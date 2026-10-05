import { describe, expect, it } from 'vitest';
import {
  API_BASE_URL,
  API_VERSION,
  CDN_BASE_URL,
  DISCORD_EPOCH,
  userAgent,
} from '../../src/discord/api.js';
import { cdn } from '../../src/discord/cdn.js';
import {
  FATAL_GATEWAY_CLOSE_CODES,
  GatewayCloseCode,
  GatewayOpcode,
  JSON_ERROR_CODES,
} from '../../src/discord/codes.js';
import {
  endpoint,
  fillPath,
  majorParameter,
  pathParamNames,
} from '../../src/discord/endpoint.js';
import * as Endpoints from '../../src/discord/endpoints.js';
import {
  channelMention,
  commandMention,
  emojiMention,
  reactionEmoji,
  roleMention,
  timestamp,
  TimestampStyle,
  userMention,
} from '../../src/discord/formatting.js';
import {
  combineIntents,
  EVENT_INTENTS,
  GatewayIntent,
  intentNames,
  PRIVILEGED_INTENTS,
} from '../../src/discord/intents.js';
import {
  compareSnowflakes,
  isSnowflake,
  snowflakeFromTimestamp,
  snowflakeTimestamp,
} from '../../src/discord/snowflake.js';
import * as Types from '../../src/discord/types/index.js';

describe('API constants', () => {
  it('match the official reference', () => {
    expect(API_VERSION).toBe(10);
    expect(API_BASE_URL).toBe('https://discord.com/api');
    expect(CDN_BASE_URL).toBe('https://cdn.discordapp.com');
    expect(DISCORD_EPOCH).toBe(1420070400000n);
  });

  it('builds the User-Agent in the format Discord requires', () => {
    expect(userAgent('1.2.3')).toMatch(
      /^DiscordBot \(https:\/\/\S+, 1\.2\.3\)$/
    );
  });
});

describe('snowflakes', () => {
  // The example of the documentation: 175928847299117063 → 2016-04-30 11:18:25.796 UTC
  const id = '175928847299117063';

  it('reads the creation date of an id', () => {
    expect(new Date(snowflakeTimestamp(id)).toISOString()).toBe(
      '2016-04-30T11:18:25.796Z'
    );
  });

  it('builds the smallest id of a date, usable for pagination', () => {
    const from = snowflakeFromTimestamp(snowflakeTimestamp(id));
    expect(snowflakeTimestamp(from)).toBe(snowflakeTimestamp(id));
    expect(BigInt(from) <= BigInt(id)).toBe(true);
    expect(snowflakeFromTimestamp(new Date('2016-04-30T11:18:25.796Z'))).toBe(
      from
    );
  });

  it('refuses a date before the Discord epoch', () => {
    expect(() => snowflakeFromTimestamp(0)).toThrow(/2015/);
  });

  it.each([
    ['175928847299117063', true],
    ['12345678901234567', true],
    ['1234', false],
    ['', false],
    ['abc', false],
    ['<@175928847299117063>', false],
    [' 175928847299117063', false],
    [175928847299117063, false],
    [null, false],
    [undefined, false],
  ])('isSnowflake(%j) is %s', (value, expected) => {
    expect(isSnowflake(value)).toBe(expected);
  });

  it('sorts ids by age, where text order would be wrong', () => {
    const ids = ['99999999999999999', '100000000000000000', '5'];
    expect([...ids].sort(compareSnowflakes)).toEqual([
      '5',
      '99999999999999999',
      '100000000000000000',
    ]);
    expect(compareSnowflakes('7', '7')).toBe(0);
  });
});

