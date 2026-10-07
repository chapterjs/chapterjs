// Translated messages: the languages of `src/messages/`, and `t` in every
// handler.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assembleMessages,
  commandsDeclarations,
  languagesConvention,
  messagesDeclarations,
  type LanguageEntry,
} from '../src/messages/convention.js';
import { language } from '../src/messages/messages.js';
import { translateCommand, unknownCommands } from '../src/messages/commands.js';
import {
  audienceLocale,
  compile,
  compilePlural,
  fill,
  missingTranslator,
  pickLocale,
  templateOf,
  translation,
  translatorFor,
  translatorOf,
  type LoadedMessages,
} from '../src/messages/translate.js';
import {
  FRAMEWORK,
  FRAMEWORK_KEYS,
  FRAMEWORK_TEXTS,
  phrase,
} from '../src/messages/phrases.js';
import { EVENTS, EVENT_NAMES } from '../src/events/registry.js';
import { commandsConvention } from '../src/commands/convention.js';
import { componentsConvention } from '../src/components/convention.js';
import { button } from '../src/components/button.js';
import { select } from '../src/components/select.js';
import { modal } from '../src/components/modal.js';
import { container, row } from '../src/components/layout.js';
import { resolve } from '../src/components/instance.js';
import { buildMessage } from '../src/structures/payload.js';
import { command } from '../src/commands/command.js';
import type { Guild } from '../src/structures/guild.js';
import {
  ALICE,
  BOT,
  GENERAL,
  GUILD,
  connected,
  packageDir,
  project,
  rawGuild,
  rawMessage,
  runDev,
  runProduction,
  world,
  type FakeWorld,
} from './dev-helpers.js';

/** A language file as the loader reads it. */
const lang = (
  locale: string,
  texts: Record<string, string | Record<string, string>>,
  extra: Record<string, unknown> = {}
): LanguageEntry => ({
  file: `src/messages/${locale}.ts`,
  language: languagesConvention.read(
    { default: language({ texts, ...extra } as never) },
    `${locale}.ts`
  ),
});

/** The languages of a project, assembled; throws on what is wrong. */
const assemble = (...entries: LanguageEntry[]): LoadedMessages => {
  const { messages, failed } = assembleMessages(entries);
  if (failed.length > 0) throw failed[0]!.error;
  return messages!;
};

const EN = `import { language } from 'chapterjs';
export default language({
  default: true,
  texts: {
    pong: 'Pong!',
    welcome: 'Welcome {name}, member #{count}!',
    members: { one: '{count} member', other: '{count} members' },
  },
});
`;
const FR = `import { language } from 'chapterjs';
export default language({
  texts: {
    pong: 'Pong !',
    welcome: 'Bienvenue {name}, membre n°{count} !',
    members: { one: '{count} membre', other: '{count} membres' },
  },
  framework: { failed: 'Une erreur est survenue avec cette {what}.', command: 'commande' },
});
`;

describe('a text', () => {
  it.each([
    ['Pong!', ['Pong!'], []],
    ['Hi {name}', ['Hi ', 'name', ''], ['name']],
    ['{a}{b}', ['', 'a', '', 'b', ''], ['a', 'b']],
    ['{a} and {a}', ['', 'a', ' and ', 'a', ''], ['a']],
    ['no {closing', ['no {closing'], []],
    ['', [''], []],
    ['{}', ['', '', ''], ['']],
    ['é {nom} ✓', ['é ', 'nom', ' ✓'], ['nom']],
    // Braces written as is.
    ['{{a}}', ['{a}'], []],
    ['{{{a}}}', ['{', 'a', '}'], ['a']],
    ['{{ {a}', ['{ ', 'a', ''], ['a']],
    ['{ {a}', ['{ ', 'a', ''], ['a']],
    ['{a}}', ['', 'a', '}'], ['a']],
    ['}}{a}', ['}', 'a', ''], ['a']],
    ['a } b', ['a } b'], []],
    ['{{', ['{'], []],
    ['{', ['{'], []],
  ])('%j is cut around its placeholders', (text, parts, params) => {
    expect(compile(text)).toEqual({ text, parts, params });
  });

  it('is a plural with one form per quantity, and count first', () => {
    const plural = compilePlural(
      new Map([
        ['one', compile('{count} member of {guild}')],
        ['other', compile('{count} members, {n} new')],
      ])
    );
    expect(plural.params).toEqual(['count', 'guild', 'n']);
    expect(templateOf('Hi {a}')).toEqual(compile('Hi {a}'));
    expect(templateOf({ other: '{count}' }).params).toEqual(['count']);
    expect(fill('k', plural, { count: 1, guild: 'g', n: 0 })).toBe(
      '1 member of g'
    );
    expect(fill('k', plural, { count: 2, guild: 'g', n: 0 })).toBe(
      '2 members, 0 new'
    );
    expect(fill('k', plural, { count: 0, guild: 'g', n: 0 })).toBe(
      '0 members, 0 new'
    );
    // French says "1 membre", and "0 membre" too: its rules, not English's.
    expect(fill('k', plural, { count: 0, guild: 'g', n: 0 }, 'fr')).toBe(
      '0 member of g'
    );
    // A form the file does not have falls back to "other".
    expect(fill('k', plural, { count: 1000000, guild: 'g', n: 0 }, 'fr')).toBe(
      '1\u202f000\u202f000 members, 0 new'
    );
    expect(() => fill('members', plural, { guild: 'g', n: 0 })).toThrow(
      `The message "members" needs {count}: t('members', { count, guild, n })`
    );
    expect(() =>
      fill('members', plural, { count: '3', guild: 'g', n: 0 })
    ).toThrow(
      'The message "members" is a plural: its {count} is a number, got "3".'
    );
  });

  it('writes numbers the way the language does', () => {
    const template = compile('{n} and {s}');
    expect(fill('k', template, { n: 1234.5, s: '1234' })).toBe(
      '1,234.5 and 1234'
    );
    expect(fill('k', template, { n: 1234.5, s: '1234' }, 'fr')).toBe(
      '1\u202f234,5 and 1234'
    );
    expect(fill('k', template, { n: 1234.5, s: '1234' }, 'de')).toBe(
      '1.234,5 and 1234'
    );
    expect(fill('k', template, { n: -0.5, s: true }, 'nope!')).toBe(
      '-0.5 and true'
    );
  });

  it('is filled in, with an error naming what is missing', () => {
    expect(fill('k', compile('Hi {name}, #{n}'), { name: 'Al', n: 3 })).toBe(
      'Hi Al, #3'
    );
    expect(fill('k', compile('Pong!'), undefined)).toBe('Pong!');
    expect(fill('k', compile('{a}{a}'), { a: 0 })).toBe('00');
    expect(() => fill('welcome', compile('Hi {name}, #{n}'), { n: 1 })).toThrow(
      'The message "welcome" needs {name}: t(\'welcome\', { name, n })'
    );
    expect(() =>
      fill('welcome', compile('Hi {name}, #{n}'), undefined)
    ).toThrow('needs {name}, {n}');
    expect(() => fill('k', compile('{a}'), { a: undefined })).toThrow(
      'needs {a}'
    );
  });
});

