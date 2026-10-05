import type { Snowflake } from './common.js';
import type { RawUser } from './user.js';

/**
 * Team Member Role Types
 * @see https://docs.discord.com/developers/topics/teams#team-member-roles-team-member-role-types
 */
export const TeamMemberRole = {
  /** Owners are the most permissible role, and can take destructive, irreversible actions like deleting team-owned apps or the team itself. Teams are limited to 1 owner. */
  /** Admins have similar access as owners, except they cannot take destructive actions on the team or team-owned apps. */
  Admin: 'admin',
  /** Developers can access information about team-owned apps, like the client secret or public key. They can also take limited actions on team-owned apps, like configuring interaction endpoints or resetting the bot token. Members with the Developer role *cannot* manage the team or its members, or take destructive actions on team-owned apps. */
  Developer: 'developer',
  /** Read-only members can access information about a team and any team-owned apps. Some examples include getting the IDs of applications and exporting payout records. Members can also invite bots associated with team-owned apps that are marked private. */
  ReadOnly: 'read_only',
} as const;
export type TeamMemberRole =
  (typeof TeamMemberRole)[keyof typeof TeamMemberRole];

/**
 * Team Object
 * @see https://docs.discord.com/developers/topics/teams#data-models-team-object
 */
export interface RawTeam {
  /** Hash of the image of the team's icon */
  icon: string | null;
  /** Unique ID of the team */
  id: Snowflake;
  /** Members of the team */
  members: RawTeamMember[];
  /** Name of the team */
  name: string;
  /** User ID of the current team owner */
  owner_user_id: Snowflake;
}

/**
 * Team Member Object
 * @see https://docs.discord.com/developers/topics/teams#data-models-team-member-object
 */
export interface RawTeamMember {
  /** User's membership state on the team */
  membership_state: TeamMembershipState;
  /** ID of the parent team of which they are a member */
  team_id: Snowflake;
  /** User object of the team member */
  user: RawUser;
  /** Role of the team member */
  role: TeamMemberRole;
}

/**
 * Membership State Enum
 * @see https://docs.discord.com/developers/topics/teams#data-models-membership-state-enum
 */
export const TeamMembershipState = {
  Invited: 1,
  Accepted: 2,
} as const;
export type TeamMembershipState =
  (typeof TeamMembershipState)[keyof typeof TeamMembershipState];
