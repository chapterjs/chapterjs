// Suggestions while the person types in an option: Discord sends an
// Application Command Autocomplete interaction with what they typed so
// far, and waits 3 seconds for up to 25 choices. Nothing else can be
// answered to it: the `autocomplete` function of the file returns the
// suggestions, and this module checks them and sends them.
// https://docs.discord.com/developers/interactions/application-commands#autocomplete

import { CreateInteractionResponse } from '../discord/endpoints.js';
import type { RawApplicationCommandOptionChoice } from '../discord/types/application-command.js';
import type { Locale } from '../discord/types/common.js';
import {
  InteractionCallbackType,
  type RawApplicationCommandInteractionDataOption,
  type RawInteraction,
} from '../discord/types/interaction.js';
import {
  authorOf,
  placeContext,
  resolvePlace,
  type Reporter,
} from '../interactions/dispatch.js';
import { translation } from '../messages/translate.js';
import { DiscordApiError } from '../rest/errors.js';
import type { Context } from '../structures/context.js';
import type { AutocompleteContext, Suggestion } from './command.js';
import { commandName, type CommandEntry } from './tree.js';

/** How many suggestions Discord shows. */
export const MAX_SUGGESTIONS = 25;
/** The longest name of a suggestion, and the longest text it may carry. */
const MAX_LENGTH = 100;
/** How long Discord waits for the suggestions. */
const DEADLINE = 3000;
/** Discord says it when the interaction expired before the answer. */
const UNKNOWN_INTERACTION = 10062;

/**
 * Answers an autocomplete interaction with what the `autocomplete`
 * function of the command returns. Discord shows nothing when the answer
 * is empty, so every path ends with an answer, even when the function
 * fails: the person is never left with a spinner.
 */
export function suggest(
  ctx: Context,
  raw: RawInteraction,
  entry: CommandEntry | undefined,
  given: readonly RawApplicationCommandInteractionDataOption[],
  reporter: Reporter,
  warnedOnce: Set<string>
): void {
  const focused = given.find(option => option.focused);
  const started = Date.now();
  const answer = (choices: RawApplicationCommandOptionChoice[]): void => {
    ctx.rest
      .request(CreateInteractionResponse, [raw.id, raw.token], {
        body: {
          type: InteractionCallbackType.ApplicationCommandAutocompleteResult,
          data: { choices },
        },
        auth: false,
      })
      .catch((error: unknown) => {
        if (!entry || !focused) return;
        const name = `${commandName(entry.command.path)} ${focused.name}`;
        if (
          error instanceof DiscordApiError &&
          error.code === UNKNOWN_INTERACTION
        ) {
          // Too late, or the person typed on and Discord dropped this one.
          if (Date.now() - started < DEADLINE) return;
          reporter.onWarning(
            entry.file,
            `The suggestions for ${name} took ${((Date.now() - started) / 1000).toFixed(1)} s: Discord waits 3 seconds, then shows none. Make the autocomplete function faster.`
          );
          return;
        }
        reporter.onError(entry.file, error);
      });
  };

  // The command, the option or its function is gone: nothing to suggest.
  const fn = focused && entry?.command.autocomplete[focused.name];
  if (!entry || !focused || !fn) {
    answer([]);
    if (entry && focused) {
      // Still registered with suggestions, but the file has no function.
      reporter.onWarning(
        entry.file,
        `Discord asked suggestions for ${commandName(entry.command.path)} ${focused.name}, which has none in "autocomplete": the command was registered with an older version of this file.`
      );
    }
    return;
  }
  const { command, file } = entry;
  const name = `${commandName(command.path)} ${focused.name}`;
  const option = command.options.find(one => one.name === focused.name)!;
  const isText = option.type === 'string';

  const author = authorOf(raw);
  if (!author) return answer([]);
  const user = ctx.entities.user(author.user);
  const placed = resolvePlace(
    ctx,
    raw,
    user,
    author.member,
    command.where,
    message => reporter.onWarning(file, `${name} ${message}`)
  );
  // Used where the command can't run: no suggestion, the use is refused.
  if (!placed.place) return answer([]);

  // What was typed: a text, maybe empty; a number only once it is one.
  const typed = focused.value;
  const value = isText
    ? String(typed ?? '')
    : typeof typed === 'number'
      ? typed
      : undefined;
  const soFar: Record<string, unknown> = {};
  for (const one of given) {
    if (one.value === undefined) continue;
    // Ids and numbers arrive as what they are; the focused one may be
    // partial, and stays what the person typed.
    soFar[one.name] = one.name === focused.name ? value : one.value;
  }
  const context = Object.freeze({
    value,
    options: Object.freeze(soFar),
    user,
    locale: raw.locale as Locale,
    ...placeContext(placed.place, command.where),
    // Suggestions are shown to the person alone: their language.
    ...translation(ctx, raw.locale ?? null),
  }) as unknown as AutocompleteContext;

  new Promise<readonly Suggestion[]>(resolve => resolve(fn(context)))
    .then(suggestions => {
      answer(
        toChoices(suggestions, {
          name,
          isText,
          integer: option.type === 'integer',
          warn: message => {
            // Said once per option: it happens on every keystroke.
            if (warnedOnce.has(`${file} ${name} ${message}`)) return;
            warnedOnce.add(`${file} ${name} ${message}`);
            reporter.onWarning(file, `${name}: ${message}`);
          },
        })
      );
    })
    .catch((error: unknown) => {
      reporter.onError(file, error);
      answer([]);
    });
}

