// The runtime of `t`: which language to take, and a text with its
// placeholders filled in. No dependency on the loader or on Discord.

import { Locale } from '../discord/types/common.js';
import type { Context } from '../structures/context.js';
import type { Guild } from '../structures/guild.js';
import type {
  MessageText,
  MessageTexts,
  PluralText,
  Translator,
} from './messages.js';

/** A text, cut once: its literal parts and the placeholders between them. */
export interface TextTemplate {
  readonly text: string;
  /** Odd entries are placeholder names, even ones literal text. */
  readonly parts: readonly string[];
  readonly params: readonly string[];
}

/** The forms of a plural, by name. */
export type PluralForm = keyof PluralText;

/** A text with several forms, one per quantity, picked by `count`. */
export interface PluralTemplate {
  readonly forms: ReadonlyMap<PluralForm, TextTemplate>;
  /** `count`, then the placeholders of every form. */
  readonly params: readonly string[];
}

export type Template = TextTemplate | PluralTemplate;

/** The languages of `src/messages/`, checked and assembled: what `t` reads. */
export interface LoadedMessages {
  readonly default: Locale;
  /** The texts of each language declared, compiled. */
  readonly locales: ReadonlyMap<Locale, ReadonlyMap<string, Template>>;
  /** The phrases of the framework each language translates, compiled. */
  readonly framework: ReadonlyMap<Locale, ReadonlyMap<string, Template>>;
  /**
   * The `commands` section of each language that has one, by the path of
   * the command file, not checked yet: the commands of the project are
   * needed for that.
   */
  readonly commands: ReadonlyMap<Locale, Readonly<Record<string, unknown>>>;
  /** The file of each language: `src/messages/fr.ts`. */
  readonly files: ReadonlyMap<Locale, string>;
}

/** The forms a plural can have, in the order of the docs. */
export const PLURAL_FORMS: readonly PluralForm[] = [
  'zero',
  'one',
  'two',
  'few',
  'many',
  'other',
];

/**
 * Cuts a text around its placeholders, read from left to right: `{name}`
 * is a placeholder, `{{` and `}}` are braces written as is, and a `{`
 * with another `{` before its `}` is a brace too.
 */
export function compile(text: string): TextTemplate {
  const parts: string[] = [];
  const params: string[] = [];
  let literal = '';
  let i = 0;
  while (i < text.length) {
    const char = text[i]!;
    if (char === '{' && text[i + 1] === '{') {
      literal += '{';
      i += 2;
    } else if (char === '}' && text[i + 1] === '}') {
      literal += '}';
      i += 2;
    } else if (char === '{') {
      const close = text.indexOf('}', i + 1);
      const open = text.indexOf('{', i + 1);
      if (close === -1 || (open !== -1 && open < close)) {
        literal += '{';
        i += 1;
      } else {
        const name = text.slice(i + 1, close);
        parts.push(literal, name);
        if (!params.includes(name)) params.push(name);
        literal = '';
        i = close + 1;
      }
    } else {
      literal += char;
      i += 1;
    }
  }
  parts.push(literal);
  return { text, parts, params };
}

/** Puts the forms of a plural together: `count` picks one when filled. */
export function compilePlural(
  forms: ReadonlyMap<PluralForm, TextTemplate>
): PluralTemplate {
  const params = ['count'];
  for (const form of forms.values()) {
    for (const name of form.params) {
      if (!params.includes(name)) params.push(name);
    }
  }
  return { forms, params };
}

/** A text of a language file, trusted, compiled. */
export function templateOf(text: MessageText): Template {
  if (typeof text === 'string') return compile(text);
  return compilePlural(
    new Map(
      (Object.entries(text) as [PluralForm, string][]).map(([form, one]) => [
        form,
        compile(one),
      ])
    )
  );
}

/** Whether a template is a plural. */
export const isPlural = (template: Template): template is PluralTemplate =>
  'forms' in template;

/** Every locale Discord knows. */
export const LOCALES: ReadonlySet<string> = new Set(Object.values(Locale));

/**
 * The language of the file to use for one asked: the same one, else one
 * of the same language in another region (`en-GB` → `en-US`, `es-419` →
 * `es-ES`, `zh-TW` → `zh-CN`), else the default.
 */
export function pickLocale(
  messages: LoadedMessages,
  locale: string | null
): Locale {
  if (locale === null) return messages.default;
  if (messages.locales.has(locale as Locale)) return locale as Locale;
  const language = locale.split('-')[0]!;
  for (const known of messages.locales.keys()) {
    if (known.split('-')[0] === language) return known;
  }
  return messages.default;
}

const numberFormats = new Map<string, Intl.NumberFormat>();
const pluralRules = new Map<string, Intl.PluralRules>();

/** How a language writes a number: `1,234` in English, `1 234` in French. */
function numberFormat(locale: string): Intl.NumberFormat {
  let format = numberFormats.get(locale);
  if (!format) {
    try {
      format = new Intl.NumberFormat(locale);
    } catch {
      format = new Intl.NumberFormat('en-US');
    }
    numberFormats.set(locale, format);
  }
  return format;
}

