// What goes in the `components` of a message: pieces made by the framework
// (a button declared with `button()`, a `row()`, a `container()`...),
// never raw JSON. Each piece knows the Discord shape it is sent as; the
// brand is what lets a message refuse anything else, so that no custom_id
// is ever written by hand.

import type { Snowflake } from '../discord/types/common.js';
import type {
  RawActionRow,
  RawButton,
  RawContainer,
  RawFileComponent,
  RawMediaGallery,
  RawSection,
  RawSelectMenu,
  RawSeparator,
  RawTextDisplay,
  RawThumbnail,
} from '../discord/types/component.js';
import type { RawEmoji } from '../discord/types/emoji.js';
import type { RawInteractionCallbackModalData } from '../discord/types/interaction.js';
import type { EmojiInput } from '../structures/message.js';
import type { Translator } from '../messages/messages.js';

declare const brand: unique symbol;

/** A piece of a message made by ChapterJS: a button, a menu, a layout. */
export interface Piece<Kind extends string> {
  /** What kind of piece it is. Only the framework makes pieces. */
  readonly [brand]: Kind;
}

/** A button: declared with `button()`, or made with `linkButton()` or `premiumButton()`. */
export type ButtonComponent = Piece<'button'>;
/** A select menu declared with `select()`. */
export type SelectComponent = Piece<'select'>;
/** A row of up to 5 buttons, or of one menu: `row()`. */
export type ActionRowComponent = Piece<'row'>;
/** A text: `text()`. */
export type TextComponent = Piece<'text'>;
/** Texts with a button or a thumbnail beside them: `section()`. */
export type SectionComponent = Piece<'section'>;
/** A small image beside a section: `thumbnail()`. */
export type ThumbnailComponent = Piece<'thumbnail'>;
/** Up to 10 images or videos: `gallery()`. */
export type GalleryComponent = Piece<'gallery'>;
/** An attached file shown in the message: `file()`. */
export type FileComponent = Piece<'file'>;
/** Space, with or without a line: `separator()`. */
export type SeparatorComponent = Piece<'separator'>;
/** A box around other pieces, with an optional color: `container()`. */
export type ContainerComponent = Piece<'container'>;
/** A form to open with `interaction.showModal()`: declared with `modal()`. */
export type ModalComponent = Piece<'modal'>;

/** What a container can hold. */
export type ContainerChild =
  | ButtonComponent
  | SelectComponent
  | ActionRowComponent
  | TextComponent
  | SectionComponent
  | GalleryComponent
  | FileComponent
  | SeparatorComponent;

/**
 * What the `components` of a message take. Buttons and menus are put in
 * rows by the framework (5 buttons per row, a menu alone in its row);
 * `row()` is there to choose. As soon as a message has a text, a section,
 * a gallery, a file, a separator or a container, it is built with
 * components only: Discord then takes no `content` and no `embeds`.
 * @see https://docs.discord.com/developers/components/reference
 */
export type MessageComponent = ContainerChild | ContainerComponent;

export type PieceKind =
  | 'button'
  | 'select'
  | 'row'
  | 'text'
  | 'section'
  | 'thumbnail'
  | 'gallery'
  | 'file'
  | 'separator'
  | 'container'
  | 'modal';

interface RawOf {
  button: RawButton;
  select: RawSelectMenu;
  row: RawActionRow;
  text: RawTextDisplay;
  section: RawSection;
  thumbnail: RawThumbnail;
  gallery: RawMediaGallery;
  file: RawFileComponent;
  separator: RawSeparator;
  container: RawContainer;
  modal: RawInteractionCallbackModalData;
}

/**
 * What a piece sends: known when the piece is made, or computed when the
 * message is sent, with `t` in the language of who will read it (a piece
 * whose texts are functions).
 */
export type Deferred<R> = R | ((t: Translator) => R);

/** A piece as the framework sees it. */
export interface Rendered<Kind extends PieceKind = PieceKind> {
  kind: Kind;
  raw: Deferred<RawOf[Kind]>;
}

