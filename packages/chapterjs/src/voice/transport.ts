// What travels over UDP to Discord's voice server: an RTP header, then the
// audio encrypted with the key of the session. Only the two modes Discord
// still accepts are written, with what Node has built in.
// https://docs.discord.com/developers/topics/voice-connections#transport-encryption-and-sending-voice

import { createCipheriv } from 'node:crypto';

/** The transport encryption modes, best first. */
export const TRANSPORT_MODES = [
  'aead_aes256_gcm_rtpsize',
  'aead_xchacha20_poly1305_rtpsize',
] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

/**
 * The mode to use among the ones the voice server offers: AES256-GCM when
 * it is there (Discord asks to prefer it), XChaCha20-Poly1305 otherwise
 * (always offered); `null` when neither is.
 * https://docs.discord.com/developers/topics/voice-connections#transport-encryption-modes
 */
export function pickMode(offered: readonly string[]): TransportMode | null {
  return TRANSPORT_MODES.find(mode => offered.includes(mode)) ?? null;
}

const RTP_HEADER_SIZE = 12;
/** Audio sampled at 48 kHz: what an RTP timestamp counts. */
export const SAMPLE_RATE = 48_000;

/**
 * The RTP header of a voice packet: version 2, payload type 0x78, then
 * sequence, timestamp and SSRC, big endian.
 * https://docs.discord.com/developers/topics/voice-connections#transport-encryption-modes-voice-packet-structure
 */
export function rtpHeader(
  sequence: number,
  timestamp: number,
  ssrc: number
): Buffer {
  const header = Buffer.alloc(RTP_HEADER_SIZE);
  header[0] = 0x80;
  header[1] = 0x78;
  header.writeUInt16BE(sequence & 0xffff, 2);
  header.writeUInt32BE(timestamp >>> 0, 4);
  header.writeUInt32BE(ssrc >>> 0, 8);
  return header;
}

const sigma = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574];

/**
 * HChaCha20: derives the key XChaCha20 uses for a 24-byte nonce, from the
 * key and the first 16 bytes of that nonce.
 * https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha#section-2.2
 */
export function hchacha20(key: Uint8Array, nonce16: Uint8Array): Buffer {
  const k = Buffer.from(key.buffer, key.byteOffset, key.byteLength);
  const n = Buffer.from(nonce16.buffer, nonce16.byteOffset, 16);
  const s = new Uint32Array(16);
  s.set(sigma, 0);
  for (let i = 0; i < 8; i++) s[4 + i] = k.readUInt32LE(i * 4);
  for (let i = 0; i < 4; i++) s[12 + i] = n.readUInt32LE(i * 4);
  const quarter = (a: number, b: number, c: number, d: number): void => {
    s[a] = (s[a]! + s[b]!) >>> 0;
    s[d] = rotl(s[d]! ^ s[a]!, 16);
    s[c] = (s[c]! + s[d]!) >>> 0;
    s[b] = rotl(s[b]! ^ s[c]!, 12);
    s[a] = (s[a]! + s[b]!) >>> 0;
    s[d] = rotl(s[d]! ^ s[a]!, 8);
    s[c] = (s[c]! + s[d]!) >>> 0;
    s[b] = rotl(s[b]! ^ s[c]!, 7);
  };
  for (let round = 0; round < 10; round++) {
    quarter(0, 4, 8, 12);
    quarter(1, 5, 9, 13);
    quarter(2, 6, 10, 14);
    quarter(3, 7, 11, 15);
    quarter(0, 5, 10, 15);
    quarter(1, 6, 11, 12);
    quarter(2, 7, 8, 13);
    quarter(3, 4, 9, 14);
  }
  const out = Buffer.alloc(32);
  for (let i = 0; i < 4; i++) out.writeUInt32LE(s[i]!, i * 4);
  for (let i = 0; i < 4; i++) out.writeUInt32LE(s[12 + i]!, 16 + i * 4);
  return out;
}

const rotl = (value: number, bits: number): number =>
  ((value << bits) | (value >>> (32 - bits))) >>> 0;

/**
 * XChaCha20-Poly1305: ChaCha20-Poly1305 (which Node has) with the key
 * HChaCha20 derives and the last 8 bytes of the 24-byte nonce.
 * https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha#section-2.3
 */
export function xchacha20poly1305Seal(
  key: Uint8Array,
  nonce24: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array
): Buffer {
  const subkey = hchacha20(key, nonce24.subarray(0, 16));
  const nonce = Buffer.alloc(12);
  nonce.set(nonce24.subarray(16, 24), 4);
  const cipher = createCipheriv('chacha20-poly1305', subkey, nonce, {
    authTagLength: 16,
  });
  cipher.setAAD(aad, { plaintextLength: plaintext.length });
  const sealed = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([sealed, cipher.getAuthTag()]);
}

/**
 * Encrypts packets for one voice session. In the `rtpsize` modes the RTP
 * header stays clear and authenticated, and a 32-bit counter, appended to
 * the packet, is the nonce: the first 4 bytes of a nonce that is zero
 * otherwise.
 */
export class TransportEncryptor {
  readonly #mode: TransportMode;
  readonly #key: Buffer;
  #counter = 0;

  constructor(mode: TransportMode, key: Uint8Array) {
    if (key.length !== 32) {
      throw new RangeError(
        `The voice session key has ${key.length} bytes instead of 32.`
      );
    }
    this.#mode = mode;
    this.#key = Buffer.from(key);
  }

  get mode(): TransportMode {
    return this.#mode;
  }

  /** A whole packet: the clear header, the sealed audio, the counter. */
  seal(header: Buffer, payload: Uint8Array): Buffer {
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.#counter, 0);
    this.#counter = (this.#counter + 1) >>> 0;
    let sealed: Buffer;
    if (this.#mode === 'aead_aes256_gcm_rtpsize') {
      const nonce = Buffer.alloc(12);
      counter.copy(nonce, 0);
      const cipher = createCipheriv('aes-256-gcm', this.#key, nonce);
      cipher.setAAD(header);
      sealed = Buffer.concat([
        cipher.update(payload),
        cipher.final(),
        cipher.getAuthTag(),
      ]);
    } else {
      const nonce = Buffer.alloc(24);
      counter.copy(nonce, 0);
      sealed = xchacha20poly1305Seal(this.#key, nonce, payload, header);
    }
    return Buffer.concat([header, sealed, counter]);
  }
}
