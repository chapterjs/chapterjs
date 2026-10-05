import type { ISO8601Timestamp, Snowflake } from './common.js';
import type { RawEmoji } from './emoji.js';
import type { RawUser } from './user.js';

/**
 * Poll Object Structure
 * @see https://docs.discord.com/developers/resources/poll#poll-object-poll-object-structure
 */
export interface RawPoll {
  /** The question of the poll. Only `text` is supported. */
  question: RawPollMedia;
  /** Each of the answers available in the poll. */
  answers: RawPollAnswer[];
  /** The time when the poll ends. */
  expiry: ISO8601Timestamp | null;
  /** Whether a user can select multiple answers */
  allow_multiselect: boolean;
  /** The layout type of the poll */
  layout_type: PollLayoutType;
  /** The results of the poll */
  results?: RawPollResults;
}

/**
 * Poll Create Request Object Structure
 * @see https://docs.discord.com/developers/resources/poll#poll-create-request-object-poll-create-request-object-structure
 */
export interface RawPollCreateRequest {
  /** The question of the poll. Only `text` is supported. */
  question: RawPollMedia;
  /** Each of the answers available in the poll, up to 10 */
  answers: RawPollAnswer[];
  /** Number of hours the poll should be open for, up to 32 days. Defaults to 24 */
  duration?: number;
  /** Whether a user can select multiple answers. Defaults to false */
  allow_multiselect?: boolean;
  /** The layout type of the poll. Defaults to... DEFAULT! */
  layout_type?: PollLayoutType;
}

/**
 * Layout Type
 * @see https://docs.discord.com/developers/resources/poll#layout-type
 */
export const PollLayoutType = {
  /** The, uhm, default layout type. */
  Default: 1,
} as const;
export type PollLayoutType =
  (typeof PollLayoutType)[keyof typeof PollLayoutType];

/**
 * Poll Media Object Structure
 * @see https://docs.discord.com/developers/resources/poll#poll-media-object-poll-media-object-structure
 */
export interface RawPollMedia {
  /** The text of the field */
  text?: string;
  /** The emoji of the field */
  emoji?: Partial<RawEmoji>;
}

/**
 * Poll Answer Object Structure
 * @see https://docs.discord.com/developers/resources/poll#poll-answer-object-poll-answer-object-structure
 */
export interface RawPollAnswer {
  /** The ID of the answer */
  answer_id: number;
  /** The data of the answer */
  poll_media: RawPollMedia;
}

/**
 * Poll Results Object Structure
 * @see https://docs.discord.com/developers/resources/poll#poll-results-object-poll-results-object-structure
 */
export interface RawPollResults {
  /** Whether the votes have been precisely counted */
  is_finalized: boolean;
  /** The counts for each answer */
  answer_counts: RawPollAnswerCount[];
}

/**
 * Poll Answer Count Object Structure
 * @see https://docs.discord.com/developers/resources/poll#poll-results-object-poll-answer-count-object-structure
 */
export interface RawPollAnswerCount {
  /** The `answer_id` */
  id: number;
  /** The number of votes for this answer */
  count: number;
  /** Whether the current user voted for this answer */
  me_voted: boolean;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/poll#get-answer-voters-query-string-params
 */
export interface GetAnswerVotersQuery {
  /** Get users after this user ID */
  after?: Snowflake;
  /** Max number of users to return (1-100) */
  limit?: number;
}

/**
 * Response Body
 * @see https://docs.discord.com/developers/resources/poll#get-answer-voters-response-body
 */
export interface GetAnswerVotersResponse {
  /** Users who voted for this answer */
  users: RawUser[];
}