/** A piece with what it sends, known: after `resolve()`. */
export interface Resolved<Kind extends PieceKind = PieceKind> {
  kind: Kind;
  raw: RawOf[Kind];
}

/** What a piece sends, for the language of who will read it. */
export function resolve<Kind extends PieceKind>(
  rendered: Rendered<Kind>,
  t: Translator
): Resolved<Kind> {
  const { kind, raw } = rendered;
  return { kind, raw: typeof raw === 'function' ? raw(t) : raw };
}

/**
 * What a piece made of others sends: known now when every child is, else
 * computed when the message is sent, from what the children send then.
 */
export function compose<R>(
  children: readonly Rendered[],
  build: (raws: readonly unknown[]) => R
): Deferred<R> {
  if (children.every(child => typeof child.raw !== 'function')) {
    return build(children.map(child => child.raw));
  }
  return (t: Translator) => build(children.map(child => resolve(child, t).raw));
}

const INSTANCE = Symbol.for('chapterjs.component');

/** Makes a piece. `raw` is frozen: a piece never changes once made. */
export function piece<Kind extends PieceKind>(
  kind: Kind,
  raw: Deferred<RawOf[Kind]>
): Piece<Kind> {
  return Object.freeze({
    [INSTANCE]: true,
    kind,
    raw,
  }) as unknown as Piece<Kind>;
}

/**
 * Lets a function stand for a piece: the file of a button without data is
 * a function (called with a look) and also the button itself. `render`
 * is asked for the piece when the message is built.
 */
export function pieceFunction<F extends object>(
  target: F,
  render: () => Rendered
): F {
  Object.defineProperty(target, INSTANCE, { value: true });
  Object.defineProperty(target, 'kind', { get: () => render().kind });
  Object.defineProperty(target, 'raw', { get: () => render().raw });
  return target;
}

/** Whether a value is a piece made by the framework. */
export function isPiece(value: unknown): value is Piece<PieceKind> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    (value as Record<symbol, unknown>)[INSTANCE] === true
  );
}

/** What a piece is and how it is sent. Throws on anything else. */
export function renderedOf(value: unknown, where: string): Rendered {
  if (!isPiece(value)) {
    throw new TypeError(
      `${where} is not a component made by ChapterJS, got ${value === null ? 'null' : typeof value === 'object' && 'custom_id' in (value as object) ? 'an object with a custom_id' : typeof value}. Use the buttons, menus and forms declared with button(), select() and modal(), and row(), text(), section(), container()... from 'chapterjs'. Components are never written as JSON.`
    );
  }
  const { kind, raw } = value as unknown as Rendered;
  return { kind, raw };
}

/**
 * An emoji as a component takes it: a standard one (`'👍'`), a custom one as
 * Discord writes it (`'<:name:id>'`, `'<a:name:id>'`) or one of
 * `guild.emojis`.
 */
export function emojiOf(input: EmojiInput, what: string): Partial<RawEmoji> {
  if (typeof input !== 'string') {
    const id = (input as { id?: Snowflake | null }).id ?? null;
    const name = (input as { name?: string | null }).name ?? null;
    if (!id && !name) {
      throw new TypeError(`The emoji of ${what} has no name and no id.`);
    }
    return {
      ...(id ? { id } : {}),
      ...(name ? { name } : {}),
      ...((input as { animated?: boolean }).animated ? { animated: true } : {}),
    };
  }
  const text = input.trim();
  const custom = /^<(a?):(\w+):(\d+)>$/.exec(text);
  if (custom) {
    return {
      id: custom[3]!,
      name: custom[2]!,
      ...(custom[1] ? { animated: true } : {}),
    };
  }
  if (text === '') {
    throw new TypeError(
      `The emoji of ${what} is empty: pass one like "👍", or a custom one like "<:name:id>".`
    );
  }
  return { name: text };
}
