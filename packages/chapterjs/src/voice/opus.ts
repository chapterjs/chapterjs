// Opus packets out of the files that already hold them: Ogg (`.ogg`,
// `.opus`) and WebM/Matroska (`.webm`, `.mka`). Discord takes Opus as is,
// so nothing is decoded: packets are only taken out of their container.

/** A file that holds no Opus audio this module can read. */
export class NotOpusError extends Error {}

/**
 * How many samples (at 48 kHz) an Opus packet plays, from its TOC byte.
 * https://www.rfc-editor.org/rfc/rfc6716#section-3.1
 */
export function opusSamples(packet: Uint8Array): number {
  const toc = packet[0];
  if (toc === undefined) return 0;
  const config = toc >> 3;
  // Frame size in 1/400 s (2.5 ms), per configuration group.
  const tenths =
    config < 12
      ? [4, 8, 16, 24][config % 4]!
      : config < 16
        ? [4, 8][config % 2]!
        : [1, 2, 4, 8][config % 4]!;
  const code = toc & 3;
  const frames = code === 0 ? 1 : code === 3 ? (packet[1] ?? 0) & 0x3f : 2;
  return tenths * 120 * frames;
}

/** Bytes coming in pieces, read as they are needed. */
class Reader {
  #chunks: Uint8Array[] = [];
  #length = 0;
  readonly #source: AsyncIterator<Uint8Array>;
  #done = false;

  constructor(source: AsyncIterable<Uint8Array>) {
    this.#source = source[Symbol.asyncIterator]();
  }

  /** Makes at least `size` bytes available; `false` at the end. */
  async need(size: number): Promise<boolean> {
    while (this.#length < size && !this.#done) {
      const next = await this.#source.next();
      if (next.done) this.#done = true;
      else if (next.value.length > 0) {
        this.#chunks.push(next.value);
        this.#length += next.value.length;
      }
    }
    return this.#length >= size;
  }

