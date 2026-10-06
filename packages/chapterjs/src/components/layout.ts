// The pieces of a message that have no action of their own, written where
// the message is: rows, link and premium buttons, texts, sections,
// thumbnails, galleries, files, separators and containers. Each is checked
// against the limits of Discord when it is made.
// https://docs.discord.com/developers/components/reference

import { Limits } from '../discord/api.js';
import type { Snowflake } from '../discord/types/common.js';
import {
  ButtonStyle,
  ComponentType,
  type RawActionRowChildComponent,
  type RawButton,
  type RawContainerChildComponent,
  type RawMediaGalleryItem,
  type RawSection,
  type RawTextDisplay,
  type RawThumbnail,
} from '../discord/types/component.js';
import type { EmojiInput } from '../structures/message.js';
import {
  emojiOf,
  piece,
  renderedOf,
  type ActionRowComponent,
  type ButtonComponent,
  type ContainerChild,
  type ContainerComponent,
  type FileComponent,
  type GalleryComponent,
  type Rendered,
  type SectionComponent,
  type SelectComponent,
  type SeparatorComponent,
  type TextComponent,
  type ThumbnailComponent,
} from './instance.js';

const fail = (message: string): never => {
  throw new TypeError(message);
};

function checkText(
  what: string,
  value: unknown,
  max: number,
  { required = true }: { required?: boolean } = {}
): string | undefined {
  if (value === undefined) {
    return required ? fail(`${what} is missing.`) : undefined;
  }
  if (typeof value !== 'string') {
    return fail(`${what} is a text, got ${typeof value}.`);
  }
  if (value.trim() === '') return fail(`${what} is empty.`);
  if (value.length > max) {
    return fail(
      `${what} is ${value.length} characters long: Discord accepts ${max} at most.`
    );
  }
  return value;
}

/** A link button: what it shows, and the address it opens. */
export interface LinkButtonOptions {
  /** The text on the button (80 characters at most). */
  label?: string;
  /** An emoji on the button, before the label. */
  emoji?: EmojiInput;
  /** The address the button opens (512 characters at most). */
  url: string;
  /** Shows the button greyed out, impossible to click. */
  disabled?: boolean;
}

/**
 * A button that opens a link. Nothing runs in your bot when it is clicked:
 * Discord opens the address.
 * @see https://docs.discord.com/developers/components/reference#button
 */
export function linkButton(options: LinkButtonOptions): ButtonComponent {
  if (typeof options !== 'object' || options === null) {
    fail(`linkButton() takes an object like { label: 'Docs', url: '...' }.`);
  }
  const url = checkText(
    'The url of a link button',
    options.url,
    Limits.ButtonUrl
  )!;
  if (!/^https?:\/\/|^discord:\/\//.test(url)) {
    fail(
      `The url of a link button must start with https:// (got ${JSON.stringify(url)}).`
    );
  }
  const label = checkText(
    'The label of a link button',
    options.label,
    Limits.ButtonLabel,
    { required: false }
  );
  if (label === undefined && options.emoji === undefined) {
    fail('A link button needs a label or an emoji.');
  }
  const raw: RawButton = {
    type: ComponentType.Button,
    style: ButtonStyle.Link,
    url,
  };
  if (label !== undefined) raw.label = label;
  if (options.emoji !== undefined)
    raw.emoji = emojiOf(options.emoji, 'a link button');
  if (options.disabled) raw.disabled = true;
  return piece('button', raw);
}

/**
 * A button that offers something to buy: Discord shows the name and the
 * price of the SKU itself.
 * @see https://docs.discord.com/developers/components/reference#button
 */
export function premiumButton(
  skuId: Snowflake,
  { disabled = false }: { disabled?: boolean } = {}
): ButtonComponent {
  if (typeof skuId !== 'string' || !/^\d+$/.test(skuId)) {
    fail(
      `premiumButton() takes the id of a SKU, got ${JSON.stringify(skuId)}.`
    );
  }
  const raw: RawButton = {
    type: ComponentType.Button,
    style: ButtonStyle.Premium,
    sku_id: skuId,
  };
  if (disabled) raw.disabled = true;
  return piece('button', raw);
}

/**
 * A row of components: up to 5 buttons, or one select menu. The framework
 * makes rows by itself; use this to choose which buttons share a row.
 * @see https://docs.discord.com/developers/components/reference#action-row
 */