describe('the language', () => {
  const loaded = assemble(
    lang('en-US', { hi: 'Hi' }),
    lang('en-GB', { hi: 'Hiya' }),
    lang('fr', { hi: 'Salut' }, { default: true }),
    lang('es-ES', { hi: 'Hola' })
  );

  it.each([
    [null, 'fr'],
    ['fr', 'fr'],
    ['en-US', 'en-US'],
    ['en-GB', 'en-GB'],
    ['es-419', 'es-ES'],
    ['de', 'fr'],
    ['zh-TW', 'fr'],
    ['', 'fr'],
  ])('asked %j gives %s', (asked, picked) => {
    expect(pickLocale(loaded, asked)).toBe(picked);
  });

  it('is what t speaks, and t.in() speaks another', () => {
    const t = translatorFor(loaded, 'es-419');
    expect(t.locale).toBe('es-ES');
    expect(t('hi')).toBe('Hola');
    expect(t.in('en-GB')('hi')).toBe('Hiya');
    expect(t.in('en-GB').locale).toBe('en-GB');
    expect(t.in('ja')('hi')).toBe('Salut');
    // In one call: the language, the key, the params.
    expect(t.in('en-GB', 'hi')).toBe('Hiya');
    expect(t.in('ja', 'hi')).toBe('Salut');
    expect(
      (t.in as unknown as (...args: unknown[]) => string)('fr', 'hi', {})
    ).toBe('Salut');
    expect(() =>
      (t.in as unknown as (...args: unknown[]) => string)('fr', 'bye')
    ).toThrow('There is no message "bye" in src/messages/. It has: hi.');
    expect(() => (t as unknown as (key: string) => string)('bye')).toThrow(
      'There is no message "bye" in src/messages/. It has: hi.'
    );
    expect(Object.keys(t)).toEqual(['locale']);
    expect(Object.isFrozen(t)).toBe(true);
  });

  it('is made once per language asked', () => {
    const t = translatorFor(loaded, 'fr');
    expect(translatorFor(loaded, 'fr')).toBe(t);
    expect(translatorFor(loaded, null)).not.toBe(t);
    expect(translatorFor(loaded, null)).toBe(translatorFor(loaded, null));
    expect(t.in('en-GB')).toBe(translatorFor(loaded, 'en-GB'));
    expect(translation({ messages: loaded }, 'fr').t).toBe(t);
    expect(missingTranslator('de')).toBe(missingTranslator('de'));
    expect(missingTranslator(null)).toBe(missingTranslator('en-US'));
    // Another set of messages has its own.
    expect(translatorFor(assemble(lang('fr', { hi: 'x' })), 'fr')).not.toBe(t);
  });

  it('gives t only when the project has messages', () => {
    expect(translation({ messages: null }, 'fr')).toEqual({});
    const given = translation({ messages: loaded }, 'fr');
    expect(given.t?.('hi')).toBe('Salut');
  });

  const guild = (features: string[], preferredLocale = 'fr') =>
    ({ features, preferredLocale }) as unknown as Guild;

  it.each([
    [{ person: 'de', guild: null }, 'de'],
    [{ person: 'de', guild: guild(['COMMUNITY']), ephemeral: true }, 'de'],
    [{ person: 'de', guild: guild(['COMMUNITY']) }, 'fr'],
    [{ person: 'de', guild: guild([]) }, null],
    [{ person: 'de', guild: guild(['COMMUNITY'], 'en-US') }, 'en-US'],
    [{ guild: guild(['BANNER', 'COMMUNITY']) }, 'fr'],
    [{ guild: guild([]) }, null],
    [{ person: null, guild: null }, null],
    [{}, null],
  ])('is the one of who will read: %j → %j', (audience, locale) => {
    expect(audienceLocale(audience)).toBe(locale);
  });

  it('is given to what is sent, even without a messages file', () => {
    expect(translatorOf({ messages: loaded }, { person: 'de' })('hi')).toBe(
      'Salut'
    );
    expect(translatorOf({ messages: loaded }, { person: 'en-US' })('hi')).toBe(
      'Hi'
    );
    const none = translatorOf({ messages: null }, { person: 'de' });
    expect(none.locale).toBe('de');
    expect(none.in('fr')).toBe(none);
    expect(() => (none as unknown as (key: string) => string)('hi')).toThrow(
      'This project has no language in src/messages/: add one, like src/messages/en-US.ts, to use t().'
    );
    expect(() =>
      (none.in as unknown as (...args: unknown[]) => string)('fr', 'hi')
    ).toThrow('This project has no language in src/messages/');
    expect(missingTranslator(null).locale).toBe('en-US');
  });
});

describe('the phrases of the framework', () => {
  it('are in English, each with its placeholders', () => {
    expect(FRAMEWORK_KEYS).toEqual(Object.keys(FRAMEWORK_TEXTS));
    expect(FRAMEWORK.get('guildOnly')!.params).toEqual(['what']);
    expect(FRAMEWORK.get('needsPermissions')!.params).toEqual([
      'count',
      'permissions',
    ]);
    expect(FRAMEWORK.get('command')!.params).toEqual([]);
  });

  const fr = lang(
    'fr',
    { hi: 'Salut' },
    {
      default: true,
      framework: {
        command: 'commande',
        guildOnly: "Cette {what} ne s'utilise que sur un serveur.",
        needsPermissions: {
          one: 'Il te faut la permission {permissions}.',
          other: 'Il te faut les permissions {permissions}.',
        },
      },
    }
  );
  const loaded = assemble(fr, lang('de', { hi: 'Hallo' }));

  it.each([
    [
      null,
      'guildOnly',
      { what: 'command' },
      "Cette commande ne s'utilise que sur un serveur.",
    ],
    [
      'fr',
      'guildOnly',
      { what: 'button' },
      "Cette button ne s'utilise que sur un serveur.",
    ],
    [
      'de',
      'guildOnly',
      { what: 'command' },
      'This command can only be used in a server.',
    ],
    [
      'fr',
      'dmOnly',
      { what: 'form' },
      'This form can only be used in a private message with me.',
    ],
    [
      'fr',
      'needsPermissions',
      { permissions: 'A', count: 1 },
      'Il te faut la permission A.',
    ],
    [
      'fr',
      'needsPermissions',
      { permissions: 'A, B', count: 2 },
      'Il te faut les permissions A, B.',
    ],
    [
      'de',
      'needsPermissions',
      { permissions: 'A', count: 1 },
      'You need the A permission to use this command.',
    ],
    [
      'de',
      'needsPermissions',
      { permissions: 'A, B', count: 2 },
      'You need the A, B permissions to use this command.',
    ],
    [
      'ja',
      'missingPermission',
      {},
      "I don't have the permission to do that here.",
    ],
    [
      'fr',
      'failed',
      { what: 'menu' },
      'Something went wrong while running this menu.',
    ],
  ] as const)(
    'speak the language of the file that translates them, else English (%s, %s)',
    (locale, key, params, expected) => {
      expect(phrase({ messages: loaded }, locale, key, params)).toBe(expected);
    }
  );

  it('are English without a language file', () => {
    expect(
      phrase({ messages: null }, 'fr', 'outdated', { what: 'button' })
    ).toBe('This button is out of date.');
    expect(phrase({ messages: null }, null, 'unavailable')).toBe(
      'This command is not available right now.'
    );
  });
});

describe('the server of an event', () => {
  const guild = { id: 'g' } as unknown as Guild;
  it.each(EVENT_NAMES.filter(name => name !== 'ready'))(
    'is declared for %s',
    name => {
      const read = EVENTS[name].guildOf as (context: object) => Guild | null;
      expect(read).toBeTypeOf('function');
      expect(read({ guild, message: { guild }, channel: { guild } })).toBe(
        guild
      );
      expect(
        read({
          guild: null,
          message: { guild: null },
          channel: { guild: null },
        })
      ).toBe(null);
    }
  );
  it('is none for ready', () => {
    expect(EVENTS.ready.guildOf).toBeUndefined();
  });
});

/** `t` as a test writes it: the package itself has no src/messages/. */
type AnyT = (key: string, params?: Record<string, unknown>) => string;
const any = (t: unknown): AnyT => t as AnyT;

describe('the texts of a component', () => {
  const loaded = assemble(
    lang(
      'en-US',
      { again: 'Again ({count})', pick: 'Pick one', title: 'Hello' },
      { default: true }
    ),
    lang('fr', { again: 'Encore ({count})', pick: 'Choisis', title: 'Bonjour' })
  );
  const t = (locale: string | null) => translatorFor(loaded, locale);
  const load = (path: string, exports: Record<string, unknown>) =>
    componentsConvention.read(exports, path);

  it('can be computed when the message is sent, in the language of who reads it', () => {
    const again = button({
      label: ({ t, data }) => any(t)('again', { count: data.count }),
      data: { count: 'number' },
      run() {},
    });
    load('buttons/again.ts', { default: again });
    const rendered = again({ count: 3 }) as unknown as { raw: unknown };
    expect(typeof rendered.raw).toBe('function');
    expect(resolve(rendered as never, t('fr')).raw).toMatchObject({
      label: 'Encore (3)',
      custom_id: 'buttons/again:3',
    });
    // A message resolves them for its reader; rows and containers too.
    const body = (locale: string | null) =>
      buildMessage(
        {
          components: [
            row([again({ count: 1 })]),
            container([again({ count: 2 })]),
          ],
        },
        { t: t(locale) }
      ).body;
    expect(JSON.stringify(body('fr'))).toContain('"label":"Encore (1)"');
    expect(JSON.stringify(body('fr'))).toContain('"label":"Encore (2)"');
    expect(JSON.stringify(body(null))).toContain('"label":"Again (2)"');
    // Without t, a function is an error that says why.
    expect(() => buildMessage({ components: [again({ count: 1 })] })).toThrow(
      'This project has no language in src/messages/'
    );
    // A text that was written stays as it is: nothing to compute.
    const plain = button({ label: 'Again', run() {} });
    load('buttons/plain.ts', { default: plain });
    expect(typeof (plain as unknown as { raw: unknown }).raw).toBe('object');
  });

  it('is checked against the limits of Discord when computed', () => {
    const long = button({ label: () => 'x'.repeat(81), run() {} });
    load('buttons/long.ts', { default: long });
    expect(() => buildMessage({ components: [long] }, { t: t(null) })).toThrow(
      'The label of long, as its function returned it, is 81 characters long: Discord accepts between 1 and 80.'
    );
    const wrong = button({ label: (() => 3) as never, run() {} });
    load('buttons/wrong.ts', { default: wrong });
    expect(() => buildMessage({ components: [wrong] }, { t: t(null) })).toThrow(
      'is a text of 1 to 80 characters, got number.'
    );
  });

  it('works for the placeholder and the options of a menu', () => {
    const menu = select({
      placeholder: ({ t }) => any(t)('pick'),
      options: [
        {
          label: ({ t }) => any(t)('again', { count: 1 }),
          value: 'a',
          description: ({ t }) => any(t)('title'),
        },
        { label: 'B', value: 'b' },
      ],
      run() {},
    });
    load('selects/menu.ts', { default: menu });
    const raw = resolve(menu as never, t('fr')).raw as {
      placeholder: string;
      options: { label: string; description?: string }[];
    };
    expect(raw.placeholder).toBe('Choisis');
    expect(raw.options).toEqual([
      { label: 'Encore (1)', value: 'a', description: 'Bonjour' },
      { label: 'B', value: 'b' },
    ]);
    const plain = select({ placeholder: 'Pick', options: ['a'], run() {} });
    load('selects/plain.ts', { default: plain });
    expect(typeof (plain as unknown as { raw: unknown }).raw).toBe('object');
  });

  it('works for the title and the fields of a form', () => {
    const form = modal({
      title: ({ t }) => any(t)('title'),
      fields: {
        why: {
          type: 'text',
          label: ({ t }) => any(t)('pick'),
          placeholder: ({ t }) => any(t)('again', { count: 2 }),
          description: ({ t }) => any(t)('title'),
        },
        how: {
          type: 'radio',
          label: 'how',
          options: [
            { label: ({ t }) => any(t)('pick'), value: 'x' },
            { label: 'y', value: 'y' },
          ],
        },
        note: { type: 'note', content: ({ t }) => any(t)('title') },
      },
      run() {},
    });
    load('modals/form.ts', { default: form });
    const raw = resolve(form as never, t('fr')).raw;
    expect(JSON.parse(JSON.stringify(raw))).toEqual(
      JSON.parse(
        JSON.stringify({
          custom_id: 'modals/form',
          title: 'Bonjour',
          components: [
            {
              type: 18,
              label: 'Choisis',
              description: 'Bonjour',
              component: {
                type: 4,
                custom_id: 'why',
                style: 1,
                placeholder: 'Encore (2)',
              },
            },
            {
              type: 18,
              label: 'how',
              component: {
                type: 21,
                custom_id: 'how',
                options: [
                  { label: 'Choisis', value: 'x' },
                  { label: 'y', value: 'y' },
                ],
              },
            },
            { type: 10, content: 'Bonjour' },
          ],
        })
      )
    );
  });
});

