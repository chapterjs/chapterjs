import { describe, expect, it } from 'vitest';
import { command } from '../src/commands/command.js';
import { commandsConvention } from '../src/commands/convention.js';
import { buildCommands, privateOnly } from '../src/commands/tree.js';
import { sameDefinition, withoutGlobalTwins } from '../src/commands/twins.js';

/** A command file as the loader hands it over, for a place. */
const entry = (path: string, where?: 'guild' | 'dm' | 'both') => ({
  file: `src/commands/${path}`,
  command: commandsConvention.read(
    {
      default: command({
        description: 'd',
        ...(where ? { where } : {}),
        run() {},
      }),
    },
    path
  ),
});

const GUILD = 0;
const BOT_DM = 1;

describe('where commands are offered', () => {
  const entries = [
    entry('server.ts'),
    entry('explicit.ts', 'guild'),
    entry('private.ts', 'dm'),
    entry('anywhere.ts', 'both'),
    // A folder is offered wherever one of its subcommands works.
    entry('mixed/a.ts', 'dm'),
    entry('mixed/b.ts', 'guild'),
    entry('secret/a.ts', 'dm'),
    entry('secret/deep/b.ts', 'dm'),
    entry('open/a.ts', 'both'),
    entry('open/b.ts', 'guild'),
  ];

  it('follows where for global commands: the contexts of the docs', () => {
    const contexts = Object.fromEntries(
      buildCommands(entries, { guild: false }).map(payload => [
        payload.name,
        (payload as { contexts?: number[] }).contexts,
      ])
    );
    expect(contexts).toEqual({
      server: [GUILD],
      explicit: [GUILD],
      private: [BOT_DM],
      anywhere: [GUILD, BOT_DM],
      mixed: [GUILD, BOT_DM],
      secret: [BOT_DM],
      open: [GUILD, BOT_DM],
    });
    // Installed to servers only: the bot is not a user-installed app.
    for (const payload of buildCommands(entries, { guild: false })) {
      expect(
        (payload as { integration_types?: number[] }).integration_types
      ).toEqual([0]);
    }
  });

  it('leaves out of a server what only works in private messages', () => {
    const payloads = buildCommands(entries, { guild: true });
    expect(payloads.map(payload => payload.name)).toEqual([
      'anywhere',
      'explicit',
      'mixed',
      'open',
      'server',
    ]);
    // Discord takes no contexts for the commands of one server.
    for (const payload of payloads) {
      expect(payload).not.toHaveProperty('contexts');
      expect(payload).not.toHaveProperty('integration_types');
    }
    expect(
      payloads
        .find(payload => payload.name === 'mixed')!
        .options!.map(option => option.name)
    ).toEqual(['b']);
    expect(privateOnly(entries).map(({ file }) => file)).toEqual([
      'src/commands/private.ts',
      'src/commands/mixed/a.ts',
      'src/commands/secret/a.ts',
      'src/commands/secret/deep/b.ts',
    ]);
  });
});

