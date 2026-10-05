import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { isSnowflake } from '../discord/snowflake.js';

export interface DevEnv {
  token: string;
  devGuildId: string;
}

/**
 * Values people leave in a `.env` copied from an example. Whole values only:
 * a real token may start with any letters.
 */
const PLACEHOLDER =
  /^(?:(?:your|my)[-_ ]?(?:bot[-_ ]?)?token(?:[-_ ]?here)?|x{3,}|todo|token|changeme|change-me|<.*>|\.{3})$/i;

/** What `chapterjs start` runs with. */
export interface StartEnv {
  token: string;
  /** The dev server, when the project has one: production leaves it alone. */
  devGuildId: string | null;
}

/** The `.env` file of a project, with the real environment on top. */
async function readEnv(
  projectDir: string,
  processEnv: Record<string, string | undefined>
): Promise<{ read: (name: string) => string; hasFile: boolean }> {
  let file: Record<string, string | undefined> = {};
  let hasFile = true;
  try {
    file = parseEnv(await readFile(join(projectDir, '.env'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    hasFile = false;
  }
  return {
    read: name => (processEnv[name] ?? file[name] ?? '').trim(),
    hasFile,
  };
}

const TOKEN_HELP =
  'Copy the token of your bot from https://discord.com/developers/applications → your application → Bot → Reset Token.';

/** What is wrong with a token, if anything. */
function tokenProblem(token: string, where: string): string | null {
  if (token === '' || PLACEHOLDER.test(token)) {
    return `${where}: BOT_TOKEN is ${token === '' ? 'empty' : 'still the example value'}.\n${TOKEN_HELP}`;
  }
  if (/\s/.test(token)) {
    return `${where}: BOT_TOKEN contains a space, so it is not a whole token.\nCopy it again from https://discord.com/developers/applications → your application → Bot → Reset Token.`;
  }
  return null;
}

/**
 * Reads what `chapterjs dev` needs from the `.env` file of the project (the
 * real environment wins when a value is set in both). Returns every problem
 * at once, each one saying how to fix it.
 */
export async function readDevEnv(
  projectDir: string,
  processEnv: Record<string, string | undefined>
): Promise<{ env: DevEnv } | { problems: string[] }> {
  const { read, hasFile } = await readEnv(projectDir, processEnv);
  const token = read('BOT_TOKEN').replace(/^Bot\s+/i, '');
  const devGuildId = read('DEV_GUILD_ID');
  const problems: string[] = [];

  if (!hasFile && token === '' && devGuildId === '') {
    return {
      problems: [
        'There is no .env file in this folder.\nCopy .env.example to .env, then fill in BOT_TOKEN and DEV_GUILD_ID.',
      ],
    };
  }
  const wrongToken = tokenProblem(token, '.env');
  if (wrongToken) problems.push(wrongToken);
  if (devGuildId === '') {
    problems.push(
      `.env: DEV_GUILD_ID is empty.\nIn Discord, right-click your test server → Copy Server ID (enable Settings → Advanced → Developer Mode to see it).`
    );
  } else if (!isSnowflake(devGuildId)) {
    problems.push(
      `.env: DEV_GUILD_ID is "${devGuildId}", which is not a server ID (an ID only has digits).\nIn Discord, right-click your test server → Copy Server ID.`
    );
  }
  return problems.length > 0 ? { problems } : { env: { token, devGuildId } };
}

/**
 * Reads what `chapterjs start` needs. In production the values often come
 * from the host and not from a file: only the token is needed. The dev
 * server is optional: when it is known, production leaves it to
 * `chapterjs dev`.
 */
export async function readStartEnv(
  projectDir: string,
  processEnv: Record<string, string | undefined>
): Promise<{ env: StartEnv } | { problems: string[] }> {
  const { read, hasFile } = await readEnv(projectDir, processEnv);
  const token = read('BOT_TOKEN').replace(/^Bot\s+/i, '');
  const devGuildId = read('DEV_GUILD_ID');
  if (!hasFile && token === '') {
    return {
      problems: [
        `BOT_TOKEN is not set.\nGive it to the bot the way your host does it (its "environment variables" or "secrets"), or in a .env file in this folder.\n${TOKEN_HELP}`,
      ],
    };
  }
  const problems: string[] = [];
  const wrongToken = tokenProblem(token, hasFile ? '.env' : 'Environment');
  if (wrongToken) problems.push(wrongToken);
  if (devGuildId !== '' && !isSnowflake(devGuildId)) {
    problems.push(
      `DEV_GUILD_ID is "${devGuildId}", which is not a server ID (an ID only has digits).\nRemove it, or copy it again: in Discord, right-click your test server → Copy Server ID.`
    );
  }
  return problems.length > 0
    ? { problems }
    : { env: { token, devGuildId: devGuildId === '' ? null : devGuildId } };
}
