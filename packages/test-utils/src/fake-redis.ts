// A local Redis, on `node:net`: it speaks RESP2, logs users in, keeps keys
// per database with their expiration, and answers the commands the
// framework sends (and a few more a test may want). Its RESP reader is its
// own, so the client of the framework is checked against a second reading
// of the protocol, not against itself. Closed when the test ends.

import { createServer, type Server, type Socket } from 'node:net';
import { onTestFinished } from 'vitest';

/** One client connected to the fake. */
export interface FakeRedisConnection {
  /** The commands received on this connection, in order. */
  commands: string[][];
  /** Whether AUTH succeeded (or none is needed). */
  authenticated: boolean;
  db: number;
  closed: boolean;
  /** The keys WATCH is watching, with their version then. */
  watched: Map<string, number>;
  /** The commands queued since MULTI, or `null` outside a transaction. */
  queued: string[][] | null;
  /** Ends the connection without a word, as a network failure would. */
  drop(): void;
  /** Writes raw bytes, for what a Redis would never say. */
  write(text: string): void;
}

/** How the fake answers; change it at any time. */
export interface FakeRedisBehavior {
  /** The password AUTH must give, or `null` for no password. */
  password: string | null;
  /** The user AUTH must name with the password, or `null` for the default user. */
  username: string | null;
  /** Whether commands are answered at all: `false` lets a test hang one. */
  answer: boolean;
  /** The clock of the expirations. */
  now: () => number;
}

interface Entry {
  value: string;
  expiresAt: number | null;
  /** A sorted set: member → score. `value` is then unused. */
  zset?: Map<string, number>;
}

const WRONGTYPE = {
  error: 'WRONGTYPE Operation against a key holding the wrong kind of value',
} as const;

/** A score as Redis writes it. */
const formatScore = (score: number): string =>
  score === Infinity ? 'inf' : score === -Infinity ? '-inf' : String(score);

/** A score Redis reads: a number, or inf. */
const parseScore = (text: string | undefined): number | null => {
  if (text === undefined) return null;
  const lower = text.toLowerCase();
  if (lower === 'inf' || lower === '+inf') return Infinity;
  if (lower === '-inf') return -Infinity;
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? null : value;
};

/** A sorted set in order: by score, then by the bytes of the member. */
const sorted = (zset: Map<string, number>): [string, number][] =>
  [...zset].sort(([a, x], [b, y]) =>
    x !== y ? x - y : Buffer.compare(Buffer.from(a), Buffer.from(b))
  );

export interface FakeRedis {
  /** `redis://127.0.0.1:<port>`. */
  url: string;
  host: string;
  port: number;
  behavior: FakeRedisBehavior;
  connections: FakeRedisConnection[];
  /** Every command received, on every connection, in order. */
  commands: string[][];
  /** The keys of a database, sorted. */
  keys(db?: number): string[];
  /** The value of a key, or `undefined`. */
  get(key: string, db?: number): string | undefined;
  /** The members and scores of a sorted set, in order, or `undefined`. */
  zset(key: string, db?: number): [member: string, score: number][] | undefined;
  /** When a key expires, in ms since the epoch, or `null`. */
  expiresAt(key: string, db?: number): number | null | undefined;
  /** Writes a key directly, as another client would have. */
  set(key: string, value: string, options?: { px?: number; db?: number }): void;
  /** Drops every connection; the server stays up for the next ones. */
  dropAll(): void;
  /** Stops the server: nothing connects any more. */
  close(): Promise<void>;
}

/** A RESP2 reader of commands: arrays of bulk strings, and inline lines. */
function* readCommands(buffer: { bytes: Buffer }): Generator<string[]> {
  for (;;) {
    const bytes = buffer.bytes;
    if (bytes.length === 0) return;
    if (bytes[0] !== 0x2a) {
      // An inline command, as redis-cli may send it.
      const end = bytes.indexOf('\r\n');
      if (end === -1) return;
      buffer.bytes = bytes.subarray(end + 2);
      yield bytes.toString('utf8', 0, end).split(/\s+/).filter(Boolean);
      continue;
    }
    const countEnd = bytes.indexOf('\r\n');
    if (countEnd === -1) return;
    const count = Number(bytes.toString('utf8', 1, countEnd));
    let at = countEnd + 2;
    const args: string[] = [];
    for (let index = 0; index < count; index++) {
      if (bytes[at] !== 0x24)
        throw new Error('A command is made of bulk strings.');
      const lengthEnd = bytes.indexOf('\r\n', at);
      if (lengthEnd === -1) return;
      const length = Number(bytes.toString('utf8', at + 1, lengthEnd));
      const start = lengthEnd + 2;
      if (bytes.length < start + length + 2) return;
      args.push(bytes.toString('utf8', start, start + length));
      at = start + length + 2;
    }
    buffer.bytes = bytes.subarray(at);
    yield args;
  }
}

