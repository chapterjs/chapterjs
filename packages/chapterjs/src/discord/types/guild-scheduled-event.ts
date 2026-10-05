import type { ISO8601Timestamp, ImageData, Snowflake } from './common.js';
import type { RawGuildMember } from './guild.js';
import type { RawUser } from './user.js';

/**
 * Guild Scheduled Event Structure
 * @see https://docs.discord.com/developers/resources/guild-scheduled-event#guild-scheduled-event-object-guild-scheduled-event-structure
 */
export interface RawGuildScheduledEvent {
  /** the id of the scheduled event */
  id: Snowflake;
  /** the guild id which the scheduled event belongs to */
  guild_id: Snowflake;
  /** the channel id in which the scheduled event will be hosted, or `null` if scheduled entity type is `EXTERNAL` */
  channel_id: Snowflake | null;
  /** the id of the user that created the scheduled event * */
  creator_id?: Snowflake | null;
  /** the name of the scheduled event (1-100 characters) */
  name: string;
  /** the description of the scheduled event (1-1000 characters) */
  description?: string | null;
  /** the time the scheduled event will start */
  scheduled_start_time: ISO8601Timestamp;
  /** the time the scheduled event will end, required if entity_type is `EXTERNAL` */
  scheduled_end_time: ISO8601Timestamp | null;
  /** the privacy level of the scheduled event */
  privacy_level: GuildScheduledEventPrivacyLevel;
  /** the status of the scheduled event */
  status: GuildScheduledEventStatus;
  /** the type of the scheduled event */
  entity_type: GuildScheduledEventEntityType;
  /** the id of an entity associated with a guild scheduled event */
  entity_id: Snowflake | null;
  /** additional metadata for the guild scheduled event */
  entity_metadata: RawGuildScheduledEventEntityMetadata | null;
  /** the user that created the scheduled event */
  creator?: RawUser;
  /** the number of users subscribed to the scheduled event */
  user_count?: number;
  /** the cover image hash of the scheduled event */
  image?: string | null;
  /** the definition for how often this event should recur */
  recurrence_rule: RawGuildScheduledEventRecurrenceRule | null;
}

/**
 * Guild Scheduled Event Privacy Level
 * @see https://docs.discord.com/developers/resources/guild-scheduled-event#guild-scheduled-event-object-guild-scheduled-event-privacy-level
 */
export const GuildScheduledEventPrivacyLevel = {
  /** the scheduled event is only accessible to guild members */
  GuildOnly: 2,
} as const;
export type GuildScheduledEventPrivacyLevel =
  (typeof GuildScheduledEventPrivacyLevel)[keyof typeof GuildScheduledEventPrivacyLevel];

/**
 * Guild Scheduled Event Entity Types
 * @see https://docs.discord.com/developers/resources/guild-scheduled-event#guild-scheduled-event-object-guild-scheduled-event-entity-types
 */
export const GuildScheduledEventEntityType = {
  StageInstance: 1,
  Voice: 2,
  External: 3,
} as const;
export type GuildScheduledEventEntityType =
  (typeof GuildScheduledEventEntityType)[keyof typeof GuildScheduledEventEntityType];

/**
 * Guild Scheduled Event Status
 * @see https://docs.discord.com/developers/resources/guild-scheduled-event#guild-scheduled-event-object-guild-scheduled-event-status
 */
export const GuildScheduledEventStatus = {
  Scheduled: 1,
  Active: 2,
  Completed: 3,
  Canceled: 4,
} as const;
export type GuildScheduledEventStatus =
  (typeof GuildScheduledEventStatus)[keyof typeof GuildScheduledEventStatus];

/**
 * Guild Scheduled Event Entity Metadata
 * @see https://docs.discord.com/developers/resources/guild-scheduled-event#guild-scheduled-event-object-guild-scheduled-event-entity-metadata
 */
export interface RawGuildScheduledEventEntityMetadata {
  /** location of the event (1-100 characters) */
  location?: string;
}

/**
 * Guild Scheduled Event User Structure
 * @see https://docs.discord.com/developers/resources/guild-scheduled-event#guild-scheduled-event-user-object-guild-scheduled-event-user-structure
 */
export interface RawGuildScheduledEventUser {
  /** the scheduled event id which the user subscribed to */
  guild_scheduled_event_id: Snowflake;
  /** user which subscribed to an event */
  user: RawUser;
  /** guild member data for this user for the guild which this event belongs to, if any */
  member?: RawGuildMember;
}

/**
 * Guild Scheduled Event Recurrence Rule Structure
 * @see https://docs.discord.com/developers/resources/guild-scheduled-event#guild-scheduled-event-recurrence-rule-object-guild-scheduled-event-recurrence-rule-structure
 */
export interface RawGuildScheduledEventRecurrenceRule {
  /** Starting time of the recurrence interval */
  start: ISO8601Timestamp;
  /** Ending time of the recurrence interval */
  end: ISO8601Timestamp | null;
  /** How often the event occurs */
  frequency: GuildScheduledEventRecurrenceRuleFrequency;
  /** The spacing between the events, defined by `frequency`. For example, `frequency` of `WEEKLY` and an `interval` of `2` would be "every-other week" */
  interval: number;
  /** Set of specific days within a week for the event to recur on */
  by_weekday: GuildScheduledEventRecurrenceRuleWeekday[] | null;
  /** List of specific days within a specific week (1-5) to recur on */
  by_n_weekday: RawGuildScheduledEventRecurrenceRuleNWeekday[] | null;
  /** Set of specific months to recur on */
  by_month: GuildScheduledEventRecurrenceRuleMonth[] | null;
  /** Set of specific dates within a month to recur on */
  by_month_day: number[] | null;
  /** Set of days within a year to recur on (1-364) */
  by_year_day: number[] | null;
  /** The total amount of times that the event is allowed to recur before stopping */
  count: number | null;
}

