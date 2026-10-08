// The bot in a voice channel. A `VoiceConnection` is what user code holds:
// one per server, the same object while the bot stays in voice there, even
// when it moves or its session with the voice server is renewed. Joining,
// moving and leaving go through the main gateway (Voice State Update);
// what Discord answers is routed here by `VoiceManager`.
// https://docs.discord.com/developers/topics/voice-connections#connecting-to-voice

import { inspect } from 'node:util';
import { ModifyCurrentUserVoiceState } from '../discord/endpoints.js';
import type { Snowflake } from '../discord/types/common.js';
import type {
  GatewayDispatchEvents,
  RawGatewayVoiceStateUpdate,
} from '../discord/types/gateway-events.js';
import type { VoiceChannel } from '../structures/channel.js';
import type { Context } from '../structures/context.js';
import { storesOf, type Guild } from '../structures/guild.js';
import { loadDave } from './dave.js';
import { opusSamples } from './opus.js';
import { VoiceSession, type SessionEnd, type VoiceServer } from './session.js';
import { openAudio, type AudioSource, type OpusStream } from './source.js';
import { SAMPLE_RATE } from './transport.js';

/** What `join()` takes. */
export interface JoinOptions {
  /**
   * Whether the bot is deafened: it hears nothing, which Discord then
   * does not send it. Default: `true`, since the bot only plays.
   */
  deaf?: boolean;
  /** Whether the bot shows as muted. Default: `false`. */
  mute?: boolean;
}

/** How long to wait for Discord to let the bot in. */
const JOIN_TIMEOUT = 10_000;
/** How long playing waits for the end-to-end encryption of the call. */
const ENCRYPTION_WAIT = 5_000;

/** What the bot sends to Discord's main gateway for voice. */
export interface VoiceGateway {
  updateVoiceState(data: RawGatewayVoiceStateUpdate): Promise<void>;
  /** Whether Discord sends the bot its own voice state (the intent). */
  hasVoiceStates(): boolean;
}

/** What only the manager does with a connection. */
interface Internals {
  /** The session audio goes through, after a (re)connection. */
  attach(session: VoiceSession, channelId: Snowflake): void;
  session(): VoiceSession | null;
  /** The channel, known even when it was deleted. */
  channelId(): Snowflake;
  /** Discord moved the bot. */
  moved(channelId: Snowflake): void;
  /** The bot is no longer in voice here. */
  closed(): void;
}

let internals: (connection: VoiceConnection) => Internals;

/** What is playing on a connection. */
interface Playing {
  stream: OpusStream;
  paused: boolean;
  stopped: boolean;
  resume: (() => void) | null;
  done: Promise<void>;
}

/**
 * The bot in a voice channel of a server: what it plays there, and how it
 * leaves. `channel.join()` gives one; `guild.voice` is the one of a server.
 */
export class VoiceConnection {
  readonly #manager: VoiceManager;
  readonly #guildId: Snowflake;
  #channelId: Snowflake;
  #session: VoiceSession | null = null;
  #playing: Playing | null = null;
  #left = false;

  constructor(manager: VoiceManager, guildId: Snowflake, channelId: Snowflake) {
    this.#manager = manager;
    this.#guildId = guildId;
    this.#channelId = channelId;
  }

  /** The server of the voice channel. */
  get guild(): Guild {
    return this.#manager.guild(this.#guildId);
  }

  /** The voice channel the bot is in. */
  get channel(): VoiceChannel {
    return this.#manager.channel(this.#guildId, this.#channelId);
  }

  /** Whether the bot is still in voice in this server. */
  get connected(): boolean {
    return !this.#left;
  }

  /** Whether something is playing, paused or not. */
  get playing(): boolean {
    return this.#playing !== null;
  }

  /** Whether what is playing is paused. */
  get paused(): boolean {
    return this.#playing?.paused ?? false;
  }

  /**
   * Plays a file of `public/` (`asset('music/intro.ogg')`), a file sent on
   * Discord (the `attachment` option of a command) or a link. Opus
   * (`.ogg`, `.webm`) is sent as is; anything else is converted with
   * ffmpeg, which must then be installed. Stops what was playing.
   * Resolves when it ends, is stopped, or another `play()` replaces it.
   */
  async play(source: AudioSource): Promise<void> {
    this.#check();
    const channel = this.channel;
    const me = this.guild.me;
    if (!me.permissionsIn(channel).has('Speak')) {
      throw new Error(
        `The bot can't play in ${channel.name}: it needs the Speak permission there.`
      );
    }
    const stream = await openAudio(source);
    this.stop();
    if (this.#left) {
      stream.close();
      return;
    }
    const playing: Playing = {
      stream,
      paused: false,
      stopped: false,
      resume: null,
      done: Promise.resolve(),
    };
    playing.done = this.#run(playing);
    this.#playing = playing;
    await playing.done;
  }

