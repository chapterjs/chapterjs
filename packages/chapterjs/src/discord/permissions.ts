import type { Snowflake } from './types/common.js';
import { PermissionFlags } from './types/permissions.js';

export type PermissionName = keyof typeof PermissionFlags;

/** A permission, or several: by name, as bits, or as a set. */
export type PermissionResolvable =
  PermissionName | bigint | Permissions | readonly (PermissionName | bigint)[];

/** Every permission that exists, combined. */
export const ALL_PERMISSIONS: bigint = Object.values(PermissionFlags).reduce(
  (all, flag) => all | flag,
  0n
);

/**
 * Permissions that only make sense on a moderator: Discord asks for
 * two-factor authentication to use them on servers that require it.
 * @see https://docs.discord.com/developers/topics/permissions#permissions-bitwise-permission-flags
 */
export const ELEVATED_PERMISSIONS: readonly PermissionName[] = [
  'KickMembers',
  'BanMembers',
  'Administrator',
  'ManageChannels',
  'ManageGuild',
  'ManageMessages',
  'ManageRoles',
  'ManageWebhooks',
  'ManageGuildExpressions',
  'ManageThreads',
  'ViewCreatorMonetizationAnalytics',
];

function resolve(permission: PermissionResolvable): bigint {
  if (typeof permission === 'bigint') return permission;
  if (permission instanceof Permissions) return permission.bits;
  if (typeof permission === 'string') {
    const flag = PermissionFlags[permission];
    if (flag === undefined) {
      throw new TypeError(
        `"${permission}" is not a permission. Permissions are: ${Object.keys(PermissionFlags).join(', ')}.`
      );
    }
    return flag;
  }
  if (Array.isArray(permission)) {
    return permission.reduce<bigint>((bits, one) => bits | resolve(one), 0n);
  }
  throw new TypeError(
    `A permission is a name like "BanMembers", got ${typeof permission}.`
  );
}

/**
 * A set of permissions that never changes: every operation returns a new
 * set. Discord serializes permissions as text because they don't fit in a
 * regular number.
 * @see https://docs.discord.com/developers/topics/permissions
 */
export class Permissions {
  /** The permissions as one number, each bit being a permission. */
  readonly bits: bigint;

  constructor(bits: PermissionResolvable | string = 0n) {
    this.bits =
      typeof bits === 'string' && /^\d+$/.test(bits)
        ? BigInt(bits)
        : resolve(bits as PermissionResolvable);
    Object.freeze(this);
  }

  /**
   * Whether every given permission is in the set. An administrator has
   * every permission, unless `{ checkAdmin: false }` is passed.
   */
  has(
    permission: PermissionResolvable,
    { checkAdmin = true }: { checkAdmin?: boolean } = {}
  ): boolean {
    if (checkAdmin && (this.bits & PermissionFlags.Administrator) !== 0n) {
      return true;
    }
    const wanted = resolve(permission);
    return (this.bits & wanted) === wanted;
  }

  /** Whether at least one of the given permissions is in the set. */
  any(
    permission: PermissionResolvable,
    { checkAdmin = true }: { checkAdmin?: boolean } = {}
  ): boolean {
    if (checkAdmin && (this.bits & PermissionFlags.Administrator) !== 0n) {
      return true;
    }
    return (this.bits & resolve(permission)) !== 0n;
  }

  /** The given permissions that are not in the set, by name. */
  missing(permission: PermissionResolvable): PermissionName[] {
    if ((this.bits & PermissionFlags.Administrator) !== 0n) return [];
    return new Permissions(resolve(permission) & ~this.bits).toArray();
  }

  /** A new set with the given permissions added. */
  add(permission: PermissionResolvable): Permissions {
    return new Permissions(this.bits | resolve(permission));
  }

  /** A new set without the given permissions. */
  remove(permission: PermissionResolvable): Permissions {
    return new Permissions(this.bits & ~resolve(permission));
  }

  /** The names of the permissions in the set, in the order of the docs. */
  toArray(): PermissionName[] {
    return (Object.keys(PermissionFlags) as PermissionName[]).filter(
      name => (this.bits & PermissionFlags[name]) !== 0n
    );
  }