describe('the commands section', () => {
  /** Described in its file. */
  const described = commandsConvention.read(
    {
      default: command({
        description: 'Pong',
        options: {
          who: { type: 'string', description: 'd', choices: ['warm', 'cold'] },
        },
        run() {},
      }),
    },
    'ping.ts'
  );
  /** Described by the languages: no description in the file. */
  const bare = commandsConvention.read(
    {
      default: command({
        options: {
          who: { type: 'string', choices: ['warm', 'cold'] },
          why: { type: 'string', description: 'In the file' },
        },
        run() {},
      }),
    },
    'ping.ts'
  );
  const file = (
    en: Record<string, Record<string, unknown>> | undefined,
    fr: Record<string, Record<string, unknown>> | undefined
  ) =>
    assemble(
      lang(
        'en-US',
        { a: 'b' },
        { default: true, ...(en ? { commands: en } : {}) }
      ),
      lang('fr', { a: 'c' }, fr ? { commands: fr } : {})
    );

  it.each([
    [
      { commands: 'ping' },
      `"commands" is an object whose keys are the paths of your command files: commands: { ping: { description: '...' }, 'mod/ban': { name: '...' } }`,
    ],
    [
      { commands: { Ping: {} } },
      `"Ping" in "commands" is not the path of a command file: write it as the file is named, like 'ping' or 'mod/ban'.`,
    ],
    [{ commands: { 'a/b/c/d': {} } }, 'is not the path of a command file'],
    [
      { commands: { 'mod/ban': 'Bannir' } },
      `The texts of the command /mod ban must be an object like { name: '...', description: '...' }.`,
    ],
  ])('is refused when wrong (%#)', (extra, message) => {
    expect(() => lang('fr', { a: 'c' }, extra)).toThrow(message);
  });

  it('is read apart from the texts, in every language', () => {
    const loaded = file(undefined, { ping: { description: 'Pong !' } });
    expect([...loaded.locales.get('fr')!.keys()]).toEqual(['a']);
    expect(loaded.commands.get('fr')).toEqual({
      ping: { description: 'Pong !' },
    });
    expect(loaded.commands.has('en-US')).toBe(false);
    expect(loaded.files.get('fr')).toBe('src/messages/fr.ts');
    expect(unknownCommands(loaded, new Set(['ping']))).toEqual([]);
    expect(unknownCommands(loaded, new Set(['pong']))).toEqual([
      { file: 'src/messages/fr.ts', path: 'ping' },
    ]);
  });

  it('a command without description in its file has no "locales" either', () => {
    expect(() =>
      commandsConvention.read(
        {
          default: command({ locales: { fr: { description: 'x' } }, run() {} }),
        },
        'ping.ts'
      )
    ).toThrow(
      'This command has no "description", so its texts come from the language files of src/messages/: put its "locales" there too (commands: { ... }), or give it a description here.'
    );
    expect(described.described).toBe(true);
    expect(bare.described).toBe(false);
    expect(bare.description).toBe('');
    expect(bare.options.map(option => option.description)).toEqual([
      '',
      'In the file',
    ]);
  });

  it('refuses to translate a command its file describes', () => {
    const { command: same, failed } = translateCommand(
      'src/commands/ping.ts',
      described,
      file(undefined, { ping: { description: 'Pong !' } })
    );
    expect(same).toBe(described);
    expect(failed).toMatchObject([
      {
        file: 'src/messages/fr.ts',
        error: {
          message:
            '/ping is described in src/commands/ping.ts: remove its description there to translate it here, or remove it here.',
        },
      },
    ]);
    // Nothing about it in the languages: nothing to say.
    expect(translateCommand('src/commands/ping.ts', described, null)).toEqual({
      command: described,
      failed: [],
    });
  });

  it('describes a command from the default language, and translates it from the others', () => {
    const { command: merged, failed } = translateCommand(
      'src/commands/ping.ts',
      bare,
      file(
        {
          ping: {
            name: 'ignored',
            description: 'Pong',
            options: { who: { description: 'Who', choices: { warm: 'Warm' } } },
          },
        },
        {
          ping: {
            name: 'pong',
            description: 'Pong !',
            options: {
              who: {
                name: 'qui',
                description: 'Qui',
                choices: { warm: 'Chaud' },
              },
            },
          },
        }
      )
    );
    expect(failed).toEqual([]);
    expect(merged).toMatchObject({
      description: 'Pong',
      options: [
        { name: 'who', description: 'Who' },
        { name: 'why', description: 'In the file' },
      ],
      names: { fr: 'pong' },
      descriptions: { fr: 'Pong !' },
      optionLocales: {
        who: {
          names: { fr: 'qui' },
          descriptions: { fr: 'Qui' },
          choices: { warm: { fr: 'Chaud' } },
        },
      },
    });
  });

  it.each([
    [
      null,
      'src/commands/ping.ts',
      `This command has no description: write it in src/messages/en-US.ts (commands: { "ping": { description: '...' } }), or in the file (description: '...').`,
    ],
    [
      file(undefined, { ping: { description: 'Pong !' } }),
      'src/commands/ping.ts',
      `This command has no description: write it in src/messages/en-US.ts (commands: { "ping": { description: '...' } }), or in the file (description: '...').`,
    ],
    [
      file({ ping: { description: 'Pong' } }, undefined),
      'src/commands/ping.ts',
      `The option "who" of /ping has no description: write it in src/messages/en-US.ts (commands: { "ping": { options: { who: { description: '...' } } } }), or in the file.`,
    ],
    [
      file(
        {
          ping: {
            description: 'Pong',
            options: { who: { description: 'Who' } },
          },
        },
        { ping: { options: { nope: { name: 'x' } } } }
      ),
      'src/messages/fr.ts',
      'In "commands", for /ping: the "fr" translation translates an option "nope" that this command does not have. Its options are: who, why.',
    ],
  ])(
    'says what is missing or wrong, on the right file (%#)',
    (messages, where, message) => {
      const { failed } = translateCommand(
        'src/commands/ping.ts',
        bare,
        messages
      );
      expect(failed.map(({ file }) => file)).toContain(where);
      expect(String(failed.find(one => one.file === where)!.error)).toContain(
        message
      );
    }
  );
});