  /** Pauses what is playing; `resume()` goes on from there. */
  pause(): void {
    const playing = this.#playing;
    if (playing) playing.paused = true;
  }

  /** Goes on with what was paused. */
  resume(): void {
    const playing = this.#playing;
    if (!playing?.paused) return;
    playing.paused = false;
    playing.resume?.();
    playing.resume = null;
  }

  /** Stops what is playing: its `play()` resolves. */
  stop(): void {
    const playing = this.#playing;
    if (!playing) return;
    playing.stopped = true;
    playing.paused = false;
    playing.resume?.();
    playing.resume = null;
    playing.stream.close();
  }

  /** Leaves the voice channel. */
  async leave(): Promise<void> {
    if (this.#left) return;
    this.#close();
    await this.#manager.leave(this.#guildId);
  }

  /**
   * What `console.log` and `JSON.stringify` show: the server, the channel
   * and what plays, never the session or its keys.
   */
  toJSON(): object {
    return {
      guildId: this.#guildId,
      channelId: this.#channelId,
      connected: this.connected,
      playing: this.playing,
      paused: this.paused,
    };
  }

  [inspect.custom](): string {
    return `VoiceConnection ${inspect(this.toJSON())}`;
  }

  static {
    internals = connection => ({
      attach(session, channelId) {
        if (connection.#session !== session) connection.#session?.close();
        connection.#session = session;
        connection.#channelId = channelId;
      },
      session: () => connection.#session,
      channelId: () => connection.#channelId,
      moved(channelId) {
        connection.#channelId = channelId;
      },
      closed: () => connection.#close(),
    });
  }

  #close(): void {
    this.#left = true;
    this.stop();
    this.#session?.close();
    this.#session = null;
  }

  #check(): void {
    if (this.#left) {
      throw new Error(
        'The bot is no longer in this voice channel: join it again with channel.join().'
      );
    }
  }

  /** Sends the packets in time: each when the previous one has played. */
  async #run(playing: Playing): Promise<void> {
    const encrypted = this.#session?.dave.ready();
    if (encrypted) {
      await Promise.race([encrypted, sleep(ENCRYPTION_WAIT)]);
    }
    const packets = playing.stream.packets[Symbol.asyncIterator]();
    let next = performance.now();
    try {
      while (!playing.stopped) {
        if (playing.paused) {
          this.#session?.sendSilence();
          this.#session?.setSpeaking(false);
          await new Promise<void>(resolve => (playing.resume = resolve));
          next = performance.now();
          continue;
        }
        const { value, done } = await packets.next();
        if (done || playing.stopped) break;
        const samples = opusSamples(value) || 960;
        // While reconnecting there is no session: the audio goes on.
        this.#session?.sendOpus(value, samples);
        next += (samples * 1000) / SAMPLE_RATE;
        const wait = next - performance.now();
        if (wait > 0) await sleep(wait);
        // Far behind (the process was busy): start counting again.
        else if (wait < -200) next = performance.now();
      }
    } finally {
      playing.stream.close();
      void packets.return?.();
      if (this.#playing === playing) this.#playing = null;
      if (!this.#left) {
        this.#session?.sendSilence();
        this.#session?.setSpeaking(false);
      }
    }
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/** A join waiting for Discord's two answers. */
interface PendingJoin {
  channelId: Snowflake;
  sessionId: string | null;
  server: { token: string; endpoint: string } | null;
  settle: (error?: unknown) => void;
}

/** Where the bot is in voice in each server, and how it gets there. */
export class VoiceManager {
  readonly #ctx: Context;
  readonly #gateway: VoiceGateway;
  readonly #warn: (message: string) => void;
  readonly #connections = new Map<Snowflake, VoiceConnection>();
  readonly #pending = new Map<Snowflake, PendingJoin>();
  /** The voice session id Discord gave the bot, per server. */
  readonly #sessionIds = new Map<Snowflake, string>();
  /** Only tests change these. */
  readonly #secure: boolean;
  readonly #joinTimeout: number;
  readonly #endedGrace: number;

  constructor(
    ctx: Context,
    gateway: VoiceGateway,
    options: {
      warn: (message: string) => void;
      secure?: boolean;
      joinTimeout?: number;
      endedGrace?: number;
    }
  ) {
    this.#ctx = ctx;
    this.#gateway = gateway;
    this.#warn = options.warn;
    this.#secure = options.secure ?? true;
    this.#joinTimeout = options.joinTimeout ?? JOIN_TIMEOUT;
    this.#endedGrace = options.endedGrace ?? 3000;
  }

  /** The connection of the bot in a server, if it is in voice there. */
  connectionOf(guildId: Snowflake): VoiceConnection | null {
    return this.#connections.get(guildId) ?? null;
  }

  guild(guildId: Snowflake): Guild {
    const guild = this.#ctx.cache.guilds.get(guildId);
    if (!guild) {
      throw new Error(
        `The server ${guildId} is not one the bot is in any more.`
      );
    }
    return guild;
  }

  channel(guildId: Snowflake, channelId: Snowflake): VoiceChannel {
    const channel = this.guild(guildId).channels.get(channelId);
    if (!channel || !('bitrate' in channel)) {
      throw new Error(
        `The voice channel ${channelId} does not exist any more.`
      );
    }
    return channel as VoiceChannel;
  }

  /**
   * Joins a voice channel, or moves there from another channel of the
   * same server. Resolves once audio can be sent.
   */
  async join(
    channel: VoiceChannel,
    options: JoinOptions = {}
  ): Promise<VoiceConnection> {
    const guild = channel.guild;
    const me = guild.me;
    const permissions = me.permissionsIn(channel);
    if (!permissions.has('Connect')) {
      throw new Error(
        `The bot can't join ${channel.name}: it needs the Connect permission there.`
      );
    }
    let inside = 0;
    for (const [userId, entry] of storesOf(guild).voiceStates) {
      if (entry.channel.id === channel.id && userId !== me.id) inside++;
    }
    if (
      channel.userLimit > 0 &&
      inside >= channel.userLimit &&
      !permissions.has('MoveMembers')
    ) {
      throw new Error(
        `The bot can't join ${channel.name}: it is full (${channel.userLimit} people), and the bot does not have the Move Members permission that lets it in anyway.`
      );
    }
    const existing = this.#connections.get(guild.id);
    if (existing?.connected && existing.channel.id === channel.id) {
      return existing;
    }
    const connection = existing?.connected
      ? existing
      : new VoiceConnection(this, guild.id, channel.id);
    this.#connections.set(guild.id, connection);
    await this.#request(guild.id, channel, options);
    if (channel.isStage) await this.#speakOnStage(guild.id, channel);
    return connection;
  }

  /** Leaves the voice channel of a server. */
  async leave(guildId: Snowflake): Promise<void> {
    const connection = this.#connections.get(guildId);
    this.#connections.delete(guildId);
    this.#pending
      .get(guildId)
      ?.settle(new Error('The bot left before it was in the channel.'));
    if (connection) internals(connection).closed();
    await this.#gateway.updateVoiceState({
      guild_id: guildId,
      channel_id: null,
      self_mute: false,
      self_deaf: false,
    });
  }

