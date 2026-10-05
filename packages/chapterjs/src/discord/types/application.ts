import type { ImageData, Snowflake } from './common.js';
import type { RawGuild } from './guild.js';
import type { OAuth2Scope } from './oauth2.js';
import type { RawTeam } from './team.js';
import type { RawUser } from './user.js';

/**
 * Application Structure
 * @see https://docs.discord.com/developers/resources/application#application-object-application-structure
 */
export interface RawApplication {
  /** ID of the app */
  id: Snowflake;
  /** Name of the app */
  name: string;
  /** Icon hash of the app */
  icon: string | null;
  /** Description of the app */
  description: string;
  /** List of RPC origin URLs, if RPC is enabled */
  rpc_origins?: string[];
  /** When `false`, only the app owner can add the app to guilds */
  bot_public: boolean;
  /** When `true`, the app's bot will only join upon completion of the full OAuth2 code grant flow */
  bot_require_code_grant: boolean;
  /** Partial user object for the bot user associated with the app */
  bot?: Partial<RawUser>;
  /** URL of the app's Terms of Service */
  terms_of_service_url?: string;
  /** URL of the app's Privacy Policy */
  privacy_policy_url?: string;
  /** Partial user object for the owner of the app */
  owner?: Partial<RawUser>;
  /** Hex encoded key for verification in interactions and the GameSDK's GetTicket */
  verify_key: string;
  /** If the app belongs to a team, this will be a list of the members of that team */
  team: RawTeam | null;
  /** Guild associated with the app. For example, a developer support server. */
  guild_id?: Snowflake;
  /** Partial object of the associated guild */
  guild?: Partial<RawGuild>;
  /** If this app is a game sold on Discord, this field will be the id of the "Game SKU" that is created, if exists */
  primary_sku_id?: Snowflake;
  /** If this app is a game sold on Discord, this field will be the URL slug that links to the store page */
  slug?: string;
  /** App's default rich presence invite cover image hash */
  cover_image?: string;
  /** App's legacy public flags */
  flags?: number;
  /** App's public flags */
  flags_new?: string;
  /** Approximate count of guilds the app has been added to */
  approximate_guild_count?: number;
  /** Approximate count of users that have installed the app (authorized with `application.commands` as a scope) */
  approximate_user_install_count?: number;
  /** Approximate count of users that have OAuth2 authorizations for the app */
  approximate_user_authorization_count?: number;
  /** Array of redirect URIs for the app */
  redirect_uris?: string[];
  /** Interactions endpoint URL for the app */
  interactions_endpoint_url?: string | null;
  /** Role connection verification URL for the app */
  role_connections_verification_url?: string | null;
  /** Event webhooks URL for the app to receive webhook events */
  event_webhooks_url?: string | null;
  /** If webhook events are enabled for the app. `1` (default) means disabled, `2` means enabled, and `3` means disabled by Discord */
  event_webhooks_status?: ApplicationEventWebhookStatus;
  /** List of Webhook event types the app subscribes to */
  event_webhooks_types?: string[];
  /** List of tags describing the content and functionality of the app. Max of 5 tags. */
  tags?: string[];
  /** Settings for the app's default in-app authorization link, if enabled */
  install_params?: RawInstallParams;
  /** Default scopes and permissions for each supported installation context. Value for each key is an integration type configuration object */
  integration_types_config?: Partial<
    Record<
      `${ApplicationIntegrationType}`,
      RawApplicationIntegrationTypeConfiguration
    >
  >;
  /** Default custom authorization URL for the app, if enabled */
  custom_install_url?: string;
}

/**
 * Application Integration Types
 * @see https://docs.discord.com/developers/resources/application#application-object-application-integration-types
 */
export const ApplicationIntegrationType = {
  /** App is installable to servers */
  GuildInstall: 0,
  /** App is installable to users */
  UserInstall: 1,
} as const;
export type ApplicationIntegrationType =
  (typeof ApplicationIntegrationType)[keyof typeof ApplicationIntegrationType];

/**
 * Application Integration Type Configuration Object
 * @see https://docs.discord.com/developers/resources/application#application-object-application-integration-type-configuration-object
 */
export interface RawApplicationIntegrationTypeConfiguration {
  /** Install params for each installation context's default in-app authorization link */
  oauth2_install_params?: RawInstallParams;
}

/**
 * Application Event Webhook Status
 * @see https://docs.discord.com/developers/resources/application#application-object-application-event-webhook-status
 */
