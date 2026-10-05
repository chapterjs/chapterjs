import type { Locale } from './common.js';

/**
 * Application Role Connection Metadata Structure
 * @see https://docs.discord.com/developers/resources/application-role-connection-metadata#application-role-connection-metadata-object-application-role-connection-metadata-structure
 */
export interface RawApplicationRoleConnectionMetadata {
  /** type of metadata value */
  type: ApplicationRoleConnectionMetadataType;
  /** dictionary key for the metadata field (must be `a-z`, `0-9`, or `_` characters; 1-50 characters) */
  key: string;
  /** name of the metadata field (1-100 characters) */
  name: string;
  /** translations of the name */
  name_localizations?: Partial<Record<Locale, string>>;
  /** description of the metadata field (1-200 characters) */
  description: string;
  /** translations of the description */
  description_localizations?: Partial<Record<Locale, string>>;
}

/**
 * Application Role Connection Metadata Type
 * @see https://docs.discord.com/developers/resources/application-role-connection-metadata#application-role-connection-metadata-object-application-role-connection-metadata-type
 */
export const ApplicationRoleConnectionMetadataType = {
  /** the metadata value (`integer`) is less than or equal to the guild's configured value (`integer`) */
  IntegerLessThanOrEqual: 1,
  /** the metadata value (`integer`) is greater than or equal to the guild's configured value (`integer`) */
  IntegerGreaterThanOrEqual: 2,
  /** the metadata value (`integer`) is equal to the guild's configured value (`integer`) */
  IntegerEqual: 3,
  /** the metadata value (`integer`) is not equal to the guild's configured value (`integer`) */
  IntegerNotEqual: 4,
  /** the metadata value (`ISO8601 string`) is less than or equal to the guild's configured value (`integer`; `days before current date`) */
  DatetimeLessThanOrEqual: 5,
  /** the metadata value (`ISO8601 string`) is greater than or equal to the guild's configured value (`integer`; `days before current date`) */
  DatetimeGreaterThanOrEqual: 6,
  /** the metadata value (`integer`) is equal to the guild's configured value (`integer`; `1`) */
  BooleanEqual: 7,
  /** the metadata value (`integer`) is not equal to the guild's configured value (`integer`; `1`) */
  BooleanNotEqual: 8,
} as const;
export type ApplicationRoleConnectionMetadataType =
  (typeof ApplicationRoleConnectionMetadataType)[keyof typeof ApplicationRoleConnectionMetadataType];