export function row(
  components: readonly (ButtonComponent | SelectComponent)[]
): ActionRowComponent {
  if (!Array.isArray(components) || components.length === 0) {
    fail('row() takes a list of buttons, or one select menu.');
  }
  const rendered = components.map((component, index) =>
    renderedOf(component, `Component ${index + 1} of a row`)
  );
  if (rendered.some(one => one.kind === 'select')) {
    if (rendered.length > 1) {
      fail('A select menu takes a whole row: put it in a row of its own.');
    }
  } else if (rendered.some(one => one.kind !== 'button')) {
    fail('A row only holds buttons, or one select menu.');
  } else if (rendered.length > Limits.ActionRowButtons) {
    fail(
      `A row holds ${Limits.ActionRowButtons} buttons at most, got ${rendered.length}.`
    );
  }
  return piece('row', {
    type: ComponentType.ActionRow,
    components: rendered.map(one => one.raw as RawActionRowChildComponent),
  });
}

/**
 * A text in a message built with components. Markdown works as in any
 * message, mentions included. The texts of a message add up to 4000
 * characters at most.
 * @see https://docs.discord.com/developers/components/reference#text-display
 */
export function text(content: string): TextComponent {
  return piece('text', {
    type: ComponentType.TextDisplay,
    content: checkText('A text', content, Limits.TextDisplayTotal)!,
  });
}

/** A picture or a video: its address, or `attachment://name` for a file of the message. */
export interface MediaOptions {
  /** The address of the media: a link, or `attachment://chart.png` for a file sent with the message. */
  url: string;
  /** What the media shows, for people who can't see it (1024 characters at most). */
  description?: string;
  /** Blurs the media until it is clicked. */
  spoiler?: boolean;
}

function mediaOf(
  input: string | MediaOptions,
  what: string
): RawMediaGalleryItem {
  const options = typeof input === 'string' ? { url: input } : input;
  if (typeof options !== 'object' || options === null) {
    fail(`${what} is an address, or an object like { url: '...' }.`);
  }
  const url = checkText(`The url of ${what}`, options.url, 2048)!;
  const item: RawMediaGalleryItem = { media: { url } };
  const description = checkText(
    `The description of ${what}`,
    options.description,
    Limits.MediaDescription,
    { required: false }
  );
  if (description !== undefined) item.description = description;
  if (options.spoiler) item.spoiler = true;
  return item;
}

/**
 * A small picture beside the texts of a section.
 * @see https://docs.discord.com/developers/components/reference#thumbnail
 */
export function thumbnail(media: string | MediaOptions): ThumbnailComponent {
  const item = mediaOf(media, 'a thumbnail');
  const raw: RawThumbnail = {
    type: ComponentType.Thumbnail,
    media: item.media,
  };
  if (item.description !== undefined) raw.description = item.description;
  if (item.spoiler) raw.spoiler = true;
  return piece('thumbnail', raw);
}

/**
 * One to three texts with a button or a thumbnail beside them.
 * @see https://docs.discord.com/developers/components/reference#section
 */
export function section(
  texts: string | readonly string[],
  accessory: ButtonComponent | ThumbnailComponent
): SectionComponent {
  const list = typeof texts === 'string' ? [texts] : texts;
  if (
    !Array.isArray(list) ||
    list.length === 0 ||
    list.length > Limits.SectionTexts
  ) {
    fail(
      `A section has 1 to ${Limits.SectionTexts} texts, got ${Array.isArray(list) ? list.length : typeof list}.`
    );
  }
  const side = renderedOf(accessory, 'The accessory of a section');
  if (side.kind !== 'button' && side.kind !== 'thumbnail') {
    fail(
      `Beside a section goes a button or a thumbnail(), got a ${side.kind}.`
    );
  }
  const raw: RawSection = {
    type: ComponentType.Section,
    components: list.map(
      (content, index) =>
        ({
          type: ComponentType.TextDisplay,
          content: checkText(
            `Text ${index + 1} of a section`,
            content,
            Limits.TextDisplayTotal
          )!,
        }) satisfies RawTextDisplay
    ),
    accessory: side.raw as RawSection['accessory'],
  };
  return piece('section', raw);
}

/**
 * Up to 10 pictures or videos, shown in a grid.
 * @see https://docs.discord.com/developers/components/reference#media-gallery
 */
export function gallery(
  items: readonly (string | MediaOptions)[]
): GalleryComponent {
  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    items.length > Limits.MediaGalleryItems
  ) {
    fail(
      `A gallery has 1 to ${Limits.MediaGalleryItems} items, got ${Array.isArray(items) ? items.length : typeof items}.`
    );
  }
  return piece('gallery', {
    type: ComponentType.MediaGallery,
    items: items.map((item, index) =>
      mediaOf(item, `item ${index + 1} of a gallery`)
    ),
  });
}

