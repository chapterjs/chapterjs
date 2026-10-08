// What the bot sends to a voice server, piece by piece: the transport
// encryption, the RTP header, Opus packets out of their files, and what
// play() accepts.
import { fakeBin, tempDir } from '@chapterjs/test-utils';
import { createDecipheriv } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, onTestFinished } from 'vitest';
import { asset, setPublicDir } from '../src/assets/asset.js';
import {
  NotOpusError,
  oggOpusPackets,
  opusSamples,
  webmOpusPackets,
} from '../src/voice/opus.js';
import { openAudio, sniff } from '../src/voice/source.js';
import {
  hchacha20,
  pickMode,
  rtpHeader,
  TransportEncryptor,
  xchacha20poly1305Seal,
} from '../src/voice/transport.js';
import { joinsVoice, sourcesJoinVoice } from '../src/voice/usage.js';
import { block, el, ogg, webm } from './voice-helpers.js';

const hex = (text: string) => Buffer.from(text.replace(/\s/g, ''), 'hex');

async function collect(source: AsyncIterable<Buffer>): Promise<Buffer[]> {
  const out: Buffer[] = [];
  for await (const packet of source) out.push(packet);
  return out;
}

async function* chunks(data: Buffer, size: number): AsyncGenerator<Buffer> {
  for (let offset = 0; offset < data.length; offset += size) {
    yield data.subarray(offset, offset + size);
  }
}

describe('the transport encryption', () => {
  it('derives XChaCha20 keys as the IETF draft says', () => {
    // draft-irtf-cfrg-xchacha, 2.2.1
    expect(
      hchacha20(
        Buffer.from([...Array(32).keys()]),
        hex('000000090000004a0000000031415927')
      ).toString('hex')
    ).toBe('82413b4227b27bfed30e42508a877d73a0f9e4d58a74a853c12ec41326d3ecdc');
  });

  it('seals with XChaCha20-Poly1305 as the IETF draft says', () => {
    // draft-irtf-cfrg-xchacha, A.3.1
    const sealed = xchacha20poly1305Seal(
      Buffer.from([...Array(32).keys()].map(i => 0x80 + i)),
      Buffer.from([...Array(24).keys()].map(i => 0x40 + i)),
      Buffer.from(
        "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it."
      ),
      hex('50515253c0c1c2c3c4c5c6c7')
    );
    expect(sealed.subarray(0, 16).toString('hex')).toBe(
      'bd6d179d3e83d43b9576579493c0e939'
    );
    expect(sealed.subarray(-16).toString('hex')).toBe(
      'c0875924c1c7987947deafd8780acf49'
    );
    expect(sealed.length).toBe(114 + 16);
  });

  it.each([
    [
      ['aead_aes256_gcm_rtpsize', 'aead_xchacha20_poly1305_rtpsize'],
      'aead_aes256_gcm_rtpsize',
    ],
    [
      ['aead_xchacha20_poly1305_rtpsize', 'xsalsa20_poly1305'],
      'aead_xchacha20_poly1305_rtpsize',
    ],
    [['xsalsa20_poly1305_lite', 'aead_aes256_gcm'], null],
    [[], null],
  ])('picks a mode among %j: %s', (offered, expected) => {
    expect(pickMode(offered)).toBe(expected);
  });

  it('writes the RTP header of Discord, wrapping its counters', () => {
    expect(rtpHeader(0x1_0001, 2 ** 32 + 5, 0xdeadbeef).toString('hex')).toBe(
      '80780001' + '00000005' + 'deadbeef'
    );
  });

  it('seals AES256-GCM packets: clear header, sealed audio, counter nonce', () => {
    const key = Buffer.alloc(32, 9);
    const encryptor = new TransportEncryptor('aead_aes256_gcm_rtpsize', key);
    const header = rtpHeader(1, 960, 42);
    const opus = Buffer.from([0xfc, 1, 2, 3]);
    const packets = [
      encryptor.seal(header, opus),
      encryptor.seal(header, opus),
    ];
    for (const [index, packet] of packets.entries()) {
      expect(packet.subarray(0, 12)).toEqual(header);
      expect(packet.readUInt32BE(packet.length - 4)).toBe(index);
      const nonce = Buffer.alloc(12);
      packet.copy(nonce, 0, packet.length - 4);
      const sealed = packet.subarray(12, -4);
      const decipher = createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAAD(header);
      decipher.setAuthTag(sealed.subarray(-16));
      expect(
        Buffer.concat([
          decipher.update(sealed.subarray(0, -16)),
          decipher.final(),
        ])
      ).toEqual(opus);
    }
    // A new nonce for each packet: the same audio never looks the same.
    expect(packets[0]!.subarray(12, -4)).not.toEqual(
      packets[1]!.subarray(12, -4)
    );
  });

  it('seals XChaCha20 packets with a 24-byte counter nonce', () => {
    const key = Buffer.alloc(32, 3);
    const encryptor = new TransportEncryptor(
      'aead_xchacha20_poly1305_rtpsize',
      key
    );
    const header = rtpHeader(5, 0, 1);
    const packet = encryptor.seal(header, Buffer.from('opus'));
    const nonce = Buffer.alloc(24);
    expect(packet.subarray(12, -4)).toEqual(
      xchacha20poly1305Seal(key, nonce, Buffer.from('opus'), header)
    );
  });

  it('refuses a key of the wrong size', () => {
    expect(
      () => new TransportEncryptor('aead_aes256_gcm_rtpsize', Buffer.alloc(16))
    ).toThrow('The voice session key has 16 bytes instead of 32.');
  });
});