describe('endpoints', () => {
  const all = Object.entries(Endpoints);

  it('describes every endpoint of the API', () => {
    expect(all.length).toBeGreaterThan(200);
  });

  it.each(all)('%s has a valid method and path', (_name, value) => {
    expect(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).toContain(value.method);
    expect(value.path).toMatch(/^\/[a-z@]/);
    // Every placeholder is closed and named.
    expect(value.path.replace(/\{[a-z_.]+\}/g, '')).not.toMatch(/[{}]/);
    expect(Object.isFrozen(value)).toBe(true);
  });

  it('only describes the same request twice where the documentation does', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const [name, value] of all) {
      const key = `${value.method} ${value.path}`;
      if (seen.has(key)) duplicates.push(`${seen.get(key)} / ${name}`);
      seen.set(key, name);
    }
    expect(duplicates).toEqual([
      'CreateDm / CreateGroupDm',
      'StartThreadWithoutMessage / StartThreadInForumOrMediaChannel',
    ]);
  });

  it('knows the documented path of well-known endpoints', () => {
    expect(Endpoints.GetGuildMember).toEqual({
      method: 'GET',
      path: '/guilds/{guild.id}/members/{user.id}',
    });
    expect(Endpoints.CreateMessage).toEqual({
      method: 'POST',
      path: '/channels/{channel.id}/messages',
    });
    expect(Endpoints.CreateGuildBan.method).toBe('PUT');
    expect(Endpoints.GetGatewayBot.path).toBe('/gateway/bot');
  });

  it('lists the placeholders of a path in order', () => {
    expect(pathParamNames('/guilds/{guild.id}/members/{user.id}')).toEqual([
      'guild.id',
      'user.id',
    ]);
    expect(pathParamNames('/users/@me')).toEqual([]);
  });

  it('fills a path, URL-encoding what is not URL-safe', () => {
    expect(fillPath('/guilds/{guild.id}/members/{user.id}', ['1', '2'])).toBe(
      '/guilds/1/members/2'
    );
    expect(
      fillPath(
        '/channels/{channel.id}/messages/{message.id}/reactions/{emoji.id}/@me',
        ['1', '2', '👍']
      )
    ).toBe('/channels/1/messages/2/reactions/%F0%9F%91%8D/@me');
    expect(fillPath('/a/{x}', ['a/b?c'])).toBe('/a/a%2Fb%3Fc');
  });

  it.each([
    [['1'], /takes 2 value\(s\) \(guild\.id, user\.id\), got 1/],
    [['1', '2', '3'], /got 3/],
    [['1', ''], /non-empty text for \{user\.id\}/],
    [['1', undefined as unknown as string], /\{user\.id\}/],
    [['1', 2 as unknown as string], /\{user\.id\}/],
  ])('refuses wrong values %j', (params, message) => {
    expect(() =>
      fillPath('/guilds/{guild.id}/members/{user.id}', params)
    ).toThrow(message);
  });

  it.each([
    ['/channels/{channel.id}/messages/{message.id}', ['1', '2'], '1'],
    ['/guilds/{guild.id}/roles', ['7'], '7'],
    ['/webhooks/{webhook.id}', ['3'], '3'],
    ['/webhooks/{webhook.id}/{webhook.token}', ['3', 'tok'], '3/tok'],
    [
      '/webhooks/{application.id}/{interaction.token}/messages/@original',
      ['9', 'tok'],
      '9/tok',
    ],
    ['/users/{user.id}', ['5'], ''],
    ['/applications/{application.id}/commands', ['5'], ''],
    ['/users/@me', [], ''],
  ])('the top-level resource of %s is %j → %j', (path, params, expected) => {
    expect(majorParameter(path, params)).toBe(expected);
  });

  it('declares an endpoint that cannot be changed', () => {
    const one = endpoint<{ result: string }>()('GET', '/x/{y}');
    expect(one).toEqual({ method: 'GET', path: '/x/{y}' });
    expect(() => {
      (one as { method: string }).method = 'POST';
    }).toThrow();
  });
});

