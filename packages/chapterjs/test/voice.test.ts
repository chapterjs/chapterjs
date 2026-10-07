// The bot in voice, against a fake voice server of Discord: joining,
// playing in time, pausing, moving, leaving, what Discord closes, and the
// DAVE side the bot drives (key package, transitions).
import {
  fakeDiscord,
  fakeVoice,
  tempDir,
  type FakeVoice,
} from '@chapterjs/test-utils';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { asset, setPublicDir } from '../src/assets/asset.js';
import { Cache } from '../src/cache/cache.js';
import { VoiceOpcode } from '../src/discord/codes.js';
import type { RawGatewayVoiceStateUpdate } from '../src/discord/types/gateway-events.js';
import { RestClient } from '../src/rest/rest.js';
import type { VoiceChannel } from '../src/structures/channel.js';
import { createContext } from '../src/structures/entities.js';
import { VoiceManager, type VoiceConnection } from '../src/voice/connection.js';
import { ogg } from './voice-helpers.js';

const GUILD = '100000000000000000';
const OWNER = '100000000000000001';
const BOT = '100000000000000002';
const ALICE = '100000000000000003';
const VOICE = '100000000000000010';
const OTHER = '100000000000000011';
const STAGE = '100000000000000012';
const ALL = String((1n << 20n) | (1n << 21n) | (1n << 10n));

/** A packet of `n`, 20 ms of CELT. */
const packet = (n: number) => Buffer.from([0xfc, n, n, n]);

async function world(
  options: { permissions?: string; userLimit?: number } = {}
) {
  const discord = await fakeDiscord();
  const voice = await fakeVoice();
  const rest = new RestClient({
    token: 't',
    version: '10',
    baseUrl: discord.url,
  });
  const ctx = createContext({ rest, cache: new Cache() });
  ctx.self = { userId: BOT, applicationId: BOT };
  ctx.entities.guild({
    id: GUILD,
    name: 'Dev Server',
    owner_id: OWNER,
    roles: [
      {
        id: GUILD,
        name: '@everyone',
        permissions: options.permissions ?? ALL,
        position: 0,
      },
    ],
    emojis: [],
    features: [],
    members: [
      {
        user: { id: BOT, username: 'bot', discriminator: '0', bot: true },
        roles: [],
        joined_at: null,
        deaf: false,
        mute: false,
        flags: 0,
      },
    ],
    channels: [
      {
        id: VOICE,
        type: 2,
        name: 'Lounge',
        user_limit: options.userLimit ?? 0,
      },
      { id: OTHER, type: 2, name: 'Music' },
      { id: STAGE, type: 13, name: 'Stage' },
    ],
    voice_states: [],
  } as never);

  const sent: RawGatewayVoiceStateUpdate[] = [];
  const warnings: string[] = [];
  let sessions = 0;
  // What Discord answers a Voice State Update: the bot's voice state with
  // its session, then the voice server.
  let answers = true;
  const manager: VoiceManager = new VoiceManager(
    ctx,
    {
      async updateVoiceState(data) {
        sent.push(data);
        if (!answers) return;
        setImmediate(() => {
          manager.onVoiceState({
            guild_id: data.guild_id,
            channel_id: data.channel_id,
            user_id: BOT,
            session_id: `voice-session-${++sessions}`,
            deaf: false,
            mute: false,
            self_deaf: data.self_deaf,
            self_mute: data.self_mute,
            self_video: false,
            suppress: false,
            request_to_speak_timestamp: null,
          });
          if (data.channel_id) {
            manager.onVoiceServer({
              guild_id: data.guild_id,
              token: `voice-token-${sessions}`,
              endpoint: voice.endpoint,
            });
          }
        });
      },
      hasVoiceStates: () => true,
    },
    {
      warn: message => warnings.push(message),
      secure: false,
      joinTimeout: 500,
      endedGrace: 100,
    }
  );
  ctx.voice = manager;
  const guild = ctx.cache.guilds.get(GUILD)!;
  const channel = (id: string) => guild.channels.get(id) as VoiceChannel;

  const cwd = tempDir();
  mkdirSync(join(cwd, 'public'));
  setPublicDir(cwd);
  const file = (name: string, packets: Buffer[]) => {
    writeFileSync(join(cwd, 'public', name), ogg(packets));
    return asset(name);
  };

  return {
    discord,
    voice,
    ctx,
    guild,
    channel,
    manager,
    sent,
    warnings,
    file,
    stopAnswering: () => (answers = false),
  };
}