describe('a language file', () => {
  const read = (path: string, exports: Record<string, unknown>) => {
    languagesConvention.check?.(path);
    return languagesConvention.read(exports, path);
  };
  const example =
    "import { language } from 'chapterjs'; export default language({ texts: { pong: 'Pong!' } })";

  it.each([
    [
      'en.ts',
      '"en" is not a language Discord knows: the name of a file of src/messages/ is the language it holds. It can be: id, da, de, en-GB, en-US, es-ES, es-419, fr, hr, it, lt, hu, nl, no, pl, pt-BR, ro, fi, sv-SE, vi, tr, cs, el, bg, ru, uk, hi, th, zh-CN, ja, zh-TW, ko.',
    ],
    ['French.ts', '"French" is not a language Discord knows'],
    [
      'old/fr.ts',
      "A language is a file directly in src/messages/, named after the language: src/messages/fr.ts. It can't be in a subfolder.",
    ],
  ])('is named after its language (%s)', (path, message) => {
    expect(() => languagesConvention.check!(path)).toThrow(message);
  });

  it.each([
    [{}, `This file has no default export. It should look like: ${example}`],
    [
      { default: { texts: {} } },
      'The default export of this file must be what language() returns',
    ],
    [
      { default: language('x' as never) },
      "language() needs an object: language({ texts: { pong: 'Pong!' } })",
    ],
    [
      { default: language({ texts: {}, locale: 'fr' } as never) },
      '"locale" is not something a language has. It can have: default, texts, commands, framework.',
    ],
    [
      { default: language({ texts: {}, default: 'yes' } as never) },
      '"default" is true or false, got "yes".',
    ],
    [
      { default: language({} as never) },
      `"texts" is an object, one text per key: texts: { pong: 'Pong!', welcome: 'Welcome {name}!' }`,
    ],
    [
      { default: language({ texts: 'Salut' } as never) },
      '"texts" is an object, one text per key',
    ],
    [
      { default: language({ texts: { a: '' } }) },
      `The message "a" must be a text: a: 'Hello {name}!', or a plural: a: { one: '{count} member', other: '{count} members' }`,
    ],
    [
      { default: language({ texts: { a: 3 } } as never) },
      'The message "a" must be a text',
    ],
    [
      { default: language({ texts: { a: { one: 'x' } } } as never) },
      `The plural "a" needs an "other" form, used when no other form fits: a: { one: '{count} member', other: '{count} members' }`,
    ],
    [
      {
        default: language({ texts: { a: { other: 'x', some: 'y' } } } as never),
      },
      `"some" is not a form of the plural "a". A plural has: zero, one, two, few, many, other (other at least): a: { one: '{count} member', other: '{count} members' }`,
    ],
    [
      { default: language({ texts: { a: { other: '' } } }) },
      `The form "other" of the plural "a" must be a text: other: '{count} members'`,
    ],
    [
      { default: language({ texts: { a: { other: 'x {a b}' } } }) },
      'The form "other" of the plural "a" has a placeholder "{a b}": a placeholder is a name made of letters, digits and _, like {name}.',
    ],
    [
      { default: language({ texts: {}, framework: 'x' } as never) },
      `"framework" is an object, one phrase per key: framework: { guildOnly: '...' }. It can have: command, button, menu, form, guildOnly, dmOnly, notHere, unavailable, gone, outdated, authorOnly, failed, missingPermission, needsPermissions.`,
    ],
    [
      { default: language({ texts: {}, framework: { hello: 'x' } } as never) },
      '"hello" is not a phrase of the framework. It can be: command, button, menu, form, guildOnly, dmOnly, notHere, unavailable, gone, outdated, authorOnly, failed, missingPermission, needsPermissions.',
    ],
    [
      { default: language({ texts: {}, framework: { guildOnly: '' } }) },
      `The phrase "guildOnly" must be a text: guildOnly: 'Hello {name}!'`,
    ],
    [
      { default: language({ texts: {}, framework: { guildOnly: 'Nope.' } }) },
      'The phrase "guildOnly" does not have the placeholders of the framework: it has none, the framework has {what}.',
    ],
    [
      {
        default: language({
          texts: {},
          framework: { needsPermissions: 'Missing: {permissions} ({n})' },
        }),
      },
      'The phrase "needsPermissions" does not have the placeholders of the framework: it has {permissions}, {n}, the framework has {count}, {permissions}.',
    ],
    [
      { default: language({ texts: { a: 'Hi { name }' } }) },
      'The message "a" has a placeholder "{ name }": a placeholder is a name made of letters, digits and _, like {name}.',
    ],
    [
      { default: language({ texts: { a: 'Hi {}' } }) },
      'has a placeholder "{}"',
    ],
  ])('is refused when wrong (%#)', (exports, message) => {
    expect(() => read('fr.ts', exports)).toThrow(message);
  });

  it('is read, compiled once per text', () => {
    const loaded = read('fr.ts', {
      default: language({
        default: true,
        texts: { pong: 'Pong !', hi: 'Salut {name}' },
      }),
    });
    expect(loaded.locale).toBe('fr');
    expect(loaded.isDefault).toBe(true);
    expect(loaded.commands).toBeUndefined();
    expect(loaded.texts.get('hi')).toEqual({
      text: 'Salut {name}',
      parts: ['Salut ', 'name', ''],
      params: ['name'],
    });
    expect(read('fr.ts', { default: language({ texts: {} }) }).isDefault).toBe(
      false
    );
    expect(loaded.framework.size).toBe(0);
    const phrases = read('fr.ts', {
      default: language({
        texts: { n: { one: '{count} x', other: '{count} xs' } },
        framework: {
          command: 'commande',
          needsPermissions: { other: 'Missing: {permissions} ({count})' },
        },
      }),
    });
    expect([...phrases.framework.keys()]).toEqual([
      'command',
      'needsPermissions',
    ]);
    expect(phrases.texts.get('n')!.params).toEqual(['count']);
  });
});

describe('the languages together', () => {
  it('need one default, unless there is one language', () => {
    expect(assemble(lang('fr', { a: 'b' })).default).toBe('fr');
    expect(
      assemble(
        lang('fr', { a: 'b' }),
        lang('de', { a: 'c' }, { default: true })
      ).default
    ).toBe('de');
    expect(assembleMessages([])).toEqual({ messages: null, failed: [] });
    const none = assembleMessages([
      lang('fr', { a: 'b' }),
      lang('de', { a: 'c' }),
    ]);
    expect(none.messages).toBeNull();
    expect(none.failed.map(({ file }) => file)).toEqual([
      'src/messages/fr.ts',
      'src/messages/de.ts',
    ]);
    expect(String(none.failed[0]!.error)).toContain(
      'None of the 2 languages of src/messages/ is the default one, used when the language of a person or of a server is not there. Add default: true in one of them.'
    );
    const two = assembleMessages([
      lang('fr', { a: 'b' }, { default: true }),
      lang('de', { a: 'c' }, { default: true }),
      lang('it', { a: 'd' }),
    ]);
    expect(two.messages).toBeNull();
    expect(two.failed.map(({ file }) => file)).toEqual([
      'src/messages/fr.ts',
      'src/messages/de.ts',
    ]);
    expect(String(two.failed[0]!.error)).toContain(
      '2 languages say default: true (src/messages/fr.ts, src/messages/de.ts): only one can be the default.'
    );
  });

  it('take from the default language the texts another does not have', () => {
    const { messages, failed } = assembleMessages([
      lang(
        'en-US',
        { a: 'Hi {name}', c: 'd', n: 'Number {n}' },
        { default: true }
      ),
      lang('fr', { a: 'Salut {name}' }),
    ]);
    expect(failed).toEqual([]);
    const t = translatorFor(messages!, 'fr');
    expect(t('a', { name: 'x' })).toBe('Salut x');
    expect(t('c')).toBe('d');
    // A text of the default language is written its way.
    expect(t('n', { n: 1234 })).toBe('Number 1,234');
    expect(() => any(t)('z')).toThrow(
      'There is no message "z" in src/messages/. It has: a, c, n.'
    );
  });

  it.each([
    [
      { a: 'Hi {name}', c: 'd', e: 'f' },
      'The message "e" is not in en-US.ts: add it there, or remove it here.',
    ],
    [
      { a: 'Hi {nom}', c: 'd' },
      'The message "a" does not have the placeholders of en-US.ts: it has {nom}, en-US.ts has {name}.',
    ],
    [{ a: 'Hi', c: 'd' }, 'it has none, en-US.ts has {name}.'],
    [
      { a: { one: 'Hi {name}', other: 'Hi all' }, c: 'd' },
      'The message "a" does not have the placeholders of en-US.ts: it has {count}, {name}, en-US.ts has {name}.',
    ],
  ])(
    'leave out a language that differs, and say why (%#)',
    (texts, message) => {
      const { messages, failed } = assembleMessages([
        lang('en-US', { a: 'Hi {name}', c: 'd' }, { default: true }),
        lang('fr', texts),
        lang('de', { a: 'Hallo {name}', c: 'd' }),
      ]);
      expect(failed.map(({ file }) => file)).toEqual(['src/messages/fr.ts']);
      expect(String(failed[0]!.error)).toContain(message);
      expect([...messages!.locales.keys()]).toEqual(['en-US', 'de']);
    }
  );

  it('take a plural where another language has a text, when the placeholders match', () => {
    const { messages, failed } = assembleMessages([
      lang(
        'en-US',
        { n: { one: '{count} member', other: '{count} members' } },
        { default: true, framework: { command: 'command!' } }
      ),
      lang('fr', { n: '{count} membre(s)' }),
      lang('de', { n: { other: '{count} Mitglieder' } }, { framework: {} }),
    ]);
    expect(failed).toEqual([]);
    expect([...messages!.locales.keys()]).toEqual(['en-US', 'fr', 'de']);
    // Only the languages that translate a phrase are kept.
    expect([...messages!.framework.keys()]).toEqual(['en-US']);
    expect(translatorFor(messages!, 'fr')('n', { count: 2 })).toBe(
      '2 membre(s)'
    );
    expect(translatorFor(messages!, 'de')('n', { count: 1 })).toBe(
      '1 Mitglieder'
    );
    expect(translatorFor(messages!, 'en-GB')('n', { count: 1 })).toBe(
      '1 member'
    );
  });

  it('offer the commands of the project in the editor, but not the ones their file describes', () => {
    expect(commandsDeclarations([])).toBe('');
    expect(
      commandsDeclarations([
        { file: 'src/commands/(mod)/mod/ban.ts', described: true },
        { file: 'src/commands/ping.ts', described: false },
      ])
    ).toBe(`export {};

declare module 'chapterjs' {
  /** The commands of src/commands/, by the path of their file: true when the language files describe it, false when the file has its own description. */
  export interface ProjectCommands {
    "mod/ban": false;
    "ping": true;
  }
}
`);
  });

  it('type t from the default language file, or the first one until it is known', () => {
    expect(messagesDeclarations([])).toBe('');
    const files = [
      { file: 'src/messages/_old.ts', path: '' },
      { file: 'src/messages/fr.ts', path: '' },
      { file: 'src/messages/en-US.ts', path: '' },
    ];
    expect(messagesDeclarations(files)).toContain(
      "extends MessagesOf<typeof import('../../src/messages/fr').default> {}"
    );
    expect(messagesDeclarations(files, 'src/messages/en-US.ts')).toContain(
      "extends MessagesOf<typeof import('../../src/messages/en-US').default> {}"
    );
    expect(messagesDeclarations(files, 'src/messages/de.ts')).toContain(
      "import('../../src/messages/fr')"
    );
    // The languages, for t.in(): the named files, whatever the default.
    expect(messagesDeclarations(files))
      .toContain(`  export interface ProjectLocales {
    "en-US": true;
    "fr": true;
  }`);
    expect(messagesDeclarations([{ file: 'src/messages/fr.ts', path: '' }]))
      .toContain(`  export interface ProjectLocales {
    "fr": true;
  }`);
    expect(
      messagesDeclarations([{ file: 'src/messages/nope.ts', path: '' }])
    ).toBe('');
  });
});