/** Which form of a plural a language uses for a number. */
function pluralRule(locale: string): Intl.PluralRules {
  let rules = pluralRules.get(locale);
  if (!rules) {
    try {
      rules = new Intl.PluralRules(locale);
    } catch {
      rules = new Intl.PluralRules('en-US');
    }
    pluralRules.set(locale, rules);
  }
  return rules;
}

/** A value where a placeholder is: a number the way the language writes it. */
const show = (value: unknown, locale: string): string =>
  typeof value === 'number'
    ? numberFormat(locale).format(value)
    : String(value);

/**
 * Fills the placeholders of a template, with an error naming a missing
 * one. Numbers are written the way `locale` writes them, and a plural
 * takes the form that language uses for `count`.
 */
export function fill(
  key: string,
  template: Template,
  params: Record<string, unknown> | undefined,
  locale = 'en-US'
): string {
  if (template.params.length === 0) return (template as TextTemplate).text;
  const missing = template.params.filter(name => params?.[name] === undefined);
  if (missing.length > 0) {
    throw new TypeError(
      `The message "${key}" needs ${missing.map(name => `{${name}}`).join(', ')}: t('${key}', { ${template.params.join(', ')} })`
    );
  }
  if (isPlural(template)) {
    const count = params!.count;
    if (typeof count !== 'number') {
      throw new TypeError(
        `The message "${key}" is a plural: its {count} is a number, got ${JSON.stringify(count)}.`
      );
    }
    const form = pluralRule(locale).select(count) as PluralForm;
    template = template.forms.get(form) ?? template.forms.get('other')!;
  }
  let text = '';
  template.parts.forEach((part, index) => {
    text += index % 2 === 0 ? part : show(params![part], locale);
  });
  return text;
}

/** The `t` of each language asked, made once per set of messages. */
const translators = new WeakMap<
  LoadedMessages,
  Map<string, Translator<MessageTexts>>
>();

/** `t` for one language of the file, the same object every time. */
export function translatorFor(
  messages: LoadedMessages,
  locale: string | null
): Translator<MessageTexts> {
  let made = translators.get(messages);
  if (!made) translators.set(messages, (made = new Map()));
  const asked = locale ?? '';
  const known = made.get(asked);
  if (known) return known;
  const picked = pickLocale(messages, locale);
  const texts = messages.locales.get(picked)!;
  const t = ((key: string, params?: Record<string, unknown>) => {
    const template = texts.get(key);
    if (!template) {
      throw new TypeError(
        `There is no message "${key}" in src/messages/. It has: ${[...texts.keys()].join(', ')}.`
      );
    }
    return fill(key, template, params, picked);
  }) as Translator<MessageTexts> & { locale: Locale };
  Object.defineProperties(t, {
    locale: { value: picked, enumerable: true },
    in: {
      value: (other: string) => translatorFor(messages, other),
      enumerable: false,
    },
  });
  Object.freeze(t);
  made.set(asked, t);
  return t;
}

/** Who will read what is sent. */
export interface Audience {
  /** The language of the person (the one of an interaction), when known. */
  person?: string | null | undefined;
  /** The server the message goes to; `null` in private messages. */
  guild?: Guild | null | undefined;
  /** Whether the person alone sees it. */
  ephemeral?: boolean | undefined;
}

/**
 * The language of those who will read what is sent: the person when they
 * alone see it (an ephemeral answer, a private message), else the language
 * of the server when Discord knows it (it only does for Community servers:
 * elsewhere `preferred_locale` is always `en-US`), else none, which means
 * the default language of the file.
 * @see https://docs.discord.com/developers/resources/guild#guild-object-guild-structure
 */
export function audienceLocale({
  person,
  guild,
  ephemeral,
}: Audience): string | null {
  if (ephemeral || !guild) return person ?? null;
  return guild.features.includes('COMMUNITY') ? guild.preferredLocale : null;
}

const missing = new Map<string, Translator<MessageTexts>>();

/** A `t` for a project without a language in `src/messages/`: it says so when called. */
export function missingTranslator(
  locale: string | null
): Translator<MessageTexts> {
  const shown = locale ?? 'en-US';
  const known = missing.get(shown);
  if (known) return known;
  const t = (() => {
    throw new TypeError(
      'This project has no language in src/messages/: add one, like src/messages/en-US.ts, to use t().'
    );
  }) as unknown as Translator<MessageTexts> & { locale: string };
  Object.defineProperties(t, {
    locale: { value: shown, enumerable: true },
    in: { value: () => t, enumerable: false },
  });
  Object.freeze(t);
  missing.set(shown, t);
  return t;
}

/**
 * `t` for what the bot sends, in the language of who will read it. Without
 * a language, a `t` that explains it is missing when called: the
 * texts of a component may still be functions of it.
 */
export function translatorOf(
  ctx: Pick<Context, 'messages'>,
  audience: Audience
): Translator<MessageTexts> {
  const locale = audienceLocale(audience);
  return ctx.messages
    ? translatorFor(ctx.messages, locale)
    : missingTranslator(locale);
}

/**
 * What a handler receives about translations: `t` in the language asked
 * when the project has a language in `src/messages/`, nothing otherwise. Spread it
 * into the context of any handler.
 */
export function translation(
  ctx: Pick<Context, 'messages'>,
  locale: string | null
): { t?: Translator<MessageTexts> } {
  return ctx.messages ? { t: translatorFor(ctx.messages, locale) } : {};
}
