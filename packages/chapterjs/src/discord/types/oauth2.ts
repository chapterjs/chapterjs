import type { RawApplication } from './application.js';
import type { ISO8601Timestamp } from './common.js';
import type { RawUser } from './user.js';

/**
 * Response Structure
 * @see https://docs.discord.com/developers/topics/oauth2#get-current-authorization-information-response-structure
 */
export interface GetCurrentAuthorizationInformationResponse {
  /** the current application */
  application: Partial<RawApplication>;
  /** the scopes the user has authorized the application for */
  scopes: string[];
  /** when the access token expires */
  expires: ISO8601Timestamp;
  /** the user who has authorized, if the user has authorized with the `identify` scope */
  user?: RawUser;
}

/**
 * OAuth2 Scopes
 * @see https://docs.discord.com/developers/topics/oauth2#shared-resources-oauth2-scopes
 */
export type OAuth2Scope =
  | 'activities.read'
  | 'activities.write'
  | 'applications.builds.read'
  | 'applications.builds.upload'
  | 'applications.commands'
  | 'applications.commands.update'
  | 'applications.commands.permissions.update'
  | 'applications.entitlements'
  | 'applications.store.update'
  | 'bot'
  | 'connections'
  | 'dm_channels.read'
  | 'email'
  | 'gdm.join'
  | 'guilds'
  | 'guilds.join'
  | 'guilds.members.read'
  | 'identify'
  | 'identify.premium'
  | 'messages.read'
  | 'relationships.read'
  | 'role_connections.write'
  | 'rpc'
  | 'rpc.activities.write'
  | 'rpc.notifications.read'
  | 'rpc.voice.read'
  | 'rpc.voice.write'
  | 'voice'
  | 'webhook.incoming';
