// End-to-end encryption of voice (DAVE), on Discord's own libdave compiled
// to WebAssembly (vendor/dave, built by scripts/build-dave.sh). libdave
// keeps the MLS group and encrypts frames; this file follows the voice
// gateway through the protocol: key packages, proposals, commits, welcomes
// and transitions.
// https://docs.discord.com/developers/topics/voice-connections#end-to-end-encryption-dave-protocol
// https://daveprotocol.com/#voice-gateway-opcodes

import { VoiceOpcode } from '../discord/codes.js';
import type { Snowflake } from '../discord/types/common.js';

/** What chapterjs uses of libdave's WebAssembly module. */
interface DaveModule {
  HEAPU8: Uint8Array;
  _malloc(size: number): number;
  _free(pointer: number): void;
  MaxSupportedProtocolVersion(): number;
  MediaType: { Audio: unknown };
  Codec: { Opus: unknown };
  TransientKeys: new () => TransientKeys;
  Session: new (
    context: string,
    authSessionId: string,
    onFailure: (source: string, reason: string) => void
  ) => MlsSession;
  Encryptor: new () => FrameEncryptor;
}

interface Deletable {
  delete(): void;
}

interface TransientKeys extends Deletable {
  GetTransientPrivateKey(version: number): Deletable;
}

interface KeyRatchet {
  cipherSuite: number;
  baseSecret: number[];
}

interface MlsSession extends Deletable {
  Init(version: number, groupId: bigint, userId: string, key: Deletable): void;
  Reset(): void;
  SetProtocolVersion(version: number): void;
  GetProtocolVersion(): number;
  SetExternalSender(sender: Uint8Array): void;
  ProcessProposals(
    proposals: Uint8Array,
    recognizedUserIds: string[]
  ): number[] | null;
  ProcessCommit(commit: Uint8Array): {
    failed: boolean;
    ignored: boolean;
  };
  ProcessWelcome(
    welcome: Uint8Array,
    recognizedUserIds: string[]
  ): object | null;
  GetMarshalledKeyPackage(): number[];
  GetKeyRatchet(userId: string): KeyRatchet | null;
}

interface FrameEncryptor extends Deletable {
  SetKeyRatchet(ratchet: KeyRatchet | null): void;
  SetPassthroughMode(passthrough: boolean): void;
  AssignSsrcToCodec(ssrc: number, codec: unknown): void;
  GetMaxCiphertextByteSize(mediaType: unknown, size: number): number;
  Encrypt(
    mediaType: unknown,
    ssrc: number,
    pointer: number,
    length: number,
    capacity: number
  ): number;
}

let loading: Promise<DaveModule> | null = null;

/** libdave, loaded the first time a voice connection needs it. */
export function loadDave(): Promise<DaveModule> {
  loading ??= (async () => {
    const url = new URL('../../vendor/dave/libdave.mjs', import.meta.url);
    const { default: factory } = (await import(url.href)) as {
      default: (options: {
        print: (text: string) => void;
        printErr: (text: string) => void;
      }) => Promise<DaveModule>;
    };
    // libdave logs every step, MLS messages included: not for the
    // terminal of the developer. What fails reaches the session callback.
    return factory({ print: () => {}, printErr: () => {} });
  })();
  return loading;
}

/** How a DAVE session talks back to the voice gateway. */
export interface DaveTransport {
  json(op: VoiceOpcode, data: unknown): void;
  binary(op: VoiceOpcode, payload: Uint8Array): void;
}

/** Something libdave refused: reported, and the session recovers by itself. */
export type DaveWarning = (message: string) => void;

/**
 * The DAVE state of one voice connection: the MLS group of the call and
 * the encryptor of what the bot sends.
 */