/**
 * A file sent with the message (its `files`), shown where it is placed.
 * @see https://docs.discord.com/developers/components/reference#file
 */
export function file(
  name: string,
  { spoiler = false }: { spoiler?: boolean } = {}
): FileComponent {
  const fileName = checkText(
    'The name of a file component',
    name,
    1024
  )!.replace(/^attachment:\/\//, '');
  const raw = {
    type: ComponentType.File,
    file: { url: `attachment://${fileName}` },
    ...(spoiler ? { spoiler: true } : {}),
  } as const;
  return piece('file', raw);
}

/** How a separator looks. */
export interface SeparatorOptions {
  /** Shows a line. Shown by default. */
  divider?: boolean;
  /** How much space: `'small'` (the default) or `'large'`. */
  spacing?: 'small' | 'large';
}

/**
 * Space between two pieces, with a line by default.
 * @see https://docs.discord.com/developers/components/reference#separator
 */
export function separator({
  divider = true,
  spacing = 'small',
}: SeparatorOptions = {}): SeparatorComponent {
  if (spacing !== 'small' && spacing !== 'large') {
    fail(
      `The spacing of a separator is 'small' or 'large', got ${JSON.stringify(spacing)}.`
    );
  }
  return piece('separator', {
    type: ComponentType.Separator,
    ...(divider ? {} : { divider: false }),
    ...(spacing === 'large' ? { spacing: 2 } : {}),
  });
}

/** How a container looks. */
export interface ContainerOptions {
  /** The color of the line on its left, as a number (`0xc026d3`). */
  color?: number;
  /** Blurs the whole container until it is clicked. */
  spoiler?: boolean;
}

/**
 * A box around texts, sections, rows, galleries, files and separators,
 * with an optional color on its left, like an embed.
 * @see https://docs.discord.com/developers/components/reference#container
 */
export function container(
  children: readonly ContainerChild[],
  { color, spoiler = false }: ContainerOptions = {}
): ContainerComponent {
  if (!Array.isArray(children) || children.length === 0) {
    fail('container() takes a list of components to put in the box.');
  }
  if (
    color !== undefined &&
    (!Number.isInteger(color) || color < 0 || color > 0xffffff)
  ) {
    fail(
      `The color of a container is a number between 0 and 0xFFFFFF, got ${String(color)}.`
    );
  }
  const components = autoRows(
    children.map((child, index) =>
      renderedOf(child, `Component ${index + 1} of a container`)
    ),
    'a container'
  );
  for (const child of components) {
    if (child.kind === 'container' || child.kind === 'thumbnail') {
      fail(
        `A container can't hold a ${child.kind}: it holds texts, sections, rows, galleries, files and separators.`
      );
    }
  }
  return piece('container', {
    type: ComponentType.Container,
    components: components.map(
      child => child.raw as RawContainerChildComponent
    ),
    ...(color !== undefined ? { accent_color: color } : {}),
    ...(spoiler ? { spoiler: true } : {}),
  });
}

/**
 * Puts the buttons and menus of a list in rows: buttons that follow each
 * other share a row of 5 at most, a menu gets its own. Rows and layout
 * pieces are kept as they are.
 */
export function autoRows(
  pieces: readonly Rendered[],
  where: string
): Rendered[] {
  const result: Rendered[] = [];
  let buttons: RawButton[] = [];
  const flush = (): void => {
    if (buttons.length === 0) return;
    result.push({
      kind: 'row',
      raw: { type: ComponentType.ActionRow, components: buttons },
    });
    buttons = [];
  };
  for (const one of pieces) {
    if (one.kind === 'button') {
      buttons.push(one.raw as RawButton);
      if (buttons.length === Limits.ActionRowButtons) flush();
    } else if (one.kind === 'select') {
      flush();
      result.push({
        kind: 'row',
        raw: {
          type: ComponentType.ActionRow,
          components: [one.raw as RawActionRowChildComponent],
        },
      });
    } else if (one.kind === 'thumbnail') {
      fail(
        `A thumbnail only goes beside a section: section(['...'], thumbnail(...)). It can't be in ${where} on its own.`
      );
    } else if (one.kind === 'modal') {
      fail(
        `A form is not part of ${where}: open it with interaction.showModal().`
      );
    } else {
      flush();
      result.push(one);
    }
  }
  flush();
  return result;
}
