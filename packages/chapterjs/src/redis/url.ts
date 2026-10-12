// What `REDIS_URL` (and `REDIS_PASSWORD`) say: where Redis is, how to
// reach it, and as what. Read once from the environment by the CLI and
// given to the client; a wrong value is explained in the words of `.env`.
// https://redis.io/docs/latest/develop/clients/nodejs/connect/ (the
// `redis://` and `rediss://` forms every client reads)

/** Where Redis is and how to connect: what the client is created with. */
export interface RedisAddress {
  host: string;
  port: number;
  /** `rediss://`: the connection is encrypted with TLS. */
  tls: boolean;
  /** The user of the ACL, when the URL names one; the default user otherwise. */
  username: string | null;
  password: string | null;
  /** The database index: `0` unless the URL ends with `/N`. */
  db: number;
}

export const REDIS_URL_HELP =
  'Write it like redis://localhost:6379 (rediss:// for a TLS connection, /1 at the end for a database other than 0), with the user and password when there are some: redis://user:password@host:6379.';

/** `host:port`, and the database when it is not the first: what messages show. Never the password. */
export const describeRedis = (address: RedisAddress): string =>
  `${address.host}:${address.port}${address.db === 0 ? '' : `/${address.db}`}`;

/**
 * Reads a `REDIS_URL`, with the `REDIS_PASSWORD` set beside it winning over
 * the one of the URL. Answers what is wrong when it is not a Redis address.
 */
export function parseRedisUrl(
  text: string,
  password: string
): { address: RedisAddress } | { problem: string } {
  let url: URL;
  try {
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) throw new Error('no scheme');
    url = new URL(text);
  } catch {
    return { problem: `is not an address. ${REDIS_URL_HELP}` };
  }
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    return {
      problem: `starts with "${url.protocol}//", and a Redis address starts with redis:// or rediss://. ${REDIS_URL_HELP}`,
    };
  }
  if (url.hostname === '') {
    return { problem: `names no host. ${REDIS_URL_HELP}` };
  }
  const port = url.port === '' ? 6379 : Number(url.port);
  const path = url.pathname.replace(/^\//, '');
  if (path !== '' && !/^\d+$/.test(path)) {
    return {
      problem: `ends with "/${path}", and what follows the host is the number of the database. ${REDIS_URL_HELP}`,
    };
  }
  const own = password !== '' ? password : decodeURIComponent(url.password);
  return {
    address: {
      // A URL keeps IPv6 brackets around the host; a socket wants none.
      host: url.hostname.replace(/^\[(.*)\]$/, '$1'),
      port,
      tls: url.protocol === 'rediss:',
      username: url.username === '' ? null : decodeURIComponent(url.username),
      password: own === '' ? null : own,
      db: path === '' ? 0 : Number(path),
    },
  };
}