type Reply =
  | { ok: string }
  | { error: string }
  | { int: number }
  | { bulk: string | null }
  | { array: Reply[] | null };

function encode(reply: Reply): string {
  if ('ok' in reply) return `+${reply.ok}\r\n`;
  if ('error' in reply) return `-${reply.error}\r\n`;
  if ('int' in reply) return `:${reply.int}\r\n`;
  if ('bulk' in reply) {
    if (reply.bulk === null) return '$-1\r\n';
    const bytes = Buffer.byteLength(reply.bulk);
    return `$${bytes}\r\n${reply.bulk}\r\n`;
  }
  if (reply.array === null) return '*-1\r\n';
  return `*${reply.array.length}\r\n${reply.array.map(encode).join('')}`;
}

/** A MATCH pattern of SCAN as a regular expression. */
function globToRegExp(pattern: string): RegExp {
  let source = '^';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]!;
    if (char === '\\' && index + 1 < pattern.length) {
      source += `\\${pattern[++index]}`;
    } else if (char === '*') source += '.*';
    else if (char === '?') source += '.';
    else if (char === '[') {
      const end = pattern.indexOf(']', index);
      if (end === -1) source += '\\[';
      else {
        source += `[${pattern.slice(index + 1, end).replace(/\\/g, '\\\\')}]`;
        index = end;
      }
    } else source += char.replace(/[.+^${}()|]/g, '\\$&');
  }
  return new RegExp(`${source}$`, 's');
}

