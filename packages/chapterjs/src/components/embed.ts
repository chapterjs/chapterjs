// `embed()`, as the files of `src/components/embeds/` import it from
// 'chapterjs': an embed written once, used in every message that needs it.
// Static, or a function of what it shows.

import type { Embed } from '../structures/payload.js';
import { createFile, fileStateOf } from './file.js';

/**
 * What `embed()` returns: the default export of an embed file. Import it
 * where you send a message: `embeds: [welcome({ member })]`, or
 * `embeds: [rules]` for an embed that always looks the same.
 */
export type EmbedFile<Args extends readonly unknown[] = []> = {
  /** What the file gave to `embed()`, not checked yet. */
  readonly config: unknown;
} & ((...args: Args) => Embed);

/**
 * Declares an embed. Export the result as the default export of a file of
 * `src/components/embeds/`. Give it the embed itself when it always looks
 * the same, or a function of what it shows:
 *
 * ```ts
 * import { embed, type GuildMember } from 'chapterjs';
 *
 * export default embed((member: GuildMember) => ({
 *   title: `Welcome ${member.displayName}!`,
 *   color: 0x57f287,
 * }));
 * ```
 */
export function embed(definition: Embed): EmbedFile<[]>;
export function embed<const Args extends readonly unknown[]>(
  definition: (...args: Args) => Embed
): EmbedFile<Args>;
export function embed(definition: unknown): EmbedFile<readonly unknown[]> {
  return createFile('embed', definition, {
    asPiece: false,
  }) as unknown as EmbedFile<readonly unknown[]>;
}

/** Whether a value is an embed file: a function to call for the embed. */
export const isEmbedFile = (
  value: unknown
): value is EmbedFile<readonly unknown[]> =>
  fileStateOf(value)?.kind === 'embed';
