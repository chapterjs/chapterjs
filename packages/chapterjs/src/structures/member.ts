import { Limits } from '../discord/api.js';
import { cdn, type ImageOptions } from '../discord/cdn.js';
import {
  AddGuildMemberRole,
  CreateGuildBan,
  ModifyCurrentMember,
  ModifyGuildMember,
  RemoveGuildMember,
  RemoveGuildMemberRole,
} from '../discord/endpoints.js';
import {
  applyTimeout,
  computeBasePermissions,
  Permissions,
} from '../discord/permissions.js';
import type { Snowflake } from '../discord/types/common.js';
import type { RawGuildMember } from '../discord/types/guild.js';
import { ctxOf, dataOf, idOf, Structure, toDate } from './base.js';
import type { GuildChannel } from './channel.js';
import type { Context } from './context.js';
import type { Guild } from './guild.js';
import type { Message } from './message.js';
import type { MessageInput } from './payload.js';
import type { Role } from './role.js';
import type { User } from './user.js';

/** The data of a member, without the user it belongs to. */
export type MemberData = Omit<RawGuildMember, 'user'>;

export interface BanOptions {
  /** Why, shown in the audit log of the server. */
  reason?: string;
  /**
   * Also deletes the messages the user sent in the last seconds given: from
   * 0 (the default, nothing) to 604800 (7 days).
   */
  deleteMessageSeconds?: number;
}

export interface MemberEditOptions {
  /** The nickname; `null` removes it. */
  nick?: string | null;
  /** Replaces every role of the member. */
  roles?: (Snowflake | Role)[];
  /** Mutes the member in voice channels. */
  mute?: boolean;
  /** Deafens the member in voice channels. */
  deaf?: boolean;
  /** Moves the member to another voice channel; `null` disconnects them. */
  voiceChannel?: Snowflake | { id: Snowflake } | null;
  /** Until when the member is timed out; `null` ends the timeout. */
  timeoutUntil?: Date | null;
}

/**
 * A user as a member of one server: nickname, roles, permissions.
 * @see https://docs.discord.com/developers/resources/guild#guild-member-object
 */
export class GuildMember extends Structure<MemberData> {
  /** The id of the server. */
  readonly guildId: Snowflake;
  /** The account of the member. */
  readonly user: User;

  constructor(ctx: Context, data: MemberData, guildId: Snowflake, user: User) {
    super(ctx, data);
    this.guildId = guildId;
    this.user = user;
  }

  /** The id of the user. */
  get id(): Snowflake {
    return this.user.id;
  }

  /** The server, when it is known. */
  get guild(): Guild | null {
    return ctxOf(this).cache.guilds.get(this.guildId) ?? null;
  }

  /** The nickname of the member in this server, when they have one. */
  get nick(): string | null {
    return dataOf(this).nick ?? null;
  }

  /** The name to show: nickname, or display name, or username. */
  get displayName(): string {
    return this.nick ?? this.user.displayName;
  }

  /** The ids of the roles of the member (@everyone is not listed). */
  get roleIds(): readonly Snowflake[] {
    return dataOf(this).roles;
  }

  /** The roles of the member, @everyone included, highest first. */
  get roles(): Role[] {
    const guild = this.guild;
    if (!guild) return [];
    const roles: Role[] = [];
    for (const id of [...this.roleIds, this.guildId]) {
      const role = guild.roles.get(id);
      if (role) roles.push(role);
    }
    return roles.sort((a, b) => (a.isHigherThan(b) ? -1 : 1));
  }

  /** The highest role of the member in the hierarchy. */
  get highestRole(): Role | null {
    return this.roles[0] ?? null;
  }

  /** When the member joined the server. */
  get joinedAt(): Date | null {
    return toDate(dataOf(this).joined_at);
  }

  /** Since when the member boosts the server. */
  get boostingSince(): Date | null {
    return toDate(dataOf(this).premium_since);
  }

  /** Whether the member has not passed the membership screening yet. */
  get pending(): boolean {
    return dataOf(this).pending ?? false;
  }

  /** Until when the member is timed out; `null` when they are not. */
  get timeoutUntil(): Date | null {
    const until = toDate(dataOf(this).communication_disabled_until);
    return until && until.getTime() > Date.now() ? until : null;
  }

  /** Whether the member is timed out right now. */
  get isTimedOut(): boolean {
    return this.timeoutUntil !== null;
  }

  /** Whether the member owns the server. */
  get isOwner(): boolean {
    return this.guild?.ownerId === this.id;
  }

  /**
   * What the member can do in the server (channels may change it: see
   * `permissionsIn`).
   * @see https://docs.discord.com/developers/topics/permissions#permission-overwrites
   */
  get permissions(): Permissions {
    const guild = this.guild;
    if (!guild) {
      throw new Error(
        'The permissions of this member are unknown: its server is not in the cache.'
      );
    }
    const base = computeBasePermissions({
      guildId: this.guildId,
      ownerId: guild.ownerId,
      userId: this.id,
      memberRoleIds: this.roleIds,
      roles: [...guild.roles.values()].map(role => ({
        id: role.id,
        permissions: role.permissions.bits,
      })),
    });
    return new Permissions(this.isTimedOut ? applyTimeout(base) : base);
  }

  /** What the member can do in a channel of the server. */
  permissionsIn(channel: GuildChannel): Permissions {
    return channel.permissionsFor(this);
  }

  /** The avatar of the member in this server, or else of their account. */
  avatarURL(options?: ImageOptions): string {
    const avatar = dataOf(this).avatar;
    return avatar
      ? cdn.memberAvatar(this.guildId, this.id, avatar, options)
      : this.user.avatarURL(options);
  }

