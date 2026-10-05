import { cdn, type ImageOptions } from '../discord/cdn.js';
import { DeleteGuildEmoji, ModifyGuildEmoji } from '../discord/endpoints.js';
import { emojiMention } from '../discord/formatting.js';
import type { Snowflake } from '../discord/types/common.js';
import type { RawEmoji } from '../discord/types/emoji.js';
import { ctxOf, dataOf, idOf, IdStructure } from './base.js';
import type { Context } from './context.js';

export type GuildEmojiData = Omit<RawEmoji, 'id' | 'user'> & { id: Snowflake };

/**
 * A custom emoji of a server.
 * @see https://docs.discord.com/developers/resources/emoji#emoji-object
 */
export class GuildEmoji extends IdStructure<GuildEmojiData> {
  /** The id of the server of the emoji. */
  readonly guildId: Snowflake;

  constructor(ctx: Context, data: GuildEmojiData, guildId: Snowflake) {
    super(ctx, data);
    this.guildId = guildId;
  }

  /** The name of the emoji, without the colons. */
  get name(): string {
    return dataOf(this).name ?? '';
  }

  /** Whether the emoji moves. */
  get animated(): boolean {
    return dataOf(this).animated ?? false;
  }

  /** `false` when the server lost the boosts that gave it this emoji. */
  get available(): boolean {
    return dataOf(this).available ?? true;
  }

  /** Whether the emoji belongs to an integration. */
  get managed(): boolean {
    return dataOf(this).managed ?? false;
  }

  /** The ids of the roles allowed to use the emoji; empty for everyone. */
  get roleIds(): readonly Snowflake[] {
    return dataOf(this).roles ?? [];
  }

  /** The URL of the image of the emoji. */
  url(options?: ImageOptions): string {
    return cdn.emoji(this.id, this.animated, options);
  }

  /**
   * Renames the emoji, or changes which roles can use it.
   * @see https://docs.discord.com/developers/resources/emoji#modify-guild-emoji
   */
  async edit(
    options: {
      name?: string;
      roles?: (Snowflake | { id: Snowflake })[] | null;
    },
    reason?: string
  ): Promise<GuildEmoji> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(ModifyGuildEmoji, [this.guildId, this.id], {
      body: { name: options.name, roles: options.roles?.map(idOf) },
      reason,
    });
    return entities.emoji(this.guildId, raw);
  }

  /**
   * Deletes the emoji.
   * @see https://docs.discord.com/developers/resources/emoji#delete-guild-emoji
   */
  async delete(reason?: string): Promise<void> {
    await ctxOf(this).rest.request(DeleteGuildEmoji, [this.guildId, this.id], {
      reason,
    });
  }

  /** `<:name:id>`: shows the emoji when put in a message. */
  toString(): string {
    return emojiMention(this.name, this.id, this.animated);
  }
}
