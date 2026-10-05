/**
 * Gateway URL Query String Params
 * @see https://docs.discord.com/developers/events/gateway#connecting-gateway-url-query-string-params
 */
export interface RawGatewayUrlQuery {
  /** API Version to use */
  v: number;
  /** The encoding of received gateway packets */
  encoding: string;
  /** The optional transport compression of gateway packets */
  compress?: string;
}

/**
 * JSON Response
 * @see https://docs.discord.com/developers/events/gateway#get-gateway-bot-json-response
 */
export interface RawGatewayBot {
  /** WSS URL that can be used for connecting to the Gateway */
  url: string;
  /** Recommended number of shards to use when connecting */
  shards: number;
  /** Information on the current session start limit */
  session_start_limit: RawSessionStartLimit;
}

/**
 * Session Start Limit Structure
 * @see https://docs.discord.com/developers/events/gateway#session-start-limit-object-session-start-limit-structure
 */
export interface RawSessionStartLimit {
  /** Total number of session starts the current user is allowed */
  total: number;
  /** Remaining number of session starts the current user is allowed */
  remaining: number;
  /** Number of milliseconds after which the limit resets */
  reset_after: number;
  /** Number of identify requests allowed per 5 seconds */
  max_concurrency: number;
}