afterEach(() => setPublicDir('/nowhere'));

/** The payloads of every connection, by op. */
const ops = (voice: FakeVoice, index = 0) =>
  voice.connections[index]!.received.map(payload => payload.op);

describe('joining a voice channel', () => {
  it('asks the gateway, then identifies to the voice server with what it answered', async () => {
    const w = await world();
    const connection = await w.channel(VOICE).join();
    expect(w.sent).toEqual([
      { guild_id: GUILD, channel_id: VOICE, self_mute: false, self_deaf: true },
    ]);
    const server = await w.voice.connection(0);
    expect(server.query.v).toBe('8');
    expect((await server.waitFor(VoiceOpcode.Identify)).d).toEqual({
      server_id: GUILD,
      user_id: BOT,
      session_id: 'voice-session-1',
      token: 'voice-token-1',
      max_dave_protocol_version: 1,
    });
    const select = (await server.waitFor(VoiceOpcode.SelectProtocol)).d as {
      protocol: string;
      data: { address: string; port: number; mode: string };
    };
    expect(select.protocol).toBe('udp');
    expect(select.data.address).toBe('127.0.0.1');
    expect(select.data.port).toBeGreaterThan(0);
    expect(select.data.mode).toBe('aead_aes256_gcm_rtpsize');
    expect(connection.channel.id).toBe(VOICE);
    expect(connection.connected).toBe(true);
    expect(w.guild.voice).toBe(connection);
    // Joining the same channel again changes nothing.
    expect(await w.channel(VOICE).join({ deaf: false })).toBe(connection);
    expect(w.sent).toHaveLength(1);
    // Nothing secret when it is logged.
    expect(JSON.stringify(connection)).toBe(
      `{"guildId":"${GUILD}","channelId":"${VOICE}","connected":true,"playing":false,"paused":false}`
    );
  });

  it('passes deaf and mute as the bot asks', async () => {
    const w = await world();
    await w.channel(VOICE).join({ deaf: false, mute: true });
    expect(w.sent[0]).toMatchObject({ self_deaf: false, self_mute: true });
  });

  it.each([
    [
      String((1n << 21n) | (1n << 10n)),
      "The bot can't join Lounge: it needs the Connect permission there.",
    ],
  ])('refuses without permission (%s)', async (permissions, message) => {
    const w = await world({ permissions });
    await expect(w.channel(VOICE).join()).rejects.toThrow(message);
    expect(w.sent).toHaveLength(0);
  });

  it('refuses a full channel, unless the bot may move members', async () => {
    const w = await world({ userLimit: 1 });
    w.ctx.entities.voiceState(GUILD, {
      user_id: ALICE,
      channel_id: VOICE,
      session_id: 's',
    } as never);
    await expect(w.channel(VOICE).join()).rejects.toThrow(
      "The bot can't join Lounge: it is full (1 people), and the bot does not have the Move Members permission that lets it in anyway."
    );
    const moving = await world({
      userLimit: 1,
      permissions: String(BigInt(ALL) | (1n << 24n)),
    });
    moving.ctx.entities.voiceState(GUILD, {
      user_id: ALICE,
      channel_id: VOICE,
      session_id: 's',
    } as never);
    await expect(moving.channel(VOICE).join()).resolves.toBeDefined();
  });

  it('says when Discord never answers', async () => {
    const w = await world();
    w.stopAnswering();
    await expect(w.channel(VOICE).join()).rejects.toThrow(
      'Discord did not let the bot join Lounge within 0.5 s.'
    );
    expect(w.guild.voice).toBeNull();
  });

  it('chooses XChaCha20 when the voice server offers no AES', async () => {
    const w = await world();
    w.voice.behavior.modes = [
      'aead_xchacha20_poly1305_rtpsize',
      'xsalsa20_poly1305',
    ];
    await w.channel(VOICE).join();
    const select = (
      await (await w.voice.connection(0)).waitFor(VoiceOpcode.SelectProtocol)
    ).d as {
      data: { mode: string };
    };
    expect(select.data.mode).toBe('aead_xchacha20_poly1305_rtpsize');
  });
});

