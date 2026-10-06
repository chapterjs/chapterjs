// Components: the files of src/components/, their ids written by the
// framework, the pieces of a message, and what runs when someone clicks,
// picks or sends a form.
import { describe, expect, it } from 'vitest';
import { button, renderButton } from '../src/components/button.js';
import {
  componentsConvention,
  findDuplicates,
} from '../src/components/convention.js';
import {
  checkData,
  decodeCustomId,
  encodeCustomId,
  readData,
} from '../src/components/custom-id.js';
import { embed } from '../src/components/embed.js';
import { fileStateOf } from '../src/components/file.js';
import { isPiece, renderedOf } from '../src/components/instance.js';
import {
  container,
  file,
  gallery,
  linkButton,
  premiumButton,
  row,
  section,
  separator,
  text,
  thumbnail,
} from '../src/components/layout.js';
import { modal } from '../src/components/modal.js';
import { renderComponents } from '../src/components/render.js';
import { select } from '../src/components/select.js';
import { buildMessage } from '../src/structures/payload.js';
import {
  ALICE,
  BOT,
  connected,
  GENERAL,
  GUILD,
  project,
  rawMessage,
  runDev,
  world,
  type FakeWorld,
} from './dev-helpers.js';

/** A file of src/components/ as the loader reads it, bound to its path. */
function load(path: string, exports: Record<string, unknown>) {
  componentsConvention.check?.(path);
  return componentsConvention.read(exports, path);
}

const raw = (piece: unknown) => renderedOf(piece, 'test').raw;

describe('the id of a component', () => {
  it.each([
    ['buttons/ban', {}, {}, 'buttons/ban'],
    [
      'buttons/ban',
      { userId: 'string', page: 'number', hard: 'boolean' },
      { userId: '1234', page: 3, hard: true },
      'buttons/ban:1234:3:true',
    ],
    [
      'selects/pick',
      { text: 'string' },
      { text: 'a:b\\c' },
      'selects/pick:a\\:b\\\\c',
    ],
    ['buttons/x', { s: 'string' }, { s: '' }, 'buttons/x:'],
    ['buttons/x', { n: 'number' }, { n: -0.5 }, 'buttons/x:-0.5'],
    ['buttons/x', { s: 'string' }, { s: '日本:語' }, 'buttons/x:日本\\:語'],
  ] as const)(
    'is the path then the data, and reads back the same (%s %j)',
    (path, shape, values, expected) => {
      const id = encodeCustomId(path, shape, { ...values });
      expect(id).toBe(expected);
      const decoded = decodeCustomId(id);
      expect(decoded.path).toBe(path);
      expect(readData(shape, decoded.parts)).toEqual(values);
    }
  );

  it('refuses data that does not fit in 100 characters, and says by how much', () => {
    expect(() =>
      encodeCustomId('buttons/ban', { s: 'string' }, { s: 'x'.repeat(95) })
    ).toThrow(
      'The data of buttons/ban is 95 characters long once encoded, and Discord leaves 88 for it (its id is buttons/ban, 11 characters, out of 100). Carry less: an id instead of a name, or a shorter file name.'
    );
    expect(() =>
      encodeCustomId('buttons/ban', { s: 'string' }, { s: 'x'.repeat(88) })
    ).not.toThrow();
  });

  it.each([
    [{ n: 'number' }, ['abc']],
    [{ n: 'number' }, ['']],
    [{ n: 'number' }, ['Infinity']],
    [{ b: 'boolean' }, ['yes']],
    [{ a: 'string', b: 'string' }, ['one']],
    [{}, ['extra']],
  ] as const)(
    'reads nothing from data that changed shape (%j %j)',
    (shape, parts) => {
      expect(readData(shape, parts)).toBeNull();
    }
  );

  it.each([
    [{}, { x: 1 }, 'ban carries no data: it is used as is, without arguments.'],
    [
      { userId: 'string' },
      undefined,
      "ban needs its data: write ban({ userId: '...' }).",
    ],
    [
      { userId: 'string' },
      'x',
      "ban needs its data: write ban({ userId: '...' }).",
    ],
    [
      { userId: 'string' },
      {},
      'The data "userId" of ban is a string, got undefined.',
    ],
    [
      { userId: 'string' },
      { userId: 1 },
      'The data "userId" of ban is a string, got 1.',
    ],
    [{ n: 'number' }, { n: NaN }, 'The data "n" of ban is a number, got null.'],
    [
      { n: 'number' },
      { n: 1, extra: 2 },
      '"extra" is not in the data of ban. Its data is: n.',
    ],
    [
      { b: 'boolean' },
      { b: 'true' },
      'The data "b" of ban is a boolean, got "true".',
    ],
  ] as const)(
    'checks the data given to a component (%j %j)',
    (shape, values, message) => {
      expect(() => checkData('ban', shape, values)).toThrow(message);
    }
  );
});

