import { cdn, type ImageOptions } from '../discord/cdn.js';
import { DeleteGuildRole, ModifyGuildRole } from '../discord/endpoints.js';
import { roleMention } from '../discord/formatting.js';
import { Permissions } from '../discord/permissions.js';
import type { Snowflake } from '../discord/types/common.js';
import type { ModifyGuildRoleJSONParams } from '../discord/types/guild.js';
import type { RawRole } from '../discord/types/permissions.js';
import { toSnakeCase, type Camelize } from '../util/case.js';
import { ctxOf, dataOf, IdStructure } from './base.js';
import type { Context } from './context.js';
import type { Guild } from './guild.js';
import type { GuildMember } from './member.js';

export type RoleEditOptions = Camelize<
  Omit<ModifyGuildRoleJSONParams, 'permissions'>
> & {
  permissions?: Permissions | ConstructorParameters<typeof Permissions>[0];
};

/**
 * A role of a server.
 * @see https://docs.discord.com/developers/topics/permissions#role-object
 */
export class Role extends IdStructure<RawRole> {
  /** The id of the server of the role. */
  readonly guildId: Snowflake;

  constructor(ctx: Context, data: RawRole, guildId: Snowflake) {
    super(ctx, data);
    this.guildId = guildId;
  }

  /** The server of the role, when it is known. */
  get guild(): Guild | null {
    return ctxOf(this).cache.guilds.get(this.guildId) ?? null;
  }

  /** The name of the role. */
  get name(): string {
    return dataOf(this).name;
  }

  /** The color as a number (`0xff0000`); `0` means no color. */
  get color(): number {
    return dataOf(this).colors?.primary_color ?? dataOf(this).color;
  }

  /** Whether members with this role are shown apart in the member list. */
  get hoist(): boolean {
    return dataOf(this).hoist;
  }

  /** Where the role is in the hierarchy: the higher, the more powerful. */
  get position(): number {
    return dataOf(this).position;
  }

  /** What the role allows in the server. */
  get permissions(): Permissions {
    return new Permissions(dataOf(this).permissions);
  }

  /** Whether the role belongs to an integration (a bot, boosters...). */
  get managed(): boolean {
    return dataOf(this).managed;
  }

  /** Whether everyone can mention the role. */
  get mentionable(): boolean {
    return dataOf(this).mentionable;
  }

  /** The standard emoji shown next to the role, when it has one. */
  get unicodeEmoji(): string | null {
    return dataOf(this).unicode_emoji ?? null;
  }

  /** Whether this is the @everyone role, which every member has. */
  get isEveryone(): boolean {
    return this.id === this.guildId;
  }

  /** The members that have this role, among the ones the bot knows. */
  get members(): GuildMember[] {
    const guild = this.guild;
    if (!guild) return [];
    return [...guild.members.values()].filter(member =>
      member.roleIds.includes(this.id)
    );
  }

  /** The URL of the icon of the role, when it has one. */
  iconURL(options?: ImageOptions): string | null {
    const icon = dataOf(this).icon;
    return icon ? cdn.roleIcon(this.id, icon, options) : null;
  }

  /**
   * Whether this role is above another one in the hierarchy. With the same
   * position, the oldest role is above.
   * @see https://docs.discord.com/developers/topics/permissions#permission-hierarchy
   */
  isHigherThan(other: Role): boolean {
    if (this.position !== other.position) {
      return this.position > other.position;
    }
    return BigInt(this.id) < BigInt(other.id);
  }

  /**
   * Changes the role.
   * @see https://docs.discord.com/developers/resources/guild#modify-guild-role
   */
  async edit(options: RoleEditOptions, reason?: string): Promise<Role> {
    const { rest, entities } = ctxOf(this);
    const { permissions, ...rest_ } = options;
    const body = toSnakeCase<ModifyGuildRoleJSONParams>(rest_);
    if (permissions !== undefined) {
      body.permissions = new Permissions(permissions).toString();
    }
    const raw = await rest.request(ModifyGuildRole, [this.guildId, this.id], {
      body,
      reason,
    });
    return entities.role(this.guildId, raw);
  }

  /**
   * Deletes the role.
   * @see https://docs.discord.com/developers/resources/guild#delete-guild-role
   */
  async delete(reason?: string): Promise<void> {
    await ctxOf(this).rest.request(DeleteGuildRole, [this.guildId, this.id], {
      reason,
    });
  }

  /** `<@&id>`: mentions the role when put in a message. */
  toString(): string {
    return this.isEveryone ? '@everyone' : roleMention(this.id);
  }
}
