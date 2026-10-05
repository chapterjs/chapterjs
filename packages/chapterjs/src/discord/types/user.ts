import type { ImageData, Locale, Snowflake } from './common.js';
import type { RawIntegration } from './guild.js';

/**
 * User Structure
 * @see https://docs.discord.com/developers/resources/user#user-object-user-structure
 */
export interface RawUser {
  /** the user's id */
  id: Snowflake;
  /** the user's username, not unique across the platform */
  username: string;
  /** the user's Discord-tag */
  discriminator: string;
  /** the user's display name, if it is set */
  global_name: string | null;
  /** the user's avatar hash */
  avatar: string | null;
  /** whether the user belongs to an OAuth2 application */
  bot?: boolean;
  /** whether the user is an Official Discord System user (part of the urgent message system) */
  system?: boolean;
  /** whether the user has two factor enabled on their account */
  mfa_enabled?: boolean;
  /** the user's banner hash */
  banner?: string | null;
  /** the user's banner color encoded as an integer representation of hexadecimal color code */
  accent_color?: number | null;
  /** the user's chosen language option */
  locale?: Locale;
  /** whether the email on this account has been verified */
  verified?: boolean;
  /** the user's email */
  email?: string | null;
  /** the flags on a user's account */
  flags?: number;
  /** the type of Nitro subscription on a user's account */
  premium_type?: UserPremiumType;
  /** the public flags on a user's account */
  public_flags?: number;
  /** data for the user's avatar decoration */
  avatar_decoration_data?: RawAvatarDecorationData | null;
  /** data for the user's collectibles */
  collectibles?: RawCollectibles | null;
  /** the user's primary guild */
  primary_guild?: RawUserPrimaryGuild | null;
}

/**
 * User Flags
 * @see https://docs.discord.com/developers/resources/user#user-object-user-flags
 */
export const UserFlags = {
  /** Discord Employee */
  Staff: 1 << 0,
  /** Partnered Server Owner */
  Partner: 1 << 1,
  /** HypeSquad Events Member */
  Hypesquad: 1 << 2,
  /** Bug Hunter Level 1 */
  BugHunterLevel1: 1 << 3,
  /** House Bravery Member */
  HypesquadOnlineHouse1: 1 << 6,
  /** House Brilliance Member */
  HypesquadOnlineHouse2: 1 << 7,
  /** House Balance Member */
  HypesquadOnlineHouse3: 1 << 8,
  /** Early Nitro Supporter */
  PremiumEarlySupporter: 1 << 9,
  /** User is a team */
  TeamPseudoUser: 1 << 10,
  /** Bug Hunter Level 2 */
  BugHunterLevel2: 1 << 14,
  /** Verified Bot */
  VerifiedBot: 1 << 16,
  /** Early Verified Bot Developer */
  VerifiedDeveloper: 1 << 17,
  /** Moderator Programs Alumni */
  CertifiedModerator: 1 << 18,
  /** Bot uses only HTTP interactions and is shown in the online member list */
  BotHttpInteractions: 1 << 19,
} as const;
export type UserFlags = (typeof UserFlags)[keyof typeof UserFlags];

/**
 * Premium Types
 * @see https://docs.discord.com/developers/resources/user#user-object-premium-types
 */
export const UserPremiumType = {
  None: 0,
  NitroClassic: 1,
  Nitro: 2,
  NitroBasic: 3,
} as const;
export type UserPremiumType =
  (typeof UserPremiumType)[keyof typeof UserPremiumType];

/**
 * User Primary Guild
 * @see https://docs.discord.com/developers/resources/user#user-object-user-primary-guild
 */
export interface RawUserPrimaryGuild {
  /** the id of the user's primary guild */
  identity_guild_id: Snowflake | null;
  /** whether the user is displaying the primary guild's server tag. This can be `null` if the system clears the identity, e.g. the server no longer supports tags. This will be `false` if the user manually removes their tag. */
  identity_enabled: boolean | null;
  /** the text of the user's server tag. Limited to 4 characters */
  tag: string | null;
  /** the server tag badge hash */
  badge: string | null;
}

/**
 * Avatar Decoration Data Structure
 * @see https://docs.discord.com/developers/resources/user#avatar-decoration-data-object-avatar-decoration-data-structure
 */
export interface RawAvatarDecorationData {
  /** the avatar decoration hash */
  asset: string;
  /** id of the avatar decoration's SKU */
  sku_id: Snowflake;
}

/**
 * Collectible Structure
 * @see https://docs.discord.com/developers/resources/user#collectibles-collectible-structure
 */
export interface RawCollectibles {
  /** object mapping of nameplate data */
  nameplate?: RawNameplate;
}

/**
 * Nameplate Structure
 * @see https://docs.discord.com/developers/resources/user#nameplate-nameplate-structure
 */