describe('intents', () => {
  it('uses the bits of the documentation', () => {
    expect(GatewayIntent.Guilds).toBe(1);
    expect(GatewayIntent.GuildMembers).toBe(2);
    expect(GatewayIntent.GuildPresences).toBe(256);
    expect(GatewayIntent.GuildMessages).toBe(512);
    expect(GatewayIntent.MessageContent).toBe(32768);
    expect(GatewayIntent.GuildScheduledEvents).toBe(1 << 16);
    expect(GatewayIntent.AutoModerationExecution).toBe(1 << 21);
    expect(GatewayIntent.DirectMessagePolls).toBe(1 << 25);
    expect(new Set(Object.values(GatewayIntent)).size).toBe(
      Object.keys(GatewayIntent).length
    );
  });

  it('knows the three privileged intents', () => {
    expect([...PRIVILEGED_INTENTS].sort()).toEqual([
      'GuildMembers',
      'GuildPresences',
      'MessageContent',
    ]);
  });

  it('combines intents given by name or by value, without counting twice', () => {
    expect(combineIntents([])).toBe(0);
    expect(combineIntents(['Guilds', GatewayIntent.GuildMessages])).toBe(513);
    expect(combineIntents(['Guilds', 'Guilds', 1])).toBe(1);
  });

  it('names the intents of a number', () => {
    expect(intentNames(513)).toEqual(['Guilds', 'GuildMessages']);
    expect(intentNames(0)).toEqual([]);
  });

  it('maps events to the intents that send them', () => {
    expect(EVENT_INTENTS.GUILD_MEMBER_ADD).toEqual([
      GatewayIntent.GuildMembers,
    ]);
    expect(EVENT_INTENTS.MESSAGE_CREATE).toEqual([
      GatewayIntent.GuildMessages,
      GatewayIntent.DirectMessages,
    ]);
    expect(EVENT_INTENTS.MESSAGE_DELETE_BULK).toEqual([
      GatewayIntent.GuildMessages,
    ]);
    expect(EVENT_INTENTS.PRESENCE_UPDATE).toEqual([
      GatewayIntent.GuildPresences,
    ]);
    // Events that need no intent are not listed.
    expect(EVENT_INTENTS.READY).toBeUndefined();
    expect(EVENT_INTENTS.INTERACTION_CREATE).toBeUndefined();
    expect(EVENT_INTENTS.USER_UPDATE).toBeUndefined();
    // MESSAGE_CONTENT does not represent individual events.
    for (const intents of Object.values(EVENT_INTENTS)) {
      expect(intents).not.toContain(GatewayIntent.MessageContent);
      expect(intents!.length).toBeGreaterThan(0);
    }
  });
});

describe('codes', () => {
  it('uses the opcodes of the documentation', () => {
    expect(GatewayOpcode.Dispatch).toBe(0);
    expect(GatewayOpcode.Heartbeat).toBe(1);
    expect(GatewayOpcode.Identify).toBe(2);
    expect(GatewayOpcode.Resume).toBe(6);
    expect(GatewayOpcode.Hello).toBe(10);
    expect(GatewayOpcode.HeartbeatAck).toBe(11);
  });

  it('knows which close codes forbid reconnecting', () => {
    expect([...FATAL_GATEWAY_CLOSE_CODES].sort()).toEqual([
      4004, 4010, 4011, 4012, 4013, 4014,
    ]);
    expect(FATAL_GATEWAY_CLOSE_CODES.has(GatewayCloseCode.UnknownError)).toBe(
      false
    );
    expect(
      FATAL_GATEWAY_CLOSE_CODES.has(GatewayCloseCode.SessionTimedOut)
    ).toBe(false);
  });

  it('explains JSON error codes', () => {
    expect(JSON_ERROR_CODES[10003]).toBe('Unknown channel');
    expect(JSON_ERROR_CODES[50013]).toMatch(/permission/i);
    expect(JSON_ERROR_CODES[50001]).toBe('Missing access');
    expect(Object.keys(JSON_ERROR_CODES).length).toBeGreaterThan(200);
  });
});