export const ApplicationEventWebhookStatus = {
  /** Webhook events are disabled by developer */
  Disabled: 1,
  /** Webhook events are enabled by developer */
  Enabled: 2,
  /** Webhook events are disabled by Discord, usually due to inactivity */
  DisabledByDiscord: 3,
} as const;
export type ApplicationEventWebhookStatus =
  (typeof ApplicationEventWebhookStatus)[keyof typeof ApplicationEventWebhookStatus];

/**
 * Application Flags
 * @see https://docs.discord.com/developers/resources/application#application-object-application-flags
 */
export const ApplicationFlags = {
  /** Indicates if an app uses the Auto Moderation API */
  ApplicationAutoModerationRuleCreateBadge: 1 << 6,
  /** Intent required for bots in **100 or more servers** to receive `presence_update` events */
  GatewayPresence: 1 << 12,
  /** Intent required for bots in under 100 servers to receive `presence_update` events, found on the **Bot** page in your app's settings */
  GatewayPresenceLimited: 1 << 13,
  /** Intent required for bots in **100 or more servers** to receive member-related events like `guild_member_add`. See the list of member-related events under `GUILD_MEMBERS` */
  GatewayGuildMembers: 1 << 14,
  /** Intent required for bots in under 100 servers to receive member-related events like `guild_member_add`, found on the **Bot** page in your app's settings. See the list of member-related events under `GUILD_MEMBERS` */
  GatewayGuildMembersLimited: 1 << 15,
  /** Indicates unusual growth of an app that prevents verification */
  VerificationPendingGuildLimit: 1 << 16,
  /** Indicates if an app is embedded within the Discord client (currently unavailable publicly) */
  Embedded: 1 << 17,
  /** Intent required for bots in **100 or more servers** to receive message content */
  GatewayMessageContent: 1 << 18,
  /** Intent required for bots in under 100 servers to receive message content, found on the **Bot** page in your app's settings */
  GatewayMessageContentLimited: 1 << 19,
  /** Indicates if an app has registered global application commands */
  ApplicationCommandBadge: 1 << 23,
} as const;
export type ApplicationFlags =
  (typeof ApplicationFlags)[keyof typeof ApplicationFlags];

/**
 * Install Params Structure
 * @see https://docs.discord.com/developers/resources/application#install-params-object-install-params-structure
 */
export interface RawInstallParams {
  /** Scopes to add the application to the server with */
  scopes: OAuth2Scope[];
  /** Permissions to request for the bot role */
  permissions: string;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/application#edit-current-application-json-params
 */
export interface EditCurrentApplicationJSONParams {
  /** Default custom authorization URL for the app, if enabled */
  custom_install_url?: string;
  /** Description of the app */
  description?: string;
  /** Role connection verification URL for the app */
  role_connections_verification_url?: string;
  /** Settings for the app's default in-app authorization link, if enabled */
  install_params?: RawInstallParams;
  /** Default scopes and permissions for each supported installation context. Value for each key is an integration type configuration object */
  integration_types_config?: Partial<
    Record<
      `${ApplicationIntegrationType}`,
      RawApplicationIntegrationTypeConfiguration
    >
  >;
  /** App's public flags */
  flags?: number;
  /** Icon for the app */
  icon?: ImageData | null;
  /** Default rich presence invite cover image for the app */
  cover_image?: ImageData | null;
  /** Interactions endpoint URL for the app */
  interactions_endpoint_url?: string;
  /** List of tags describing the content and functionality of the app (max of 20 characters per tag). Max of 5 tags. */
  tags?: string[];
  /** Event webhooks URL for the app to receive webhook events */
  event_webhooks_url?: string;
  /** If webhook events are enabled for the app. `1` to disable, and `2` to enable */
  event_webhooks_status?: ApplicationEventWebhookStatus;
  /** List of Webhook event types to subscribe to */
  event_webhooks_types?: string[];
}

/**
 * Activity Instance Object
 * @see https://docs.discord.com/developers/resources/application#get-application-activity-instance-activity-instance-object
 */
export interface RawActivityInstance {
  /** Application ID */
  application_id: Snowflake;
  /** Activity Instance ID */
  instance_id: string;
  /** Unique identifier for the launch */
  launch_id: Snowflake;
  /** Location the instance is running in */
  location: RawActivityLocation;
  /** IDs of the Users currently connected to the instance */
  users: Snowflake[];
}

/**
 * Activity Location Object
 * @see https://docs.discord.com/developers/resources/application#get-application-activity-instance-activity-location-object
 */
export interface RawActivityLocation {
  /** Unique identifier for the location */
  id: string;
  /** Enum describing kind of location */
  kind: 'gc' | 'pc';
  /** ID of the Channel */
  channel_id: Snowflake;
  /** ID of the Guild */
  guild_id?: Snowflake | null;
}