describe('the pieces of a message', () => {
  it('makes rows by itself: 5 buttons per row, a menu alone', () => {
    const link = (n: number) =>
      linkButton({ label: `L${n}`, url: 'https://x.y' });
    const menu = load('selects/pick.ts', {
      default: select({ options: ['a'], run() {} }),
    });
    const pick = select({ options: ['a'], run() {} });
    load('selects/pick.ts', { default: pick });
    const { raw: rows, v2 } = renderComponents([
      link(1),
      link(2),
      link(3),
      link(4),
      link(5),
      link(6),
      pick,
      link(7),
    ]);
    expect(menu.kind).toBe('select');
    expect(v2).toBe(false);
    expect(
      rows.map(one => (one as { components: unknown[] }).components.length)
    ).toEqual([5, 1, 1, 1]);
    expect(
      (rows[2] as { components: { type: number }[] }).components[0]!.type
    ).toBe(3);
  });

  it('keeps explicit rows, and knows when a message is built with components only', () => {
    const link = linkButton({ label: 'L', url: 'https://x.y' });
    const { raw: rows, v2 } = renderComponents([
      text('Hello'),
      row([link]),
      separator(),
      container([text('inside'), link], { color: 0xc026d3 }),
    ]);
    expect(v2).toBe(true);
    expect(rows).toEqual([
      { type: 10, content: 'Hello' },
      {
        type: 1,
        components: [{ type: 2, style: 5, url: 'https://x.y', label: 'L' }],
      },
      { type: 14 },
      {
        type: 17,
        accent_color: 0xc026d3,
        components: [
          { type: 10, content: 'inside' },
          {
            type: 1,
            components: [{ type: 2, style: 5, url: 'https://x.y', label: 'L' }],
          },
        ],
      },
    ]);
  });

  it('counts every component, nested ones included', () => {
    const link = () => linkButton({ label: 'L', url: 'https://x.y' });
    const many = Array.from({ length: 13 }, () => row([link(), link()]));
    expect(() => renderComponents(many)).not.toThrow(); // 39
    expect(() => renderComponents([...many, text('x')])).not.toThrow(); // 40
    expect(() => renderComponents([...many, section('s', link())])).toThrow(
      'The message has 42 components once its rows are made: Discord accepts 40 at most.'
    );
  });

  it('adds up the texts of a message', () => {
    expect(() =>
      renderComponents([
        text('x'.repeat(3000)),
        container([text('x'.repeat(1001))]),
      ])
    ).toThrow(
      'The texts of the components of the message add up to 4001 characters: Discord accepts 4000 at most.'
    );
  });

  it.each([
    [
      [{ type: 2, custom_id: 'mine', label: 'x' }],
      /Component 1 of the message is not a component made by ChapterJS, got an object with a custom_id\. Use the buttons, menus and modals of src\/components\/.*never written as JSON/,
    ],
    [[null], 'got null'],
    [['text'], 'got string'],
    [
      [thumbnail('https://x.y/a.png')],
      'A thumbnail only goes beside a section',
    ],
    ['nope', 'The components of a message are a list, got string.'],
  ] as const)(
    'refuses what the framework did not make (%j)',
    (components, message) => {
      expect(() => renderComponents(components as never)).toThrow(message);
    }
  );

  it('refuses a form in a message', () => {
    const form = modal({
      title: 't',
      fields: { a: { type: 'text', label: 'A' } },
      run() {},
    });
    load('modals/form.ts', { default: form });
    expect(() => renderComponents([form])).toThrow(
      'A form is not part of a message: open it with interaction.showModal().'
    );
  });

  describe('layout helpers', () => {
    it.each([
      [
        () => linkButton({ label: 'x', url: 'ftp://x' }),
        'The url of a link button must start with https://',
      ],
      [
        () => linkButton({ label: 'x', url: `https://${'x'.repeat(512)}` }),
        'The url of a link button is 520 characters long: Discord accepts 512 at most.',
      ],
      [
        () => linkButton({ url: 'https://x.y' }),
        'A link button needs a label or an emoji.',
      ],
      [
        () => linkButton({ label: 'x'.repeat(81), url: 'https://x.y' }),
        'The label of a link button is 81 characters long: Discord accepts 80 at most.',
      ],
      [
        () => linkButton({ label: '', url: 'https://x.y' }),
        'The label of a link button is empty.',
      ],
      [
        () => linkButton({ label: 'x', emoji: '', url: 'https://x.y' }),
        'The emoji of a link button is empty',
      ],
      [
        () => linkButton('x' as never),
        "linkButton() takes an object like { label: 'Docs', url: '...' }.",
      ],
      [
        () => premiumButton('abc'),
        'premiumButton() takes the id of a SKU, got "abc".',
      ],
      [() => row([]), 'row() takes a list of buttons, or one select menu.'],
      [
        () => row([text('x') as never]),
        'A row only holds buttons, or one select menu.',
      ],
      [
        () =>
          row(Array(6).fill(linkButton({ label: 'x', url: 'https://x.y' }))),
        'A row holds 5 buttons at most, got 6.',
      ],
      [() => text(''), 'A text is empty.'],
      [
        () => text('x'.repeat(4001)),
        'A text is 4001 characters long: Discord accepts 4000 at most.',
      ],
      [() => text(3 as never), 'A text is a text, got number.'],
      [
        () => section([], linkButton({ label: 'x', url: 'https://x.y' })),
        'A section has 1 to 3 texts, got 0.',
      ],
      [
        () =>
          section(
            ['a', 'b', 'c', 'd'],
            linkButton({ label: 'x', url: 'https://x.y' })
          ),
        'A section has 1 to 3 texts, got 4.',
      ],
      [
        () => section('a', text('x') as never),
        'Beside a section goes a button or a thumbnail(), got a text.',
      ],
      [
        () =>
          thumbnail({
            url: 'https://x.y/a.png',
            description: 'x'.repeat(1025),
          }),
        'The description of a thumbnail is 1025 characters long: Discord accepts 1024 at most.',
      ],
      [() => gallery([]), 'A gallery has 1 to 10 items, got 0.'],
      [
        () => gallery(Array(11).fill('https://x.y/a.png')),
        'A gallery has 1 to 10 items, got 11.',
      ],
      [
        () => gallery([3 as never]),
        "item 1 of a gallery is an address, or an object like { url: '...' }.",
      ],
      [() => file(''), 'The name of a file component is empty.'],
      [
        () => separator({ spacing: 'huge' as never }),
        "The spacing of a separator is 'small' or 'large', got \"huge\".",
      ],
      [
        () => container([]),
        'container() takes a list of components to put in the box.',
      ],
      [
        () => container([text('x')], { color: 0x1000000 }),
        'The color of a container is a number between 0 and 0xFFFFFF, got 16777216.',
      ],
      [
        () => container([container([text('x')]) as never]),
        "A container can't hold a container",
      ],
    ])('refuse what Discord would refuse (%#)', (make, message) => {
      expect(make).toThrow(message);
    });

    it('build what Discord takes', () => {
      expect(
        raw(
          linkButton({
            label: 'Docs',
            emoji: '<a:party:123>',
            url: 'https://x.y',
            disabled: true,
          })
        )
      ).toEqual({
        type: 2,
        style: 5,
        url: 'https://x.y',
        label: 'Docs',
        emoji: { id: '123', name: 'party', animated: true },
        disabled: true,
      });
      expect(raw(premiumButton('123', { disabled: true }))).toEqual({
        type: 2,
        style: 6,
        sku_id: '123',
        disabled: true,
      });
      expect(
        raw(
          section(
            ['a', 'b'],
            thumbnail({
              url: 'attachment://a.png',
              description: 'd',
              spoiler: true,
            })
          )
        )
      ).toEqual({
        type: 9,
        components: [
          { type: 10, content: 'a' },
          { type: 10, content: 'b' },
        ],
        accessory: {
          type: 11,
          media: { url: 'attachment://a.png' },
          description: 'd',
          spoiler: true,
        },
      });
      expect(
        raw(
          gallery([
            'https://x.y/a.png',
            { url: 'https://x.y/b.png', spoiler: true },
          ])
        )
      ).toEqual({
        type: 12,
        items: [
          { media: { url: 'https://x.y/a.png' } },
          { media: { url: 'https://x.y/b.png' }, spoiler: true },
        ],
      });
      expect(raw(file('attachment://log.txt', { spoiler: true }))).toEqual({
        type: 13,
        file: { url: 'attachment://log.txt' },
        spoiler: true,
      });
      expect(raw(separator({ divider: false, spacing: 'large' }))).toEqual({
        type: 14,
        divider: false,
        spacing: 2,
      });
      expect(raw(container([text('x')], { spoiler: true }))).toEqual({
        type: 17,
        spoiler: true,
        components: [{ type: 10, content: 'x' }],
      });
      expect(isPiece(text('x'))).toBe(true);
      expect(isPiece({ type: 10, content: 'x' })).toBe(false);
    });
  });

  it('are what a message sends, with the flag Discord wants for components only', () => {
    const plain = buildMessage({
      components: [linkButton({ label: 'x', url: 'https://x.y' })],
    });
    expect(plain.body.flags).toBeUndefined();
    expect(plain.body.components).toHaveLength(1);
    const v2 = buildMessage({
      components: [text('Hello')],
      files: [{ name: 'a.txt', data: 'a' }],
    });
    expect(v2.body.flags).toBe(1 << 15);
    expect(() =>
      buildMessage({ content: 'Hi', components: [text('Hello')] })
    ).toThrow(
      'A message built with texts, sections, galleries, files, separators or containers takes no content and no embeds'
    );
    expect(() =>
      buildMessage({ embeds: [{ title: 'x' }], components: [text('Hello')] })
    ).toThrow('takes no content and no embeds');
    expect(() =>
      buildMessage({
        components: [text('Hello')],
        poll: { question: { text: 'q' }, answers: [] },
      })
    ).toThrow("A message built with components only can't have a poll.");
    expect(() => buildMessage({ components: [] })).toThrow(
      'The message is empty'
    );
  });
});