describe('enums of the documentation', () => {
  it.each([
    ['ChannelType.GuildText', Types.ChannelType.GuildText, 0],
    ['ChannelType.Dm', Types.ChannelType.Dm, 1],
    ['ChannelType.GuildVoice', Types.ChannelType.GuildVoice, 2],
    ['ChannelType.GuildCategory', Types.ChannelType.GuildCategory, 4],
    ['ChannelType.PublicThread', Types.ChannelType.PublicThread, 11],
    ['ChannelType.GuildForum', Types.ChannelType.GuildForum, 15],
    ['MessageType.Reply', Types.MessageType.Reply, 19],
    ['MessageFlags.Ephemeral', Types.MessageFlags.Ephemeral, 64],
    ['MessageFlags.IsComponentsV2', Types.MessageFlags.IsComponentsV2, 32768],
    [
      'InteractionType.ApplicationCommand',
      Types.InteractionType.ApplicationCommand,
      2,
    ],
    ['InteractionCallbackType.Modal', Types.InteractionCallbackType.Modal, 9],
    ['ComponentType.Button', Types.ComponentType.Button, 2],
    ['ComponentType.Checkbox', Types.ComponentType.Checkbox, 23],
    ['ButtonStyle.Link', Types.ButtonStyle.Link, 5],
    [
      'ApplicationCommandOptionType.Attachment',
      Types.ApplicationCommandOptionType.Attachment,
      11,
    ],
    ['ApplicationCommandType.Message', Types.ApplicationCommandType.Message, 3],
    ['AuditLogEvent.MemberBanAdd', Types.AuditLogEvent.MemberBanAdd, 22],
    [
      'AutoModerationActionType.Timeout',
      Types.AutoModerationActionType.Timeout,
      3,
    ],
    ['PermissionFlags.Administrator', Types.PermissionFlags.Administrator, 8n],
    [
      'PermissionFlags.BypassSlowmode',
      Types.PermissionFlags.BypassSlowmode,
      1n << 52n,
    ],
    ['UserFlags.VerifiedBot', Types.UserFlags.VerifiedBot, 65536],
    ['StickerFormatType.Lottie', Types.StickerFormatType.Lottie, 3],
    ['Locale.French', Types.Locale.French, 'fr'],
    ['TeamMemberRole.ReadOnly', Types.TeamMemberRole.ReadOnly, 'read_only'],
    [
      'AllowedMentionType.Everyone',
      Types.AllowedMentionType.Everyone,
      'everyone',
    ],
    ['GuildWidgetStyle.Banner2', Types.GuildWidgetStyle.Banner2, 'banner2'],
  ])('%s is %s', (_name, actual, expected) => {
    expect(actual).toBe(expected);
  });

  it('never gives two names the same value in an enum', () => {
    for (const [name, value] of Object.entries(Types)) {
      if (typeof value !== 'object' || value === null) continue;
      const values = Object.values(value);
      expect(new Set(values).size, name).toBe(values.length);
      for (const key of Object.keys(value)) {
        expect(key, `${name}.${key}`).toMatch(/^[A-Z][A-Za-z0-9]*$/);
      }
    }
  });
});

describe('message formatting', () => {
  it('builds mentions', () => {
    expect(userMention('1')).toBe('<@1>');
    expect(channelMention('2')).toBe('<#2>');
    expect(roleMention('3')).toBe('<@&3>');
    expect(commandMention('foo group bar', '4')).toBe('</foo group bar:4>');
    expect(emojiMention('lol', '5')).toBe('<:lol:5>');
    expect(emojiMention('lol', '5', true)).toBe('<a:lol:5>');
  });

  it('builds timestamps in seconds', () => {
    expect(timestamp(1618953630000)).toBe('<t:1618953630>');
    expect(timestamp(1618953630999, TimestampStyle.Relative)).toBe(
      '<t:1618953630:R>'
    );
    expect(timestamp(new Date(1618953630000), TimestampStyle.ShortDate)).toBe(
      '<t:1618953630:d>'
    );
    expect(() => timestamp(new Date('nope'))).toThrow(/valid date/);
  });

  it('writes the emoji of a reaction as paths expect it', () => {
    expect(reactionEmoji({ name: '👍' })).toBe('👍');
    expect(reactionEmoji({ id: '5', name: 'lol' })).toBe('lol:5');
    expect(reactionEmoji({ id: null, name: '🔥' })).toBe('🔥');
    expect(() => reactionEmoji({})).toThrow(/name or an id/);
  });
});