describe('the voice channel of a member', () => {
  it('is the one Discord said they are in, and none once they left', async () => {
    const w = await world();
    const alice = w.ctx.entities.member(GUILD, {
      user: { id: ALICE, username: 'alice', discriminator: '0' },
      roles: [],
      joined_at: null,
      deaf: false,
      mute: false,
      flags: 0,
    } as never);
    expect(alice.voiceChannel).toBeNull();
    w.ctx.entities.voiceState(GUILD, {
      user_id: ALICE,
      channel_id: OTHER,
      session_id: 's',
    } as never);
    expect(alice.voiceChannel?.name).toBe('Music');
    w.ctx.entities.voiceState(GUILD, {
      user_id: ALICE,
      channel_id: null,
      session_id: 's',
    } as never);
    expect(alice.voiceChannel).toBeNull();
  });
});

describe('playing', () => {
  it('sends each packet in time, then five frames of silence, saying it speaks', async () => {
    const w = await world();
    const connection = await w.channel(VOICE).join();
    const packets = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(packet);
    const started = performance.now();
    await connection.play(w.file('song.ogg', packets));
    const took = performance.now() - started;
    // Ten packets of 20 ms: about 200 ms, never all at once.
    expect(took).toBeGreaterThan(150);
    expect(connection.playing).toBe(false);
    const received = await w.voice.waitForPackets(15);
    expect(received.map(p => p.payload)).toEqual([
      ...packets,
      ...Array(5).fill(Buffer.from([0xf8, 0xff, 0xfe])),
    ]);
    for (const [index, p] of received.entries()) {
      expect(p.ssrc).toBe(w.voice.ssrc);
      expect(p.sequence).toBe((received[0]!.sequence + index) & 0xffff);
      expect(p.timestamp).toBe((received[0]!.timestamp + index * 960) >>> 0);
    }
    const server = w.voice.connections[0]!;
    const speaking = server.received
      .filter(p => p.op === VoiceOpcode.Speaking)
      .map(p => p.d);
    expect(speaking).toEqual([
      { speaking: 1, delay: 0, ssrc: w.voice.ssrc },
      { speaking: 0, delay: 0, ssrc: w.voice.ssrc },
    ]);
  });

  it('pauses, resumes and stops', async () => {
    const w = await world();
    const connection = await w.channel(VOICE).join();
    const packets = Array.from({ length: 30 }, (_, n) => packet(n));
    const playing = connection.play(w.file('long.ogg', packets));
    await w.voice.waitForPackets(3);
    connection.pause();
    expect(connection.paused).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 60));
    const during = w.voice.packets.length;
    await new Promise(resolve => setTimeout(resolve, 100));
    // Paused: only the silence that ends a pause, nothing more.
    expect(w.voice.packets.length).toBe(during);
    expect(w.voice.packets.at(-1)!.payload).toEqual(
      Buffer.from([0xf8, 0xff, 0xfe])
    );
    connection.resume();
    expect(connection.paused).toBe(false);
    await new Promise(resolve => setTimeout(resolve, 80));
    connection.stop();
    await playing;
    const opus = w.voice.packets
      .map(p => p.payload!)
      .filter(payload => payload[0] === 0xfc);
    // In order, nothing lost, and the end was not reached.
    expect(opus).toEqual(packets.slice(0, opus.length));
    expect(opus.length).toBeLessThan(30);
  });

  it('replaces what was playing', async () => {
    const w = await world();
    const connection = await w.channel(VOICE).join();
    const first = connection.play(
      w.file(
        'a.ogg',
        Array.from({ length: 50 }, () => packet(1))
      )
    );
    await w.voice.waitForPackets(2);
    await connection.play(w.file('b.ogg', [packet(2)]));
    await first;
    expect(w.voice.packets.some(p => p.payload?.[1] === 2)).toBe(true);
  });

  it('refuses without the Speak permission', async () => {
    const w = await world({ permissions: String((1n << 20n) | (1n << 10n)) });
    const connection = await w.channel(VOICE).join();
    await expect(connection.play(w.file('a.ogg', [packet(1)]))).rejects.toThrow(
      "The bot can't play in Lounge: it needs the Speak permission there."
    );
  });
});