describe('Opus packets', () => {
  it.each([
    // config, code, second byte → samples
    [[1 << 3], 960], // SILK 20 ms
    [[3 << 3], 2880], // SILK 60 ms
    [[12 << 3], 480], // Hybrid 10 ms
    [[16 << 3], 120], // CELT 2.5 ms
    [[31 << 3], 960], // CELT 20 ms
    [[(31 << 3) | 1], 1920], // two frames
    [[(31 << 3) | 2], 1920],
    [[(31 << 3) | 3, 3], 2880], // three frames, code 3
    [[0xf8, 0xff, 0xfe], 960], // the silence frame Discord asks for
    [[], 0],
  ])('%j plays %i samples', (bytes, samples) => {
    expect(opusSamples(Buffer.from(bytes))).toBe(samples);
  });

  it('come out of Ogg without the two headers, across pages and big packets', async () => {
    const packets = [
      Buffer.from([0xfc, 1]),
      Buffer.alloc(600, 7),
      Buffer.from([0xfc]),
    ];
    const file = ogg(packets);
    for (const size of [1, 7, 64, file.length]) {
      expect(await collect(oggOpusPackets(chunks(file, size)))).toEqual(
        packets
      );
    }
  });

  it('only take the first stream of an Ogg file', async () => {
    const mine = ogg([Buffer.from([1])]);
    const other = ogg([Buffer.from([2])], { serial: 99 });
    expect(
      await collect(oggOpusPackets(chunks(Buffer.concat([mine, other]), 50)))
    ).toEqual([Buffer.from([1])]);
  });

  it.each([
    [
      Buffer.from('ID3 not an ogg file at all, longer than a page header'),
      'This is not an Ogg file.',
    ],
    [
      (() => {
        const file = ogg([]);
        file.write('Vorbis!!', 28, 'latin1');
        return file;
      })(),
      'This Ogg file holds no Opus audio.',
    ],
  ])('refuse what is not Ogg Opus', async (file, message) => {
    await expect(collect(oggOpusPackets(chunks(file, 10)))).rejects.toThrow(
      new NotOpusError(message)
    );
  });

  it.each(['none', 'xiph', 'fixed', 'ebml'] as const)(
    'come out of WebM, from the Opus track only, with lacing %s',
    async lacing => {
      const frames =
        lacing === 'fixed'
          ? [Buffer.alloc(3, 1), Buffer.alloc(3, 2), Buffer.alloc(3, 3)]
          : [Buffer.alloc(300, 1), Buffer.alloc(4, 2), Buffer.alloc(9, 3)];
      const blocks =
        lacing === 'none'
          ? frames.map(frame => block(2, [frame]))
          : [block(2, frames, lacing)];
      const file = webm([block(1, [Buffer.from('video')]), ...blocks]);
      for (const size of [1, 13, file.length]) {
        expect(await collect(webmOpusPackets(chunks(file, size)))).toEqual(
          frames
        );
      }
    }
  );

  it('refuse a WebM file without Opus', async () => {
    const file = Buffer.concat([
      el(0x1a45dfa3, el(0x4282, 'webm')),
      el(
        0x18538067,
        el(
          0x1654ae6b,
          el(0xae, Buffer.concat([el(0xd7, 1), el(0x86, 'A_VORBIS')]))
        )
      ),
    ]);
    await expect(collect(webmOpusPackets(chunks(file, 5)))).rejects.toThrow(
      'This WebM file holds no Opus audio.'
    );
    await expect(
      collect(webmOpusPackets(chunks(Buffer.from('nothing'), 5)))
    ).rejects.toThrow('This is not a WebM file.');
  });

  it.each([
    [ogg([]), 'ogg'],
    [webm([]), 'webm'],
    [Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00 an mp3'), null],
    [Buffer.from('OggS but vorbis inside'), null],
  ])('are found by the first bytes of a file (%#)', (head, expected) => {
    expect(sniff(head)).toBe(expected);
  });
});

describe('what play() takes', () => {
  afterEach(() => setPublicDir('/nowhere'));

  function projectWith(files: Record<string, Buffer>) {
    const cwd = tempDir();
    for (const [path, data] of Object.entries(files)) {
      mkdirSync(join(cwd, 'public', path, '..'), { recursive: true });
      writeFileSync(join(cwd, 'public', path), data);
    }
    setPublicDir(cwd);
    return cwd;
  }

  it('reads an Opus file of public/ as it is, whatever its extension', async () => {
    projectWith({
      'a.ogg': ogg([Buffer.from([0xfc, 1])]),
      'b.mp3': webm([block(2, [Buffer.from([0xfc, 2])])]),
    });
    for (const [name, packet] of [
      ['a.ogg', 1],
      ['b.mp3', 2],
    ] as const) {
      const stream = await openAudio(asset(name));
      expect(stream.name).toBe(`public/${name}`);
      expect(await collect(stream.packets)).toEqual([
        Buffer.from([0xfc, packet]),
      ]);
    }
  });

  it.skipIf(process.platform === 'win32')(
    'converts anything else with ffmpeg, into 20 ms frames of 48 kHz stereo Opus',
    async () => {
      projectWith({ 'song.mp3': Buffer.from('ID3 an mp3') });
      const out = tempDir();
      const bin = fakeBin({
        ffmpeg: `printf '%s\\n' "$@" > ${join(out, 'args')}; /bin/cat ${join(out, 'ogg')}`,
      });
      writeFileSync(join(out, 'ogg'), ogg([Buffer.from([0xfc, 9])]));
      const path = process.env.PATH;
      process.env.PATH = bin;
      try {
        const stream = await openAudio(asset('song.mp3'));
        expect(await collect(stream.packets)).toEqual([Buffer.from([0xfc, 9])]);
        const radio = await serve({ '/live': Buffer.from('ID3 a stream') });
        const link = await openAudio(`${radio}/live`);
        expect(await collect(link.packets)).toHaveLength(1);
      } finally {
        process.env.PATH = path;
      }
      const { readFileSync } = await import('node:fs');
      const args = readFileSync(join(out, 'args'), 'utf8').trim().split('\n');
      expect(args).toEqual([
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/live$/),
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
      ]);
    }
  );

  it.skipIf(process.platform === 'win32')(
    'says what ffmpeg refused',
    async () => {
      projectWith({ 'bad.wav': Buffer.from('RIFF broken') });
      const path = process.env.PATH;
      process.env.PATH = fakeBin({
        ffmpeg: `echo 'something first' >&2; echo 'public/bad.wav: Invalid data found when processing input' >&2; exit 1`,
      });
      try {
        const stream = await openAudio(asset('bad.wav'));
        await expect(collect(stream.packets)).rejects.toThrow(
          'ffmpeg could not read public/bad.wav: public/bad.wav: Invalid data found when processing input'
        );
      } finally {
        process.env.PATH = path;
      }
    }
  );

  it('says how to do without ffmpeg when it is not installed', async () => {
    projectWith({ 'song.mp3': Buffer.from('ID3 an mp3') });
    const path = process.env.PATH;
    process.env.PATH = tempDir();
    try {
      await expect(openAudio(asset('song.mp3'))).rejects.toThrow(
        'public/song.mp3 is not an Opus file (.ogg or .webm), and ffmpeg is not installed to convert it. Install ffmpeg (https://ffmpeg.org/download.html), or convert the file to .ogg Opus.'
      );
    } finally {
      process.env.PATH = path;
    }
  });

  /** A web server that serves these files. */
  async function serve(files: Record<string, Buffer>) {
    const { createServer } = await import('node:http');
    const server = createServer((request, response) => {
      const body = files[request.url ?? ''];
      if (!body) return void response.writeHead(404).end();
      response.writeHead(200).end(body);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    onTestFinished(
      () => new Promise<void>(resolve => server.close(() => resolve()))
    );
    const { port } = server.address() as { port: number };
    return `http://127.0.0.1:${port}`;
  }

  it('downloads a link or a file sent on Discord, and plays Opus without ffmpeg', async () => {
    const packets = Array.from({ length: 300 }, (_, n) =>
      Buffer.from([0xfc, n % 256, 7])
    );
    const url = await serve({
      '/song.ogg': ogg(packets),
      '/clip.webm': webm([block(2, [Buffer.from([0xfc, 1])])]),
    });
    const path = process.env.PATH;
    process.env.PATH = tempDir();
    try {
      const link = await openAudio(`${url}/song.ogg`);
      expect(await collect(link.packets)).toEqual(packets);
      const sent = await openAudio({
        url: `${url}/clip.webm`,
        filename: 'clip.webm',
      } as never);
      expect(sent.name).toBe('clip.webm');
      expect(await collect(sent.packets)).toEqual([Buffer.from([0xfc, 1])]);
      // Not Opus, and no ffmpeg: named as the person sent it.
      const mp3 = await serve({ '/a.mp3': Buffer.from('ID3 an mp3 file') });
      await expect(
        openAudio({ url: `${mp3}/a.mp3`, filename: 'a.mp3' } as never)
      ).rejects.toThrow(
        'a.mp3 is not an Opus file (.ogg or .webm), and ffmpeg is not installed to convert it.'
      );
    } finally {
      process.env.PATH = path;
    }
  });

  it('says when a link is a web page, like the one of a video', async () => {
    const { createServer } = await import('node:http');
    const server = createServer((_, response) =>
      response
        .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        .end('<html></html>')
    );
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    onTestFinished(
      () => new Promise<void>(resolve => server.close(() => resolve()))
    );
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/watch?v=x`;
    await expect(openAudio(url)).rejects.toThrow(
      `${url} is a web page, not a sound: give the link of an audio file or of a stream, or send the file.`
    );
  });

  it('says when a link can not be downloaded', async () => {
    const url = await serve({});
    await expect(openAudio(`${url}/gone.ogg`)).rejects.toThrow(
      `${url}/gone.ogg could not be downloaded: the server answered 404.`
    );
    await expect(openAudio('http://127.0.0.1:1/x.ogg')).rejects.toThrow(
      'http://127.0.0.1:1/x.ogg could not be downloaded: fetch failed.'
    );
  });

  it.each([
    ['not-a-link', 'Got "not-a-link".'],
    ['ftp://files.example/a.mp3', 'Got "ftp://files.example/a.mp3".'],
    [42, 'Got 42.'],
  ])('refuses %j', async (source, end) => {
    await expect(openAudio(source as never)).rejects.toThrow(
      `play() takes a file of public/, like play(asset('music/intro.ogg')), a file sent on Discord, or a link starting with https://. ${end}`
    );
  });

  it('names a file that is not in public/', async () => {
    projectWith({});
    await expect(openAudio(asset('nope.ogg'))).rejects.toThrow(
      'There is no file public/nope.ogg in your project'
    );
  });
});

describe('a project that joins voice', () => {
  it.each([
    ['await channel.join();', true],
    ['await channel.join({ deaf: false })', true],
    ['await channel.join( )', true],
    ['await voiceChannel.join({deaf:!1})', true],
    ["names.join(', ')", false],
    ['names.join(separator)', false],
    ['const join = 1', false],
  ])('is told from its code: %s', (code, expected) => {
    expect(joinsVoice(code)).toBe(expected);
  });

  it('is told from the files of src/, wherever they are', async () => {
    const cwd = tempDir();
    mkdirSync(join(cwd, 'src/lib/deep'), { recursive: true });
    writeFileSync(
      join(cwd, 'src/lib/names.ts'),
      "export const all = ['a'].join(', ');\n"
    );
    writeFileSync(join(cwd, 'src/lib/notes.md'), 'channel.join()\n');
    expect(await sourcesJoinVoice(cwd)).toBe(false);
    writeFileSync(
      join(cwd, 'src/lib/deep/music.ts'),
      'export const go = (c: { join(): void }) => c.join();\n'
    );
    expect(await sourcesJoinVoice(cwd)).toBe(true);
    expect(await sourcesJoinVoice(join(cwd, 'missing'))).toBe(false);
  });
});
