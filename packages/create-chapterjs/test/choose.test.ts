import { beforeEach, describe, expect, it, vi } from 'vitest';

const prompts = vi.hoisted(() => ({
  select: vi.fn(),
  info: vi.fn(),
}));
vi.mock('@clack/prompts', () => ({
  select: prompts.select,
  log: { info: prompts.info },
}));

const { choose } = await import('../src/choose.js');

const onlyChoice = (value: string) => `Using ${value}`;

beforeEach(() => {
  prompts.select.mockReset();
  prompts.info.mockReset();
});

describe('choose', () => {
  it('returns undefined without asking when there is no choice', async () => {
    expect(
      await choose({ message: 'Pick', choices: [], onlyChoice })
    ).toBeUndefined();
    expect(prompts.select).not.toHaveBeenCalled();
    expect(prompts.info).not.toHaveBeenCalled();
  });

  it('returns undefined without asking when every choice is disabled', async () => {
    const result = await choose({
      message: 'Pick',
      choices: [
        { value: 'a', disabled: true },
        { value: 'b', disabled: true },
      ],
      onlyChoice,
    });
    expect(result).toBeUndefined();
    expect(prompts.select).not.toHaveBeenCalled();
  });

  it('takes the only choice without asking, and says so', async () => {
    const result = await choose({
      message: 'Pick',
      choices: [{ value: 'only' }],
      onlyChoice,
    });
    expect(result).toBe('only');
    expect(prompts.select).not.toHaveBeenCalled();
    expect(prompts.info).toHaveBeenCalledWith('Using only');
  });

  it('takes the only enabled choice, wherever it is among disabled ones', async () => {
    for (const position of [0, 1, 2]) {
      prompts.info.mockReset();
      const choices = ['a', 'b', 'c'].map((value, i) => ({
        value,
        disabled: i !== position,
      }));
      const result = await choose({ message: 'Pick', choices, onlyChoice });
      expect(result).toBe(choices[position]!.value);
      expect(prompts.info).toHaveBeenCalledOnce();
    }
    expect(prompts.select).not.toHaveBeenCalled();
  });

  it('asks when several choices are enabled, showing disabled ones too', async () => {
    prompts.select.mockResolvedValue('b');
    const choices = [
      { value: 'a', hint: 'v1' },
      { value: 'x', label: 'x (not installed)', disabled: true },
      { value: 'b' },
    ];
    const result = await choose({
      message: 'Pick one',
      choices,
      initialValue: 'b',
      onlyChoice,
    });
    expect(result).toBe('b');
    expect(prompts.info).not.toHaveBeenCalled();
    expect(prompts.select).toHaveBeenCalledWith({
      message: 'Pick one',
      initialValue: 'b',
      options: choices,
    });
  });

  it.each([
    ['missing', undefined],
    ['disabled', 'x'],
    ['unknown', 'nope'],
  ])(
    'preselects the first enabled choice when the initial value is %s',
    async (_, initialValue) => {
      prompts.select.mockResolvedValue('a');
      await choose({
        message: 'Pick',
        choices: [
          { value: 'x', disabled: true },
          { value: 'a' },
          { value: 'b' },
        ],
        initialValue,
        onlyChoice,
      });
      expect(prompts.select).toHaveBeenCalledWith(
        expect.objectContaining({ initialValue: 'a' })
      );
    }
  );

  it('passes the cancel symbol through', async () => {
    const cancel = Symbol('clack:cancel');
    prompts.select.mockResolvedValue(cancel);
    const result = await choose({
      message: 'Pick',
      choices: [{ value: 'a' }, { value: 'b' }],
      onlyChoice,
    });
    expect(result).toBe(cancel);
  });
});