export class DaveSession {
  readonly #dave: DaveModule;
  readonly #transport: DaveTransport;
  readonly #userId: Snowflake;
  readonly #channelId: Snowflake;
  readonly #warn: DaveWarning;
  readonly #keys: TransientKeys;
  readonly #session: MlsSession;
  readonly #encryptor: FrameEncryptor;
  /** Who the voice gateway says is in the call: the members it may add. */
  readonly #connected = new Set<Snowflake>();
  /** The protocol version each announced transition moves to. */
  readonly #transitions = new Map<number, number>();
  #version = 0;
  /** Whether frames can be sent: no E2EE, or the bot has its key. */
  #ready = true;
  #waiting: (() => void)[] = [];
  #ssrc: number | null = null;

  constructor(
    dave: DaveModule,
    options: {
      userId: Snowflake;
      channelId: Snowflake;
      transport: DaveTransport;
      warn: DaveWarning;
    }
  ) {
    this.#dave = dave;
    this.#transport = options.transport;
    this.#userId = options.userId;
    this.#channelId = options.channelId;
    this.#warn = options.warn;
    this.#keys = new dave.TransientKeys();
    // libdave also reports what is normal in a call (a commit that arrives
    // while the group starts over): only a recovery is worth saying.
    this.#session = new dave.Session('', '', () => {});
    this.#encryptor = new dave.Encryptor();
    this.#encryptor.SetPassthroughMode(true);
    this.#connected.add(this.#userId);
  }

  /** The highest DAVE version the bot speaks, for Identify. */
  get maxVersion(): number {
    return this.#dave.MaxSupportedProtocolVersion();
  }

  /** The protocol version of the call; 0 without E2EE. */
  get version(): number {
    return this.#version;
  }

  /** Whether frames can be sent now. */
  get canSend(): boolean {
    return this.#ready;
  }

  /** Resolves once frames can be sent. */
  ready(): Promise<void> {
    if (this.#ready) return Promise.resolve();
    return new Promise(resolve => this.#waiting.push(resolve));
  }

  /** The SSRC of the bot, which the encryptor files its frames under. */
  setSsrc(ssrc: number): void {
    this.#ssrc = ssrc;
    this.#encryptor.AssignSsrcToCodec(ssrc, this.#dave.Codec.Opus);
  }

  /** Session Description (4): the version the call starts with. */
  start(version: number): void {
    this.#version = version;
    if (version > 0) {
      this.#setReady(false);
      this.#reinit(version);
    }
  }

  /** Clients Connect (11) and Client Disconnect (13). */
  clientsConnect(userIds: readonly Snowflake[]): void {
    for (const id of userIds) this.#connected.add(id);
  }

  clientDisconnect(userId: Snowflake): void {
    this.#connected.delete(userId);
  }

  /** DAVE Prepare Transition (21): a move to another version, 0 included. */
  prepareTransition(transitionId: number, version: number): void {
    this.#transitions.set(transitionId, version);
    if (transitionId === 0) this.executeTransition(0);
    else {
      this.#transport.json(VoiceOpcode.DaveTransitionReady, {
        transition_id: transitionId,
      });
    }
  }

  /** DAVE Execute Transition (22): senders switch now. */
  executeTransition(transitionId: number): void {
    const version = this.#transitions.get(transitionId);
    if (version === undefined) return;
    this.#transitions.delete(transitionId);
    const previous = this.#version;
    this.#version = version;
    if (version === 0) {
      this.#encryptor.SetPassthroughMode(true);
      this.#setReady(true);
      return;
    }
    if (previous === 0 && transitionId !== 0) {
      // An upgrade: the group of the new version was made before this.
      this.#session.SetProtocolVersion(version);
    }
    this.#useOwnKey();
  }

  /** DAVE Prepare Epoch (24): a new group when `epoch` is 1. */
  prepareEpoch(epoch: number, version: number): void {
    if (epoch === 1) {
      this.#version = version;
      this.#setReady(false);
      this.#reinit(version);
    }
  }

  /** DAVE MLS External Sender (25). */
  externalSender(payload: Uint8Array): void {
    this.#session.SetExternalSender(payload);
  }

