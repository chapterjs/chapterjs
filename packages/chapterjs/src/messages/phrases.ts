// What the bot answers by itself, when it can't run what was asked: in
// English here, and in the languages of `src/messages/` that translate
// them (the `framework` of a language file).

import type { Context } from '../structures/context.js';
import type { FrameworkTexts, MessageText } from './messages.js';
import { fill, pickLocale, templateOf, type Template } from './translate.js';

/** The phrases of the framework, in English. */
export const FRAMEWORK_TEXTS: Readonly<FrameworkTexts> = Object.freeze({
  command: 'command',
  button: 'button',
  menu: 'menu',
  form: 'form',
  guildOnly: 'This {what} can only be used in a server.',
  dmOnly: 'This {what} can only be used in a private message with me.',
  notHere: 'This {what} can not be used here.',
  unavailable: 'This command is not available right now.',
  gone: 'This {what} is not available any more.',
  outdated: 'This {what} is out of date.',
  authorOnly: 'Only the person who used the command can use this {what}.',
  failed: 'Something went wrong while running this {what}.',
  missingPermission: "I don't have the permission to do that here.",
  needsPermissions: {
    one: 'You need the {permissions} permission to use this command.',
    other: 'You need the {permissions} permissions to use this command.',
  },
});

/** A phrase of the framework. */
export type FrameworkKey = keyof FrameworkTexts;

/** The word for what was used, in `{what}`. */
export type What = 'command' | 'button' | 'menu' | 'form';

/** The phrases of the framework, compiled, by key. */
export const FRAMEWORK: ReadonlyMap<FrameworkKey, Template> = new Map(
  (Object.entries(FRAMEWORK_TEXTS) as [FrameworkKey, MessageText][]).map(
    ([key, text]) => [key, templateOf(text)]
  )
);

/** The keys a language file may translate, in the order of the docs. */
export const FRAMEWORK_KEYS = [...FRAMEWORK.keys()];

/**
 * A phrase of the framework in the language of who will read it: the one
 * of the language file that translates it, else the English one.
 */
export function phrase(
  ctx: Pick<Context, 'messages'>,
  locale: string | null,
  key: FrameworkKey,
  params: { what?: What; permissions?: string; count?: number } = {}
): string {
  const { messages } = ctx;
  const picked = messages ? pickLocale(messages, locale) : null;
  const own = picked ? messages!.framework.get(picked)?.get(key) : undefined;
  const template = own ?? FRAMEWORK.get(key)!;
  const spoken = own ? picked! : 'en-US';
  return fill(
    key,
    template,
    {
      ...params,
      ...(params.what ? { what: phrase(ctx, locale, params.what) } : {}),
    },
    spoken
  );
}
