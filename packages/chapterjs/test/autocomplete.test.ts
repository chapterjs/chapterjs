import { describe, expect, it } from 'vitest';
import { command } from '../src/commands/command.js';
import { commandsConvention } from '../src/commands/convention.js';
import { buildCommands } from '../src/commands/tree.js';
import { sameDefinition } from '../src/commands/twins.js';

const read = (config: Record<string, unknown>) =>
  commandsConvention.read(
    {
      default: command({
        description: 'd',
        run() {},
        ...config,
      } as never),
    },
    'play.ts'
  );

const OPTIONS = {
  song: { type: 'string', description: 'd', required: true },
  volume: { type: 'integer', description: 'd' },
  speed: { type: 'number', description: 'd' },
  who: { type: 'user', description: 'd' },
  fixed: { type: 'string', description: 'd', choices: ['a', 'b'] },
} as const;

describe('the autocomplete of a command file', () => {
  it('is empty when left out', () => {
    expect(read({}).autocomplete).toEqual({});
    expect(Object.isFrozen(read({}).autocomplete)).toBe(true);
  });

  it('keeps one function per option, for texts and numbers', () => {
    const song = () => ['a'];
    const volume = () => [1];
    const speed = async () => [1.5];
    const loaded = read({
      options: OPTIONS,
      autocomplete: { song, volume, speed },
    });
    expect(loaded.autocomplete).toEqual({ song, volume, speed });
    expect(Object.isFrozen(loaded.autocomplete)).toBe(true);
  });

  it.each([
    [
      'not an object',
      { options: OPTIONS, autocomplete: () => [] },
      '"autocomplete" is an object whose keys are the names of the options to suggest for, each a function returning the suggestions: autocomplete: { song: ({ value }) => [...] }',
    ],
    [
      'a list',
      { options: OPTIONS, autocomplete: ['song'] },
      '"autocomplete" is an object whose keys are the names of the options',
    ],
    [
      'an option that does not exist',
      { options: OPTIONS, autocomplete: { title: () => [] } },
      '"title" of "autocomplete" is not an option of this command. Its options are: song, volume, speed, who, fixed.',
    ],
    [
      'an option when there are none',
      { autocomplete: { title: () => [] } },
      '"title" of "autocomplete" is not an option of this command. Declare it in "options" first.',
    ],
    [
      'a user option',
      { options: OPTIONS, autocomplete: { who: () => [] } },
      '"who" of "autocomplete" can\'t have suggestions: the option "who" is a user. Only a string, integer, number option can.',
    ],
    [
      'an option with choices',
      { options: OPTIONS, autocomplete: { fixed: () => [] } },
      '"fixed" of "autocomplete" can\'t have suggestions: the option "fixed" has "choices", and Discord takes one or the other. Remove its choices to suggest them from here, or take it out of "autocomplete".',
    ],
    [
      'something that is not a function',
      { options: OPTIONS, autocomplete: { song: ['a', 'b'] } },
      '"song" of "autocomplete" is a function that returns the suggestions, like song: ({ value }) => [...]: got ["a","b"].',
    ],
    [
      'undefined instead of a function',
      { options: OPTIONS, autocomplete: { song: undefined } },
      '"song" of "autocomplete" is a function that returns the suggestions, like song: ({ value }) => [...]: got undefined.',
    ],
  ])('refuses %s', (_what, config, message) => {
    expect(() => read(config)).toThrow(message);
  });

  it('is checked after the options, so a broken option is reported first', () => {
    expect(() =>
      read({
        options: { song: { type: 'strin', description: 'd' } },
        autocomplete: { song: () => [] },
      })
    ).toThrow('The type of the option "song" is "strin"');
  });
});

describe('registering a command with autocomplete', () => {
  const entries = [
    {
      file: 'src/commands/play.ts',
      command: read({
        options: OPTIONS,
        autocomplete: { song: () => [], volume: () => [] },
      }),
    },
  ];

  it('marks the options that have a function, and no other', () => {
    const [payload] = buildCommands(entries, { guild: true });
    const options = payload!.options!.map(option => [
      option.name,
      option.autocomplete,
    ]);
    expect(options).toEqual([
      ['song', true],
      ['volume', true],
      ['speed', undefined],
      ['who', undefined],
      ['fixed', undefined],
    ]);
  });

  it('is not the same command once a function is added or removed', () => {
    const [withIt] = buildCommands(entries, { guild: false });
    const [without] = buildCommands(
      [{ file: 'src/commands/play.ts', command: read({ options: OPTIONS }) }],
      { guild: false }
    );
    const registered = {
      ...withIt!,
      id: '1',
      application_id: '2',
      version: '3',
    };
    expect(sameDefinition(withIt!, registered as never)).toBe(true);
    expect(sameDefinition(without!, registered as never)).toBe(false);
  });
});