  /** DAVE MLS Proposals (27): answered with a commit when there is one. */
  proposals(payload: Uint8Array): void {
    const commit = this.#session.ProcessProposals(payload, [
      ...this.#connected,
    ]);
    if (commit) {
      this.#transport.binary(
        VoiceOpcode.DaveMlsCommitWelcome,
        Uint8Array.from(commit)
      );
    }
  }

  /** DAVE MLS Announce Commit Transition (29). */
  announceCommit(transitionId: number, commit: Uint8Array): void {
    let result: { failed: boolean; ignored: boolean };
    try {
      result = this.#session.ProcessCommit(commit);
    } catch {
      result = { failed: true, ignored: false };
    }
    if (result.ignored) return;
    if (result.failed) return this.#recover(transitionId);
    this.#prepared(transitionId);
  }

  /** DAVE MLS Welcome (30): the bot joins the group. */
  welcome(transitionId: number, welcome: Uint8Array): void {
    let roster: object | null;
    try {
      roster = this.#session.ProcessWelcome(welcome, [...this.#connected]);
    } catch {
      roster = null;
    }
    if (!roster) return this.#recover(transitionId);
    this.#prepared(transitionId);
  }

  /**
   * One Opus frame as it travels: end-to-end encrypted when the call is,
   * unchanged otherwise.
   */
  encrypt(frame: Uint8Array): Uint8Array {
    if (this.#version === 0 || this.#ssrc === null) return frame;
    const dave = this.#dave;
    const capacity = this.#encryptor.GetMaxCiphertextByteSize(
      dave.MediaType.Audio,
      frame.length
    );
    const pointer = dave._malloc(capacity);
    try {
      dave.HEAPU8.set(frame, pointer);
      const written = this.#encryptor.Encrypt(
        dave.MediaType.Audio,
        this.#ssrc,
        pointer,
        frame.length,
        capacity
      );
      if (written === 0) {
        throw new Error('libdave could not encrypt a voice frame.');
      }
      return dave.HEAPU8.slice(pointer, pointer + written);
    } finally {
      dave._free(pointer);
    }
  }

  /** Frees what libdave holds for this connection. */
  close(): void {
    this.#setReady(true);
    this.#encryptor.delete();
    this.#session.delete();
    this.#keys.delete();
  }

  /** A new local group for `version`, and a key package to join it. */
  #reinit(version: number): void {
    this.#session.Init(
      version,
      BigInt(this.#channelId),
      this.#userId,
      this.#keys.GetTransientPrivateKey(version)
    );
    this.#transport.binary(
      VoiceOpcode.DaveMlsKeyPackage,
      Uint8Array.from(this.#session.GetMarshalledKeyPackage())
    );
  }

  /** The bot processed a commit or a welcome: ready for the transition. */
  #prepared(transitionId: number): void {
    this.#transitions.set(transitionId, this.#session.GetProtocolVersion());
    if (transitionId === 0) this.executeTransition(0);
    else {
      this.#transport.json(VoiceOpcode.DaveTransitionReady, {
        transition_id: transitionId,
      });
    }
  }

  /** A commit or welcome that could not be processed: start over. */
  #recover(transitionId: number): void {
    this.#warn(
      `the end-to-end encryption of the call could not be updated (transition ${transitionId}): joining it again.`
    );
    this.#transport.json(VoiceOpcode.DaveMlsInvalidCommitWelcome, {
      transition_id: transitionId,
    });
    this.#reinit(this.#version || this.#session.GetProtocolVersion());
  }

  #useOwnKey(): void {
    const ratchet = this.#session.GetKeyRatchet(this.#userId);
    if (!ratchet) return;
    this.#encryptor.SetKeyRatchet(ratchet);
    this.#encryptor.SetPassthroughMode(false);
    this.#setReady(true);
  }

  #setReady(ready: boolean): void {
    this.#ready = ready;
    if (!ready) return;
    const waiting = this.#waiting;
    this.#waiting = [];
    for (const resolve of waiting) resolve();
  }
}
