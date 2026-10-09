// `embed()`, as user files import it from 'chapterjs': an embed written
// once, used in every message that needs it.
// Static, or a function of what it shows.

import type { Embed } from '../structures/payload.js';
import { createComponent, componentStateOf } from './declared.js';

/**
 * What `embed()` returns: a declaration the framework finds in the exports
 * of a file. Import it where you send a message: `embeds: [welcome({
 * member })]`, or `embeds: [rules]` for an embed that always looks the
 * same.
 */
export type EmbedDeclaration<Args extends readonly unknown[] = []> = {
  /** What the file gave to `embed()`, not checked yet. */
  readonly config: unknown;
} & ((...args: Args) => Embed);

/**
 * Declares an embed. Export the result from any file of `src/`. Give it
 * the embed itself when it always looks the same, or a function of what it
 * shows:
 *
 * ```ts
 * import { embed, type GuildMember } from 'chapterjs';
 *
 * export const welcome = embed((member: GuildMember) => ({
 *   title: `Welcome ${member.displayName}!`,
 *   color: 0x57f287,
 * }));
 * ```
 */
export function embed(definition: Embed): EmbedDeclaration<[]>;
export function embed<const Args extends readonly unknown[]>(
  definition: (...args: Args) => Embed
): EmbedDeclaration<Args>;
export function embed(
  definition: unknown
): EmbedDeclaration<readonly unknown[]> {
  return createComponent('embed', definition, {
    asPiece: false,
  }) as unknown as EmbedDeclaration<readonly unknown[]>;
}

/** Whether a value is a declared embed: a function to call for the embed. */
export const isEmbedDeclaration = (
  value: unknown
): value is EmbedDeclaration<readonly unknown[]> =>
  componentStateOf(value)?.kind === 'embed';