/**
 * What the function returned, as the choices Discord takes. What can be
 * fixed is fixed and said once (too many, a name too long); what can't
 * (not a list, a value of the wrong kind) is an error, and nothing is
 * suggested.
 */
function toChoices(
  suggestions: readonly Suggestion[],
  {
    name,
    isText,
    integer,
    warn,
  }: {
    name: string;
    isText: boolean;
    integer: boolean;
    warn: (message: string) => void;
  }
): RawApplicationCommandOptionChoice[] {
  if (!Array.isArray(suggestions)) {
    throw new TypeError(
      `The autocomplete function of ${name} must return a list of suggestions, like ['a', 'b'] or [{ name: 'Shown', value: 'a' }]: got ${JSON.stringify(suggestions) ?? typeof suggestions}.`
    );
  }
  const kept =
    suggestions.length > MAX_SUGGESTIONS
      ? suggestions.slice(0, MAX_SUGGESTIONS)
      : suggestions;
  if (kept !== suggestions) {
    warn(
      `the autocomplete function returned ${suggestions.length} suggestions, Discord shows ${MAX_SUGGESTIONS} at most: only the first ${MAX_SUGGESTIONS} are sent. Return fewer, the best ones first.`
    );
  }
  return kept.map(suggestion => {
    const pair =
      typeof suggestion === 'object' && suggestion !== null
        ? suggestion
        : { name: String(suggestion), value: suggestion };
    const { value } = pair;
    if (typeof value !== (isText ? 'string' : 'number')) {
      throw new TypeError(
        `A suggestion of ${name} has the value ${JSON.stringify(value) ?? typeof value}: the option is a ${isText ? 'text' : 'number'}, so its suggestions must be ${isText ? 'texts' : 'numbers'}.`
      );
    }
    if (integer && !Number.isInteger(value)) {
      throw new TypeError(
        `A suggestion of ${name} has the value ${String(value)}, which is not a whole number: the option is an integer.`
      );
    }
    if (isText && (value as string).length > MAX_LENGTH) {
      throw new TypeError(
        `A suggestion of ${name} has a value of ${(value as string).length} characters: Discord accepts ${MAX_LENGTH} at most. Suggest a shorter value, like an id, with the text to show as its name.`
      );
    }
    let shown =
      typeof pair.name === 'string' && pair.name.length > 0
        ? pair.name
        : String(value);
    if (shown.length > MAX_LENGTH) {
      warn(
        `a suggestion is shown as ${shown.length} characters, Discord shows ${MAX_LENGTH} at most: it is cut. Give it a shorter name.`
      );
      shown = `${shown.slice(0, MAX_LENGTH - 1)}…`;
    }
    return { name: shown, value: value as string | number };
  });
}