/** A project with TypeScript, as the scaffolder leaves it. */
function typed(content: Record<string, string>): string {
  const cwd = project(content);
  cpSync(
    join(packageDir, '../create-chapter/templates/default/tsconfig.json'),
    join(cwd, 'tsconfig.json')
  );
  symlinkSync(
    join(packageDir, 'node_modules/@types'),
    join(cwd, 'node_modules/@types'),
    'dir'
  );
  return cwd;
}

const typeErrors = async (cwd: string, fake: FakeWorld) => {
  await runDev(cwd, fake, ['sync']).exited;
  const result = spawnSync(join(packageDir, 'node_modules/.bin/tsc'), ['-b'], {
    cwd,
    encoding: 'utf8',
  });
  // A language file is part of every project of `.chapterjs/` (each one
  // types `t` from it), so `tsc -b` repeats its errors: one is enough here.
  return [
    ...new Set(
      result.stdout
        .split('\n')
        .filter(line => line.includes('error TS'))
        .map(line => line.replace(/\(\d+,\d+\).*/, ''))
    ),
  ].sort();
};

describe.skipIf(process.platform === 'win32')('in the editor', () => {
  it('types the keys, the placeholders and the languages', async () => {
    const fake = await world();
    const cwd = typed({
      'src/messages/en-US.ts': EN,
      'src/messages/fr.ts': FR,
      'src/commands/ok.ts': `import { command } from 'chapterjs';
export default command({ description: 'd', async run({ interaction, t, user }) {
  const a: string = t('pong');
  const b: string = t('welcome', { name: user.username, count: 3 });
  const c: string = t.in('fr')('welcome', { name: 'x', count: 'three' });
  // A language of the project, one of Discord, or one that comes from Discord.
  const d: string = t.in('fr', 'welcome', { name: 'x', count: 3 });
  const e: string = t.in('de', 'pong');
  const f: string = t.in(interaction.locale, 'pong');
  const g: string = t.in(interaction.locale)('members', { count: 1 });
  const locale: string = t.locale;
  await interaction.reply(a + b + c + d + e + f + g + locale);
} });
`,
      'src/commands/wrong-key.ts': `import { command } from 'chapterjs';
export default command({ description: 'd', run({ t }) { return t('pang'); } });
`,
      'src/commands/missing-param.ts': `import { command } from 'chapterjs';
export default command({ description: 'd', run({ t }) { return t('welcome', { name: 'x' }); } });
`,
      'src/commands/extra-param.ts': `import { command } from 'chapterjs';
export default command({ description: 'd', run({ t }) { return t('pong', { name: 'x' }); } });
`,
      'src/commands/no-param.ts': `import { command } from 'chapterjs';
export default command({ description: 'd', run({ t }) { return t('welcome'); } });
`,
      'src/commands/wrong-locale.ts': `import { command } from 'chapterjs';
export default command({ description: 'd', run({ t }) { return t.in('en')('pong'); } });
`,
      'src/commands/wrong-locale-key.ts': `import { command } from 'chapterjs';
export default command({ description: 'd', run({ t }) { return t.in('en', 'pong'); } });
`,
      'src/commands/in-wrong-key.ts': `import { command } from 'chapterjs';
export default command({ description: 'd', run({ t }) { return t.in('fr', 'pang'); } });
`,
      'src/commands/in-missing-param.ts': `import { command } from 'chapterjs';
export default command({ description: 'd', run({ t }) { return t.in('fr', 'welcome', { name: 'x' }); } });
`,
      'src/commands/in-extra-param.ts': `import { command } from 'chapterjs';
export default command({ description: 'd', run({ t }) { return t.in('fr', 'pong', { x: 1 }); } });
`,
      'src/commands/in-any-string.ts': `import { command } from 'chapterjs';
export default command({ description: 'd', run({ t }) { return t.in(String(1), 'pong'); } });
`,
      'src/commands/plural.ts': `import { command } from 'chapterjs';
export default command({ description: 'd', run({ t }) { return t('members', { count: 2 }); } });
`,
      'src/commands/plural-string.ts': `import { command } from 'chapterjs';
export default command({ description: 'd', run({ t }) { return t('members', { count: '2' }); } });
`,
      'src/commands/plural-missing.ts': `import { command } from 'chapterjs';
export default command({ description: 'd', run({ t }) { return t('members'); } });
`,
      'src/lib/framework.ts': `import { language } from 'chapterjs';
export default language({ texts: { pong: 'x', welcome: 'x', members: 'x' }, framework: { command: 'commande', needsPermissions: { one: '{permissions} {count}', other: '{permissions}' } } });
`,
      'src/lib/wrong-framework.ts': `import { language } from 'chapterjs';
export default language({ texts: { pong: 'x' }, framework: { nope: 'x' } });
`,
      'src/lib/wrong-plural.ts': `import { language } from 'chapterjs';
export default language({ texts: { pong: { one: 'x' } } });
`,
      'src/components/buttons/ok.ts': `import { button } from 'chapterjs';
export default button({ label: 'x', async run({ interaction, t }) { await interaction.update(t('pong')); } });
`,
      'src/components/selects/wrong.ts': `import { select } from 'chapterjs';
export default select({ placeholder: 'x', options: ['a'], run({ t }) { return t('nope'); } });
`,
      'src/components/modals/ok.ts': `import { modal } from 'chapterjs';
export default modal({ title: 'x', fields: { a: { type: 'text', label: 'a' } }, async run({ interaction, t }) { await interaction.reply(t('pong')); } });
`,
      'src/events/ready/ok.ts': `import { event } from 'chapterjs';
export default event(({ t }) => console.log(t('pong')));
`,
      'src/events/messageCreate/ok.ts': `import { event } from 'chapterjs';
export default event(async ({ message, t }) => { await message.reply(t('welcome', { name: message.author.username, count: 1 })); }, { where: 'both' });
`,
      'src/events/ready/wrong.ts': `import { event } from 'chapterjs';
export default event(({ t }) => console.log(t('pong', { x: 1 })));
`,
      'src/tasks/ok.ts': `import { task } from 'chapterjs';
export default task({ every: '1h', run({ t }) { console.log(t('pong')); } });
`,
      'src/tasks/wrong.ts': `import { task } from 'chapterjs';
export default task({ every: '1h', run({ t }) { console.log(t('welcome', { count: 1 })); } });
`,
    });
    expect(await typeErrors(cwd, fake)).toEqual([
      'src/commands/extra-param.ts',
      'src/commands/in-any-string.ts',
      'src/commands/in-extra-param.ts',
      'src/commands/in-missing-param.ts',
      'src/commands/in-wrong-key.ts',
      'src/commands/missing-param.ts',
      'src/commands/no-param.ts',
      'src/commands/plural-missing.ts',
      'src/commands/plural-string.ts',
      'src/commands/wrong-key.ts',
      'src/commands/wrong-locale-key.ts',
      'src/commands/wrong-locale.ts',
      'src/components/selects/wrong.ts',
      'src/events/ready/wrong.ts',
      'src/lib/wrong-framework.ts',
      'src/lib/wrong-plural.ts',
      'src/tasks/wrong.ts',
    ]);
    expect(
      readFileSync(join(cwd, '.chapterjs/types/shared.d.ts'), 'utf8')
    ).toContain('interface ProjectMessages');
  });

  it('underlines a wrong language file, and offers the commands', async () => {
    const fake = await world();
    const cwd = typed({
      'src/messages/en-US.ts': EN,
      'src/commands/ping.ts': `import { command } from 'chapterjs';
export default command({ description: 'd', options: { who: { type: 'string', description: 'd', choices: ['warm', 'cold'] } }, run({ t }) { return t('pong'); } });
`,
      'src/commands/(mod)/mod/ban.ts': `import { command } from 'chapterjs';
export default command({ description: 'd', run({ t }) { return t('pong'); } });
`,
      'src/messages/fr.ts': `import { language } from 'chapterjs';
export default language({
  texts: { pong: 'Pong !', welcome: 'Bienvenue {name}, membre n°{count} !' },
  commands: {
    ping: { name: 'pong', description: 'd', options: { who: { name: 'qui', choices: { warm: 'Chaud' } } } },
    'mod/ban': { description: 'Bannit' },
  },
});
`,
      'src/lib/unknown-command.ts': `import { language } from 'chapterjs';
export default language({ texts: { a: 'b' }, commands: { pong: { description: 'd' } } });
`,
      'src/lib/unknown-option.ts': `import { language } from 'chapterjs';
export default language({ texts: { a: 'b' }, commands: { ping: { options: { nope: { name: 'x' } } } } });
`,
      'src/lib/unknown-choice.ts': `import { language } from 'chapterjs';
export default language({ texts: { a: 'b' }, commands: { ping: { options: { who: { choices: { hot: 'Chaud' } } } } } });
`,
      'src/lib/no-texts.ts': `import { language } from 'chapterjs';
export default language({ default: true });
`,
      'src/lib/wrong-text.ts': `import { language } from 'chapterjs';
export default language({ texts: { a: 3 } });
`,
      'src/lib/wrong-default.ts': `import { language } from 'chapterjs';
export default language({ default: 'yes', texts: { a: 'b' } });
`,
      'src/lib/wrong-command.ts': `import { language } from 'chapterjs';
export default language({ texts: { a: 'b' }, commands: { ping: { description: 3 } } });
`,
      'src/lib/ok.ts': `import { language } from 'chapterjs';
export default language({ texts: { a: 'b {x}' }, commands: { ping: { description: 'd', options: { who: { name: 'qui', choices: { warm: 'Chaud' } } } } } });
`,
    });
    // The paths are typed from the file names; options and choices are
    // checked when the files load (typing them would need the command
    // files, whose `t` needs the languages: a circle). `sync` runs no
    // file, so it does not know that ping.ts is described: every command
    // is offered until `dev` or `build` runs them.
    expect(await typeErrors(cwd, fake)).toEqual([
      'src/lib/no-texts.ts',
      'src/lib/unknown-command.ts',
      'src/lib/wrong-command.ts',
      'src/lib/wrong-default.ts',
      'src/lib/wrong-text.ts',
    ]);
    // The commands are only pulled into the main project, where languages are.
    expect(
      readFileSync(join(cwd, '.chapterjs/types/main.d.ts'), 'utf8')
    ).toContain(`"mod/ban": true;`);
    expect(
      readFileSync(join(cwd, '.chapterjs/types/shared.d.ts'), 'utf8')
    ).not.toContain('ProjectCommands');
    expect(
      JSON.parse(
        readFileSync(join(cwd, '.chapterjs/projects/main.json'), 'utf8')
      ).include
    ).toEqual(['../../src', '../types/shared.d.ts', '../types/main.d.ts']);
  });

  it('has no t without a language', async () => {
    const fake = await world();
    const cwd = typed({
      'src/commands/no-t.ts': `import { command } from 'chapterjs';
export default command({ description: 'd', run({ t }) { return t; } });
`,
      'src/commands/ok.ts': `import { command } from 'chapterjs';
export default command({ description: 'd', async run({ interaction }) { await interaction.reply('x'); } });
`,
    });
    expect(await typeErrors(cwd, fake)).toEqual(['src/commands/no-t.ts']);
    expect(
      readFileSync(join(cwd, '.chapterjs/types/shared.d.ts'), 'utf8')
    ).not.toContain('ProjectMessages');
  });
});

