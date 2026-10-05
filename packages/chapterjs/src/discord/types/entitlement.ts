import type { ISO8601Timestamp, Snowflake } from './common.js';

/**
 * Entitlement Structure
 * @see https://docs.discord.com/developers/resources/entitlement#entitlement-object-entitlement-structure
 */
export interface RawEntitlement {
  /** ID of the entitlement */
  id: Snowflake;
  /** ID of the SKU */
  sku_id: Snowflake;
  /** ID of the parent application */
  application_id: Snowflake;
  /** ID of the user that is granted access to the entitlement's sku */
  user_id?: Snowflake;
  /** Type of entitlement */
  type: EntitlementType;
  /** Entitlement was deleted */
  deleted: boolean;
  /** Start date at which the entitlement is valid. */
  starts_at: ISO8601Timestamp | null;
  /** Date at which the entitlement is no longer valid. */
  ends_at: ISO8601Timestamp | null;
  /** ID of the guild that is granted access to the entitlement's sku */
  guild_id?: Snowflake;
  /** For consumable items, whether or not the entitlement has been consumed */
  consumed?: boolean;
}

/**
 * Entitlement Types
 * @see https://docs.discord.com/developers/resources/entitlement#entitlement-object-entitlement-types
 */
export const EntitlementType = {
  /** Entitlement was purchased by user */
  Purchase: 1,
  /** Entitlement for Discord Nitro subscription */
  PremiumSubscription: 2,
  /** Entitlement was gifted by developer */
  DeveloperGift: 3,
  /** Entitlement was purchased by a dev in application test mode */
  TestModePurchase: 4,
  /** Entitlement was granted when the SKU was free */
  FreePurchase: 5,
  /** Entitlement was gifted by another user */
  UserGift: 6,
  /** Entitlement was claimed by user for free as a Nitro Subscriber */
  PremiumPurchase: 7,
  /** Entitlement was purchased as an app subscription */
  ApplicationSubscription: 8,
} as const;
export type EntitlementType =
  (typeof EntitlementType)[keyof typeof EntitlementType];

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/entitlement#list-entitlements-query-string-params
 */
export interface ListEntitlementsQuery {
  /** User ID to look up entitlements for */
  user_id?: Snowflake;
  /** Optional list of SKU IDs to check entitlements for */
  sku_ids?: string;
  /** Retrieve entitlements before this entitlement ID */
  before?: Snowflake;
  /** Retrieve entitlements after this entitlement ID */
  after?: Snowflake;
  /** Number of entitlements to return, 1-100, default 100 */
  limit?: number;
  /** Guild ID to look up entitlements for */
  guild_id?: Snowflake;
  /** Whether or not ended entitlements should be omitted. Defaults to false, ended entitlements are included by default. */
  exclude_ended?: boolean;
  /** Whether or not deleted entitlements should be omitted. Defaults to true, deleted entitlements are not included by default. */
  exclude_deleted?: boolean;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/entitlement#create-test-entitlement-json-params
 */
export interface CreateTestEntitlementJSONParams {
  /** ID of the SKU to grant the entitlement to */
  sku_id: string;
  /** ID of the guild or user to grant the entitlement to */
  owner_id: string;
  /** `1` for a guild subscription, `2` for a user subscription */
  owner_type: 1 | 2;
}
