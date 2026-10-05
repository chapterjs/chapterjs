import { describe, expect, it } from 'vitest';
import { MemoryStore, memoryStore, trimStore } from '../src/cache/store.js';
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

  it('drops the entry written the longest ago when full', () => {
    const store = new MemoryStore<string, number>({ limit: 2 });
    store.set('a', 1).set('b', 2).set('c', 3);
    expect([...store.keys()]).toEqual(['b', 'c']);
    // Written again, an entry is the most recent: it evicts nothing, and
    // it is the other one that leaves next.
    store.set('b', 20);
    expect([...store.entries()]).toEqual([
      ['c', 3],
      ['b', 20],
    ]);
    store.set('d', 4);
    expect([...store.keys()]).toEqual(['b', 'd']);
  });

  it('keeps its order when it has no limit: nothing to move', () => {
    const store = new MemoryStore<string, number>();
    store.set('a', 1).set('b', 2).set('a', 10);
    expect([...store.entries()]).toEqual([
      ['a', 10],
      ['b', 2],
    ]);
  });

  it.each([
    [5, 2, 3, ['d', 'e']],
    [5, 0, 5, []],
    [5, 5, 0, ['a', 'b', 'c', 'd', 'e']],
    [5, 9, 0, ['a', 'b', 'c', 'd', 'e']],
    [5, -1, 5, []],
    [0, 3, 0, []],
  ])(
    'forgets its oldest entries on demand: %i entries, keep %i',
    (size, keep, forgotten, left) => {
      const store = new MemoryStore<string, number>();
      for (const key of ['a', 'b', 'c', 'd', 'e'].slice(0, size)) {
        store.set(key, 1);
      }
      expect(trimStore(store, keep)).toBe(forgotten);
      expect([...store.keys()]).toEqual(left);
    }
  );

  it('can be given another limit: lowered, the oldest leave at once', () => {
    const store = new MemoryStore<string, number>({ limit: 4 });
    for (const key of ['a', 'b', 'c', 'd']) store.set(key, 1);
    expect(store.limit).toBe(4);
    expect(store.resize(2)).toBe(2);
    expect(store.limit).toBe(2);
    expect([...store.keys()]).toEqual(['c', 'd']);
    store.set('e', 1);
    expect([...store.keys()]).toEqual(['d', 'e']);
    // Raised, nothing leaves and there is room again.
    expect(store.resize(Infinity)).toBe(0);
    store.set('f', 1).set('g', 1);
    expect(store.size).toBe(4);
    expect(new MemoryStore().limit).toBe(Infinity);
    expect(store.resize(0)).toBe(4);
    store.set('h', 1);
    expect(store.size).toBe(0);
    expect(() => store.resize(-1)).toThrow(/0 or more/);
    expect(() => store.resize(NaN)).toThrow(/0 or more/);
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
