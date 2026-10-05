// Tells Discord which commands the bot has. Done only when they changed:
// what was last registered is remembered in the `.chapterjs/` folder of the
// project, so starting the bot again costs no request.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  BulkOverwriteGlobalApplicationCommands,
  BulkOverwriteGuildApplicationCommands,
} from '../discord/endpoints.js';
import type { Snowflake } from '../discord/types/common.js';
import type { Rest } from '../rest/rest.js';
import type { CommandPayload } from './tree.js';

/**
 * Registers the commands of the bot, replacing what was there: on one
 * server when `guildId` is given (they show up there at once), for
 * everyone otherwise.
 * @returns whether Discord was told (false when nothing changed)
 * @see https://docs.discord.com/developers/interactions/application-commands#bulk-overwrite-guild-application-commands
 * @see https://docs.discord.com/developers/interactions/application-commands#bulk-overwrite-global-application-commands
 */
export async function registerCommands(input: {
  rest: Rest;
  projectDir: string;
  applicationId: Snowflake;
  guildId?: Snowflake;
  commands: readonly CommandPayload[];
}): Promise<boolean> {
  const { rest, applicationId, guildId, commands } = input;
  // One memory per kind: running the bot for everyone and on its dev server
  // from the same folder must not make each forget what the other did.
  const file = join(
    input.projectDir,
    '.chapterjs',
    'cache',
    guildId ? 'commands.json' : 'commands.global.json'
  );
  // The same commands for another bot or another server are not the same.
  const hash = createHash('sha256')
    .update(JSON.stringify({ applicationId, guildId, commands }))
    .digest('hex');
  const previous = await readFile(file, 'utf8').catch(() => null);
  if (previous === hash) return false;
  // A project that never had commands has nothing to tell Discord.
  if (previous === null && commands.length === 0) return false;
  if (guildId) {
    await rest.request(
      BulkOverwriteGuildApplicationCommands,
      [applicationId, guildId],
      { body: [...commands] }
    );
  } else {
    await rest.request(
      BulkOverwriteGlobalApplicationCommands,
      [applicationId],
      {
        body: [...commands],
      }
    );
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, hash);
  return true;
}