  /**
   * Whether this member is above another one in the role hierarchy, which
   * is what allows to kick, ban or rename them.
   * @see https://docs.discord.com/developers/topics/permissions#permission-hierarchy
   */
  isHigherThan(other: GuildMember): boolean {
    if (this.isOwner) return true;
    if (other.isOwner) return false;
    const mine = this.highestRole;
    const theirs = other.highestRole;
    if (!mine || !theirs) return false;
    return mine.id !== theirs.id && mine.isHigherThan(theirs);
  }

  /**
   * Changes the member.
   * @see https://docs.discord.com/developers/resources/guild#modify-guild-member
   */
  async edit(
    options: MemberEditOptions,
    reason?: string
  ): Promise<GuildMember> {
    const { rest, entities } = ctxOf(this);
    if (
      typeof options.nick === 'string' &&
      options.nick.length > Limits.Nickname
    ) {
      throw new RangeError(
        `A nickname is ${Limits.Nickname} characters long at most, got ${options.nick.length}.`
      );
    }
    if (options.timeoutUntil) {
      const ms = options.timeoutUntil.getTime() - Date.now();
      if (!(ms > 0) || ms > Limits.TimeoutMaxDuration) {
        throw new RangeError(
          'A timeout ends in the future, 28 days from now at most.'
        );
      }
    }
    const raw = await rest.request(ModifyGuildMember, [this.guildId, this.id], {
      // `null` is meaningful for these fields; the documented type only
      // lists what they are when set.
      body: {
        nick: options.nick,
        roles: options.roles?.map(idOf),
        mute: options.mute,
        deaf: options.deaf,
        channel_id:
          options.voiceChannel === null || options.voiceChannel === undefined
            ? options.voiceChannel
            : idOf(options.voiceChannel),
        communication_disabled_until:
          options.timeoutUntil === null || options.timeoutUntil === undefined
            ? options.timeoutUntil
            : options.timeoutUntil.toISOString(),
      } as never,
      reason,
    });
    return entities.member(this.guildId, { ...raw, user: raw.user });
  }

  /** Changes the nickname of the member; `null` removes it. */
  async setNick(nick: string | null, reason?: string): Promise<GuildMember> {
    const { rest, entities, self } = ctxOf(this);
    if (self?.userId === this.id) {
      // A bot renames itself through another endpoint.
      // https://docs.discord.com/developers/resources/guild#modify-current-member
      const raw = await rest.request(ModifyCurrentMember, [this.guildId], {
        body: { nick },
        reason,
      });
      return entities.member(this.guildId, raw);
    }
    return this.edit({ nick }, reason);
  }

  /**
   * Gives a role to the member.
   * @see https://docs.discord.com/developers/resources/guild#add-guild-member-role
   */
  async addRole(role: Snowflake | Role, reason?: string): Promise<void> {
    await ctxOf(this).rest.request(
      AddGuildMemberRole,
      [this.guildId, this.id, idOf(role)],
      { reason }
    );
  }

  /**
   * Takes a role from the member.
   * @see https://docs.discord.com/developers/resources/guild#remove-guild-member-role
   */
  async removeRole(role: Snowflake | Role, reason?: string): Promise<void> {
    await ctxOf(this).rest.request(
      RemoveGuildMemberRole,
      [this.guildId, this.id, idOf(role)],
      { reason }
    );
  }

  /** Whether the member has a role. */
  hasRole(role: Snowflake | Role): boolean {
    const id = idOf(role);
    return id === this.guildId || this.roleIds.includes(id);
  }

  /**
   * Prevents the member from writing, reacting and speaking for a while.
   * @param duration how long, in milliseconds (28 days at most)
   */
  async timeout(duration: number, reason?: string): Promise<GuildMember> {
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new RangeError(
        `A timeout lasts a positive number of milliseconds, got ${duration}. Use removeTimeout() to end one.`
      );
    }
    return this.edit({ timeoutUntil: new Date(Date.now() + duration) }, reason);
  }

  /** Ends the timeout of the member. */
  async removeTimeout(reason?: string): Promise<GuildMember> {
    return this.edit({ timeoutUntil: null }, reason);
  }

  /**
   * Removes the member from the server; they can come back with an invite.
   * @see https://docs.discord.com/developers/resources/guild#remove-guild-member
   */
  async kick(reason?: string): Promise<void> {
    await ctxOf(this).rest.request(RemoveGuildMember, [this.guildId, this.id], {
      reason,
    });
  }

  /**
   * Bans the member from the server.
   * @see https://docs.discord.com/developers/resources/guild#create-guild-ban
   */
  async ban(options: BanOptions = {}): Promise<void> {
    await banUser(ctxOf(this), this.guildId, this.id, options);
  }

  /** Sends a private message to the member. */
  async send(message: MessageInput): Promise<Message> {
    return this.user.send(message);
  }

  /** `<@id>`: mentions the member when put in a message. */
  toString(): string {
    return this.user.toString();
  }
}

/** One mechanism to ban, used by members and servers. */
export async function banUser(
  ctx: Context,
  guildId: Snowflake,
  userId: Snowflake,
  { reason, deleteMessageSeconds }: BanOptions
): Promise<void> {
  if (
    deleteMessageSeconds !== undefined &&
    (!Number.isInteger(deleteMessageSeconds) ||
      deleteMessageSeconds < 0 ||
      deleteMessageSeconds > Limits.BanDeleteMessageSeconds)
  ) {
    throw new RangeError(
      `deleteMessageSeconds is a whole number between 0 and ${Limits.BanDeleteMessageSeconds} (7 days), got ${deleteMessageSeconds}.`
    );
  }
  await ctx.rest.request(CreateGuildBan, [guildId, userId], {
    body:
      deleteMessageSeconds === undefined
        ? {}
        : { delete_message_seconds: deleteMessageSeconds },
    reason,
  });
}
