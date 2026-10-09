// What `button()`, `select()`, `modal()` and `embed()` return: a component,
// declared in a file of the project. It is a function (called with the
// data the component carries) that the loader recognises, checks, and binds
// to the name of its export: that name is the custom_id. Until then it can't
// make anything, which is how a component the framework never loaded is
// refused.

import {
  piece,
  pieceFunction,
  type PieceKind,
  type Rendered,
} from './instance.js';

/** The kinds of components a file declares. */
export type ComponentKind = 'button' | 'select' | 'modal' | 'embed';

/** A declared component as the loader knows it: what it declared, and once loaded, how to make instances. */
export interface ComponentState {
  readonly kind: ComponentKind;
  readonly config: unknown;
  /** What made it, for messages: `button()`. */
  readonly made: string;
  bound?: {
    /** The name of the export that declares it: its id. */
    name: string;
    /** Makes an instance from what the component was called with. */
    render: (args: readonly unknown[]) => Rendered | object;
  };
}

const STATE = Symbol.for('chapterjs.component.declared');

/** The state of a declared component, if the value is one. */
export function componentStateOf(value: unknown): ComponentState | undefined {
  if (typeof value !== 'function') return undefined;
  return (value as unknown as Record<symbol, ComponentState | undefined>)[
    STATE
  ];
}

/**
 * Makes a declared component. `asPiece` says whether it stands for its
 * instance by itself when it carries no data (a button, a menu, a modal:
 * not an embed, which is only a function).
 */
export function createComponent(
  kind: ComponentKind,
  config: unknown,
  { asPiece, pieceKind }: { asPiece: boolean; pieceKind?: PieceKind }
): (...args: unknown[]) => unknown {
  const state: ComponentState = { kind, config, made: `${kind}()` };
  const notBound = (): never => {
    throw new Error(
      `This ${kind} was not loaded by ChapterJS: a ${kind} is exported from a file of src/ (export const name = ${kind}({ ... })), and used once the bot started.`
    );
  };
  const declared = (...args: unknown[]): unknown => {
    if (!state.bound) return notBound();
    const rendered = state.bound.render(args);
    return pieceKind
      ? piece(pieceKind, (rendered as Rendered).raw as never)
      : rendered;
  };
  Object.defineProperty(declared, STATE, { value: state });
  Object.defineProperty(declared, 'config', {
    value: config,
    enumerable: true,
  });
  if (asPiece) {
    pieceFunction(declared, () =>
      state.bound ? (state.bound.render([]) as Rendered) : notBound()
    );
  }
  return declared;
}

/** Binds a declared component to its name and to what makes its instances. */
export function bindComponent(
  declared: unknown,
  bound: NonNullable<ComponentState['bound']>
): void {
  const state = componentStateOf(declared);
  if (!state) throw new TypeError('Not a component.');
  state.bound = bound;
}
