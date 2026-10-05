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

/**
 * Reads what `chapterjs dev` needs from the `.env` file of the project (the
 * real environment wins when a value is set in both). Returns every problem
 * at once, each one saying how to fix it.
 */
export async function readDevEnv(
  projectDir: string,
  processEnv: Record<string, string | undefined>
): Promise<{ env: DevEnv } | { problems: string[] }> {
  let file: Record<string, string | undefined> = {};
  let hasFile = true;
  try {
    file = parseEnv(await readFile(join(projectDir, '.env'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    hasFile = false;
  }
  const read = (name: string): string =>
    (processEnv[name] ?? file[name] ?? '').trim();

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
  if (token === '' || PLACEHOLDER.test(token)) {
    problems.push(
      `.env: BOT_TOKEN is ${token === '' ? 'empty' : 'still the example value'}.\nCopy the token of your bot from https://discord.com/developers/applications → your application → Bot → Reset Token.`
    );
  } else if (/\s/.test(token)) {
    problems.push(
      '.env: BOT_TOKEN contains a space, so it is not a whole token.\nCopy it again from https://discord.com/developers/applications → your application → Bot → Reset Token.'
    );
  }
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
