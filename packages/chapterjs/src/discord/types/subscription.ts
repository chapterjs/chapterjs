import type { ISO8601Timestamp, Snowflake } from './common.js';

/**
 * Subscription Object
 * @see https://docs.discord.com/developers/resources/subscription#subscription-object
 */
export interface RawSubscription {
  /** ID of the subscription */
  id: Snowflake;
  /** ID of the user who is subscribed */
  user_id: Snowflake;
  /** List of SKUs subscribed to */
  sku_ids: Snowflake[];
  /** List of entitlements granted for this subscription */
  entitlement_ids: Snowflake[];
  /** List of SKUs that this user will be subscribed to at renewal */
  renewal_sku_ids: Snowflake[] | null;
  /** Start of the current subscription period */
  current_period_start: ISO8601Timestamp;
  /** End of the current subscription period */
  current_period_end: ISO8601Timestamp;
  /** Current status of the subscription */
  status: SubscriptionStatus;
  /** When the subscription was canceled */
  canceled_at: ISO8601Timestamp | null;
  /** ISO3166-1 alpha-2 country code of the payment source used to purchase the subscription. Missing unless queried with a private OAuth scope. */
  country?: string;
}

/**
 * Subscription Statuses
 * @see https://docs.discord.com/developers/resources/subscription#subscription-statuses
 */
export const SubscriptionStatus = {
  /** Subscription is active and scheduled to renew. */
  Active: 0,
  /** Subscription is inactive and not being charged. */
  Inactive: 1,
  /** Subscription is active but will not renew. */
  Ending: 2,
} as const;
export type SubscriptionStatus =
  (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/subscription#query-string-params
 */
export interface ListSkuSubscriptionsQuery {
  /** List subscriptions before this ID */
  before?: Snowflake;
  /** List subscriptions after this ID */
  after?: Snowflake;
  /** Number of results to return (1-100) */
  limit?: number;
  /** User ID for which to return subscriptions. Required except for OAuth queries. */
  user_id?: Snowflake;
}