describe('CDN', () => {
  const base = 'https://cdn.discordapp.com';

  it('requests WebP by default', () => {
    expect(cdn.userAvatar('1', 'abc')).toBe(`${base}/avatars/1/abc.webp`);
    expect(cdn.guildIcon('1', 'abc', { size: 256 })).toBe(
      `${base}/icons/1/abc.webp?size=256`
    );
  });

  it('keeps animated images animated, unless asked not to', () => {
    expect(cdn.userAvatar('1', 'a_abc')).toBe(
      `${base}/avatars/1/a_abc.webp?animated=true`
    );
    expect(cdn.userAvatar('1', 'a_abc', { animated: false })).toBe(
      `${base}/avatars/1/a_abc.webp`
    );
    expect(cdn.userAvatar('1', 'a_abc', { format: 'gif', size: 64 })).toBe(
      `${base}/avatars/1/a_abc.gif?size=64`
    );
    expect(cdn.userAvatar('1', 'a_abc', { format: 'png' })).toBe(
      `${base}/avatars/1/a_abc.png`
    );
  });

  it('never asks a GIF of an image that is not animated', () => {
    expect(cdn.userAvatar('1', 'abc', { format: 'gif' })).toBe(
      `${base}/avatars/1/abc.png`
    );
    // Splashes don't support GIF, whatever the hash looks like.
    expect(cdn.guildSplash('1', 'a_abc', { format: 'gif' })).toBe(
      `${base}/splashes/1/a_abc.png`
    );
  });

  it('computes the default avatar of both username systems', () => {
    expect(cdn.defaultUserAvatar('175928847299117063', '0')).toBe(
      `${base}/embed/avatars/${Number((175928847299117063n >> 22n) % 6n)}.png`
    );
    expect(cdn.defaultUserAvatar('1', '0007')).toBe(
      `${base}/embed/avatars/2.png`
    );
  });

  it('serves stickers by format', () => {
    expect(cdn.sticker('9', Types.StickerFormatType.Png)).toBe(
      `${base}/stickers/9.png`
    );
    expect(cdn.sticker('9', Types.StickerFormatType.Apng)).toBe(
      `${base}/stickers/9.png`
    );
    expect(cdn.sticker('9', Types.StickerFormatType.Lottie)).toBe(
      `${base}/stickers/9.json`
    );
    expect(cdn.sticker('9', Types.StickerFormatType.Gif)).toBe(
      'https://media.discordapp.net/stickers/9.gif'
    );
  });

  it('builds emoji, member and role images', () => {
    expect(cdn.emoji('5', false)).toBe(`${base}/emojis/5.webp`);
    expect(cdn.emoji('5', true)).toBe(`${base}/emojis/5.webp?animated=true`);
    expect(cdn.memberAvatar('1', '2', 'h')).toBe(
      `${base}/guilds/1/users/2/avatars/h.webp`
    );
    expect(cdn.roleIcon('3', 'h')).toBe(`${base}/role-icons/3/h.webp`);
  });

  it.each([0, 15, 100, 8192, 64.5, -64, NaN])('refuses the size %s', size => {
    expect(() => cdn.userAvatar('1', 'abc', { size: size as 64 })).toThrow(
      /power of two between 16 and 4096/
    );
  });

  it.each([16, 32, 64, 128, 256, 512, 1024, 2048, 4096] as const)(
    'accepts the size %s',
    size => {
      expect(cdn.userAvatar('1', 'abc', { size })).toContain(`size=${size}`);
    }
  );

  it('refuses an unknown format', () => {
    expect(() =>
      cdn.userAvatar('1', 'abc', { format: 'bmp' as 'png' })
    ).toThrow(/not an image format/);
  });
});