/** A slash command used by Alice, in her language. */
/** A slash command used by Alice, in her language. */
const use = (id: string, name: string, locale: string) => ({
  id,
  application_id: BOT,
  type: 2,
  token: `token-${id}`,
  version: 1,
  guild_id: GUILD,
  channel_id: GENERAL,
  locale,
  member: {
    user: { id: ALICE, username: 'alice', discriminator: '0' },
    roles: [],
    permissions: '1024',
    joined_at: '2024-01-01T00:00:00Z',
    deaf: false,
    mute: false,
    flags: 0,
  },
  app_permissions: '0',
  entitlements: [],
  authorizing_integration_owners: {},
  attachment_size_limit: 1,
  data: { id: '100000000000000500', name, type: 1 },
});

/** The bodies the bot answered the interaction `id` with. */
const bodies = (fake: FakeWorld, id: string): unknown[] =>
  fake.discord
    .requestsTo('POST', `/interactions/${id}/token-${id}/callback`)
    .map(request => (request.body as { data: unknown }).data);

/** Lets the bot answer the interaction `id`, and returns what it sent. */
function answers(fake: FakeWorld, id: string) {
  const callback = `/interactions/${id}/token-${id}/callback`;
  fake.discord.on('POST', callback, {
    body: {
      interaction: { id, type: 2 },
      resource: { type: 4, message: rawMessage('100000000000000090', 'x') },
    },
  });
  return () =>
    fake.discord
      .requestsTo('POST', callback)
      .map(
        request => (request.body as { data: { content: string } }).data.content
      );
}

const waitUntil = async (check: () => boolean, what: string) => {
  const deadline = Date.now() + 6000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};

const HELLO = `import { command } from 'chapterjs';
export default command({ description: 'd', ephemeral: true, async run({ interaction, t, user }) {
  await interaction.reply(t('welcome', { name: user.username, count: 7 }) + ' [' + t.locale + ']');
} });
`;
const COUNT = `import { command } from 'chapterjs';
export default command({ description: 'd', ephemeral: true, async run({ interaction, t }) {
  await interaction.reply(t('members', { count: 1 }) + ', ' + t('members', { count: 1234 }));
} });
`;
const PUBLIC = `import { command } from 'chapterjs';
export default command({ description: 'd', async run({ interaction, t, user }) {
  await interaction.reply(t('welcome', { name: user.username, count: 7 }) + ' [' + t.locale + ']');
} });
`;