describe('a command the bot already has for everyone', () => {
  const full = commandsConvention.read(
    {
      default: command({
        description: 'Ban a member',
        options: {
          target: { type: 'user', description: 'Who', required: true },
          reason: { type: 'string', description: 'Why', choices: ['spam'] },
          days: { type: 'integer', description: 'Days', min: 0, max: 7 },
        },
        locales: {
          fr: {
            name: 'bannir',
            description: 'Bannir',
            options: { reason: { choices: { spam: 'Pourriel' } } },
          },
        },
        permissions: ['BanMembers'],
        run() {},
      }),
    },
    'ban.ts'
  );
  const [ours] = buildCommands(
    [{ file: 'src/commands/ban.ts', command: full }],
    {
      guild: true,
    }
  );
  const [forEveryone] = buildCommands(
    [{ file: 'src/commands/ban.ts', command: full }],
    { guild: false }
  );
  /** What Discord sends back for a command: what it was given, and more. */
  const fromDiscord = (payload: object, extra: object = {}) =>
    ({
      id: '100000000000000700',
      application_id: '100000000000000002',
      version: '100000000000000701',
      dm_permission: true,
      nsfw: false,
      guild_id: undefined,
      name_localizations: null,
      description_localizations: null,
      ...JSON.parse(JSON.stringify(payload)),
      ...extra,
    }) as never;

  it('is recognised whatever Discord adds to it', () => {
    expect(sameDefinition(ours!, fromDiscord(forEveryone!))).toBe(true);
    // Options come back with their own "nothing".
    const padded = fromDiscord(forEveryone!);
    for (const option of (padded as { options: Record<string, unknown>[] })
      .options) {
      option.required ??= false;
      option.name_localizations ??= null;
      option.description_localizations ??= null;
      option.autocomplete = false;
    }
    expect(sameDefinition(ours!, padded)).toBe(true);
  });

  it.each([
    ['description', { description: 'Bans' }],
    ['permissions', { default_member_permissions: '8' }],
    ['no permissions', { default_member_permissions: null }],
    ['age restriction', { nsfw: true }],
    ['translations', { name_localizations: { fr: 'ban' } }],
    [
      'a translation more',
      { name_localizations: { fr: 'bannir', de: 'bannen' } },
    ],
    ['no options', { options: [] }],
  ])('is not the same with other %s', (_what, change) => {
    expect(sameDefinition(ours!, fromDiscord(forEveryone!, change))).toBe(
      false
    );
  });

  it.each([
    ['an option less', (options: object[]) => options.slice(1)],
    ['options in another order', (options: object[]) => [...options].reverse()],
    [
      'an option no longer required',
      (options: object[]) => [
        { ...options[0], required: false },
        ...options.slice(1),
      ],
    ],
    [
      'another choice',
      (options: { choices?: object[] }[]) =>
        options.map(option =>
          option.choices
            ? { ...option, choices: [{ name: 'raid', value: 'raid' }] }
            : option
        ),
    ],
    [
      'a choice translated differently',
      (options: { choices?: object[] }[]) =>
        options.map(option =>
          option.choices
            ? {
                ...option,
                choices: [
                  {
                    name: 'spam',
                    value: 'spam',
                    name_localizations: { fr: 'Spam' },
                  },
                ],
              }
            : option
        ),
    ],
    [
      'another limit',
      (options: { max_value?: number }[]) =>
        options.map(option =>
          option.max_value === undefined ? option : { ...option, max_value: 30 }
        ),
    ],
  ])('is not the same with %s', (_what, change) => {
    const options = forEveryone!.options as never[];
    expect(
      sameDefinition(
        ours!,
        fromDiscord(forEveryone!, { options: change(options) })
      )
    ).toBe(false);
  });

  it('is left out of what a server is given, unless it changed', () => {
    const payloads = buildCommands(
      [
        entry('same.ts'),
        entry('changed.ts'),
        entry('new.ts'),
        entry('mod/a.ts'),
      ],
      { guild: true }
    );
    const everyone = buildCommands(
      [
        entry('same.ts'),
        entry('changed.ts'),
        entry('gone.ts'),
        entry('mod/a.ts'),
      ],
      { guild: false }
    ).map(payload =>
      fromDiscord(
        payload,
        payload.name === 'changed' ? { description: 'old' } : {}
      )
    );
    const result = withoutGlobalTwins(payloads, everyone);
    expect(result.kept.map(payload => payload.name)).toEqual([
      'changed',
      'new',
    ]);
    expect(result.twins).toEqual(['mod', 'same']);
    expect(result.changed).toEqual(['changed']);
    // Nothing for everyone: everything is given, nothing is "changed".
    expect(withoutGlobalTwins(payloads, [])).toEqual({
      kept: payloads,
      twins: [],
      changed: [],
    });
    // A command of another kind with the same name is another command.
    expect(
      withoutGlobalTwins(payloads, [fromDiscord(everyone[3]!, { type: 2 })])
        .twins
    ).toEqual([]);
  });
});