describe('leaving and being moved', () => {
  it('leaves: the gateway is told, the voice server closed, nothing plays any more', async () => {
    const w = await world();
    const connection = await w.channel(VOICE).join();
    await connection.leave();
    expect(w.sent.at(-1)).toEqual({
      guild_id: GUILD,
      channel_id: null,
      self_mute: false,
      self_deaf: false,
    });
    expect(await w.voice.connections[0]!.waitForClose()).toBe(1000);
    expect(connection.connected).toBe(false);
    expect(w.guild.voice).toBeNull();
    await expect(connection.play(w.file('a.ogg', [packet(1)]))).rejects.toThrow(
      'The bot is no longer in this voice channel: join it again with channel.join().'
    );
  });

  it('moves to another channel with the same connection and a new session', async () => {
    const w = await world();
    const connection = await w.channel(VOICE).join();
    const moved = await w.channel(OTHER).join();
    expect(moved).toBe(connection);
    expect(connection.channel.id).toBe(OTHER);
    const second = await w.voice.connection(1);
    expect((await second.waitFor(VoiceOpcode.Identify)).d).toMatchObject({
      session_id: 'voice-session-2',
      token: 'voice-token-2',
    });
    expect(await w.voice.connections[0]!.waitForClose()).toBe(1000);
  });

  it('ends when someone disconnects the bot', async () => {
    const w = await world();
    const connection = await w.channel(VOICE).join();
    const playing = connection.play(
      w.file(
        'a.ogg',
        Array.from({ length: 50 }, () => packet(1))
      )
    );
    w.manager.onVoiceState({
      guild_id: GUILD,
      channel_id: null,
      user_id: BOT,
      session_id: 'x',
    } as never);
    await playing;
    expect(connection.connected).toBe(false);
    expect(w.guild.voice).toBeNull();
  });

  it('follows a move made by someone else', async () => {
    const w = await world();
    const connection = await w.channel(VOICE).join();
    w.manager.onVoiceState({
      guild_id: GUILD,
      channel_id: OTHER,
      user_id: BOT,
      session_id: 'moved',
    } as never);
    w.manager.onVoiceServer({
      guild_id: GUILD,
      token: 'after-move',
      endpoint: w.voice.endpoint,
    });
    const second = await w.voice.connection(1);
    expect((await second.waitFor(VoiceOpcode.Identify)).d).toMatchObject({
      session_id: 'moved',
      token: 'after-move',
    });
    expect(connection.channel.id).toBe(OTHER);
  });

  it.each([
    [4014, false],
    [4022, false],
  ])('ends when the voice server closes with %i', async code => {
    const w = await world();
    const connection = await w.channel(VOICE).join();
    w.voice.connections[0]!.close(code);
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(connection.connected).toBe(false);
    expect(w.guild.voice).toBeNull();
  });

  it('asks the gateway again when the session is lost (4006)', async () => {
    const w = await world();
    const connection = await w.channel(VOICE).join();
    w.voice.connections[0]!.close(4006);
    const second = await w.voice.connection(1);
    await second.waitFor(VoiceOpcode.Identify);
    expect(w.sent).toHaveLength(2);
    expect(w.sent[1]).toMatchObject({ channel_id: VOICE });
    expect(connection.connected).toBe(true);
  });

  it('resumes when the connection drops, with the last sequence it saw', async () => {
    const w = await world();
    const connection = await w.channel(VOICE).join();
    const first = w.voice.connections[0]!;
    first.send({
      op: VoiceOpcode.ClientsConnect,
      d: { user_ids: [ALICE] },
      seq: 7,
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    first.drop();
    const second = await w.voice.connection(1, 3000);
    expect((await second.waitFor(VoiceOpcode.Resume)).d).toEqual({
      server_id: GUILD,
      session_id: 'voice-session-1',
      token: 'voice-token-1',
      seq_ack: 7,
    });
    expect(connection.connected).toBe(true);
  });

  it('says what Discord refused, and ends', async () => {
    const w = await world();
    const connection = await w.channel(VOICE).join();
    w.voice.connections[0]!.close(4017);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(connection.connected).toBe(false);
    expect(w.warnings).toEqual([
      'the voice server refused the bot (4017): the channel requires end-to-end encryption (DAVE).',
    ]);
  });
});

describe('heartbeats', () => {
  it('are sent with the last sequence, and a missing ACK resumes', async () => {
    const w = await world();
    w.voice.behavior.heartbeatInterval = 40;
    await w.channel(VOICE).join();
    const first = w.voice.connections[0]!;
    const beat = (await first.waitFor(VoiceOpcode.Heartbeat)).d as {
      t: number;
      seq_ack: number;
    };
    expect(beat.seq_ack).toBe(-1);
    expect(typeof beat.t).toBe('number');
    w.voice.behavior.ackHeartbeats = false;
    const second = await w.voice.connection(1, 3000);
    await second.waitFor(VoiceOpcode.Resume);
  });
});

describe('end-to-end encryption (DAVE)', () => {
  it('sends a key package when the call is encrypted, and nothing it could not encrypt', async () => {
    const w = await world();
    w.voice.behavior.daveVersion = 1;
    const connection = await w.channel(VOICE).join();
    const server = w.voice.connections[0]!;
    const keyPackage = await server.waitForBinary(
      VoiceOpcode.DaveMlsKeyPackage
    );
    // An MLS KeyPackage, as libdave writes it: version mls10 (1), then
    // the ciphersuite of DAVE 1 (DHKEMP256_AES128GCM_SHA256_P256, 2).
    expect(keyPackage.readUInt16BE(0)).toBe(1);
    expect(keyPackage.readUInt16BE(2)).toBe(2);
    // No group yet, so no key: what plays is not sent.
    const started = performance.now();
    await connection.play(w.file('a.ogg', [packet(1), packet(2)]));
    expect(performance.now() - started).toBeGreaterThan(30);
    expect(w.voice.packets).toHaveLength(0);
  });

  it('follows a downgrade to transport encryption only', async () => {
    const w = await world();
    w.voice.behavior.daveVersion = 1;
    const connection = await w.channel(VOICE).join();
    const server = w.voice.connections[0]!;
    server.send({
      op: VoiceOpcode.DavePrepareTransition,
      d: { transition_id: 5, protocol_version: 0 },
      seq: 1,
    });
    expect((await server.waitFor(VoiceOpcode.DaveTransitionReady)).d).toEqual({
      transition_id: 5,
    });
    server.send({
      op: VoiceOpcode.DaveExecuteTransition,
      d: { transition_id: 5 },
      seq: 2,
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    await connection.play(w.file('a.ogg', [packet(1)]));
    // In clear inside the transport encryption: the call is no longer E2EE.
    expect((await w.voice.waitForPackets(1))[0]!.payload).toEqual(packet(1));
  });

  it('starts over with a new key package when a group is (re)created', async () => {
    const w = await world();
    w.voice.behavior.daveVersion = 1;
    await w.channel(VOICE).join();
    const server = w.voice.connections[0]!;
    await server.waitForBinary(VoiceOpcode.DaveMlsKeyPackage);
    server.send({
      op: VoiceOpcode.DavePrepareEpoch,
      d: { epoch: 1, protocol_version: 1 },
      seq: 1,
    });
    const deadline = Date.now() + 1000;
    while (
      server.binary.filter(m => m.op === VoiceOpcode.DaveMlsKeyPackage).length <
      2
    ) {
      if (Date.now() > deadline) throw new Error('no second key package');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const [one, two] = server.binary.filter(
      m => m.op === VoiceOpcode.DaveMlsKeyPackage
    );
    // A key package is never used twice.
    expect(one!.payload).not.toEqual(two!.payload);
  });

  it('reports a commit it can not process, and asks to be added again', async () => {
    const w = await world();
    w.voice.behavior.daveVersion = 1;
    await w.channel(VOICE).join();
    const server = w.voice.connections[0]!;
    await server.waitForBinary(VoiceOpcode.DaveMlsKeyPackage);
    server.sendBinary(
      VoiceOpcode.DaveMlsWelcome,
      Buffer.from([0, 9, 1, 2, 3, 4])
    );
    expect(
      (await server.waitFor(VoiceOpcode.DaveMlsInvalidCommitWelcome)).d
    ).toEqual({
      transition_id: 9,
    });
  });
});

describe('a stage', () => {
  it('makes the bot a speaker, or asks to speak when it may not', async () => {
    const w = await world();
    w.discord.on('PATCH', `/guilds/${GUILD}/voice-states/@me`, { status: 204 });
    await w.channel(STAGE).join();
    expect(
      w.discord.requestsTo('PATCH', `/guilds/${GUILD}/voice-states/@me`)[0]!
        .body
    ).toEqual({
      channel_id: STAGE,
      suppress: false,
    });
    const refused = await world();
    refused.discord.on(
      'PATCH',
      `/guilds/${GUILD}/voice-states/@me`,
      { status: 403, body: { code: 50013, message: 'Missing Permissions' } },
      { status: 204 }
    );
    await refused.channel(STAGE).join();
    const [, ask] = refused.discord.requestsTo(
      'PATCH',
      `/guilds/${GUILD}/voice-states/@me`
    );
    expect(Object.keys(ask!.body as object)).toEqual([
      'channel_id',
      'request_to_speak_timestamp',
    ]);
    expect(refused.warnings).toEqual([
      'the bot asked to speak on the stage Stage: a moderator must accept, or give it the Mute Members permission so it speaks by itself.',
    ]);
  });
});

export type { VoiceConnection };