describe.skipIf(process.platform === 'win32')('chapterjs dev', () => {
  it('answers in the language of the reader, follows the files and types them', async () => {
    const fake = await world();
    const cwd = project({
      'src/messages/en-US.ts': EN,
      'src/messages/fr.ts': FR,
      'src/commands/hello.ts': HELLO,
      'src/commands/open.ts': PUBLIC,
      'src/commands/count.ts': COUNT,
      'src/events/ready/hi.ts': `import { event } from 'chapterjs';
export default event(({ t }) => console.log('ready says', t('pong'), t.locale));
`,
      'src/tasks/tick.ts': `import { task } from 'chapterjs';
export default task({ every: '1h', onStart: true, run({ t }) { console.log('task says', t.in('fr')('pong')); } });
`,
    });
    const cli = runDev(cwd, fake);
    await cli.waitFor(
      '✓ 3 commands, 1 event, 1 task, messages in 2 languages loaded'
    );
    await cli.waitFor('ready says Pong! en-US');
    await cli.waitFor('task says Pong !');
    const connection = await connected(fake);
    const sent = {
      fr: answers(fake, '1'),
      en: answers(fake, '2'),
      de: answers(fake, '3'),
      open: answers(fake, '8'),
      countFr: answers(fake, '9'),
      countEn: answers(fake, '10'),
    };
    connection.dispatch('INTERACTION_CREATE', use('1', 'hello', 'fr'));
    connection.dispatch('INTERACTION_CREATE', use('2', 'hello', 'en-GB'));
    connection.dispatch('INTERACTION_CREATE', use('3', 'hello', 'de'));
    // A public answer, in a server Discord knows no language of: the default.
    connection.dispatch('INTERACTION_CREATE', use('8', 'open', 'fr'));
    // A plural and a number, the way each language writes them.
    connection.dispatch('INTERACTION_CREATE', use('9', 'count', 'fr'));
    connection.dispatch('INTERACTION_CREATE', use('10', 'count', 'en-US'));
    await waitUntil(() => sent.countEn().length === 1, 'the answers');
    expect(sent.fr()).toEqual(['Bienvenue alice, membre n°7 ! [fr]']);
    expect(sent.en()).toEqual(['Welcome alice, member #7! [en-US]']);
    expect(sent.de()).toEqual(['Welcome alice, member #7! [en-US]']);
    expect(sent.open()).toEqual(['Welcome alice, member #7! [en-US]']);
    expect(sent.countFr()).toEqual(['1 membre, 1\u202f234 membres']);
    expect(sent.countEn()).toEqual(['1 member, 1,234 members']);

    // A text changed: used at once.
    writeFileSync(
      join(cwd, 'src/messages/fr.ts'),
      FR.replace('Pong !', 'Pong ! ✓').replace('Bienvenue', 'Coucou')
    );
    await cli.waitFor('↻ Reloaded in');
    const again = answers(fake, '4');
    connection.dispatch('INTERACTION_CREATE', use('4', 'hello', 'fr'));
    await waitUntil(() => again().length === 1, 'the answer');
    expect(again()).toEqual(['Coucou alice, membre n°7 ! [fr]']);

    // A text removed from a language: the default one's is used.
    writeFileSync(
      join(cwd, 'src/messages/fr.ts'),
      FR.replace("    pong: 'Pong !',\n", '').replace('Bienvenue', 'Coucou')
    );
    await cli.waitFor('↻ Reloaded in');
    const fallen = answers(fake, '11');
    connection.dispatch('INTERACTION_CREATE', use('11', 'count', 'fr'));
    await waitUntil(() => fallen().length === 1, 'the answer');
    expect(fallen()).toEqual(['1 membre, 1\u202f234 membres']);

    // Broken: said, and the last good texts stay.
    writeFileSync(
      join(cwd, 'src/messages/fr.ts'),
      FR.replace('{count} !', '{n} !').replace('Bienvenue', 'Coucou')
    );
    await cli.waitFor(
      `✗ src/messages/fr.ts The message "welcome" does not have the placeholders of en-US.ts: it has {n}, {name}, en-US.ts has {count}, {name}.`
    );
    await cli.waitFor('⚠ Reloaded with an error');
    const kept = answers(fake, '5');
    connection.dispatch('INTERACTION_CREATE', use('5', 'hello', 'fr'));
    await waitUntil(() => kept().length === 1, 'the answer');
    expect(kept()).toEqual(['Coucou alice, membre n°7 ! [fr]']);

    // A missing param is the developer's error, told with the file and line.
    writeFileSync(
      join(cwd, 'src/commands/hello.ts'),
      HELLO.replace(', count: 7', '')
    );
    // The messages file is still broken: the reload says so again.
    await cli.waitFor('⚠ Reloaded with an error');
    const failed = answers(fake, '6');
    connection.dispatch('INTERACTION_CREATE', use('6', 'hello', 'fr'));
    await cli.waitFor(
      `✗ src/commands/hello.ts:3 The message "welcome" needs {count}: t('welcome', { name, count })`
    );
    await waitUntil(() => failed().length === 1, 'the excuse');
    // The excuse of the framework, as fr.ts translates it.
    expect(failed()).toEqual(['Une erreur est survenue avec cette commande.']);

    // Removed: the types follow, and t is gone.
    expect(
      readFileSync(join(cwd, '.chapterjs/types/shared.d.ts'), 'utf8')
    ).toContain('ProjectMessages');
    rmSync(join(cwd, 'src/messages'), { recursive: true });
    await cli.waitFor('↻ Types updated');
    await cli.waitFor(
      /↻ Reloaded in \d+ ms, 3 commands, 1 event, 1 task loaded/
    );
    expect(
      readFileSync(join(cwd, '.chapterjs/types/shared.d.ts'), 'utf8')
    ).not.toContain('ProjectMessages');
    const gone = answers(fake, '7');
    connection.dispatch('INTERACTION_CREATE', use('7', 'hello', 'fr'));
    await cli.waitFor(/✗ src\/commands\/hello\.ts:3 .*t is not a function/);
    await waitUntil(() => gone().length === 1, 'the excuse');
    // No language file: the excuse is English again.
    expect(gone()).toEqual([
      'Something went wrong while running this command.',
    ]);

    // Back, with French as the default: the types too, from that file.
    mkdirSync(join(cwd, 'src/messages'));
    writeFileSync(
      join(cwd, 'src/messages/en-US.ts'),
      EN.replace('  default: true,\n', '')
    );
    writeFileSync(
      join(cwd, 'src/messages/fr.ts'),
      FR.replace('  texts: {', '  default: true,\n  texts: {')
    );
    await cli.waitFor('↻ Types updated');
    await cli.waitFor('messages in 2 languages loaded');
    expect(
      readFileSync(join(cwd, '.chapterjs/types/shared.d.ts'), 'utf8')
    ).toContain("import('../../src/messages/fr')");
    cli.signal('SIGTERM');
    await cli.exited;
  });

  it('speaks the language of the server to an event', async () => {
    const fake = await world();
    fake.gateway.behavior.onIdentify = (connection, identify) => {
      void identify;
      connection.dispatch('READY', {
        v: 10,
        user: { id: BOT, username: 'test-bot', discriminator: '0', bot: true },
        guilds: [{ id: GUILD, unavailable: true }],
        session_id: 'session',
        resume_gateway_url: fake.gateway.url,
        application: { id: BOT, flags: 0 },
      });
      connection.dispatch('GUILD_CREATE', {
        ...rawGuild(),
        preferred_locale: 'fr',
        features: ['COMMUNITY'],
      });
    };
    const cwd = project({
      'src/messages/en-US.ts': EN,
      'src/messages/fr.ts': FR,
      'src/events/messageCreate/echo.ts': `import { event } from 'chapterjs';
export default event(({ message, t }) => console.log('event says', t('welcome', { name: message.author.username, count: 2 }), t.locale));
`,
      'src/commands/open.ts': PUBLIC,
      'src/components/buttons/again.ts': `import { button } from 'chapterjs';
export default button({ label: ({ t, data }) => t('welcome', { name: 'x', count: data.n }), data: { n: 'number' }, run() {} });
`,
      'src/commands/show.ts': `import { command } from 'chapterjs';
import again from '../components/buttons/again';
export default command({ description: 'd', async run({ interaction, channel }) {
  await interaction.reply({ content: 'public', components: [again({ n: 1 })] });
  await channel.send({ content: 'channel', components: [again({ n: 2 })] });
} });
`,
    });
    const cli = runDev(cwd, fake);
    const connection = await connected(fake);
    await cli.waitFor('✓ Connected');
    connection.dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000091', 'hey')
    );
    await cli.waitFor('event says Bienvenue alice, membre n°2 ! fr');
    // A public answer in a Community server: its language, not the person's.
    const sent = answers(fake, '1');
    connection.dispatch('INTERACTION_CREATE', use('1', 'open', 'de'));
    await waitUntil(() => sent().length === 1, 'the answer');
    expect(sent()).toEqual(['Bienvenue alice, membre n°7 ! [fr]']);
    // So is the label of a button, computed when each message is sent.
    fake.discord.on('POST', `/channels/${GENERAL}/messages`, {
      body: rawMessage('100000000000000092', 'channel'),
    });
    const shown = answers(fake, '2');
    connection.dispatch('INTERACTION_CREATE', use('2', 'show', 'de'));
    await waitUntil(
      () =>
        fake.discord.requestsTo('POST', `/channels/${GENERAL}/messages`)
          .length === 1,
      'the channel message'
    );
    const labels = (body: unknown) =>
      JSON.stringify(body).match(/"label":"[^"]*"/g);
    expect(shown()).toEqual(['public']);
    expect(labels(bodies(fake, '2')[0])).toEqual([
      '"label":"Bienvenue x, membre n°1 !"',
    ]);
    expect(
      labels(
        fake.discord.requestsTo('POST', `/channels/${GENERAL}/messages`)[0]!
          .body
      )
    ).toEqual(['"label":"Bienvenue x, membre n°2 !"']);
    cli.signal('SIGTERM');
    await cli.exited;
  });

  it('speaks to the person from a component of a message only they see', async () => {
    const fake = await world();
    const cwd = project({
      'src/messages/en-US.ts': EN,
      'src/messages/fr.ts': FR,
      // A public command, whose answer is made private at the call.
      'src/commands/ping.ts': `import { command } from 'chapterjs';
import again from '../components/buttons/again';
import more from '../components/buttons/more';
export default command({ description: 'd', async run({ interaction, t }) {
  await interaction.reply({ ephemeral: true, content: t('pong') + ' [' + t.locale + ']', components: [again, more] });
} });
`,
      // Neither button says `ephemeral`: the message they are on does.
      'src/components/buttons/again.ts': `import { button } from 'chapterjs';
export default button({ label: ({ t }) => t('pong'), async run({ interaction, t }) {
  await interaction.update(t('pong') + ' [' + t.locale + ']');
} });
`,
      'src/components/buttons/more.ts': `import { button } from 'chapterjs';
export default button({ label: 'More', async run({ interaction, t }) {
  await interaction.reply(t('welcome', { name: 'you', count: 1 }));
} });
`,
    });
    const cli = runDev(cwd, fake);
    await cli.waitFor(
      '✓ 1 command, 2 components, messages in 2 languages loaded'
    );
    const connection = await connected(fake);
    // The command: `t` was given for everyone, as the warning of the docs says.
    const sent = answers(fake, '1');
    connection.dispatch('INTERACTION_CREATE', use('1', 'ping', 'fr'));
    await waitUntil(() => sent().length === 1, 'the answer');
    expect(sent()).toEqual(['Pong! [en-US]']);
    expect(bodies(fake, '1')[0]).toMatchObject({ flags: 64 });

    // Only Alice sees that message: its buttons speak her language.
    const onPrivate = (id: string, customId: string) => ({
      ...use(id, '', 'fr'),
      type: 3,
      message: rawMessage('100000000000000090', 'Pong! [en-US]', {
        author: {
          id: BOT,
          username: 'test-bot',
          discriminator: '0',
          bot: true,
        },
        flags: 64,
        components: [],
      }),
      data: { custom_id: customId, component_type: 2 },
    });
    const updated = answers(fake, '2');
    connection.dispatch('INTERACTION_CREATE', onPrivate('2', 'buttons/again'));
    await waitUntil(() => updated().length === 1, 'the update');
    expect(bodies(fake, '2')[0]).toEqual({ content: 'Pong ! [fr]' });
    // And a new answer stays with her, in her language.
    const replied = answers(fake, '3');
    connection.dispatch('INTERACTION_CREATE', onPrivate('3', 'buttons/more'));
    await waitUntil(() => replied().length === 1, 'the reply');
    expect(bodies(fake, '3')[0]).toEqual({
      content: 'Bienvenue you, membre n°1 !',
      flags: 64,
    });
    // On a message everyone sees, the file decides, as before.
    const open = answers(fake, '4');
    connection.dispatch('INTERACTION_CREATE', {
      ...onPrivate('4', 'buttons/more'),
      message: rawMessage('100000000000000093', 'x', { flags: 0 }),
    });
    await waitUntil(() => open().length === 1, 'the public reply');
    expect(bodies(fake, '4')[0]).toEqual({
      content: 'Welcome you, member #1!',
      flags: 0,
    });
    cli.signal('SIGTERM');
    await cli.exited;
  });
});