export interface RawNameplate {
  /** id of the nameplate SKU */
  sku_id: Snowflake;
  /** path to the nameplate asset */
  asset: string;
  /** the label of this nameplate. Currently unused */
  label: string;
  /** background color of the nameplate, one of: `crimson`, `berry`, `sky`, `teal`, `forest`, `bubble_gum`, `violet`, `cobalt`, `clover`, `lemon`, `white` */
  palette: string;
}

/**
 * Connection Structure
 * @see https://docs.discord.com/developers/resources/user#connection-object-connection-structure
 */
export interface RawConnection {
  /** id of the connection account */
  id: string;
  /** the username of the connection account */
  name: string;
  /** the service of this connection */
  type: ConnectionService;
  /** whether the connection is revoked */
  revoked?: boolean;
  /** an array of partial server integrations */
  integrations?: Partial<RawIntegration>[];
  /** whether the connection is verified */
  verified: boolean;
  /** whether friend sync is enabled for this connection */
  friend_sync: boolean;
  /** whether activities related to this connection will be shown in presence updates */
  show_activity: boolean;
  /** whether this connection has a corresponding third party OAuth2 token */
  two_way_link: boolean;
  /** visibility of this connection */
  visibility: ConnectionVisibilityType;
}

/**
 * Services
 * @see https://docs.discord.com/developers/resources/user#connection-object-services
 */
export const ConnectionService = {
  AmazonMusic: 'amazon-music',
  BungieNet: 'bungie',
  Bluesky: 'bluesky',
  Crunchyroll: 'crunchyroll',
  Domain: 'domain',
  EBay: 'ebay',
  EpicGames: 'epicgames',
  Facebook: 'facebook',
  GitHub: 'github',
  Instagram: 'instagram',
  Mastodon: 'mastodon',
  PayPal: 'paypal',
  PlayStationNetwork: 'playstation',
  Reddit: 'reddit',
  Roblox: 'roblox',
  Spotify: 'spotify',
  Skype: 'skype',
  Steam: 'steam',
  TikTok: 'tiktok',
  Twitch: 'twitch',
  XTwitter: 'twitter',
  Xbox: 'xbox',
  YouTube: 'youtube',
} as const;
export type ConnectionService =
  (typeof ConnectionService)[keyof typeof ConnectionService];

/**
 * Visibility Types
 * @see https://docs.discord.com/developers/resources/user#connection-object-visibility-types
 */
export const ConnectionVisibilityType = {
  /** invisible to everyone except the user themselves */
  None: 0,
  /** visible to everyone */
  Everyone: 1,
} as const;
export type ConnectionVisibilityType =
  (typeof ConnectionVisibilityType)[keyof typeof ConnectionVisibilityType];

/**
 * Application Role Connection Structure
 * @see https://docs.discord.com/developers/resources/user#application-role-connection-object-application-role-connection-structure
 */
export interface RawApplicationRoleConnection {
  /** the vanity name of the platform a bot has connected (max 50 characters) */
  platform_name: string | null;
  /** object mapping application role connection metadata keys to their `string`-ified value (max 100 characters) for the user on the platform a bot has connected */
  metadata: Record<string, string>;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/user#modify-current-user-json-params
 */
export interface ModifyCurrentUserJSONParams {
  /** user's username, if changed may cause the user's discriminator to be randomized. */
  username?: string;
  /** if passed, modifies the user's avatar */
  avatar?: ImageData | null;
  /** if passed, modifies the user's banner */
  banner?: ImageData | null;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/user#get-current-user-guilds-query-string-params
 */
export interface GetCurrentUserGuildsQuery {
  /** get guilds before this guild ID */
  before?: Snowflake;
  /** get guilds after this guild ID */
  after?: Snowflake;
  /** max number of guilds to return (1-200) */
  limit?: number;
  /** only return guilds in this shard (`0` to `max_concurrency - 1`) */
  shard?: number;
  /** include approximate member and presence counts in response */
  with_counts?: boolean;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/user#create-dm-json-params
 */
export interface CreateDmJSONParams {
  /** the recipient to open a DM channel with */
  recipient_id: Snowflake;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/user#create-group-dm-json-params
 */
export interface CreateGroupDmJSONParams {
  /** access tokens of users that have granted your app the `gdm.join` scope */
  access_tokens: string[];
  /** a dictionary of user ids to their respective nicknames */
  nicks: Record<Snowflake, string>;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/user#update-current-user-application-role-connection-json-params
 */
export interface UpdateCurrentUserApplicationRoleConnectionJSONParams {
  /** the vanity name of the platform a bot has connected (max 50 characters) */
  platform_name?: string;
  /** the username on the platform a bot has connected (max 100 characters) */
  platform_username?: string;
  /** object mapping application role connection metadata keys to their `string`-ified value (max 100 characters) for the user on the platform a bot has connected */
  metadata?: Record<string, string>;
}
