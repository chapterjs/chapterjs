import { describe, expect, it } from 'vitest';
import { MemoryStore, memoryStore } from '../src/cache/store.js';
import { Permissions } from '../src/discord/permissions.js';
import { toCamelCase, toSnakeCase } from '../src/util/case.js';

describe('toSnakeCase', () => {
  it('renames fields at every depth', () => {
    expect(
      toSnakeCase<unknown>({
        channelId: '1',
        allowedMentions: { repliedUser: true, parse: ['users'] },
        embeds: [{ author: { iconUrl: 'x', proxyIconUrl: 'y' } }],
        rateLimitPerUser: 5,
      })
    ).toEqual({
      channel_id: '1',
      allowed_mentions: { replied_user: true, parse: ['users'] },
      embeds: [{ author: { icon_url: 'x', proxy_icon_url: 'y' } }],
      rate_limit_per_user: 5,
    });
  });

  it('leaves ids, locales and already converted names alone', () => {
    const value = {
      nameLocalizations: { 'en-US': 'a', fr: 'b', 'es-419': 'c' },
      nicks: { '175928847299117063': 'Bob' },
      already_snake: 1,
      UPPER: 2,
      a: 3,
    };
    expect(toSnakeCase<unknown>(value)).toEqual({
      name_localizations: { 'en-US': 'a', fr: 'b', 'es-419': 'c' },
      nicks: { '175928847299117063': 'Bob' },
      already_snake: 1,
      UPPER: 2,
      a: 3,
    });
  });

  it('drops undefined, keeps null, false, 0 and empty text', () => {
    expect(
      toSnakeCase<unknown>({ a: undefined, bC: null, d: false, e: 0, f: '' })
    ).toEqual({ b_c: null, d: false, e: 0, f: '' });
  });

  it('turns dates and permissions into what Discord expects', () => {
    expect(
      toSnakeCase<unknown>({
        scheduledStartTime: new Date('2030-01-02T03:04:05.000Z'),
        permissions: new Permissions('BanMembers'),
      })
    ).toEqual({
      scheduled_start_time: '2030-01-02T03:04:05.000Z',
      permissions: '4',
    });
  });

  it('never changes what it is given', () => {
    const input = { someKey: { innerKey: [1] } };
    toSnakeCase<unknown>(input);
    expect(input).toEqual({ someKey: { innerKey: [1] } });
  });

  it.each([null, 5, 'someText', true, [], {}])('keeps %j', value => {
    expect(toSnakeCase<unknown>(value as never)).toEqual(value);
  });
});

describe('toCamelCase', () => {
  it('renames fields at every depth', () => {
    expect(
      toCamelCase({
        guild_id: '1',
        thread_metadata: { auto_archive_duration: 60 },
        audit_log_entries: [{ action_type: 22, user_id: null }],
        v2_flag_1: true,
      })
    ).toEqual({
      guildId: '1',
      threadMetadata: { autoArchiveDuration: 60 },
      auditLogEntries: [{ actionType: 22, userId: null }],
      v2Flag1: true,
    });
  });

  it('leaves ids, locales and values alone', () => {
    const value = {
      name_localizations: { 'en-US': 'a_b', 'pt-BR': 'c' },
      users: { '175928847299117063': { global_name: 'snake_value' } },
      key: 'some_key',
    };
    expect(toCamelCase(value)).toEqual({
      nameLocalizations: { 'en-US': 'a_b', 'pt-BR': 'c' },
      users: { '175928847299117063': { globalName: 'snake_value' } },
      key: 'some_key',
    });
  });

  it('is the inverse of toSnakeCase for field names', () => {
    const snake = { a_b: { c_d_e: [{ f_g: 1 }] }, h: 2 };
    expect(toSnakeCase<unknown>(toCamelCase(snake))).toEqual(snake);
  });
});

describe('MemoryStore', () => {
  it('is a Map without limit by default', () => {
    const store = new MemoryStore<string, number>();
    for (let i = 0; i < 5000; i++) store.set(String(i), i);
    expect(store.size).toBe(5000);
    expect(store.get('4999')).toBe(4999);
    expect(store.delete('0')).toBe(true);
    expect(store.delete('0')).toBe(false);
    store.clear();
    expect(store.size).toBe(0);
  });

  it('drops the oldest entry when full', () => {
    const store = new MemoryStore<string, number>({ limit: 2 });
    store.set('a', 1).set('b', 2).set('c', 3);
    expect([...store.keys()]).toEqual(['b', 'c']);
    // Updating an entry that is already there evicts nothing.
    store.set('b', 20);
    expect([...store.entries()]).toEqual([
      ['b', 20],
      ['c', 3],
    ]);
  });

  it('keeps nothing with a limit of 0', () => {
    const store = new MemoryStore<string, number>({ limit: 0 });
    store.set('a', 1);
    expect(store.size).toBe(0);
    expect(store.get('a')).toBeUndefined();
  });

  it.each([-1, NaN])('refuses the limit %s', limit => {
    expect(() => new MemoryStore({ limit })).toThrow(/0 or more/);
  });

  it('is what the default factory creates', () => {
    const store = memoryStore<string, number>({ limit: 1 });
    store.set('a', 1);
    store.set('b', 2);
    expect([...store.keys()]).toEqual(['b']);
  });
});
