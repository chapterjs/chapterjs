// A bot can have a command for everyone and a command of one server with
// the same name: Discord then shows both in that server. A dev bot that
// shares its token with the bot in production would show every command
// twice in the dev server. So the dev server only gets the commands that
// are not already there for everyone, exactly as the project declares them.
// https://docs.discord.com/developers/interactions/application-commands#registering-a-command

import type { RawApplicationCommand } from '../discord/types/application-command.js';
import type { CommandPayload } from './tree.js';

/** What says how a command looks and works: the rest is not compared. */
const DEFINITION = new Set([
  'type',
  'name',
  'description',
  'name_localizations',
  'description_localizations',
  'default_member_permissions',
  'nsfw',
  'options',
  'required',
  'choices',
  'value',
  'min_value',
  'max_value',
  'min_length',
  'max_length',
  'channel_types',
  'autocomplete',
]);

const isEmpty = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  value === false ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === 'object' && Object.keys(value as object).length === 0);

/**
 * A definition in one form, whoever wrote it: Discord sends back what it
 * was given with more fields, and says "nothing" in several ways (a field
 * left out, `null`, `false`, an empty list).
 */
function canonical(value: unknown, top = true): unknown {
  if (Array.isArray(value)) return value.map(item => canonical(item, top));
  if (typeof value !== 'object' || value === null) return value;
  const entries = Object.entries(value)
    // Translations are dictionaries: their keys are languages, all kept.
    .filter(([key]) => !top || DEFINITION.has(key))
    .map(
      ([key, child]) =>
        [key, canonical(child, !key.endsWith('_localizations'))] as const
    )
    .filter(([, child]) => !isEmpty(child))
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return Object.fromEntries(entries);
}

/** Whether a command of the project is the one Discord has for everyone. */
export function sameDefinition(
  ours: CommandPayload,
  theirs: RawApplicationCommand
): boolean {
  return JSON.stringify(canonical(ours)) === JSON.stringify(canonical(theirs));
}

/**
 * The commands to give one server, without the ones that are already there
 * for everyone exactly as declared (`twins`: shown once, by the other).
 * A command that changed is kept: its new form must be there to be tried,
 * next to the one in production until that one is updated.
 */
export function withoutGlobalTwins(
  commands: readonly CommandPayload[],
  global: readonly RawApplicationCommand[]
): { kept: CommandPayload[]; twins: string[]; changed: string[] } {
  const byName = new Map(
    global
      .filter(command => (command.type ?? 1) === 1)
      .map(command => [command.name, command])
  );
  const kept: CommandPayload[] = [];
  const twins: string[] = [];
  const changed: string[] = [];
  for (const command of commands) {
    const other = byName.get(command.name);
    if (other && sameDefinition(command, other)) {
      twins.push(command.name);
      continue;
    }
    if (other) changed.push(command.name);
    kept.push(command);
  }
  return { kept, twins, changed };
}