  /** The first `size` bytes, without consuming them. */
  peek(size: number): Buffer {
    if (this.#chunks.length !== 1) {
      const all = Buffer.concat(this.#chunks);
      this.#chunks = [all];
    }
    return Buffer.from(this.#chunks[0]!.subarray(0, size));
  }

  async take(size: number): Promise<Buffer | null> {
    if (!(await this.need(size))) return null;
    const out = this.peek(size);
    const first = this.#chunks[0]!.subarray(size);
    this.#chunks = first.length > 0 ? [first] : [];
    this.#length -= size;
    return out;
  }

  async skip(size: number): Promise<boolean> {
    let left = size;
    while (left > 0) {
      if (!(await this.need(Math.min(left, 65536)))) return false;
      const step = Math.min(left, this.#length);
      await this.take(step);
      left -= step;
    }
    return true;
  }

  get ended(): boolean {
    return this.#done && this.#length === 0;
  }
}

/**
 * The Opus packets of an Ogg stream, in order, without its two header
 * packets (OpusHead, OpusTags). Only the first logical stream is read.
 * https://www.rfc-editor.org/rfc/rfc3533 https://www.rfc-editor.org/rfc/rfc7845
 */
export async function* oggOpusPackets(
  source: AsyncIterable<Uint8Array>
): AsyncGenerator<Buffer> {
  const reader = new Reader(source);
  let serial: number | null = null;
  let index = 0;
  let pending: Buffer[] = [];
  for (;;) {
    const head = await reader.take(27);
    if (!head) return;
    if (head.toString('latin1', 0, 4) !== 'OggS') {
      throw new NotOpusError('This is not an Ogg file.');
    }
    const segments = head[26]!;
    const lacing = await reader.take(segments);
    if (!lacing) return;
    const size = lacing.reduce((sum, value) => sum + value, 0);
    const body = await reader.take(size);
    if (!body) return;
    const pageSerial = head.readUInt32LE(14);
    if (serial === null) serial = pageSerial;
    if (pageSerial !== serial) continue;
    let offset = 0;
    for (const value of lacing) {
      pending.push(body.subarray(offset, offset + value));
      offset += value;
      if (value === 255) continue;
      const packet = Buffer.concat(pending);
      pending = [];
      if (index === 0 && packet.toString('latin1', 0, 8) !== 'OpusHead') {
        throw new NotOpusError('This Ogg file holds no Opus audio.');
      }
      if (index >= 2 && packet.length > 0) yield packet;
      index++;
    }
  }
}

const EBML = 0x1a45dfa3;
const SEGMENT = 0x18538067;
const TRACKS = 0x1654ae6b;
const TRACK_ENTRY = 0xae;
const TRACK_NUMBER = 0xd7;
const CODEC_ID = 0x86;
const CLUSTER = 0x1f43b675;
const BLOCK_GROUP = 0xa0;
const BLOCK = 0xa1;
const SIMPLE_BLOCK = 0xa3;
/** Elements whose children are read; everything else is skipped. */
const MASTERS = new Set([SEGMENT, TRACKS, TRACK_ENTRY, CLUSTER, BLOCK_GROUP]);

/** The length of an EBML variable-size integer, from its first byte. */
const vintLength = (first: number): number => {
  for (let length = 1; length <= 8; length++) {
    if (first & (0x80 >> (length - 1))) return length;
  }
  return 0;
};

/** A variable-size integer, without its marker; `-1` for "unknown". */
function readVint(
  bytes: Buffer,
  offset = 0
): { value: number; length: number } {
  const length = vintLength(bytes[offset]!);
  if (length === 0) throw new NotOpusError('This WebM file is damaged.');
  let value = bytes[offset]! & (0xff >> length);
  let unknown = value === 0xff >> length;
  for (let i = 1; i < length; i++) {
    const byte = bytes[offset + i]!;
    if (byte !== 0xff) unknown = false;
    value = value * 256 + byte;
  }
  return { value: unknown ? -1 : value, length };
}

/**
 * The Opus packets of a WebM/Matroska stream, from its first Opus track.
 * https://www.matroska.org/technical/elements.html
 */
export async function* webmOpusPackets(
  source: AsyncIterable<Uint8Array>
): AsyncGenerator<Buffer> {
  const reader = new Reader(source);
  let track: number | null = null;
  let entry: { number: number | null; codec: string | null } | null = null;
  let first = true;
  while (await reader.need(1)) {
    // An element: its id (marker kept), then its size.
    const idLength = vintLength(reader.peek(1)[0]!);
    if (idLength === 0 || idLength > 4 || !(await reader.need(idLength + 1))) {
      throw new NotOpusError('This WebM file is damaged.');
    }
    const id = reader.peek(idLength).readUIntBE(0, idLength);
    const sizeLength = vintLength(reader.peek(idLength + 1)[idLength]!);
    if (!(await reader.need(idLength + sizeLength))) return;
    const { value: size } = readVint(
      reader.peek(idLength + sizeLength),
      idLength
    );
    await reader.take(idLength + sizeLength);
    if (first) {
      if (id !== EBML) throw new NotOpusError('This is not a WebM file.');
      first = false;
    }
    if (MASTERS.has(id)) {
      if (id === TRACK_ENTRY) entry = { number: null, codec: null };
      continue;
    }
    if (size < 0) throw new NotOpusError('This WebM file is damaged.');
    if (id === TRACK_NUMBER || id === CODEC_ID) {
      const data = await reader.take(size);
      if (!data || !entry) continue;
      if (id === TRACK_NUMBER) entry.number = data.readUIntBE(0, size);
      else entry.codec = data.toString('latin1').replace(/\0+$/, '');
      if (track === null && entry.codec === 'A_OPUS' && entry.number !== null) {
        track = entry.number;
      }
      continue;
    }
    if (id === SIMPLE_BLOCK || id === BLOCK) {
      const data = await reader.take(size);
      if (!data) return;
      if (track === null) {
        throw new NotOpusError('This WebM file holds no Opus audio.');
      }
      const number = readVint(data);
      if (number.value !== track) continue;
      yield* laced(data, number.length + 3);
      continue;
    }
    if (!(await reader.skip(size))) return;
  }
  if (track === null) {
    throw new NotOpusError('This WebM file holds no Opus audio.');
  }
}

/** The frames of a block, after its header, whatever its lacing. */
function* laced(block: Buffer, start: number): Generator<Buffer> {
  const lacing = (block[start - 1]! >> 1) & 3;
  if (lacing === 0) {
    yield block.subarray(start);
    return;
  }
  const count = block[start]! + 1;
  let offset = start + 1;
  const sizes: number[] = [];
  if (lacing === 1) {
    // Xiph: each size is a run of 255s and a last byte.
    for (let i = 0; i < count - 1; i++) {
      let size = 0;
      let byte: number;
      do {
        byte = block[offset++]!;
        size += byte;
      } while (byte === 255);
      sizes.push(size);
    }
  } else if (lacing === 3) {
    // EBML: the first size, then signed differences.
    const firstSize = readVint(block, offset);
    offset += firstSize.length;
    sizes.push(firstSize.value);
    for (let i = 1; i < count - 1; i++) {
      const delta = readVint(block, offset);
      offset += delta.length;
      const bias = 2 ** (7 * delta.length - 1) - 1;
      sizes.push(sizes[i - 1]! + delta.value - bias);
    }
  } else {
    // Fixed: every frame has the same size.
    const each = (block.length - offset) / count;
    for (let i = 0; i < count - 1; i++) sizes.push(each);
  }
  for (const size of sizes) {
    yield block.subarray(offset, offset + size);
    offset += size;
  }
  yield block.subarray(offset);
}
