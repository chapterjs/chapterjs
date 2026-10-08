// What `play()` takes, turned into Opus packets: a file of `public/`, a
// link or a file sent on Discord that is already Opus is read as is;
// anything else is converted by ffmpeg, when it is installed.

import { spawn, type ChildProcess } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import {
  assetPath,
  isAssetFile,
  missingAsset,
  type AssetFile,
} from '../assets/asset.js';
import type { Attachment } from '../structures/message.js';
import { oggOpusPackets, webmOpusPackets } from './opus.js';

/**
 * What `play()` takes: a file of `public/` (`asset('music/intro.ogg')`), a
 * file sent on Discord (the `attachment` option of a command, or one of
 * `message.attachments`), or a link starting with `https://`.
 */
export type AudioSource = AssetFile | Attachment | string;

/** How much of a file tells what it holds. */
const HEAD = 4096;

/** Opus packets being read, and how to stop reading them. */
export interface OpusStream {
  readonly packets: AsyncIterable<Buffer>;
  /** What is played, as the developer named it. */
  readonly name: string;
  close(): void;
}

/** The container of a file, from its first bytes. */
export function sniff(head: Buffer): 'ogg' | 'webm' | null {
  if (
    head.toString('latin1', 0, 4) === 'OggS' &&
    head.includes('OpusHead', 0, 'latin1')
  ) {
    return 'ogg';
  }
  if (head.readUInt32BE(0) === 0x1a45dfa3 && head.includes('A_OPUS')) {
    return 'webm';
  }
  return null;
}

/**
 * Opens what is to be played. Fails before anything is sent when the file
 * is missing, or when ffmpeg is needed and is not installed.
 */
export async function openAudio(source: AudioSource): Promise<OpusStream> {
  if (isAssetFile(source)) {
    const path = assetPath(source);
    const name = `public/${source.path}`;
    let head: Buffer;
    try {
      const handle = await open(path, 'r');
      try {
        const buffer = Buffer.alloc(4096);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        head = buffer.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
    } catch (error) {
      throw missingAsset(source, error);
    }
    const container = head.length >= 4 ? sniff(head) : null;
    if (container) {
      const stream = createReadStream(path);
      // Reading reports what goes wrong; a stream never read must not.
      stream.on('error', () => {});
      const demux = container === 'ogg' ? oggOpusPackets : webmOpusPackets;
      return {
        name,
        packets: demux(stream as AsyncIterable<Buffer>),
        close: () => stream.destroy(),
      };
    }
    return ffmpeg(path, name);
  }
  if (isAttachment(source)) return openLink(source.url, source.filename);
  if (typeof source === 'string' && /^https?:\/\//i.test(source)) {
    return openLink(source, source);
  }
  throw new TypeError(
    `play() takes a file of public/, like play(asset('music/intro.ogg')), a file sent on Discord, or a link starting with https://. Got ${JSON.stringify(source) ?? String(source)}.`
  );
}

/** A file sent on Discord, as a command option or a message gives it. */
function isAttachment(value: unknown): value is Attachment {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Attachment).url === 'string' &&
    typeof (value as Attachment).filename === 'string'
  );
}

/**
 * A link: downloaded as it plays. Its first bytes say whether it is Opus,
 * read as is, or something ffmpeg converts.
 */
async function openLink(url: string, name: string): Promise<OpusStream> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(
      `${name} could not be downloaded: ${(error as Error).message}.`
    );
  }
  if (!response.ok || !response.body) {
    throw new Error(
      `${name} could not be downloaded: the server answered ${response.status}.`
    );
  }
  // A page (YouTube, a site): what plays is not at this address.
  if (response.headers.get('content-type')?.startsWith('text/html')) {
    void response.body.cancel().catch(() => {});
    throw new Error(
      `${name} is a web page, not a sound: give the link of an audio file or of a stream, or send the file.`
    );
  }
  const reader = response.body.getReader();
  const start: Uint8Array[] = [];
  let length = 0;
  let ended = false;
  while (length < HEAD) {
    const next = await reader.read();
    if (next.done) {
      ended = true;
      break;
    }
    start.push(next.value);
    length += next.value.length;
  }
  const head = Buffer.concat(start);
  const container = head.length >= 4 ? sniff(head) : null;
  if (!container) {
    // ffmpeg downloads it itself.
    void reader.cancel().catch(() => {});
    return ffmpeg(url, name);
  }
  let closed = false;
  const body = async function* (): AsyncGenerator<Uint8Array> {
    yield head;
    if (ended) return;
    while (!closed) {
      const next = await reader.read();
      if (next.done) return;
      yield next.value;
    }
  };
  const demux = container === 'ogg' ? oggOpusPackets : webmOpusPackets;
  return {
    name,
    packets: demux(body()),
    close: () => {
      closed = true;
      void reader.cancel().catch(() => {});
    },
  };
}

/**
 * Converts anything ffmpeg reads into Ogg Opus, 48 kHz stereo in frames
 * of 20 ms: what Discord expects.
 */
async function ffmpeg(input: string, name: string): Promise<OpusStream> {
  const child: ChildProcess = spawn(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      input,
      '-vn',
      '-c:a',
      'libopus',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-b:a',
      '128k',
      '-frame_duration',
      '20',
      '-f',
      'ogg',
      'pipe:1',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', error => {
      reject(
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? new Error(
              `${name} is not an Opus file (.ogg or .webm), and ffmpeg is not installed to convert it. Install ffmpeg (https://ffmpeg.org/download.html), or convert the file to .ogg Opus.`
            )
          : error
      );
    });
  });
  let errors = '';
  child.stderr!.setEncoding('utf8');
  child.stderr!.on('data', (text: string) => {
    errors = (errors + text).slice(-2000);
  });
  const exited = new Promise<number | null>(resolve =>
    child.once('close', code => resolve(code))
  );
  const packets = (async function* () {
    let count = 0;
    for await (const packet of oggOpusPackets(
      child.stdout as AsyncIterable<Buffer>
    )) {
      count++;
      yield packet;
    }
    const code = await exited;
    if (code !== 0 && code !== null && count === 0) {
      const reason = errors.trim().split('\n').at(-1) ?? `exit code ${code}`;
      throw new Error(`ffmpeg could not read ${name}: ${reason}`);
    }
  })();
  return {
    name,
    packets,
    close: () => {
      if (child.exitCode === null) child.kill();
    },
  };
}