describe('the files of src/components/', () => {
  it.each([
    [
      'ban.ts',
      'This file is directly in src/components/. Put it in the folder of its kind: src/components/buttons/, src/components/selects/, src/components/modals/, src/components/embeds/.',
    ],
    [
      'button/ban.ts',
      'The folder src/components/button is not a kind of component. Kinds are: buttons, selects, modals, embeds.',
    ],
    [
      'buttons/my ban.ts',
      '"my ban" can\'t be in the path of a component: use letters, digits, - and _ only. The path of the file is the id of the component.',
    ],
    ['buttons/a:b.ts', '"a:b" can\'t be in the path of a component'],
    [
      `buttons/${'x'.repeat(80)}.ts`,
      'Discord gives 100 characters to the id of a component and its data together. Shorten the names.',
    ],
  ])('refuse a misplaced file: %s', (path, message) => {
    expect(() => componentsConvention.check!(path)).toThrow(message);
  });

  it.each([
    [
      {},
      "This file has no default export. It should look like: import { button } from 'chapterjs'; export default button({ ... })",
    ],
    [
      { default: 3 },
      'The default export of this file must be what button() returns',
    ],
    [
      { default: select({ options: ['a'], run() {} }) },
      'This file exports a select, but it is in src/components/buttons/. Move it to src/components/selects/.',
    ],
    [{ default: button('x' as never) }, 'button() needs an object'],
    [
      { default: button({ run() {} } as never) },
      'A button needs a label or an emoji.',
    ],
    [
      { default: button({ label: 'x', colour: 'red', run() {} } as never) },
      '"colour" is not something a button has. It can have: label, emoji, style, disabled, data, where, who, ephemeral, run.',
    ],
    [
      { default: button({ label: 'x'.repeat(81), run() {} }) },
      'The label of this button is a text of 1 to 80 characters.',
    ],
    [
      { default: button({ label: 'x', style: 'link' as never, run() {} }) },
      "The style of this button is 'primary', 'secondary', 'success' or 'danger', got \"link\".",
    ],
    [
      { default: button({ label: 'x', disabled: 'yes' as never, run() {} }) },
      '"disabled" of this button is true or false.',
    ],
    [
      { default: button({ label: 'x' } as never) },
      'this button has no "run": the function to run when someone uses it',
    ],
    [
      { default: button({ label: 'x', data: 'userId' as never, run() {} }) },
      "\"data\" of this button is an object from a name to a kind: data: { userId: 'string', page: 'number' }.",
    ],
    [
      {
        default: button({
          label: 'x',
          data: { 'user id': 'string' } as never,
          run() {},
        }),
      },
      '"user id" can\'t be the name of a data of this button: it is how your code reads it (data.user id), so use letters, digits and _ only.',
    ],
    [
      {
        default: button({
          label: 'x',
          data: { id: 'snowflake' } as never,
          run() {},
        }),
      },
      "The data \"id\" of this button has the kind \"snowflake\", which does not exist. Kinds are: 'string', 'number', 'boolean'.",
    ],
    [
      {
        default: button({ label: 'x', where: 'everywhere' as never, run() {} }),
      },
      "\"where\" says where this button can be used: 'guild' (in servers, which is the default), 'dm' (in private messages with the bot) or 'both'. Got \"everywhere\".",
    ],
    [
      { default: button({ label: 'x', who: 'admins' as never, run() {} }) },
      '"who" says who may use this button: \'everyone\' (the default) or \'author\' (only who used the command the message answers). Got "admins".',
    ],
    [
      { default: button({ label: 'x', ephemeral: 1 as never, run() {} }) },
      '"ephemeral" is true or false, got 1.',
    ],
  ])('refuse a button file that is wrong (%#)', (exports, message) => {
    expect(() => load('buttons/ban.ts', exports)).toThrow(message);
  });

  it('reads a button, binds it to its path, and makes instances from it', () => {
    const ban = button({
      label: 'Ban',
      style: 'danger',
      emoji: '🔨',
      data: { userId: 'string', days: 'number' },
      who: 'author',
      run() {},
    });
    expect(() => ban({ userId: '1', days: 7 })).toThrow(
      'This button was not loaded by ChapterJS: a button is a file of src/components/buttons/, exported by default, and used after the bot started.'
    );
    const loaded = load('(mod)/buttons/ban.ts'.replace('(mod)/', ''), {
      default: ban,
    });
    expect(loaded).toMatchObject({
      kind: 'button',
      path: 'buttons/ban',
      who: 'author',
      where: 'guild',
      ephemeral: false,
      data: { userId: 'string', days: 'number' },
    });
    expect(raw(ban({ userId: '1', days: 7 }))).toEqual({
      type: 2,
      style: 4,
      label: 'Ban',
      emoji: { name: '🔨' },
      custom_id: 'buttons/ban:1:7',
    });
    expect(
      raw(
        ban(
          { userId: '1', days: 7 },
          { disabled: true, label: 'Banned', style: 'secondary' }
        )
      )
    ).toEqual({
      type: 2,
      style: 2,
      label: 'Banned',
      emoji: { name: '🔨' },
      custom_id: 'buttons/ban:1:7',
      disabled: true,
    });
    expect(() =>
      ban({ userId: '1', days: 7 }, { size: 'big' } as never)
    ).toThrow(
      '"size" is not something the look of ban has. It can have: label, emoji, style, disabled.'
    );
    expect(() =>
      (ban as unknown as (...args: unknown[]) => unknown)(
        { userId: '1', days: 7 },
        {},
        {}
      )
    ).toThrow(
      'ban takes its data, then a look at most: ban({ ... }, { disabled: true }).'
    );
    // A button with data is not a piece by itself: it needs its data.
    expect(() => renderComponents([ban])).toThrow(
      "ban needs its data: write ban({ userId: '...', days: 1 })."
    );
    expect(fileStateOf(ban)?.kind).toBe('button');
    expect((ban as { config: unknown }).config).toMatchObject({ label: 'Ban' });
  });

  it('lets a button without data stand for itself', () => {
    const confirm = button({ label: 'OK', run() {} });
    load('buttons/confirm.ts', { default: confirm });
    expect(raw(confirm)).toEqual({
      type: 2,
      style: 1,
      label: 'OK',
      custom_id: 'buttons/confirm',
    });
    expect(raw(confirm({ disabled: true }))).toEqual({
      type: 2,
      style: 1,
      label: 'OK',
      custom_id: 'buttons/confirm',
      disabled: true,
    });
    expect(() =>
      (confirm as unknown as (x: unknown) => unknown)({ userId: 1 })
    ).toThrow('"userId" is not something the look of confirm has.');
    expect(
      renderComponents([confirm, confirm({ label: 'Again' })]).raw
    ).toEqual([
      {
        type: 1,
        components: [
          { type: 2, style: 1, label: 'OK', custom_id: 'buttons/confirm' },
          { type: 2, style: 1, label: 'Again', custom_id: 'buttons/confirm' },
        ],
      },
    ]);
    expect(
      renderButton(
        load('buttons/confirm.ts', { default: confirm }) as never,
        []
      ).raw.custom_id
    ).toBe('buttons/confirm');
  });

  it.each([
    [
      { default: select({ run() {} } as never) },
      "this select menu needs its options: options: ['Pizza', 'Pasta'], options: { 'Shown text': 'value' } or options: [{ label: '...', value: '...', description: '...' }].",
    ],
    [
      { default: select({ type: 'users', run() {} } as never) },
      "The type of this select menu is \"users\", which does not exist. Types are: 'string', 'user', 'role', 'mentionable', 'channel'.",
    ],
    [
      { default: select({ type: 'user', options: ['a'], run() {} } as never) },
      'this select menu lists users: Discord fills it, so it takes no "options".',
    ],
    [
      {
        default: select({ type: 'user', channelTypes: [0], run() {} } as never),
      },
      '"channelTypes" is only for a menu of channels (type: \'channel\').',
    ],
    [
      {
        default: select({
          type: 'channel',
          channelTypes: [99],
          run() {},
        } as never),
      },
      '"channelTypes" of this select menu is a list of ChannelType values, like [ChannelType.GuildText].',
    ],
    [
      { default: select({ options: [], run() {} }) },
      'this select menu has 0 options: Discord accepts between 1 and 25.',
    ],
    [
      {
        default: select({
          options: Array(26)
            .fill('a')
            .map((a, i) => a + i),
          run() {},
        }),
      },
      'this select menu has 26 options: Discord accepts between 1 and 25.',
    ],
    [
      { default: select({ options: ['a', 'a'], run() {} }) },
      'this select menu has the value "a" twice.',
    ],
    [
      { default: select({ options: { A: 1 } as never, run() {} }) },
      'The option "A" of this select menu must be a text (what your code receives), got 1.',
    ],
    [
      { default: select({ options: [{ label: 'x' }] as never, run() {} }) },
      'Option 1 of this select menu needs a label and a value, both texts.',
    ],
    [
      {
        default: select({
          options: [{ label: 'x', value: 'x', color: 1 }] as never,
          run() {},
        }),
      },
      '"color" is not something an option of this select menu has. It can have: label, value, description, emoji, default.',
    ],
    [
      {
        default: select({
          options: [{ label: 'x'.repeat(101), value: 'x' }],
          run() {},
        }),
      },
      'The label of an option of this select menu is 101 characters long: Discord accepts between 1 and 100.',
    ],
    [
      {
        default: select({
          options: ['a'],
          placeholder: 'x'.repeat(151),
          run() {},
        }),
      },
      'The placeholder of this select menu is a text of 1 to 150 characters.',
    ],
    [
      { default: select({ options: ['a'], min: 2, max: 1, run() {} }) },
      'this select menu can never be used: its "min" (2) is greater than its "max" (1).',
    ],
    [
      { default: select({ options: ['a'], max: 26, run() {} }) },
      '"max" of this select menu is a whole number between 1 and 25, got 26.',
    ],
    [
      { default: select({ options: ['a'], min: -1, run() {} }) },
      '"min" of this select menu is a whole number between 0 and 25, got -1.',
    ],
    [
      { default: select({ options: ['a'] } as never) },
      'this select menu has no "run"',
    ],
  ])('refuse a select file that is wrong (%#)', (exports, message) => {
    expect(() => load('selects/pick.ts', exports)).toThrow(message);
  });

  it('reads select menus of every kind, and what they are shown with', () => {
    const pick = select({
      placeholder: 'Pick',
      options: [
        {
          label: 'Alpha',
          value: 'a',
          description: 'first',
          emoji: '🅰️',
          default: true,
        },
        { label: 'Beta', value: 'b' },
      ],
      min: 0,
      max: 2,
      data: { page: 'number' },
      run() {},
    });
    load('selects/pick.ts', { default: pick });
    expect(raw(pick({ page: 2 }))).toEqual({
      type: 3,
      custom_id: 'selects/pick:2',
      placeholder: 'Pick',
      min_values: 0,
      max_values: 2,
      options: [
        {
          label: 'Alpha',
          value: 'a',
          description: 'first',
          emoji: { name: '🅰️' },
          default: true,
        },
        { label: 'Beta', value: 'b' },
      ],
    });
    expect(
      raw(
        pick(
          { page: 2 },
          { defaults: ['b'], placeholder: 'Now', disabled: true }
        )
      )
    ).toMatchObject({
      placeholder: 'Now',
      disabled: true,
      options: [
        { label: 'Alpha', value: 'a' },
        { label: 'Beta', value: 'b', default: true },
      ],
    });
    expect(
      (
        raw(pick({ page: 2 }, { defaults: ['b'] })) as {
          options: { default?: boolean }[];
        }
      ).options[0]!.default
    ).toBeUndefined();
    expect(() => pick({ page: 2 }, { defaults: ['c'] })).toThrow(
      '"c" is not an option of pick. Its options are: a, b.'
    );
    expect(() => pick({ page: 2 }, { defaults: ['a', 'b', 'a'] })).toThrow(
      'pick has 3 defaults, but 2 can be picked at most.'
    );
    expect(() => pick({ page: 2 }, { defaults: [1] } as never)).toThrow(
      'A default of pick is a text, or something with an id, got 1.'
    );
    expect(() => pick({ page: 2 }, { colour: 1 } as never)).toThrow(
      '"colour" is not something pick takes when shown. It can take: placeholder, disabled, defaults.'
    );

    const roles = select({ type: 'role', max: 3, run() {} });
    load('selects/roles.ts', { default: roles });
    expect(raw(roles)).toEqual({
      type: 6,
      custom_id: 'selects/roles',
      max_values: 3,
    });
    expect(raw(roles({ defaults: ['1', { id: '2' }] }))).toEqual({
      type: 6,
      custom_id: 'selects/roles',
      max_values: 3,
      default_values: [
        { id: '1', type: 'role' },
        { id: '2', type: 'role' },
      ],
    });
    const channels = select({
      type: 'channel',
      channelTypes: [0, 2],
      placeholder: 'Where?',
      run() {},
    });
    load('selects/channels.ts', { default: channels });
    expect(raw(channels)).toEqual({
      type: 8,
      custom_id: 'selects/channels',
      placeholder: 'Where?',
      channel_types: [0, 2],
    });
    const anyone = select({ type: 'mentionable', disabled: true, run() {} });
    load('selects/anyone.ts', { default: anyone });
    expect(raw(anyone({ defaults: ['9'] }))).toEqual({
      type: 7,
      custom_id: 'selects/anyone',
      disabled: true,
      default_values: [{ id: '9', type: 'user' }],
    });
    const users = select({ type: 'user', run() {} });
    load('selects/users.ts', { default: users });
    expect(raw(users)).toEqual({ type: 5, custom_id: 'selects/users' });
  });

  it.each([
    [
      {
        default: modal({
          fields: { a: { type: 'text', label: 'A' } },
          run() {},
        } as never),
      },
      'The title of this form is a text of 1 to 45 characters.',
    ],
    [
      {
        default: modal({
          title: 'x'.repeat(46),
          fields: { a: { type: 'text', label: 'A' } },
          run() {},
        }),
      },
      'The title of this form is a text of 1 to 45 characters.',
    ],
    [
      { default: modal({ title: 't', run() {} } as never) },
      '"fields" of this form is an object whose keys are the names of the fields',
    ],
    [
      { default: modal({ title: 't', fields: {}, run() {} }) },
      'this form has 0 fields: Discord accepts between 1 and 5.',
    ],
    [
      {
        default: modal({
          title: 't',
          fields: Object.fromEntries(
            Array.from({ length: 6 }, (_, i) => [
              `f${i}`,
              { type: 'text', label: 'A' },
            ])
          ),
          run() {},
        }),
      },
      'this form has 6 fields: Discord accepts between 1 and 5.',
    ],
    [
      {
        default: modal({
          title: 't',
          fields: { a: { type: 'note', content: 'x' } },
          run() {},
        }),
      },
      "this form has nothing to fill in: add a field like { type: 'text', label: '...' }.",
    ],
    [
      {
        default: modal({
          title: 't',
          fields: { 'my field': { type: 'text', label: 'A' } },
          run() {},
        }),
      },
      '"my field" can\'t be the name of a field: it is how your code reads it (fields.my field), so use letters, digits and _ only.',
    ],
    [
      {
        default: modal({
          title: 't',
          fields: { a: { type: 'date', label: 'A' } as never },
          run() {},
        }),
      },
      'The type of the field "a" is "date", which does not exist. Types are: text, select, user, role, mentionable, channel, files, radio, checkboxes, checkbox, note.',
    ],
    [
      {
        default: modal({
          title: 't',
          fields: { a: { type: 'text', label: 'A', options: ['x'] } as never },
          run() {},
        }),
      },
      '"options" is not something the field "a" has (a text). It can have: type, label, description, style, placeholder, required, minLength, maxLength, value.',
    ],
    [
      {
        default: modal({
          title: 't',
          fields: { a: { type: 'text', label: 'x'.repeat(46) } },
          run() {},
        }),
      },
      'The label of the field "a" is 46 characters long: Discord accepts between 1 and 45.',
    ],
    [
      {
        default: modal({
          title: 't',
          fields: {
            a: { type: 'text', label: 'A', description: 'x'.repeat(101) },
          },
          run() {},
        }),
      },
      'The description of the field "a" is 101 characters long: Discord accepts between 1 and 100.',
    ],
    [
      {
        default: modal({
          title: 't',
          fields: { a: { type: 'text', label: 'A', style: 'long' as never } },
          run() {},
        }),
      },
      'The style of the field "a" is \'short\' or \'paragraph\', got "long".',
    ],
    [
      {
        default: modal({
          title: 't',
          fields: {
            a: { type: 'text', label: 'A', placeholder: 'x'.repeat(101) },
          },
          run() {},
        }),
      },
      'The placeholder of the field "a" is 101 characters long: Discord accepts between 1 and 100.',
    ],
    [
      {
        default: modal({
          title: 't',
          fields: {
            a: { type: 'text', label: 'A', minLength: 10, maxLength: 5 },
          },
          run() {},
        }),
      },
      'the field "a" can never be used: its "min" (10) is greater than its "max" (5).',
    ],
    [
      {
        default: modal({
          title: 't',
          fields: { a: { type: 'text', label: 'A', maxLength: 4001 } },
          run() {},
        }),
      },
      '"max" of the field "a" is a whole number between 1 and 4000, got 4001.',
    ],
    [
      {
        default: modal({
          title: 't',
          fields: { a: { type: 'text', label: 'A', required: 'yes' as never } },
          run() {},
        }),
      },
      '"required" of the field "a" is true or false, got "yes".',
    ],
    [
      {
        default: modal({
          title: 't',
          fields: { a: { type: 'radio', label: 'A', options: ['x'] } },
          run() {},
        }),
      },
      'the field "a" has 1 options: Discord accepts between 2 and 10.',
    ],
    [
      {
        default: modal({
          title: 't',
          fields: {
            a: { type: 'checkboxes', label: 'A', options: ['x', 'y'], max: 3 },
          },
          run() {},
        }),
      },
      '"max" of the field "a" is 3, but it only has 2 options.',
    ],
    [
      {
        default: modal({
          title: 't',
          fields: { a: { type: 'files', label: 'A', max: 11 } },
          run() {},
        }),
      },
      '"max" of the field "a" is a whole number between 1 and 10, got 11.',
    ],
    [
      {
        default: modal({
          title: 't',
          fields: { a: { type: 'files', label: 'A', fileTypes: ['pdf'] } },
          run() {},
        }),
      },
      "\"fileTypes\" of the field \"a\" is a list of 'image', 'video', 'audio' or extensions like '.pdf' (10 at most).",
    ],
    [
      {
        default: modal({
          title: 't',
          fields: { a: { type: 'checkbox', label: 'A', default: 1 as never } },
          run() {},
        }),
      },
      '"default" of the field "a" is true or false, got 1.',
    ],
    [
      {
        default: modal({
          title: 't',
          fields: { a: { type: 'note', content: '' } },
          run() {},
        }),
      },
      'The content of the field "a" is 0 characters long: Discord accepts between 1 and 4000.',
    ],
    [
      {
        default: modal({
          title: 't',
          fields: { a: { type: 'text', label: 'A' } },
        } as never),
      },
      'this form has no "run"',
    ],
    [
      {
        default: modal({
          title: 't',
          fields: { a: { type: 'text', label: 'A' } },
          who: 'author',
          run() {},
        } as never),
      },
      '"who" is not something a form has. It can have: title, fields, data, where, ephemeral, run.',
    ],
  ])('refuse a modal file that is wrong (%#)', (exports, message) => {
    expect(() => load('modals/report.ts', exports)).toThrow(message);
  });

  it('reads a form with every kind of field, and what it is opened with', () => {
    const report = modal({
      title: 'Report',
      data: { userId: 'string' },
      fields: {
        intro: { type: 'note', content: 'Tell us more.' },
        reason: {
          type: 'text',
          label: 'Reason',
          style: 'paragraph',
          placeholder: 'Why?',
          minLength: 10,
          maxLength: 500,
          required: false,
        },
        kind: {
          type: 'select',
          label: 'Kind',
          options: { Spam: 'spam', Abuse: 'abuse' },
          min: 0,
          max: 2,
          placeholder: 'Pick',
        },
        proof: {
          type: 'files',
          label: 'Proof',
          max: 3,
          required: false,
          fileTypes: ['image', '.pdf'],
        },
        urgent: {
          type: 'checkbox',
          label: 'Urgent',
          description: 'Ping the mods',
          default: true,
        },
      },
      run() {},
    });
    const loaded = load('modals/report.ts', { default: report });
    expect(loaded.kind).toBe('modal');
    expect(raw(report({ userId: '42' }))).toEqual({
      custom_id: 'modals/report:42',
      title: 'Report',
      components: [
        { type: 10, content: 'Tell us more.' },
        {
          type: 18,
          label: 'Reason',
          component: {
            type: 4,
            custom_id: 'reason',
            style: 2,
            min_length: 10,
            max_length: 500,
            required: false,
            placeholder: 'Why?',
          },
        },
        {
          type: 18,
          label: 'Kind',
          component: {
            type: 3,
            custom_id: 'kind',
            options: [
              { label: 'Spam', value: 'spam' },
              { label: 'Abuse', value: 'abuse' },
            ],
            placeholder: 'Pick',
            min_values: 0,
            max_values: 2,
          },
        },
        {
          type: 18,
          label: 'Proof',
          component: {
            type: 19,
            custom_id: 'proof',
            max_values: 3,
            required: false,
            file_types: ['image', '.pdf'],
          },
        },
        {
          type: 18,
          label: 'Urgent',
          description: 'Ping the mods',
          component: { type: 23, custom_id: 'urgent', default: true },
        },
      ],
    });
    const prefilled = raw(
      report(
        { userId: '42' },
        { values: { reason: 'Spam again', kind: ['abuse'], urgent: false } }
      )
    ) as { components: { component?: Record<string, unknown> }[] };
    expect(prefilled.components[1]!.component).toMatchObject({
      value: 'Spam again',
    });
    expect(prefilled.components[2]!.component).toMatchObject({
      options: [
        { label: 'Spam', value: 'spam' },
        { label: 'Abuse', value: 'abuse', default: true },
      ],
    });
    expect(prefilled.components[4]!.component).toEqual({
      type: 23,
      custom_id: 'urgent',
    });
    expect(() =>
      report({ userId: '42' }, { values: { nope: 1 } } as never)
    ).toThrow(
      '"nope" is not a field of report. Its fields are: intro, reason, kind, proof, urgent.'
    );
    expect(() =>
      report({ userId: '42' }, { values: { kind: ['x'] } } as never)
    ).toThrow(
      '"x" is not an option of the field "kind" of report. Its options are: spam, abuse.'
    );
    expect(() =>
      report({ userId: '42' }, { values: { proof: [] } } as never)
    ).toThrow(
      'The field "proof" of report is a files: it can\'t be given a value when the form opens.'
    );
    expect(() =>
      report({ userId: '42' }, { values: { urgent: 'yes' } } as never)
    ).toThrow(
      'The value given for the field "urgent" of report is true or false, got "yes".'
    );
    expect(() => report({ userId: '42' }, { title: 'x' } as never)).toThrow(
      '"title" is not something report takes when opened. It can take: values.'
    );

    const other = modal({
      title: 'Other',
      fields: {
        who: { type: 'user', label: 'Who', min: 0, max: 5, required: false },
        where: {
          type: 'channel',
          label: 'Where',
          channelTypes: [0],
          placeholder: 'A channel',
        },
        role: { type: 'role', label: 'Role' },
        any: { type: 'mentionable', label: 'Any' },
        level: {
          type: 'radio',
          label: 'Level',
          options: ['low', 'high'],
          required: false,
        },
      },
      run() {},
    });
    load('modals/other.ts', { default: other });
    expect(raw(other)).toEqual({
      custom_id: 'modals/other',
      title: 'Other',
      components: [
        {
          type: 18,
          label: 'Who',
          component: {
            type: 5,
            custom_id: 'who',
            min_values: 0,
            max_values: 5,
            required: false,
          },
        },
        {
          type: 18,
          label: 'Where',
          component: {
            type: 8,
            custom_id: 'where',
            placeholder: 'A channel',
            channel_types: [0],
          },
        },
        { type: 18, label: 'Role', component: { type: 6, custom_id: 'role' } },
        { type: 18, label: 'Any', component: { type: 7, custom_id: 'any' } },
        {
          type: 18,
          label: 'Level',
          component: {
            type: 21,
            custom_id: 'level',
            options: [
              { label: 'low', value: 'low' },
              { label: 'high', value: 'high' },
            ],
            required: false,
          },
        },
      ],
    });
    const boxes = modal({
      title: 'B',
      fields: {
        pick: {
          type: 'checkboxes',
          label: 'Pick',
          options: ['a', 'b', 'c'],
          min: 0,
          max: 2,
        },
      },
      run() {},
    });
    load('modals/boxes.ts', { default: boxes });
    expect(raw(boxes({ values: { pick: ['a', 'c'] } }))).toMatchObject({
      components: [
        {
          component: {
            type: 22,
            custom_id: 'pick',
            min_values: 0,
            max_values: 2,
            options: [
              { value: 'a', default: true },
              { value: 'b' },
              { value: 'c', default: true },
            ],
          },
        },
      ],
    });
  });

  it('reads embeds, static or as functions, and refuses a static one over the limits', () => {
    const rules = embed({ title: 'Rules', description: 'Be nice.' });
    expect(() => rules()).toThrow('This embed was not loaded by ChapterJS');
    expect(load('embeds/rules.ts', { default: rules })).toEqual({
      kind: 'embed',
      path: 'embeds/rules',
    });
    expect(rules()).toEqual({ title: 'Rules', description: 'Be nice.' });
    expect(() => (rules as unknown as (x: unknown) => unknown)('x')).toThrow(
      'rules always looks the same: it takes no arguments.'
    );
    const welcome = embed((name: string, count: number) => ({
      title: `Welcome ${name}`,
      footer: { text: `${count} members` },
    }));
    load('embeds/welcome.ts', { default: welcome });
    expect(welcome('Ann', 3)).toEqual({
      title: 'Welcome Ann',
      footer: { text: '3 members' },
    });
    expect(
      buildMessage({ embeds: [rules, welcome('Bo', 1)] }).body.embeds
    ).toEqual([
      { title: 'Rules', description: 'Be nice.' },
      { title: 'Welcome Bo', footer: { text: '1 members' } },
    ]);
    expect(() => buildMessage({ embeds: [(() => ({})) as never] })).toThrow(
      "Embed 1 of the message is a function: an embed is an object like { title: '...' }, or a file of src/components/embeds/."
    );
    expect(() =>
      load('embeds/big.ts', { default: embed({ title: 'x'.repeat(257) }) })
    ).toThrow(
      'The title of this embed is 257 characters long: Discord accepts 256 at most.'
    );
    expect(() => load('embeds/bad.ts', { default: embed(3 as never) })).toThrow(
      "embed() takes the embed itself ({ title: '...' }) or a function that returns one."
    );
    expect(() =>
      load('embeds/bad.ts', {
        default: embed({ fields: Array(26).fill({ name: 'n', value: 'v' }) }),
      })
    ).toThrow('This embed has 26 fields: Discord accepts 25 at most.');
  });

  it('finds two files that are the same component', () => {
    const entries = [
      {
        file: 'src/components/(b)/buttons/ok.ts',
        component: { path: 'buttons/ok' },
      },
      {
        file: 'src/components/(a)/buttons/ok.ts',
        component: { path: 'buttons/ok' },
      },
      {
        file: 'src/components/buttons/no.ts',
        component: { path: 'buttons/no' },
      },
    ];
    const { valid, conflicts } = findDuplicates(entries);
    expect(valid.map(one => one.file)).toEqual([
      'src/components/(a)/buttons/ok.ts',
      'src/components/buttons/no.ts',
    ]);
    expect(conflicts).toEqual([
      {
        file: 'src/components/(b)/buttons/ok.ts',
        message:
          "buttons/ok is already src/components/(a)/buttons/ok.ts: two files can't be the same component. A folder in parentheses only groups files, it is not part of the id.",
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// End to end: the CLI runs the files, Discord is faked.

const BOB = '100000000000000004';

/** Lets the bot answer the interaction `id`, and returns what it sent. */
function answers(fake: FakeWorld, id: string) {
  const token = `token-${id}`;
  const callback = `/interactions/${id}/${token}/callback`;
  const original = `/webhooks/${BOT}/${token}/messages/@original`;
  const followUp = `/webhooks/${BOT}/${token}`;
  const message = rawMessage('100000000000000090', 'answer');
  fake.discord.on('POST', callback, request => {
    const body = request.body as { type: number };
    return body.type === 4 || body.type === 7
      ? {
          body: {
            interaction: { id, type: 2 },
            resource: { type: body.type, message },
          },
        }
      : {};
  });
  fake.discord.on('PATCH', original, { body: message });
  fake.discord.on('DELETE', original, {});
  fake.discord.on('POST', followUp, { body: message });
  return {
    callbacks: () => fake.discord.requestsTo('POST', callback),
    edits: () => fake.discord.requestsTo('PATCH', original),
    followUps: () => fake.discord.requestsTo('POST', followUp),
  };
}

const member = (id: string) => ({
  user: { id, username: id === ALICE ? 'alice' : 'bob', discriminator: '0' },
  roles: [],
  permissions: '1024',
  joined_at: '2024-01-01T00:00:00Z',
  deaf: false,
  mute: false,
  flags: 0,
});

/** A slash command being used, as Discord sends it. */
const use = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {}
) => ({
  id,
  application_id: BOT,
  type: 2,
  token: `token-${id}`,
  version: 1,
  guild_id: GUILD,
  channel_id: GENERAL,
  locale: 'fr',
  member: member(ALICE),
  app_permissions: '0',
  entitlements: [],
  authorizing_integration_owners: {},
  attachment_size_limit: 1,
  data: { id: '100000000000000500', name, type: 1 },
  ...extra,
});

/** The message a component is on: an answer to a command of Alice. */
const messageWith = (
  components: unknown[],
  extra: Record<string, unknown> = {}
) =>
  rawMessage('100000000000000090', 'answer', {
    author: { id: BOT, username: 'test-bot', discriminator: '0', bot: true },
    interaction_metadata: {
      id: '100000000000000600',
      type: 2,
      user: { id: ALICE, username: 'alice', discriminator: '0' },
      authorizing_integration_owners: {},
    },
    components,
    ...extra,
  });

/** A component being used, as Discord sends it. */
const click = (
  id: string,
  customId: string,
  componentType: number,
  extra: Record<string, unknown> = {},
  data: Record<string, unknown> = {}
) => ({
  ...use(id, ''),
  type: 3,
  message: messageWith([]),
  data: { custom_id: customId, component_type: componentType, ...data },
  ...extra,
});

/** A form being sent, as Discord sends it. */
const submit = (
  id: string,
  customId: string,
  components: unknown[],
  extra: Record<string, unknown> = {}
) => ({
  ...use(id, ''),
  type: 5,
  data: { custom_id: customId, components },
  ...extra,
});

const waitUntil = async (check: () => boolean, what: string) => {
  const deadline = Date.now() + 6000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};

const AGAIN = `import { button } from 'chapterjs';
const again = button({
  label: 'Again',
  data: { count: 'number' },
  async run({ interaction, data, message, user, guild, member, channel }) {
    console.log(JSON.stringify({ again: data.count, message: message.id, user: user.username, guild: guild.name, member: member.id, channel: channel.id, locale: interaction.locale }));
    await interaction.update({ content: 'Pong! x' + (data.count + 1), components: [again({ count: data.count + 1 })] });
  },
});
export default again;
`;

describe.skipIf(process.platform === 'win32')('components', () => {
  it('run when clicked, change their message and carry their data', async () => {
    const fake = await world();
    const cwd = project({
      'src/commands/ping.ts': `import { command, linkButton } from 'chapterjs';
import again from '../components/buttons/again';
import confirm from '../components/buttons/confirm';
export default command({
  description: 'Pong',
  async run({ interaction }) {
    await interaction.reply({ content: 'Pong! x1', components: [again({ count: 1 }), linkButton({ label: 'Docs', url: 'https://chapterjs.dev' }), confirm] });
  },
});
`,
      'src/components/buttons/again.ts': AGAIN,
      'src/components/buttons/confirm.ts': `import { button } from 'chapterjs';
export default button({
  label: 'Only me',
  style: 'success',
  who: 'author',
  ephemeral: true,
  async run({ interaction }) {
    await interaction.reply('Yes, you.');
  },
});
`,
    });
    const cli = runDev(cwd, fake);
    await cli.waitFor('✓ 1 command, 2 components loaded');
    const connection = await connected(fake);

    const ping = answers(fake, '100000000000000601');
    connection.dispatch(
      'INTERACTION_CREATE',
      use('100000000000000601', 'ping')
    );
    await waitUntil(() => ping.callbacks().length === 1, 'the answer to /ping');
    expect(ping.callbacks()[0]!.body).toEqual({
      type: 4,
      data: {
        content: 'Pong! x1',
        flags: 0,
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 1,
                label: 'Again',
                custom_id: 'buttons/again:1',
              },
              {
                type: 2,
                style: 5,
                label: 'Docs',
                url: 'https://chapterjs.dev',
              },
              {
                type: 2,
                style: 3,
                label: 'Only me',
                custom_id: 'buttons/confirm',
              },
            ],
          },
        ],
      },
    });

    // Alice clicks "Again": the message changes, the data moves on.
    const again = answers(fake, '100000000000000602');
    connection.dispatch(
      'INTERACTION_CREATE',
      click('100000000000000602', 'buttons/again:1', 2)
    );
    await waitUntil(
      () => again.callbacks().length === 1,
      'the answer to the click'
    );
    expect(again.callbacks()[0]!.body).toEqual({
      type: 7,
      data: {
        content: 'Pong! x2',
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 1,
                label: 'Again',
                custom_id: 'buttons/again:2',
              },
            ],
          },
        ],
      },
    });
    expect(again.callbacks()[0]!.query).toEqual({ with_response: ['true'] });
    await cli.waitFor(
      '"again":1,"message":"100000000000000090","user":"alice","guild":"Dev Server","member":"100000000000000003","channel":"100000000000000021","locale":"fr"'
    );

    // Bob clicks the button of Alice.
    const bob = answers(fake, '100000000000000603');
    connection.dispatch(
      'INTERACTION_CREATE',
      click('100000000000000603', 'buttons/confirm', 2, { member: member(BOB) })
    );
    await waitUntil(() => bob.callbacks().length === 1, 'the refusal');
    expect(bob.callbacks()[0]!.body).toEqual({
      type: 4,
      data: {
        content: 'Only the person who used the command can use this button.',
        flags: 64,
      },
    });
    // Alice does: the answer is hers only, as the file says.
    const alice = answers(fake, '100000000000000604');
    connection.dispatch(
      'INTERACTION_CREATE',
      click('100000000000000604', 'buttons/confirm', 2)
    );
    await waitUntil(() => alice.callbacks().length === 1, 'the answer');
    expect(alice.callbacks()[0]!.body).toEqual({
      type: 4,
      data: { content: 'Yes, you.', flags: 64 },
    });

    // A button of a file that no longer exists, or whose data changed.
    const gone = answers(fake, '100000000000000605');
    connection.dispatch(
      'INTERACTION_CREATE',
      click('100000000000000605', 'buttons/gone', 2)
    );
    await waitUntil(() => gone.callbacks().length === 1, 'the refusal');
    expect(gone.callbacks()[0]!.body).toEqual({
      type: 4,
      data: { content: 'This button is not available any more.', flags: 64 },
    });
    const stale = answers(fake, '100000000000000606');
    connection.dispatch(
      'INTERACTION_CREATE',
      click('100000000000000606', 'buttons/again:abc', 2)
    );
    await waitUntil(() => stale.callbacks().length === 1, 'the refusal');
    expect(stale.callbacks()[0]!.body).toEqual({
      type: 4,
      data: { content: 'This button is out of date.', flags: 64 },
    });
    // A menu whose id is a button's.
    const wrong = answers(fake, '100000000000000607');
    connection.dispatch(
      'INTERACTION_CREATE',
      click('100000000000000607', 'buttons/again:1', 3, {}, { values: [] })
    );
    await waitUntil(() => wrong.callbacks().length === 1, 'the refusal');
    expect(
      (wrong.callbacks()[0]!.body as { data: unknown }).data
    ).toMatchObject({ content: 'This menu is not available any more.' });

    cli.signal('SIGTERM');
    await cli.exited;
  });

  it('give menus what was picked, open forms and receive what was filled in', async () => {
    const fake = await world();
    const ROLE = '100000000000000010';
    const cwd = project({
      'src/commands/setup.ts': `import { command } from 'chapterjs';
import roles from '../components/selects/roles';
import color from '../components/selects/color';
export default command({
  description: 'Setup',
  async run({ interaction }) {
    await interaction.reply({ content: 'Pick', components: [roles, color({ theme: 'dark' }, { defaults: ['blue'] })] });
  },
});
`,
      'src/components/selects/roles.ts': `import { select } from 'chapterjs';
import report from '../modals/report';
export default select({
  type: 'role',
  placeholder: 'Roles',
  max: 3,
  async run({ interaction, values, value }) {
    console.log(JSON.stringify({ roles: values.map(role => role.name), first: value?.id }));
    await interaction.showModal(report({ roleId: value!.id }, { values: { reason: 'Prefilled' } }));
  },
});
`,
      'src/components/selects/color.ts': `import { select } from 'chapterjs';
export default select({
  options: { Red: 'red', Blue: 'blue' },
  data: { theme: 'string' },
  async run({ interaction, values, value, data }) {
    console.log(JSON.stringify({ colors: values, value, theme: data.theme }));
    await interaction.deferUpdate();
    await interaction.reply('Picked ' + value);
  },
});
`,
      'src/components/modals/report.ts': `import { modal } from 'chapterjs';
export default modal({
  title: 'Report',
  data: { roleId: 'string' },
  fields: {
    reason: { type: 'text', label: 'Reason', style: 'paragraph' },
    note: { type: 'text', label: 'Note', required: false },
    who: { type: 'user', label: 'Who' },
    level: { type: 'radio', label: 'Level', options: ['low', 'high'], required: false },
    proof: { type: 'files', label: 'Proof', required: false },
  },
  async run({ interaction, fields, data, message }) {
    console.log(JSON.stringify({ fields: { ...fields, who: fields.who.map(user => user.username), proof: fields.proof.map(file => file.filename) }, data, message: message?.id ?? null }));
    await interaction.update({ content: 'Reported ' + fields.reason });
  },
});
`,
    });
    const cli = runDev(cwd, fake);
    await cli.waitFor('✓ 1 command, 3 components loaded');
    const connection = await connected(fake);

    const setup = answers(fake, '100000000000000611');
    connection.dispatch(
      'INTERACTION_CREATE',
      use('100000000000000611', 'setup')
    );
    await waitUntil(
      () => setup.callbacks().length === 1,
      'the answer to /setup'
    );
    expect(
      (setup.callbacks()[0]!.body as { data: { components: unknown } }).data
        .components
    ).toEqual([
      {
        type: 1,
        components: [
          {
            type: 6,
            custom_id: 'selects/roles',
            placeholder: 'Roles',
            max_values: 3,
          },
        ],
      },
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: 'selects/color:dark',
            options: [
              { label: 'Red', value: 'red' },
              { label: 'Blue', value: 'blue', default: true },
            ],
          },
        ],
      },
    ]);

    // A role is picked: the menu opens a form.
    const picked = answers(fake, '100000000000000612');
    connection.dispatch(
      'INTERACTION_CREATE',
      click(
        '100000000000000612',
        'selects/roles',
        6,
        {},
        {
          values: [ROLE, GUILD],
          resolved: {
            roles: {
              [ROLE]: {
                id: ROLE,
                name: 'Mods',
                permissions: '0',
                position: 1,
                color: 0,
              },
              [GUILD]: {
                id: GUILD,
                name: '@everyone',
                permissions: '0',
                position: 0,
                color: 0,
              },
            },
          },
        }
      )
    );
    await waitUntil(() => picked.callbacks().length === 1, 'the form');
    await cli.waitFor(`"roles":["Mods","@everyone"],"first":"${ROLE}"`);
    expect(picked.callbacks()[0]!.body).toEqual({
      type: 9,
      data: {
        custom_id: `modals/report:${ROLE}`,
        title: 'Report',
        components: [
          {
            type: 18,
            label: 'Reason',
            component: {
              type: 4,
              custom_id: 'reason',
              style: 2,
              value: 'Prefilled',
            },
          },
          {
            type: 18,
            label: 'Note',
            component: {
              type: 4,
              custom_id: 'note',
              style: 1,
              required: false,
            },
          },
          { type: 18, label: 'Who', component: { type: 5, custom_id: 'who' } },
          {
            type: 18,
            label: 'Level',
            component: {
              type: 21,
              custom_id: 'level',
              options: [
                { label: 'low', value: 'low' },
                { label: 'high', value: 'high' },
              ],
              required: false,
            },
          },
          {
            type: 18,
            label: 'Proof',
            component: { type: 19, custom_id: 'proof', required: false },
          },
        ],
      },
    });

    // The form is sent, from the message of the menu.
    const sent = answers(fake, '100000000000000613');
    connection.dispatch(
      'INTERACTION_CREATE',
      submit(
        '100000000000000613',
        `modals/report:${ROLE}`,
        [
          {
            type: 18,
            id: 1,
            component: { type: 4, id: 2, custom_id: 'reason', value: 'Spam' },
          },
          {
            type: 18,
            id: 3,
            component: { type: 4, id: 4, custom_id: 'note', value: '' },
          },
          {
            type: 18,
            id: 5,
            component: { type: 5, id: 6, custom_id: 'who', values: [BOB] },
          },
          {
            type: 18,
            id: 7,
            component: { type: 21, id: 8, custom_id: 'level', value: null },
          },
          {
            type: 18,
            id: 9,
            component: {
              type: 19,
              id: 10,
              custom_id: 'proof',
              values: ['100000000000000888'],
            },
          },
        ],
        {
          message: messageWith([]),
          data: {
            custom_id: `modals/report:${ROLE}`,
            components: [
              {
                type: 18,
                id: 1,
                component: {
                  type: 4,
                  id: 2,
                  custom_id: 'reason',
                  value: 'Spam',
                },
              },
              {
                type: 18,
                id: 3,
                component: { type: 4, id: 4, custom_id: 'note', value: '' },
              },
              {
                type: 18,
                id: 5,
                component: { type: 5, id: 6, custom_id: 'who', values: [BOB] },
              },
              {
                type: 18,
                id: 7,
                component: { type: 21, id: 8, custom_id: 'level', value: null },
              },
              {
                type: 18,
                id: 9,
                component: {
                  type: 19,
                  id: 10,
                  custom_id: 'proof',
                  values: ['100000000000000888'],
                },
              },
            ],
            resolved: {
              users: {
                [BOB]: { id: BOB, username: 'bob', discriminator: '0' },
              },
              attachments: {
                '100000000000000888': {
                  id: '100000000000000888',
                  filename: 'proof.png',
                  size: 1,
                  url: 'https://x.y/p.png',
                  proxy_url: 'https://x.y/p.png',
                },
              },
            },
          },
        }
      )
    );
    await waitUntil(
      () => sent.callbacks().length === 1,
      'the answer to the form'
    );
    await cli.waitFor(
      `{"fields":{"reason":"Spam","who":["bob"],"proof":["proof.png"]},"data":{"roleId":"${ROLE}"},"message":"100000000000000090"}`
    );
    expect(sent.callbacks()[0]!.body).toEqual({
      type: 7,
      data: { content: 'Reported Spam' },
    });

    // A color is picked: the menu answers with nothing, then a message.
    const color = answers(fake, '100000000000000614');
    connection.dispatch(
      'INTERACTION_CREATE',
      click(
        '100000000000000614',
        'selects/color:dark',
        3,
        {},
        { values: ['red', 'blue'] }
      )
    );
    await waitUntil(() => color.followUps().length === 1, 'the follow-up');
    await cli.waitFor('{"colors":["red","blue"],"value":"red","theme":"dark"}');
    expect(color.callbacks()[0]!.body).toEqual({ type: 6 });
    expect(color.followUps()[0]!.body).toEqual({
      content: 'Picked red',
      flags: 0,
    });

    // A form sent from a command has no message to change.
    const noMessage = answers(fake, '100000000000000615');
    connection.dispatch(
      'INTERACTION_CREATE',
      submit('100000000000000615', `modals/report:${ROLE}`, [
        {
          type: 18,
          id: 1,
          component: { type: 4, id: 2, custom_id: 'reason', value: 'Spam' },
        },
      ])
    );
    await waitUntil(
      () => noMessage.callbacks().length === 1,
      'the error answer'
    );
    await cli.waitFor(
      '✗ src/components/modals/report.ts:14 This form was opened by a command, not by a button or a menu: there is no message to change. Use interaction.reply().'
    );
    expect(noMessage.callbacks()[0]!.body).toEqual({
      type: 4,
      data: {
        content: 'Something went wrong while running this form.',
        flags: 64,
      },
    });

    cli.signal('SIGTERM');
    await cli.exited;
  });

  it('always answer, say when a file is silent or slow, and check where a component works', async () => {
    const fake = await world();
    const cwd = project({
      'src/components/buttons/boom.ts': `import { button } from 'chapterjs';
export default button({ label: 'Boom', run() { throw new Error('kaboom'); } });
`,
      'src/components/buttons/silent.ts': `import { button } from 'chapterjs';
export default button({ label: 'Silent', run() {} });
`,
      'src/components/buttons/slow.ts': `import { button } from 'chapterjs';
import { setTimeout as sleep } from 'node:timers/promises';
export default button({
  label: 'Slow',
  async run({ interaction }) {
    await sleep(2400);
    await interaction.update('Done at last');
  },
});
`,
      'src/components/buttons/slowboom.ts': `import { button } from 'chapterjs';
import { setTimeout as sleep } from 'node:timers/promises';
export default button({
  label: 'Slow boom',
  async run() {
    await sleep(2400);
    throw new Error('late kaboom');
  },
});
`,
      'src/components/buttons/private.ts': `import { button } from 'chapterjs';
export default button({
  label: 'Private',
  where: 'dm',
  async run({ interaction, channel }) {
    await interaction.reply('In private ' + channel.id);
  },
});
`,
      'src/components/buttons/twice.ts': `import { button } from 'chapterjs';
export default button({
  label: 'Twice',
  async run({ interaction }) {
    await interaction.update('once');
    await interaction.update('twice');
  },
});
`,
    });
    const cli = runDev(cwd, fake, ['dev']);
    await cli.waitFor('✓ 6 components loaded');
    await cli.waitFor(
      'ℹ src/components/buttons/private.ts the button buttons/private only works in private messages'
    );
    const connection = await connected(fake);

    const boom = answers(fake, '100000000000000621');
    connection.dispatch(
      'INTERACTION_CREATE',
      click('100000000000000621', 'buttons/boom', 2)
    );
    await waitUntil(() => boom.callbacks().length === 1, 'the error answer');
    await cli.waitFor('✗ src/components/buttons/boom.ts:2 kaboom');
    expect(boom.callbacks()[0]!.body).toEqual({
      type: 4,
      data: {
        content: 'Something went wrong while running this button.',
        flags: 64,
      },
    });

    connection.dispatch(
      'INTERACTION_CREATE',
      click('100000000000000622', 'buttons/silent', 2)
    );
    await cli.waitFor(
      '⚠ src/components/buttons/silent.ts buttons/silent finished without answering: the person sees "This interaction failed". Call interaction.update() or interaction.reply() in run, or interaction.deferUpdate() to change nothing.'
    );

    const slow = answers(fake, '100000000000000623');
    connection.dispatch(
      'INTERACTION_CREATE',
      click('100000000000000623', 'buttons/slow', 2)
    );
    await waitUntil(() => slow.edits().length === 1, 'the late update');
    // The framework said nothing would show meanwhile, then the update
    // came as a change of the message.
    expect(slow.callbacks().map(one => one.body)).toEqual([{ type: 6 }]);
    expect(slow.edits()[0]!.body).toEqual({ content: 'Done at last' });

    const slowBoom = answers(fake, '100000000000000624');
    connection.dispatch(
      'INTERACTION_CREATE',
      click('100000000000000624', 'buttons/slowboom', 2)
    );
    await waitUntil(() => slowBoom.followUps().length === 1, 'the late error');
    // The bad news never replaces the message of the button.
    expect(slowBoom.callbacks().map(one => one.body)).toEqual([{ type: 6 }]);
    expect(slowBoom.edits()).toEqual([]);
    expect(slowBoom.followUps()[0]!.body).toEqual({
      content: 'Something went wrong while running this button.',
      flags: 64,
    });

    const privateOnly = answers(fake, '100000000000000625');
    connection.dispatch(
      'INTERACTION_CREATE',
      click('100000000000000625', 'buttons/private', 2)
    );
    await waitUntil(() => privateOnly.callbacks().length === 1, 'the refusal');
    expect(privateOnly.callbacks()[0]!.body).toEqual({
      type: 4,
      data: {
        content: 'This button can only be used in a private message with me.',
        flags: 64,
      },
    });

    const twice = answers(fake, '100000000000000626');
    connection.dispatch(
      'INTERACTION_CREATE',
      click('100000000000000626', 'buttons/twice', 2)
    );
    await cli.waitFor(
      '✗ src/components/buttons/twice.ts:6 This interaction was already answered: the message can no longer be changed through it. Use interaction.message.edit() to change the message, or interaction.followUp() to send another one.'
    );
    await waitUntil(
      () => twice.followUps().length === 1,
      'the error follow-up'
    );

    cli.signal('SIGTERM');
    await cli.exited;
  });

  it('report a wrong file with what to write, and keep the others running', async () => {
    const fake = await world();
    const cwd = project({
      'src/components/buttons/ok.ts': `import { button } from 'chapterjs';
export default button({ label: 'OK', async run({ interaction }) { await interaction.deferUpdate(); } });
`,
      'src/components/buttons/bad.ts': `import { button } from 'chapterjs';
export default button({ label: '', run() {} });
`,
      'src/components/cards/x.ts': `export default 1;`,
      'src/components/modals/wrong.ts': `import { button } from 'chapterjs';
export default button({ label: 'x', run() {} });
`,
      'src/components/embeds/_shared.ts': `export const color = 1;`,
      'src/components/embeds/(info)/rules.ts': `import { embed } from 'chapterjs';
import { color } from '../_shared';
export default embed({ title: 'Rules', color });
`,
    });
    const cli = runDev(cwd, fake);
    await cli.waitFor(
      '✗ src/components/buttons/bad.ts The label of this button is a text of 1 to 80 characters.'
    );
    await cli.waitFor(
      '✗ src/components/cards/x.ts The folder src/components/cards is not a kind of component. Kinds are: buttons, selects, modals, embeds.'
    );
    await cli.waitFor(
      '✗ src/components/modals/wrong.ts This file exports a button, but it is in src/components/modals/. Move it to src/components/buttons/.'
    );
    await cli.waitFor('✓ 2 components loaded');
    const connection = await connected(fake);
    const ok = answers(fake, '100000000000000631');
    connection.dispatch(
      'INTERACTION_CREATE',
      click('100000000000000631', 'buttons/ok', 2)
    );
    await waitUntil(() => ok.callbacks().length === 1, 'the acknowledgement');
    expect(ok.callbacks()[0]!.body).toEqual({ type: 6 });
    cli.signal('SIGTERM');
    await cli.exited;
  });
});
