import type { Snowflake } from './common.js';

/**
 * SKU Structure
 * @see https://docs.discord.com/developers/resources/sku#sku-object-sku-structure
 */
export interface RawSku {
  /** ID of SKU */
  id: Snowflake;
  /** Type of SKU */
  type: SkuType;
  /** ID of the parent application */
  application_id: Snowflake;
  /** Customer-facing name of your premium offering */
  name: string;
  /** System-generated URL slug based on the SKU's name */
  slug: string;
  /** SKU flags combined as a bitfield */
  flags: number;
}

/**
 * SKU Types
 * @see https://docs.discord.com/developers/resources/sku#sku-object-sku-types
 */
export const SkuType = {
  /** Durable one-time purchase */
  Durable: 2,
  /** Consumable one-time purchase */
  Consumable: 3,
  /** Represents a recurring subscription */
  Subscription: 5,
  /** System-generated group for each SUBSCRIPTION SKU created */
  SubscriptionGroup: 6,
} as const;
export type SkuType = (typeof SkuType)[keyof typeof SkuType];

/**
 * SKU Flags
 * @see https://docs.discord.com/developers/resources/sku#sku-object-sku-flags
 */
export const SkuFlags = {
  /** SKU is available for purchase */
  Available: 1 << 2,
  /** Recurring SKU that can be purchased by a user and applied to a single server. Grants access to every user in that server. */
  GuildSubscription: 1 << 7,
  /** Recurring SKU purchased by a user for themselves. Grants access to the purchasing user in every server. */
  UserSubscription: 1 << 8,
} as const;
export type SkuFlags = (typeof SkuFlags)[keyof typeof SkuFlags];
