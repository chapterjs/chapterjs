import { DeleteInvite } from '../discord/endpoints.js';
import type { Snowflake } from '../discord/types/common.js';
import type { RawInvite, RawInviteMetadata } from '../discord/types/invite.js';
import { ctxOf, dataOf, Structure, toDate } from './base.js';
import type { Context } from './context.js';
import type { User } from './user.js';

export type InviteData = Omit<RawInvite, 'inviter'> &
  Partial<RawInviteMetadata>;

/**
 * An invite to a server.
 * @see https://docs.discord.com/developers/resources/invite#invite-object
 */
export class Invite extends Structure<InviteData> {
  /** Who created the invite, when Discord says it. */
  readonly inviter: User | null;

  constructor(ctx: Context, data: InviteData, inviter: User | null) {
    super(ctx, data);
    this.inviter = inviter;
  }

  /** The unique code of the invite (`discord.gg/code`). */
  get code(): string {
    return dataOf(this).code;
  }

  /** The link to share. */
  get url(): string {
    return `https://discord.gg/${this.code}`;
  }

  /** The id of the server the invite leads to. */
  get guildId(): Snowflake | null {
    return dataOf(this).guild?.id ?? null;
  }

  /** The id of the channel the invite leads to. */
  get channelId(): Snowflake | null {
    return dataOf(this).channel?.id ?? null;
  }

  /** When the invite stops working; `null` when it never does. */
  get expiresAt(): Date | null {
    return toDate(dataOf(this).expires_at);
  }

  /** How many times the invite was used, when Discord says it. */
  get uses(): number | null {
    return dataOf(this).uses ?? null;
  }

  /** How many times the invite can be used; `0` means no limit. */
  get maxUses(): number | null {
    return dataOf(this).max_uses ?? null;
  }

  /** Whether members who joined with it are kicked when they go offline. */
  get temporary(): boolean {
    return dataOf(this).temporary ?? false;
  }

  /**
   * Deletes the invite: its link stops working.
   * @see https://docs.discord.com/developers/resources/invite#delete-invite
   */
  async delete(reason?: string): Promise<void> {
    await ctxOf(this).rest.request(DeleteInvite, [this.code], { reason });
  }

  /** The link to share. */
  toString(): string {
    return this.url;
  }
}