export async function fakeRedis(
  options: Partial<FakeRedisBehavior> & {
    /** A port to listen on, for a Redis that comes back where it was. */
    port?: number;
  } = {}
): Promise<FakeRedis> {
  const { port: wanted = 0, ...rest } = options;
  const behavior: FakeRedisBehavior = {
    password: null,
    username: null,
    answer: true,
    now: Date.now,
    ...rest,
  };
  const databases = new Map<number, Map<string, Entry>>();
  const dbOf = new Map<Map<string, Entry>, number>();
  const database = (db: number): Map<string, Entry> => {
    let data = databases.get(db);
    if (!data) {
      data = new Map();
      databases.set(db, data);
      dbOf.set(data, db);
    }
    return data;
  };
  // Every write of a key bumps its version: what makes EXEC refuse a
  // transaction whose watched key was written since WATCH.
  const versions = new Map<string, number>();
  const versionKey = (db: number, key: string): string => `${db}\u0000${key}`;
  const versionOf = (db: number, key: string): number =>
    versions.get(versionKey(db, key)) ?? 0;
  const bump = (data: Map<string, Entry>, key: string): void => {
    const id = versionKey(dbOf.get(data) ?? 0, key);
    versions.set(id, (versions.get(id) ?? 0) + 1);
  };
  const alive = (data: Map<string, Entry>, key: string): Entry | undefined => {
    const entry = data.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= behavior.now()) {
      data.delete(key);
      bump(data, key);
      return undefined;
    }
    return entry;
  };
  const connections: FakeRedisConnection[] = [];
  const commands: string[][] = [];
  const sockets = new Set<Socket>();

  const answer = (connection: FakeRedisConnection, args: string[]): Reply => {
    const [name = '', ...rest] = args;
    const command = name.toUpperCase();
    const needsAuth = behavior.password !== null && !connection.authenticated;
    if (command === 'AUTH') {
      const [first, second] = rest;
      const user = second === undefined ? null : first;
      const password = second ?? first;
      if (behavior.password === null) {
        return {
          error:
            'ERR AUTH <password> called without any password configured for the default user. Are you sure your configuration is correct?',
        };
      }
      const expectedUser = behavior.username ?? 'default';
      if (
        (user ?? 'default') !== expectedUser ||
        password !== behavior.password
      ) {
        return {
          error:
            'WRONGPASS invalid username-password pair or user is disabled.',
        };
      }
      connection.authenticated = true;
      return { ok: 'OK' };
    }
    if (needsAuth) return { error: 'NOAUTH Authentication required.' };
    // A transaction: everything but these is queued until EXEC.
    if (connection.queued !== null) {
      if (command === 'MULTI') {
        return { error: 'ERR MULTI calls can not be nested' };
      }
      if (command === 'WATCH') {
        return { error: 'ERR WATCH inside MULTI is not allowed' };
      }
      if (command !== 'EXEC' && command !== 'DISCARD') {
        connection.queued.push(args);
        return { ok: 'QUEUED' };
      }
    }
    const data = database(connection.db);
    switch (command) {
      case 'WATCH':
        for (const key of rest) {
          alive(data, key);
          connection.watched.set(
            versionKey(connection.db, key),
            versionOf(connection.db, key)
          );
        }
        return { ok: 'OK' };
      case 'UNWATCH':
        connection.watched.clear();
        return { ok: 'OK' };
      case 'MULTI':
        connection.queued = [];
        return { ok: 'OK' };
      case 'DISCARD':
        if (connection.queued === null) {
          return { error: 'ERR DISCARD without MULTI' };
        }
        connection.queued = null;
        connection.watched.clear();
        return { ok: 'OK' };
      case 'EXEC': {
        const queued = connection.queued;
        if (queued === null) return { error: 'ERR EXEC without MULTI' };
        connection.queued = null;
        // A watched key that expired since counts as written.
        for (const id of connection.watched.keys()) {
          const [db, key] = id.split('\u0000') as [string, string];
          alive(database(Number(db)), key);
        }
        const changed = [...connection.watched].some(
          ([id, version]) => (versions.get(id) ?? 0) !== version
        );
        connection.watched.clear();
        if (changed) return { array: null };
        return {
          array: queued.map(queuedArgs => answer(connection, queuedArgs)),
        };
      }
      case 'PING':
        return rest[0] === undefined ? { ok: 'PONG' } : { bulk: rest[0] };
      case 'QUIT':
        return { ok: 'OK' };
      case 'SELECT': {
        const db = Number(rest[0]);
        if (!Number.isInteger(db) || db < 0 || db > 15) {
          return { error: 'ERR DB index is out of range' };
        }
        connection.db = db;
        return { ok: 'OK' };
      }
      case 'GET': {
        const entry = alive(data, rest[0]!);
        if (entry?.zset) return WRONGTYPE;
        return { bulk: entry ? entry.value : null };
      }
      case 'ZADD':
      case 'ZINCRBY': {
        const [key, ...pairs] = rest;
        if (key === undefined || pairs.length === 0 || pairs.length % 2 !== 0) {
          return {
            error: `ERR wrong number of arguments for '${name.toLowerCase()}' command`,
          };
        }
        if (command === 'ZINCRBY' && pairs.length !== 2) {
          return {
            error: "ERR wrong number of arguments for 'zincrby' command",
          };
        }
        const existing = alive(data, key);
        if (existing && !existing.zset) return WRONGTYPE;
        const scores: [number, string][] = [];
        for (let index = 0; index < pairs.length; index += 2) {
          const score = parseScore(pairs[index]);
          if (score === null)
            return { error: 'ERR value is not a valid float' };
          scores.push([score, pairs[index + 1]!]);
        }
        const zset = existing?.zset ?? new Map<string, number>();
        if (!existing) data.set(key, { value: '', expiresAt: null, zset });
        let added = 0;
        let last = 0;
        for (const [score, member] of scores) {
          if (!zset.has(member)) added++;
          last =
            command === 'ZINCRBY' ? (zset.get(member) ?? 0) + score : score;
          zset.set(member, last);
        }
        bump(data, key);
        return command === 'ZINCRBY'
          ? { bulk: formatScore(last) }
          : { int: added };
      }
      case 'ZSCORE': {
        const entry = alive(data, rest[0]!);
        if (entry && !entry.zset) return WRONGTYPE;
        const score = entry?.zset?.get(rest[1]!);
        return { bulk: score === undefined ? null : formatScore(score) };
      }
      case 'ZCARD': {
        const entry = alive(data, rest[0]!);
        if (entry && !entry.zset) return WRONGTYPE;
        return { int: entry?.zset?.size ?? 0 };
      }
      case 'ZRANK':
      case 'ZREVRANK': {
        const entry = alive(data, rest[0]!);
        if (entry && !entry.zset) return WRONGTYPE;
        if (!entry?.zset?.has(rest[1]!)) return { bulk: null };
        const order = sorted(entry.zset);
        if (command === 'ZREVRANK') order.reverse();
        return { int: order.findIndex(([member]) => member === rest[1]) };
      }
      case 'ZRANGE':
      case 'ZREVRANGE': {
        const [key, startText, stopText, flag] = rest;
        const entry = alive(data, key!);
        if (entry && !entry.zset) return WRONGTYPE;
        const start = Number(startText);
        const stop = Number(stopText);
        if (!Number.isInteger(start) || !Number.isInteger(stop)) {
          return { error: 'ERR value is not an integer or out of range' };
        }
        const withScores = flag?.toUpperCase() === 'WITHSCORES';
        const order = entry?.zset ? sorted(entry.zset) : [];
        if (command === 'ZREVRANGE') order.reverse();
        const from = start < 0 ? Math.max(0, order.length + start) : start;
        const to = stop < 0 ? order.length + stop : stop;
        const slice = to < from ? [] : order.slice(from, to + 1);
        return {
          array: slice.flatMap(([member, score]) =>
            withScores
              ? [{ bulk: member }, { bulk: formatScore(score) }]
              : [{ bulk: member }]
          ),
        };
      }
      case 'ZREM': {
        const [key, ...members] = rest;
        const entry = alive(data, key!);
        if (entry && !entry.zset) return WRONGTYPE;
        let removed = 0;
        for (const member of members) {
          if (entry?.zset?.delete(member)) removed++;
        }
        if (entry?.zset && entry.zset.size === 0) data.delete(key!);
        if (removed > 0) bump(data, key!);
        return { int: removed };
      }
      case 'SET': {
        const [key, value, ...flags] = rest;
        if (key === undefined || value === undefined) {
          return { error: "ERR wrong number of arguments for 'set' command" };
        }
        let expiresAt: number | null = null;
        let nx = false;
        let xx = false;
        for (let index = 0; index < flags.length; index++) {
          const flag = flags[index]!.toUpperCase();
          const amount = Number(flags[index + 1]);
          if (
            flag === 'PX' ||
            flag === 'EX' ||
            flag === 'PXAT' ||
            flag === 'EXAT'
          ) {
            if (!Number.isInteger(amount) || amount <= 0) {
              return { error: "ERR invalid expire time in 'set' command" };
            }
            expiresAt =
              flag === 'PX'
                ? behavior.now() + amount
                : flag === 'EX'
                  ? behavior.now() + amount * 1000
                  : flag === 'PXAT'
                    ? amount
                    : amount * 1000;
            index++;
          } else if (flag === 'NX') nx = true;
          else if (flag === 'XX') xx = true;
          else if (flag === 'KEEPTTL')
            expiresAt = alive(data, key)?.expiresAt ?? null;
          else return { error: 'ERR syntax error' };
        }
        const exists = alive(data, key) !== undefined;
        if ((nx && exists) || (xx && !exists)) return { bulk: null };
        data.set(key, { value, expiresAt });
        bump(data, key);
        return { ok: 'OK' };
      }
      case 'DEL': {
        let count = 0;
        for (const key of rest)
          if (alive(data, key) && data.delete(key)) {
            bump(data, key);
            count++;
          }
        return { int: count };
      }
      case 'EXISTS': {
        let count = 0;
        for (const key of rest) if (alive(data, key)) count++;
        return { int: count };
      }
      case 'PTTL': {
        const entry = alive(data, rest[0]!);
        if (!entry) return { int: -2 };
        if (entry.expiresAt === null) return { int: -1 };
        return { int: Math.max(0, entry.expiresAt - behavior.now()) };
      }
      case 'MGET':
        return {
          array: rest.map(key => {
            const entry = alive(data, key);
            return { bulk: entry && !entry.zset ? entry.value : null };
          }),
        };
      case 'KEYS': {
        const match = globToRegExp(rest[0] ?? '*');
        return {
          array: [...data.keys()]
            .filter(key => alive(data, key) && match.test(key))
            .sort()
            .map(key => ({ bulk: key })),
        };
      }
      case 'SCAN': {
        const cursor = Number(rest[0]);
        let match = /^/;
        let count = 10;
        for (let index = 1; index < rest.length; index += 2) {
          const flag = rest[index]!.toUpperCase();
          if (flag === 'MATCH') match = globToRegExp(rest[index + 1]!);
          else if (flag === 'COUNT') count = Number(rest[index + 1]);
          else return { error: 'ERR syntax error' };
        }
        // Keys in insertion order, a `COUNT` at a time: what a real SCAN
        // walks, the pattern applied after, as Redis does.
        const all = [...data.keys()];
        const slice = all.slice(cursor, cursor + count);
        const next = cursor + count >= all.length ? 0 : cursor + count;
        return {
          array: [
            { bulk: String(next) },
            {
              array: slice
                .filter(key => alive(data, key) && match.test(key))
                .map(key => ({ bulk: key })),
            },
          ],
        };
      }
      case 'FLUSHDB':
        for (const key of data.keys()) bump(data, key);
        data.clear();
        return { ok: 'OK' };
      case 'FLUSHALL':
        for (const each of databases.values()) {
          for (const key of each.keys()) bump(each, key);
          each.clear();
        }
        return { ok: 'OK' };
      default:
        return {
          error: `ERR unknown command '${name}', with args beginning with: ${rest.map(arg => `'${arg}'`).join(' ')}`,
        };
    }
  };

  const server: Server = createServer(socket => {
    sockets.add(socket);
    const buffer = { bytes: Buffer.alloc(0) };
    const connection: FakeRedisConnection = {
      commands: [],
      authenticated: behavior.password === null,
      db: 0,
      closed: false,
      watched: new Map(),
      queued: null,
      drop: () => socket.destroy(),
      write: text => socket.write(text),
    };
    connections.push(connection);
    socket.on('data', chunk => {
      buffer.bytes =
        buffer.bytes.length === 0
          ? chunk
          : Buffer.concat([buffer.bytes, chunk]);
      try {
        for (const args of readCommands(buffer)) {
          connection.commands.push(args);
          commands.push(args);
          if (!behavior.answer) continue;
          socket.write(encode(answer(connection, args)));
          if (args[0]?.toUpperCase() === 'QUIT') socket.end();
        }
      } catch (error) {
        socket.write(encode({ error: `ERR ${(error as Error).message}` }));
        socket.destroy();
      }
    });
    socket.on('error', () => {});
    socket.on('close', () => {
      connection.closed = true;
      sockets.delete(socket);
    });
  });
  await new Promise<void>(resolve =>
    server.listen(wanted, '127.0.0.1', resolve)
  );
  const port = (server.address() as { port: number }).port;
  const close = async (): Promise<void> => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
  };
  onTestFinished(close);
  return {
    url: `redis://127.0.0.1:${port}`,
    host: '127.0.0.1',
    port,
    behavior,
    connections,
    commands,
    keys: (db = 0) =>
      [...database(db).keys()].filter(key => alive(database(db), key)).sort(),
    get: (key, db = 0) => {
      const entry = alive(database(db), key);
      return entry && !entry.zset ? entry.value : undefined;
    },
    zset: (key, db = 0) => {
      const zset = alive(database(db), key)?.zset;
      return zset ? sorted(zset) : undefined;
    },
    expiresAt: (key, db = 0) => alive(database(db), key)?.expiresAt,
    set: (key, value, { px, db = 0 } = {}) => {
      const data = database(db);
      data.set(key, {
        value,
        expiresAt: px === undefined ? null : behavior.now() + px,
      });
      bump(data, key);
    },
    dropAll: () => {
      for (const socket of sockets) socket.destroy();
    },
    close,
  };
}
