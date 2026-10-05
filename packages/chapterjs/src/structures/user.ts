import { cdn, type ImageOptions } from '../discord/cdn.js';
import { CreateDm, GetUser } from '../discord/endpoints.js';
import { userMention } from '../discord/formatting.js';
import type { Locale } from '../discord/types/common.js';
import { UserFlags, type RawUser } from '../discord/types/user.js';
import { ctxOf, dataOf, IdStructure } from './base.js';
import type { DMChannel } from './channel.js';
import type { Message } from './message.js';
import type { MessageInput } from './payload.js';

export type UserFlagName = keyof typeof UserFlags;

/**
 * A Discord account, the same in every server.
 * @see https://docs.discord.com/developers/resources/user#user-object
 */
export class User extends IdStructure<RawUser> {
  /** The unique name of the account (`@name`). */
  get username(): string {
    return dataOf(this).username;
  }

  /** The name shown in Discord, when the user chose one. */
  get globalName(): string | null {
    return dataOf(this).global_name ?? null;
  }

  /** The name to show: the display name, or else the username. */
  get displayName(): string {
    return this.globalName ?? this.username;
  }

  /** `"0"` for users on the current username system. */
  get discriminator(): string {
    return dataOf(this).discriminator;
  }

  /** Whether the account is a bot. */
  get bot(): boolean {
    return dataOf(this).bot ?? false;
  }

  /** Whether the account is an official Discord system account. */
  get system(): boolean {
    return dataOf(this).system ?? false;
  }

  /** The hash of the avatar; use `avatarURL()` to get the image. */
  get avatar(): string | null {
    return dataOf(this).avatar;
  }

  /** The hash of the banner; use `bannerURL()` to get the image. */
  get banner(): string | null {
    return dataOf(this).banner ?? null;
  }

  /** The banner color, as a number (`0xff0000`). */
  get accentColor(): number | null {
    return dataOf(this).accent_color ?? null;
  }

  /** Only known for the bot itself. */
  get locale(): Locale | null {
    return dataOf(this).locale ?? null;
  }

  /** The public badges of the account, by name. */
  get flags(): UserFlagName[] {
    const bits = dataOf(this).public_flags ?? dataOf(this).flags ?? 0;
    return (Object.keys(UserFlags) as UserFlagName[]).filter(
      name => (bits & UserFlags[name]) !== 0
    );
  }

  /** The URL of the avatar; of the default one when none is set. */
  avatarURL(options?: ImageOptions): string {
    return this.avatar
      ? cdn.userAvatar(this.id, this.avatar, options)
      : cdn.defaultUserAvatar(this.id, this.discriminator);
  }

  /** The URL of the banner, when one is set. */
  bannerURL(options?: ImageOptions): string | null {
    return this.banner ? cdn.userBanner(this.id, this.banner, options) : null;
  }

  /** Asks Discord for the latest data of this user. */
  async fetch(): Promise<User> {
    const { rest, entities } = ctxOf(this);
    return entities.user(await rest.request(GetUser, [this.id]));
  }

  /**
   * Opens the private conversation with this user.
   * @see https://docs.discord.com/developers/resources/user#create-dm
   */
  async createDM(): Promise<DMChannel> {
    const { rest, entities, cache } = ctxOf(this);
    for (const channel of cache.channels.values()) {
      if (channel.isDM() && channel.recipientId === this.id) return channel;
    }
    const raw = await rest.request(CreateDm, [], {
      body: { recipient_id: this.id },
    });
    return entities.channel(raw) as DMChannel;
  }

  /** Sends a private message to this user. */
  async send(message: MessageInput): Promise<Message> {
    return (await this.createDM()).send(message);
  }

  /** `<@id>`: mentions the user when put in a message. */
  toString(): string {
    return userMention(this.id);
  }
}
