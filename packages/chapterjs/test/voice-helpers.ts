// Files of audio built by hand: Ogg and WebM holding the Opus packets a test
// chooses, so that what the bot sends can be compared with what was in them.

/** An Ogg stream holding these packets, one page per `perPage` packets. */
export function ogg(packets: Buffer[], options: { serial?: number } = {}) {
  const serial = options.serial ?? 7;
  const pages: Buffer[] = [];
  let sequence = 0;
  // A packet of 255 bytes or more spans several lacing values.
  const page = (packet: Buffer, flags = 0): Buffer => {
    const lacing: number[] = [];
    let left = packet.length;
    while (left >= 255) {
      lacing.push(255);
      left -= 255;
    }
    lacing.push(left);
    const head = Buffer.alloc(27);
    head.write('OggS', 0, 'latin1');
    head[5] = flags;
    head.writeUInt32LE(serial, 14);
    head.writeUInt32LE(sequence++, 18);
    head[26] = lacing.length;
    return Buffer.concat([head, Buffer.from(lacing), packet]);
  };
  const opusHead = Buffer.alloc(19);
  opusHead.write('OpusHead', 0, 'latin1');
  opusHead[8] = 1;
  opusHead[9] = 2;
  pages.push(page(opusHead, 2));
  pages.push(page(Buffer.from('OpusTags........', 'latin1')));
  for (const packet of packets) pages.push(page(packet));
  return Buffer.concat(pages);
}

/** An EBML element. */
export function el(id: number, body: Buffer | string | number): Buffer {
  const data =
    typeof body === 'number'
      ? Buffer.from([body])
      : typeof body === 'string'
        ? Buffer.from(body, 'latin1')
        : body;
  const idBytes = Buffer.from(
    id
      .toString(16)
      .padStart(id > 0xffffff ? 8 : id > 0xffff ? 6 : id > 0xff ? 4 : 2, '0'),
    'hex'
  );
  const size = Buffer.alloc(8);
  size[0] = 0x01;
  size.writeUIntBE(data.length, 2, 6);
  return Buffer.concat([idBytes, size, data]);
}

/** A WebM file with one Opus track (2) next to a video track (1). */
export function webm(blocks: Buffer[]): Buffer {
  const tracks = el(
    0x1654ae6b,
    Buffer.concat([
      el(0xae, Buffer.concat([el(0xd7, 1), el(0x86, 'V_VP9')])),
      el(0xae, Buffer.concat([el(0xd7, 2), el(0x86, 'A_OPUS')])),
    ])
  );
  const cluster = el(0x1f43b675, Buffer.concat([el(0xe7, 0), ...blocks]));
  return Buffer.concat([
    el(0x1a45dfa3, el(0x4282, 'webm')),
    el(
      0x18538067,
      Buffer.concat([el(0x1549a966, Buffer.alloc(4)), tracks, cluster])
    ),
  ]);
}

/** A SimpleBlock of a track, with the frames given and their lacing. */
export function block(
  track: number,
  frames: Buffer[],
  lacing: 'none' | 'xiph' | 'fixed' | 'ebml' = 'none'
): Buffer {
  const flags = { none: 0, xiph: 2, fixed: 4, ebml: 6 }[lacing];
  const head = Buffer.from([0x80 | track, 0, 0, 0x80 | flags]);
  if (lacing === 'none') return el(0xa3, Buffer.concat([head, frames[0]!]));
  const sizes: number[] = [];
  if (lacing === 'xiph') {
    for (const frame of frames.slice(0, -1)) {
      let left = frame.length;
      while (left >= 255) {
        sizes.push(255);
        left -= 255;
      }
      sizes.push(left);
    }
  } else if (lacing === 'ebml') {
    // First size as a 2-byte vint, then differences biased by 8191.
    const first = frames[0]!.length;
    sizes.push(0x40 | (first >> 8), first & 0xff);
    for (let i = 1; i < frames.length - 1; i++) {
      const delta = frames[i]!.length - frames[i - 1]!.length + 8191;
      sizes.push(0x40 | (delta >> 8), delta & 0xff);
    }
  }
  return el(
    0xa3,
    Buffer.concat([head, Buffer.from([frames.length - 1, ...sizes]), ...frames])
  );
}