describe.skipIf(process.platform === 'win32')(
  'the commands of src/messages/',
  () => {
    it('describe the commands that have no description in their file', async () => {
      const fake = await world();
      const cwd = project({
        'src/messages/en-US.ts': `import { language } from 'chapterjs';
export default language({
  default: true,
  texts: { a: 'b' },
  commands: { ping: { description: 'Pong', options: { who: { description: 'Who' } } } },
});
`,
        'src/messages/fr.ts': `import { language } from 'chapterjs';
export default language({
  texts: { a: 'c' },
  commands: {
    ping: { name: 'pong', description: 'Pong !', options: { who: { name: 'qui', choices: { warm: 'Chaud' } } } },
    'mod/ban': { description: 'Bannit' },
  },
});
`,
        'src/commands/ping.ts': `import { command } from 'chapterjs';
export default command({ options: { who: { type: 'string', choices: ['warm', 'cold'] } }, run() {} });
`,
        'src/commands/mod/ban.ts': `import { command } from 'chapterjs';
export default command({ description: 'Ban', run() {} });
`,
      });
      const cli = runDev(cwd, fake);
      await cli.waitFor(
        '✗ src/messages/fr.ts /mod ban is described in src/commands/mod/ban.ts: remove its description there to translate it here, or remove it here.'
      );
      await cli.waitFor('✓ Commands updated on Dev Server');
      const registered = fake.discord.requestsTo(
        'PUT',
        `/applications/${BOT}/guilds/${GUILD}/commands`
      )[0]!.body as Record<string, unknown>[];
      expect(registered.find(one => one.name === 'ping')).toMatchObject({
        description: 'Pong',
        name_localizations: { fr: 'pong' },
        description_localizations: { fr: 'Pong !' },
        options: [
          {
            name: 'who',
            description: 'Who',
            name_localizations: { fr: 'qui' },
            choices: [
              { name: 'warm', name_localizations: { fr: 'Chaud' } },
              { name: 'cold' },
            ],
          },
        ],
      });
      expect(registered.find(one => one.name === 'mod')).toMatchObject({
        options: [{ name: 'ban', description: 'Ban' }],
      });

      // The default language stops describing it: the command is left out.
      writeFileSync(
        join(cwd, 'src/messages/en-US.ts'),
        `import { language } from 'chapterjs';
export default language({ default: true, texts: { a: 'b' }, commands: { pong: { name: 'x' } } });
`
      );
      await cli.waitFor(
        `✗ src/messages/en-US.ts "commands" translates "pong", which is not a command of this project (its commands are: mod/ban, ping). The key is the path of the command file, like 'ping' or 'mod/ban'.`
      );
      await cli.waitFor(
        `✗ src/commands/ping.ts This command has no description: write it in src/messages/en-US.ts (commands: { "ping": { description: '...' } }), or in the file (description: '...').`
      );
      await cli.waitFor('↻ Commands updated on Discord');
      const again = fake.discord.requestsTo(
        'PUT',
        `/applications/${BOT}/guilds/${GUILD}/commands`
      );
      expect(
        (again.at(-1)!.body as { name: string }[]).map(one => one.name)
      ).toEqual(['mod']);
      cli.signal('SIGTERM');
      await cli.exited;
    });
  }
);

describe.skipIf(process.platform === 'win32')(
  'the commands a language file offers',
  () => {
    it('are the ones without description in their file, and follow a save', async () => {
      const fake = await world();
      const cwd = project({
        'src/messages/en-US.ts': `import { language } from 'chapterjs';
export default language({ texts: { a: 'b' }, commands: { ping: { description: 'Pong' } } });
`,
        'src/commands/ping.ts': `import { command } from 'chapterjs';
export default command({ run() {} });
`,
        'src/commands/mod/ban.ts': `import { command } from 'chapterjs';
export default command({ description: 'Ban', run() {} });
`,
      });
      const declared = () =>
        readFileSync(join(cwd, '.chapterjs/types/main.d.ts'), 'utf8');
      const cli = runDev(cwd, fake);
      await cli.waitFor('✓ Commands updated on Dev Server');
      expect(declared()).toContain('"mod/ban": false;');
      expect(declared()).toContain('"ping": true;');

      // The file takes its description: the language file no longer may.
      writeFileSync(
        join(cwd, 'src/commands/ping.ts'),
        `import { command } from 'chapterjs';
export default command({ description: 'Pong', run() {} });
`
      );
      await cli.waitFor(
        '✗ src/messages/en-US.ts /ping is described in src/commands/ping.ts: remove its description there to translate it here, or remove it here.'
      );
      await cli.waitFor('↻ Types updated');
      expect(declared()).toContain('"ping": false;');
      cli.signal('SIGTERM');
      await cli.exited;
    });
  }
);

describe.skipIf(process.platform === 'win32')('chapterjs start', () => {
  it('runs the messages of the build', async () => {
    const fake = await world();
    const cli = runProduction(
      project(
        {
          'src/messages/en-US.ts': EN,
          'src/messages/fr.ts': FR,
          'src/commands/hello.ts': HELLO,
        },
        'BOT_TOKEN=test-token\n'
      ),
      fake
    );
    await cli.waitFor('✓ 1 command, messages in 2 languages loaded');
    const connection = await connected(fake);
    const sent = answers(fake, '1');
    connection.dispatch('INTERACTION_CREATE', use('1', 'hello', 'fr'));
    await waitUntil(() => sent().length === 1, 'the answer');
    expect(sent()).toEqual(['Bienvenue alice, membre n°7 ! [fr]']);
    cli.signal('SIGTERM');
    await cli.exited;
  });
});