  /** Closes every connection: the bot is going offline. */
  closeAll(): void {
    for (const connection of this.#connections.values())
      internals(connection).closed();
    this.#connections.clear();
  }

  /** The bot's own Voice State Update. */
  onVoiceState(data: GatewayDispatchEvents['VOICE_STATE_UPDATE']): void {
    const guildId = data.guild_id;
    if (!guildId) return;
    this.#sessionIds.set(guildId, data.session_id);
    const pending = this.#pending.get(guildId);
    if (pending && data.channel_id === pending.channelId) {
      pending.sessionId = data.session_id;
      this.#tryConnect(guildId);
      return;
    }
    const connection = this.#connections.get(guildId);
    if (!connection) return;
    if (data.channel_id === null) {
      // Disconnected by someone, or the channel was deleted.
      this.#connections.delete(guildId);
      internals(connection).closed();
    } else {
      internals(connection).moved(data.channel_id);
    }
  }

  /** Voice Server Update: a voice server, and the token to use it. */
  onVoiceServer(data: GatewayDispatchEvents['VOICE_SERVER_UPDATE']): void {
    // No endpoint: Discord is still choosing a server, another comes.
    if (!data.endpoint) return;
    const guildId = data.guild_id;
    const server = { token: data.token, endpoint: data.endpoint };
    const pending = this.#pending.get(guildId);
    if (pending) {
      pending.server = server;
      this.#tryConnect(guildId);
      return;
    }
    // A new server for a connection that exists: moved, or renewed.
    const connection = this.#connections.get(guildId);
    const sessionId = this.#sessionIds.get(guildId);
    if (!connection?.connected || !sessionId) return;
    void this.#open(connection, guildId, internals(connection).channelId(), {
      ...server,
      sessionId,
    }).catch(error => {
      this.#warn(
        `the bot lost its voice connection: ${(error as Error).message}`
      );
      this.#connections.delete(guildId);
      internals(connection).closed();
    });
  }

  /** Asks Discord to put the bot in a channel, and waits for its answers. */
  #request(
    guildId: Snowflake,
    channel: VoiceChannel,
    options: JoinOptions
  ): Promise<void> {
    this.#pending
      .get(guildId)
      ?.settle(new Error(`The bot was asked to join ${channel.name} instead.`));
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = this.#pending.get(guildId);
        const reason =
          pending?.server &&
          !pending.sessionId &&
          !this.#gateway.hasVoiceStates()
            ? `Discord did not send the bot its voice state: it was connected without the GUILD_VOICE_STATES intent. ChapterJS asks for it when a file of your project calls join(); restart the bot so it is asked.`
            : `Discord did not let the bot join ${channel.name} within ${this.#joinTimeout / 1000} s.`;
        settle(new Error(reason));
      }, this.#joinTimeout);
      const settle = (error?: unknown): void => {
        clearTimeout(timer);
        if (this.#pending.get(guildId)?.settle === settle) {
          this.#pending.delete(guildId);
        }
        if (error) {
          const connection = this.#connections.get(guildId);
          if (connection && !internals(connection).session()) {
            this.#connections.delete(guildId);
            internals(connection).closed();
          }
          reject(error);
        } else resolve();
      };
      this.#pending.set(guildId, {
        channelId: channel.id,
        sessionId: null,
        server: null,
        settle,
      });
      this.#gateway
        .updateVoiceState({
          guild_id: guildId,
          channel_id: channel.id,
          self_mute: options.mute ?? false,
          self_deaf: options.deaf ?? true,
        })
        .catch(settle);
    });
  }

  #tryConnect(guildId: Snowflake): void {
    const pending = this.#pending.get(guildId);
    const connection = this.#connections.get(guildId);
    if (!pending?.sessionId || !pending.server || !connection) return;
    this.#open(connection, guildId, pending.channelId, {
      ...pending.server,
      sessionId: pending.sessionId,
    }).then(
      () => pending.settle(),
      error => pending.settle(error)
    );
  }

  /** A new session with a voice server, given to the connection. */
  async #open(
    connection: VoiceConnection,
    guildId: Snowflake,
    channelId: Snowflake,
    server: { token: string; endpoint: string; sessionId: string }
  ): Promise<void> {
    const self = this.#ctx.self;
    if (!self) throw new Error('The bot is not connected to Discord yet.');
    const dave = await loadDave();
    const info: VoiceServer = {
      ...server,
      guildId,
      channelId,
      userId: self.userId,
    };
    const session: VoiceSession = new VoiceSession(info, {
      dave,
      secure: this.#secure,
      warn: message => this.#warn(message),
      onEnd: end => this.#ended(connection, session, end),
    });
    await session.connect();
    internals(connection).attach(session, info.channelId);
  }

  /** A session ended without the bot leaving. */
  #ended(
    connection: VoiceConnection,
    session: VoiceSession,
    end: SessionEnd
  ): void {
    // An older session, replaced by a move: nothing to do.
    if (internals(connection).session() !== session) return;
    const guildId = session.server.guildId;
    // A move is under way: its new session replaces this one.
    if (this.#pending.has(guildId)) return;
    if (end.type === 'ended' && connection.connected) {
      // Discord may close the old session of a bot it moved before the
      // new server arrives: wait for it a moment.
      setTimeout(() => {
        if (
          internals(connection).session() === session &&
          connection.connected
        ) {
          this.#connections.delete(guildId);
          internals(connection).closed();
        }
      }, this.#endedGrace).unref();
      return;
    }
    if (end.type === 'lost' && connection.connected) {
      // Ask Discord again: a new session comes with a new token.
      void this.#gateway
        .updateVoiceState({
          guild_id: guildId,
          channel_id: internals(connection).channelId(),
          self_mute: false,
          self_deaf: true,
        })
        .catch(() => {});
      return;
    }
    if (end.type === 'refused') {
      this.#warn(
        `the voice server refused the bot (${end.code}): ${end.reason}.`
      );
    }
    this.#connections.delete(guildId);
    internals(connection).closed();
  }

  /**
   * On a stage, the bot is in the audience until it speaks: it asks to
   * become a speaker, and to speak when it may not decide it.
   * https://docs.discord.com/developers/resources/voice#modify-current-user-voice-state
   */
  async #speakOnStage(
    guildId: Snowflake,
    channel: VoiceChannel
  ): Promise<void> {
    try {
      await this.#ctx.rest.request(ModifyCurrentUserVoiceState, [guildId], {
        body: { channel_id: channel.id, suppress: false },
      });
    } catch {
      await this.#ctx.rest
        .request(ModifyCurrentUserVoiceState, [guildId], {
          body: {
            channel_id: channel.id,
            request_to_speak_timestamp: new Date().toISOString(),
          },
        })
        .catch(() => {});
      this.#warn(
        `the bot asked to speak on the stage ${channel.name}: a moderator must accept, or give it the Mute Members permission so it speaks by itself.`
      );
    }
  }
}