/**
 * Guild Scheduled Event Recurrence Rule - Frequency
 * @see https://docs.discord.com/developers/resources/guild-scheduled-event#guild-scheduled-event-recurrence-rule-object-guild-scheduled-event-recurrence-rule-frequency
 */
export const GuildScheduledEventRecurrenceRuleFrequency = {
  Yearly: 0,
  Monthly: 1,
  Weekly: 2,
  Daily: 3,
} as const;
export type GuildScheduledEventRecurrenceRuleFrequency =
  (typeof GuildScheduledEventRecurrenceRuleFrequency)[keyof typeof GuildScheduledEventRecurrenceRuleFrequency];

/**
 * Guild Scheduled Event Recurrence Rule - Weekday
 * @see https://docs.discord.com/developers/resources/guild-scheduled-event#guild-scheduled-event-recurrence-rule-object-guild-scheduled-event-recurrence-rule-weekday
 */
export const GuildScheduledEventRecurrenceRuleWeekday = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6,
} as const;
export type GuildScheduledEventRecurrenceRuleWeekday =
  (typeof GuildScheduledEventRecurrenceRuleWeekday)[keyof typeof GuildScheduledEventRecurrenceRuleWeekday];

/**
 * Guild Scheduled Event Recurrence Rule - N_Weekday Structure
 * @see https://docs.discord.com/developers/resources/guild-scheduled-event#guild-scheduled-event-recurrence-rule-object-guild-scheduled-event-recurrence-rule-nweekday-structure
 */
export interface RawGuildScheduledEventRecurrenceRuleNWeekday {
  /** The week to reoccur on. 1 - 5 */
  n: number;
  /** The day within the week to reoccur on */
  day: GuildScheduledEventRecurrenceRuleWeekday;
}

/**
 * Guild Scheduled Event Recurrence Rule - Month
 * @see https://docs.discord.com/developers/resources/guild-scheduled-event#guild-scheduled-event-recurrence-rule-object-guild-scheduled-event-recurrence-rule-month
 */
export const GuildScheduledEventRecurrenceRuleMonth = {
  January: 1,
  February: 2,
  March: 3,
  April: 4,
  May: 5,
  June: 6,
  July: 7,
  August: 8,
  September: 9,
  October: 10,
  November: 11,
  December: 12,
} as const;
export type GuildScheduledEventRecurrenceRuleMonth =
  (typeof GuildScheduledEventRecurrenceRuleMonth)[keyof typeof GuildScheduledEventRecurrenceRuleMonth];

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/guild-scheduled-event#list-scheduled-events-for-guild-query-string-params
 */
export interface ListScheduledEventsForGuildQuery {
  /** include number of users subscribed to each event */
  with_user_count?: boolean;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/guild-scheduled-event#create-guild-scheduled-event-json-params
 */
export interface CreateGuildScheduledEventJSONParams {
  /** the channel id of the scheduled event. */
  channel_id?: Snowflake;
  /** the entity metadata of the scheduled event */
  entity_metadata?: RawGuildScheduledEventEntityMetadata;
  /** the name of the scheduled event */
  name: string;
  /** the privacy level of the scheduled event */
  privacy_level: GuildScheduledEventPrivacyLevel;
  /** the time to schedule the scheduled event */
  scheduled_start_time: ISO8601Timestamp;
  /** the time when the scheduled event is scheduled to end */
  scheduled_end_time?: ISO8601Timestamp;
  /** the description of the scheduled event */
  description?: string;
  /** the entity type of the scheduled event */
  entity_type: GuildScheduledEventEntityType;
  /** the cover image of the scheduled event */
  image?: ImageData;
  /** the definition for how often this event should recur */
  recurrence_rule?: RawGuildScheduledEventRecurrenceRule;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/guild-scheduled-event#get-guild-scheduled-event-query-string-params
 */
export interface GetGuildScheduledEventQuery {
  /** include number of users subscribed to this event */
  with_user_count?: boolean;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/guild-scheduled-event#modify-guild-scheduled-event-json-params
 */
export interface ModifyGuildScheduledEventJSONParams {
  /** the channel id of the scheduled event, set to `null` if changing entity type to `EXTERNAL` */
  channel_id?: Snowflake | null;
  /** the entity metadata of the scheduled event */
  entity_metadata?: RawGuildScheduledEventEntityMetadata | null;
  /** the name of the scheduled event */
  name?: string;
  /** the privacy level of the scheduled event */
  privacy_level?: GuildScheduledEventPrivacyLevel;
  /** the time to schedule the scheduled event */
  scheduled_start_time?: ISO8601Timestamp;
  /** the time when the scheduled event is scheduled to end */
  scheduled_end_time?: ISO8601Timestamp;
  /** the description of the scheduled event */
  description?: string | null;
  /** the entity type of the scheduled event */
  entity_type?: GuildScheduledEventEntityType;
  /** the status of the scheduled event */
  status?: GuildScheduledEventStatus;
  /** the cover image of the scheduled event */
  image?: ImageData;
  /** the definition for how often this event should recur */
  recurrence_rule?: RawGuildScheduledEventRecurrenceRule | null;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/guild-scheduled-event#get-guild-scheduled-event-users-query-string-params
 */
export interface GetGuildScheduledEventUsersQuery {
  /** number of users to return (up to maximum 100) */
  limit?: number;
  /** include guild member data if it exists */
  with_member?: boolean;
  /** consider only users before given user id */
  before?: Snowflake;
  /** consider only users after given user id */
  after?: Snowflake;
}
