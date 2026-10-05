// Tells Discord which commands the bot has. Done only when they changed:
// what was last registered is remembered in the `.chapterjs/` folder of the
// project, so starting the bot again costs no request.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { BulkOverwriteGuildApplicationCommands } from '../discord/endpoints.js';
import type { Snowflake } from '../discord/types/common.js';
import type { Rest } from '../rest/rest.js';
import type { CommandPayload } from './tree.js';

/**
 * Registers the commands of one server, replacing what was there.
 * @returns whether Discord was told (false when nothing changed)
 * @see https://docs.discord.com/developers/interactions/application-commands#bulk-overwrite-guild-application-commands
 */
export async function registerGuildCommands(input: {
  rest: Rest;
  projectDir: string;
  applicationId: Snowflake;
  guildId: Snowflake;
  commands: readonly CommandPayload[];
}): Promise<boolean> {
  const { rest, applicationId, guildId, commands } = input;
  const file = join(input.projectDir, '.chapterjs', 'cache', 'commands.json');
  // The same commands for another bot or another server are not the same.
  const hash = createHash('sha256')
    .update(JSON.stringify({ applicationId, guildId, commands }))
    .digest('hex');
  const previous = await readFile(file, 'utf8').catch(() => null);
  if (previous === hash) return false;
  // A project that never had commands has nothing to tell Discord.
  if (previous === null && commands.length === 0) return false;
  await rest.request(
    BulkOverwriteGuildApplicationCommands,
    [applicationId, guildId],
    { body: [...commands] }
  );
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, hash);
  return true;
}
