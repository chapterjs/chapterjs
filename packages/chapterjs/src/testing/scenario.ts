// What a file of `src/` declares with `scenario()`: a test of the bot,
// written by the developer, that `chapterjs test` runs against a Discord
// in memory. A scenario names itself by its label, since that is what the
// report shows: a file may export several, in a list too.

import type { Declaration } from '../loader/loader.js';
import type { TestBot } from './harness.js';

/** What a file gives to `scenario()`. */
export interface ScenarioDeclaration {
  /** What the file gave to `scenario()`, not checked yet. */
  readonly config: { label: string; run: (bot: TestBot) => unknown };
}

/** A scenario, checked: what the runner works with. */
export interface LoadedScenario {
  readonly label: string;
  readonly run: (bot: TestBot) => unknown;
}

const BRAND = Symbol.for('chapterjs.scenario');

/**
 * Declares a test of your bot. Export the result from a `*.test.ts` file of
 * `src/`: `chapterjs test` runs it against a Discord in memory, where the
 * bot is in a server with a few people in it.
 *
 * ```ts
 * import { scenario } from 'chapterjs/test';
 * import { ping } from './ping';
 *
 * export default scenario('ping answers Pong', async bot => {
 *   const reply = await bot.use(ping);
 *   reply.says('Pong');
 * });
 * ```
 *
 * `bot` is the bot in its test server: `bot.use()` runs a command,
 * `bot.click()` presses a button, `bot.say()` sends a message as someone,
 * and what comes back says what the bot answered.
 */
export function scenario(
  label: string,
  run: (bot: TestBot) => unknown
): ScenarioDeclaration {
  return Object.freeze({ [BRAND]: true, config: { label, run } });
}

/** Whether a value was made by `scenario()`. */
export function isScenarioDeclaration(
  value: unknown
): value is ScenarioDeclaration {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[BRAND] === true
  );
}

const fail = (message: string): never => {
  throw new TypeError(message);
};

/** The longest label shown on one line of the report. */
const MAX_LABEL = 120;

/** The `Declaration` of scenarios, for the loader. */
export const scenarioDeclaration: Declaration<LoadedScenario> = {
  one: 'scenario',
  many: 'scenarios',
  is: isScenarioDeclaration,
  list: true,
  read(value) {
    const { config } = value as ScenarioDeclaration;
    if (typeof config.label !== 'string' || config.label.trim() === '') {
      fail(
        `scenario() needs a label first, what the test checks: scenario('ping answers Pong', async bot => { ... }).`
      );
    }
    if (config.label.length > MAX_LABEL) {
      fail(
        `The label of this scenario is ${config.label.length} characters long: keep it under ${MAX_LABEL}, it is a title.`
      );
    }
    if (typeof config.run !== 'function') {
      fail(
        `scenario('${config.label}') needs a function after its label, what the test does: async bot => { ... }.`
      );
    }
    return Object.freeze({ label: config.label.trim(), run: config.run });
  },
};
