// What `button()`, `select()`, `modal()` and `embed()` return: the default
// export of a file of `src/components/`. It is a function (called with the
// data the component carries) that the loader recognises, checks, and binds
// to the path of its file: that path is the custom_id. Until then it can't
// make anything, which is how a definition outside `src/components/` is
// refused.

import {
  piece,
  pieceFunction,
  type PieceKind,
  type Rendered,
} from './instance.js';

/** The kinds of files of `src/components/`, which are its folders. */
export type ComponentKind = 'button' | 'select' | 'modal' | 'embed';

export const COMPONENT_FOLDERS: Record<string, ComponentKind> = {
  buttons: 'button',
  selects: 'select',
  modals: 'modal',
  embeds: 'embed',
};

/** A file as the loader knows it: what it declared, and once loaded, how to make instances. */
export interface ComponentFileState {
  readonly kind: ComponentKind;
  readonly config: unknown;
  /** The name of the file for messages, before it is bound: `button()`. */
  readonly made: string;
  bound?: {
    /** The path of the file inside `src/components/`, without extension. */
    path: string;
    /** Makes an instance from what the file was called with. */
    render: (args: readonly unknown[]) => Rendered | object;
  };
}

const FILE = Symbol.for('chapterjs.component.file');

/** The state of a component file, if the value is one. */
export function fileStateOf(value: unknown): ComponentFileState | undefined {
  if (typeof value !== 'function') return undefined;
  return (value as unknown as Record<symbol, ComponentFileState | undefined>)[
    FILE
  ];
}

/**
 * Makes a component file. `asPiece` says whether the file itself stands
 * for its instance when it carries no data (a button, a menu, a modal: not
 * an embed, which is only a function).
 */
export function createFile(
  kind: ComponentKind,
  config: unknown,
  { asPiece, pieceKind }: { asPiece: boolean; pieceKind?: PieceKind }
): (...args: unknown[]) => unknown {
  const state: ComponentFileState = { kind, config, made: `${kind}()` };
  const notBound = (): never => {
    throw new Error(
      `This ${kind} was not loaded by ChapterJS: a ${kind} is a file of src/components/${Object.keys(COMPONENT_FOLDERS).find(folder => COMPONENT_FOLDERS[folder] === kind)}/, exported by default, and used after the bot started.`
    );
  };
  const file = (...args: unknown[]): unknown => {
    if (!state.bound) return notBound();
    const rendered = state.bound.render(args);
    return pieceKind
      ? piece(pieceKind, (rendered as Rendered).raw as never)
      : rendered;
  };
  Object.defineProperty(file, FILE, { value: state });
  Object.defineProperty(file, 'config', { value: config, enumerable: true });
  if (asPiece) {
    pieceFunction(file, () =>
      state.bound ? (state.bound.render([]) as Rendered) : notBound()
    );
  }
  return file;
}

/** Binds a file to its path and to what makes its instances. */
export function bindFile(
  file: unknown,
  bound: NonNullable<ComponentFileState['bound']>
): void {
  const state = fileStateOf(file);
  if (!state) throw new TypeError('Not a component file.');
  state.bound = bound;
}
