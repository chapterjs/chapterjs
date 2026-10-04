import * as p from '@clack/prompts';

export interface Choice<Value extends string> {
  value: Value;
  label?: string;
  hint?: string;
  /** Shown but can't be picked (e.g. a package manager that isn't installed). */
  disabled?: boolean;
}

export interface ChooseOptions<Value extends string> {
  message: string;
  choices: Choice<Value>[];
  initialValue?: Value;
  /** Shown instead of the question when there is only one possible answer. */
  onlyChoice: (value: Value) => string;
}

/**
 * A select menu that never asks a question with only one answer: when a single
 * choice can be picked, it is taken right away and the user is told why.
 * Returns `undefined` when no choice can be picked, and the cancel symbol when
 * the user presses Ctrl+C or Esc.
 */
export async function choose<Value extends string>({
  message,
  choices,
  initialValue,
  onlyChoice,
}: ChooseOptions<Value>): Promise<Value | symbol | undefined> {
  const enabled = choices.filter(choice => !choice.disabled);
  const [first] = enabled;
  if (!first) return undefined;
  if (enabled.length === 1) {
    p.log.info(onlyChoice(first.value));
    return first.value;
  }
  // clack's option type can't be resolved for a generic `Value`, so the menu is
  // typed with `string`: it only ever returns one of `choices`.
  const picked = await p.select<string>({
    message,
    initialValue: enabled.some(choice => choice.value === initialValue)
      ? initialValue
      : first.value,
    options: choices,
  });
  return picked as Value | symbol;
}