  /** The text Discord expects in a request. */
  toString(): string {
    return this.bits.toString();
  }

  /** The text Discord expects in a request. */
  toJSON(): string {
    return this.toString();
  }
}

/** What the permission computation needs to know about a role. */
export interface PermissionRole {
  id: Snowflake;
  permissions: bigint;
}

/** What the permission computation needs to know about an overwrite. */
export interface PermissionOverwrite {
  id: Snowflake;
  allow: bigint;
  deny: bigint;
}

/**
 * The permissions of a member in a server, before channel overwrites:
 * `compute_base_permissions` of the documentation.
 * @see https://docs.discord.com/developers/topics/permissions#permission-overwrites
 */
export function computeBasePermissions(input: {
  guildId: Snowflake;
  ownerId: Snowflake;
  userId: Snowflake;
  /** The ids of the roles of the member (@everyone is implied). */
  memberRoleIds: readonly Snowflake[];
  /** Every role of the server, @everyone included. */
  roles: Iterable<PermissionRole>;
}): bigint {
  if (input.ownerId === input.userId) return ALL_PERMISSIONS;
  const owned = new Set(input.memberRoleIds);
  let permissions = 0n;
  for (const role of input.roles) {
    // The @everyone role has the id of the server.
    if (role.id === input.guildId || owned.has(role.id)) {
      permissions |= role.permissions;
    }
  }
  if ((permissions & PermissionFlags.Administrator) !== 0n) {
    return ALL_PERMISSIONS;
  }
  return permissions;
}

/**
 * The permissions of a member in a channel, from their server permissions:
 * `compute_overwrites` of the documentation.
 * @see https://docs.discord.com/developers/topics/permissions#permission-overwrites
 */
export function computeOverwrites(
  basePermissions: bigint,
  input: {
    guildId: Snowflake;
    userId: Snowflake;
    memberRoleIds: readonly Snowflake[];
    overwrites: Iterable<PermissionOverwrite>;
  }
): bigint {
  if ((basePermissions & PermissionFlags.Administrator) !== 0n) {
    return ALL_PERMISSIONS;
  }
  const owned = new Set(input.memberRoleIds);
  let everyone: PermissionOverwrite | undefined;
  let member: PermissionOverwrite | undefined;
  let allow = 0n;
  let deny = 0n;
  for (const overwrite of input.overwrites) {
    if (overwrite.id === input.guildId) everyone = overwrite;
    else if (overwrite.id === input.userId) member = overwrite;
    else if (owned.has(overwrite.id)) {
      allow |= overwrite.allow;
      deny |= overwrite.deny;
    }
  }
  let permissions = basePermissions;
  if (everyone) {
    permissions &= ~everyone.deny;
    permissions |= everyone.allow;
  }
  permissions &= ~deny;
  permissions |= allow;
  if (member) {
    permissions &= ~member.deny;
    permissions |= member.allow;
  }
  return permissions;
}

/**
 * Removes what a member can't do in practice in a channel they can't see
 * or can't write in.
 * @see https://docs.discord.com/developers/topics/permissions#implicit-permissions
 */
export function applyImplicitPermissions(permissions: bigint): bigint {
  if ((permissions & PermissionFlags.Administrator) !== 0n) return permissions;
  if ((permissions & PermissionFlags.ViewChannel) === 0n) return 0n;
  if ((permissions & PermissionFlags.SendMessages) === 0n) {
    permissions &= ~(
      PermissionFlags.MentionEveryone |
      PermissionFlags.SendTtsMessages |
      PermissionFlags.AttachFiles |
      PermissionFlags.EmbedLinks
    );
  }
  return permissions;
}

/**
 * What is left of the permissions of a timed out member.
 * @see https://docs.discord.com/developers/topics/permissions#permissions-for-timed-out-members
 */
export function applyTimeout(permissions: bigint): bigint {
  if ((permissions & PermissionFlags.Administrator) !== 0n) return permissions;
  return (
    permissions &
    (PermissionFlags.ViewChannel | PermissionFlags.ReadMessageHistory)
  );
}
