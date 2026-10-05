import type { ChannelType } from './channel.js';
import type { Snowflake } from './common.js';
import type { RawEmoji } from './emoji.js';
import type { RawResolvedData } from './interaction.js';

/**
 * Anatomy of a Component
 * @see https://docs.discord.com/developers/components/reference#anatomy-of-a-component
 */
export interface RawBaseComponent {
  /** The type of the component */
  type: ComponentType;
  /** 32 bit integer used as an optional identifier for component */
  id?: number;
}

/**
 * Custom ID
 * @see https://docs.discord.com/developers/components/reference#anatomy-of-a-component-custom-id
 */
export interface RawCustomId {
  /** Developer-defined identifier, 1-100 characters */
  custom_id: string;
}

/**
 * Action Row Structure
 * @see https://docs.discord.com/developers/components/reference#action-row-action-row-structure
 */
export interface RawActionRow {
  /** `1` for action row component */
  type: typeof ComponentType.ActionRow;
  /** Optional identifier for component */
  id?: number;
  /** Up to 5 interactive button components or a single select component */
  components: RawActionRowChildComponent[];
}

/**
 * Button Structure
 * @see https://docs.discord.com/developers/components/reference#button-button-structure
 */
export interface RawButton {
  /** `2` for a button */
  type: typeof ComponentType.Button;
  /** Optional identifier for component */
  id?: number;
  /** A button style */
  style: ButtonStyle;
  /** Text that appears on the button; max 80 characters */
  label?: string;
  /** `name`, `id`, and `animated` */
  emoji?: Partial<RawEmoji>;
  /** Developer-defined identifier for the button; 1-100 characters */
  custom_id?: string;
  /** Identifier for a purchasable SKU, only available when using premium-style buttons */
  sku_id?: Snowflake;
  /** URL for link-style buttons; max 512 characters */
  url?: string;
  /** Whether the button is disabled (defaults to `false`) */
  disabled?: boolean;
}

/**
 * Button Styles
 * @see https://docs.discord.com/developers/components/reference#button-button-styles
 */
export const ButtonStyle = {
  Primary: 1,
  Secondary: 2,
  Success: 3,
  Danger: 4,
  Link: 5,
  Premium: 6,
} as const;
export type ButtonStyle = (typeof ButtonStyle)[keyof typeof ButtonStyle];

/**
 * String Select Structure
 * @see https://docs.discord.com/developers/components/reference#string-select-string-select-structure
 */
export interface RawStringSelect {
  /** `3` for string select */
  type: typeof ComponentType.StringSelect;
  /** Optional identifier for component */
  id?: number;
  /** ID for the select menu; 1-100 characters */
  custom_id: string;
  /** Specified choices in a select menu; max 25 */
  options: RawSelectOption[];
  /** Placeholder text if nothing is selected or default; max 150 characters */
  placeholder?: string;
  /** Minimum number of items that must be chosen (defaults to 1); min 0 (see note), max 25 */
  min_values?: number;
  /** Maximum number of items that can be chosen (defaults to 1); max 25 */
  max_values?: number;
  /** Whether the string select is required to answer in a modal (defaults to `true`) */
  required?: boolean;
  /** Whether select menu is disabled in a message (defaults to `false`) */
  disabled?: boolean;
}

/**
 * Select Option Structure
 * @see https://docs.discord.com/developers/components/reference#string-select-select-option-structure
 */
export interface RawSelectOption {
  /** User-facing name of the option; max 100 characters */
  label: string;
  /** Dev-defined value of the option; max 100 characters */
  value: string;
  /** Additional description of the option; max 100 characters */
  description?: string;
  /** `id`, `name`, and `animated` */
  emoji?: Partial<RawEmoji>;
  /** Will show this option as selected by default */
  default?: boolean;
}

/**
 * String Select Interaction Response Structure
 * @see https://docs.discord.com/developers/components/reference#string-select-string-select-interaction-response-structure
 */
export interface RawStringSelectInteractionResponse {
  /** `3` for a String Select */
  type: typeof ComponentType.StringSelect;
  /** `3` for a String Select */
  component_type: ComponentType;
  /** Unique identifier for the component */
  id: number;
  /** Developer-defined identifier for the input; 1-100 characters */
  custom_id: string;
  /** The text of the selected options */
  values: string[];
}

/**
 * Text Input Structure
 * @see https://docs.discord.com/developers/components/reference#text-input-text-input-structure
 */
export interface RawTextInput {
  /** `4` for a text input */
  type: typeof ComponentType.TextInput;
  /** Optional identifier for component */
  id?: number;
  /** Developer-defined identifier for the input; 1-100 characters */
  custom_id: string;
  /** The Text Input Style */
  style: TextInputStyle;
  /** Minimum input length for a text input; min 0, max 4000 */
  min_length?: number;
  /** Maximum input length for a text input; min 1, max 4000 */
  max_length?: number;
  /** Whether this component is required to be filled (defaults to `true`) */
  required?: boolean;
  /** Pre-filled value for this component; max 4000 characters */
  value?: string;
  /** Custom placeholder text if the input is empty; max 100 characters */
  placeholder?: string;
}

/**
 * Text Input Styles
 * @see https://docs.discord.com/developers/components/reference#text-input-text-input-styles
 */
export const TextInputStyle = {
  /** Single-line input */
  Short: 1,
  /** Multi-line input */
  Paragraph: 2,
} as const;
export type TextInputStyle =
  (typeof TextInputStyle)[keyof typeof TextInputStyle];

/**
 * Text Input Interaction Response Structure
 * @see https://docs.discord.com/developers/components/reference#text-input-text-input-interaction-response-structure
 */
export interface RawTextInputInteractionResponse {
  /** `4` for a Text Input */
  type: typeof ComponentType.TextInput;
  /** Unique identifier for the component */
  id: number;
  /** Developer-defined identifier for the input; 1-100 characters */
  custom_id: string;
  /** The user's input text */
  value: string;
}

/**
 * User Select Structure
 * @see https://docs.discord.com/developers/components/reference#user-select-user-select-structure
 */
export interface RawUserSelect {
  /** `5` for user select */
  type: typeof ComponentType.UserSelect;
  /** Optional identifier for component */
  id?: number;
  /** ID for the select menu; 1-100 characters */
  custom_id: string;
  /** Placeholder text if nothing is selected; max 150 characters */
  placeholder?: string;
  /** List of default values for auto-populated select menu components; number of default values must be in the range defined by `min_values` and `max_values` */
  default_values?: RawSelectDefaultValue[];
  /** Minimum number of items that must be chosen (defaults to 1); min 0 (see note), max 25 */
  min_values?: number;
  /** Maximum number of items that can be chosen (defaults to 1); max 25 */
  max_values?: number;
  /** Whether the user select is required to answer in a modal (defaults to `true`) */
  required?: boolean;
  /** Whether select menu is disabled in a message (defaults to `false`) */
  disabled?: boolean;
}

/**
 * Select Default Value Structure
 * @see https://docs.discord.com/developers/components/reference#user-select-select-default-value-structure
 */
export interface RawSelectDefaultValue {
  /** ID of a user, role, or channel */
  id: Snowflake;
  /** Type of value that `id` represents. Either `"user"`, `"role"`, or `"channel"` */
  type: string;
}

/**
 * User Select Interaction Response Structure
 * @see https://docs.discord.com/developers/components/reference#user-select-user-select-interaction-response-structure
 */
export interface RawUserSelectInteractionResponse {
  /** `5` for a User Select */
  type: typeof ComponentType.UserSelect;
  /** `5` for a User Select */
  component_type: ComponentType;
  /** Unique identifier for the component */
  id: number;
  /** Developer-defined identifier for the input; 1-100 characters */
  custom_id: string;
  /** Resolved entities from selected options */
  resolved: RawResolvedData;
  /** IDs of the selected users */
  values: Snowflake[];
}

/**
 * Role Select Structure
 * @see https://docs.discord.com/developers/components/reference#role-select-role-select-structure
 */
export interface RawRoleSelect {
  /** `6` for role select */
  type: typeof ComponentType.RoleSelect;
  /** Optional identifier for component */
  id?: number;
  /** ID for the select menu; 1-100 characters */
  custom_id: string;
  /** Placeholder text if nothing is selected; max 150 characters */
  placeholder?: string;
  /** List of default values for auto-populated select menu components; number of default values must be in the range defined by `min_values` and `max_values` */
  default_values?: RawSelectDefaultValue[];
  /** Minimum number of items that must be chosen (defaults to 1); min 0 (see note), max 25 */
  min_values?: number;
  /** Maximum number of items that can be chosen (defaults to 1); max 25 */
  max_values?: number;
  /** Whether the role select is required to answer in a modal (defaults to `true`) */
  required?: boolean;
  /** Whether select menu is disabled in a message (defaults to `false`) */
  disabled?: boolean;
}

/**
 * Role Select Interaction Response Structure
 * @see https://docs.discord.com/developers/components/reference#role-select-role-select-interaction-response-structure
 */
export interface RawRoleSelectInteractionResponse {
  /** `6` for a Role Select */
  type: typeof ComponentType.RoleSelect;
  /** `6` for a Role Select */
  component_type: ComponentType;
  /** Unique identifier for the component */
  id: number;
  /** Developer-defined identifier for the input; 1-100 characters */
  custom_id: string;
  /** Resolved entities from selected options */
  resolved: RawResolvedData;
  /** IDs of the selected roles */
  values: Snowflake[];
}

/**
 * Mentionable Select Structure
 * @see https://docs.discord.com/developers/components/reference#mentionable-select-mentionable-select-structure
 */
export interface RawMentionableSelect {
  /** `7` for mentionable select */
  type: typeof ComponentType.MentionableSelect;
  /** Optional identifier for component */
  id?: number;
  /** ID for the select menu; 1-100 characters */
  custom_id: string;
  /** Placeholder text if nothing is selected; max 150 characters */
  placeholder?: string;
  /** List of default values for auto-populated select menu components; number of default values must be in the range defined by `min_values` and `max_values` */
  default_values?: RawSelectDefaultValue[];
  /** Minimum number of items that must be chosen (defaults to 1); min 0 (see note), max 25 */
  min_values?: number;
  /** Maximum number of items that can be chosen (defaults to 1); max 25 */
  max_values?: number;
  /** Whether the mentionable select is required to answer in a modal (defaults to `true`) */
  required?: boolean;
  /** Whether select menu is disabled in a message (defaults to `false`) */
  disabled?: boolean;
}

/**
 * Mentionable Select Interaction Response Structure
 * @see https://docs.discord.com/developers/components/reference#mentionable-select-mentionable-select-interaction-response-structure
 */
export interface RawMentionableSelectInteractionResponse {
  /** `7` for a Mentionable Select */
  type: typeof ComponentType.MentionableSelect;
  /** `7` for a Mentionable Select */
  component_type: ComponentType;
  /** Unique identifier for the component */
  id: number;
  /** Developer-defined identifier for the input; 1-100 characters */
  custom_id: string;
  /** Resolved entities from selected options */
  resolved: RawResolvedData;
  /** IDs of the selected mentionables */
  values: Snowflake[];
}

/**
 * Channel Select Structure
 * @see https://docs.discord.com/developers/components/reference#channel-select-channel-select-structure
 */
export interface RawChannelSelect {
  /** `8` for channel select */
  type: typeof ComponentType.ChannelSelect;
  /** Optional identifier for component */
  id?: number;
  /** ID for the select menu; 1-100 characters */
  custom_id: string;
  /** List of channel types to include in the channel select component */
  channel_types?: ChannelType[];
  /** Placeholder text if nothing is selected; max 150 characters */
  placeholder?: string;
  /** List of default values for auto-populated select menu components; number of default values must be in the range defined by `min_values` and `max_values` */
  default_values?: RawSelectDefaultValue[];
  /** Minimum number of items that must be chosen (defaults to 1); min 0 (see note), max 25 */
  min_values?: number;
  /** Maximum number of items that can be chosen (defaults to 1); max 25 */
  max_values?: number;
  /** Whether the channel select is required to answer in a modal (defaults to `true`) */
  required?: boolean;
  /** Whether select menu is disabled in a message (defaults to `false`) */
  disabled?: boolean;
}

/**
 * Channel Select Interaction Response Structure
 * @see https://docs.discord.com/developers/components/reference#channel-select-channel-select-interaction-response-structure
 */
export interface RawChannelSelectInteractionResponse {
  /** `8` for a Channel Select */
  type: typeof ComponentType.ChannelSelect;
  /** `8` for a Channel Select */
  component_type: ComponentType;
  /** Unique identifier for the component */
  id: number;
  /** Developer-defined identifier for the input; 1-100 characters */
  custom_id: string;
  /** Resolved entities from selected options */
  resolved: RawResolvedData;
  /** IDs of the selected channels */
  values: Snowflake[];
}

/**
 * Section Structure
 * @see https://docs.discord.com/developers/components/reference#section-section-structure
 */
export interface RawSection {
  /** `9` for section component */
  type: typeof ComponentType.Section;
  /** Optional identifier for component */
  id?: number;
  /** One to three child components representing the content of the section that is contextually associated to the accessory */
  components: RawTextDisplay[];
  /** A component that is contextually associated to the content of the section */
  accessory: RawButton | RawThumbnail;
}

/**
 * Text Display Structure
 * @see https://docs.discord.com/developers/components/reference#text-display-text-display-structure
 */
export interface RawTextDisplay {
  /** `10` for text display */
  type: typeof ComponentType.TextDisplay;
  /** Optional identifier for component */
  id?: number;
  /** Text that will be displayed similar to a message */
  content: string;
}

/**
 * Text Display Interaction Response Structure
 * @see https://docs.discord.com/developers/components/reference#text-display-text-display-interaction-response-structure
 */
export interface RawTextDisplayInteractionResponse {
  /** `10` for a Text Display */
  type: typeof ComponentType.TextDisplay;
  /** Unique identifier for the component */
  id: number;
}

/**
 * Thumbnail Structure
 * @see https://docs.discord.com/developers/components/reference#thumbnail-thumbnail-structure
 */
export interface RawThumbnail {
  /** `11` for thumbnail component */
  type: typeof ComponentType.Thumbnail;
  /** Optional identifier for component */
  id?: number;
  /** A url or attachment provided as an unfurled media item */
  media: RawUnfurledMediaItem;
  /** Alt text for the media, max 1024 characters */
  description?: string | null;
  /** Whether the thumbnail should be a spoiler (or blurred out). Defaults to `false` */
  spoiler?: boolean;
}

/**
 * Media Gallery Structure
 * @see https://docs.discord.com/developers/components/reference#media-gallery-media-gallery-structure
 */
export interface RawMediaGallery {
  /** `12` for media gallery component */
  type: typeof ComponentType.MediaGallery;
  /** Optional identifier for component */
  id?: number;
  /** 1 to 10 media gallery items */
  items: RawMediaGalleryItem[];
}

/**
 * Media Gallery Item Structure
 * @see https://docs.discord.com/developers/components/reference#media-gallery-media-gallery-item-structure
 */
export interface RawMediaGalleryItem {
  /** A url or attachment provided as an unfurled media item */
  media: RawUnfurledMediaItem;
  /** Alt text for the media, max 1024 characters */
  description?: string | null;
  /** Whether the media should be a spoiler (or blurred out). Defaults to `false` */
  spoiler?: boolean;
}

/**
 * File Structure
 * @see https://docs.discord.com/developers/components/reference#file-file-structure
 */
export interface RawFileComponent {
  /** `13` for a file component */
  type: typeof ComponentType.File;
  /** Optional identifier for component */
  id?: number;
  /** This unfurled media item is unique in that it **only** supports attachment references using the `attachment://` syntax */
  file: RawUnfurledMediaItem;
  /** Whether the media should be a spoiler (or blurred out). Defaults to `false` */
  spoiler?: boolean;
  /** The name of the file. This field is ignored and provided by the API as part of the response */
  name?: string;
  /** The size of the file in bytes. This field is ignored and provided by the API as part of the response */
  size?: number;
}

/**
 * Separator Structure
 * @see https://docs.discord.com/developers/components/reference#separator-separator-structure
 */
export interface RawSeparator {
  /** `14` for separator component */
  type: typeof ComponentType.Separator;
  /** Optional identifier for component */
  id?: number;
  /** Whether a visual divider should be displayed in the component. Defaults to `true` */
  divider?: boolean;
  /** Size of separator padding—`1` for small padding, `2` for large padding. Defaults to `1` */
  spacing?: number;
}

/**
 * Container Structure
 * @see https://docs.discord.com/developers/components/reference#container-container-structure
 */
export interface RawContainer {
  /** `17` for container component */
  type: typeof ComponentType.Container;
  /** Optional identifier for component */
  id?: number;
  /** Child components that are encapsulated within the Container */
  components: RawContainerChildComponent[];
  /** Color for the accent on the container as RGB from `0x000000` to `0xFFFFFF` */
  accent_color?: number | null;
  /** Whether the container should be a spoiler (or blurred out). Defaults to `false`. */
  spoiler?: boolean;
}

/**
 * Label Structure
 * @see https://docs.discord.com/developers/components/reference#label-label-structure
 */
export interface RawLabel {
  /** `18` for a label */
  type: typeof ComponentType.Label;
  /** Optional identifier for component */
  id?: number;
  /** The label text; max 45 characters */
  label: string;
  /** An optional description text for the label; max 100 characters */
  description?: string;
  /** The component within the label */
  component: RawLabelChildComponent;
}

/**
 * Label Interaction Response Structure
 * @see https://docs.discord.com/developers/components/reference#label-label-interaction-response-structure
 */
export interface RawLabelInteractionResponse {
  /** `18` for a Label */
  type: typeof ComponentType.Label;
  /** Unique identifier for the component */
  id: number;
  /** The component within the label */
  component: RawLabelInteractionResponseChildComponent;
}

/**
 * File Upload Structure
 * @see https://docs.discord.com/developers/components/reference#file-upload-file-upload-structure
 */
export interface RawFileUpload {
  /** `19` for file upload */
  type: typeof ComponentType.FileUpload;
  /** Optional identifier for component */
  id?: number;
  /** ID for the file upload; 1-100 characters */
  custom_id: string;
  /** Minimum number of items that must be uploaded (defaults to 1); min 0 (see note), max 10 */
  min_values?: number;
  /** Maximum number of items that can be uploaded (defaults to 1); max 10 */
  max_values?: number;
  /** Whether the file upload requires files to be uploaded before submitting the modal (defaults to `true`) */
  required?: boolean;
  /** File types to filter for; can be `image`, `video`, `audio`, or any dot-prefixed extension such as `.pdf`; max 10 */
  file_types?: string[];
}

/**
 * File Upload Interaction Response Structure
 * @see https://docs.discord.com/developers/components/reference#file-upload-file-upload-interaction-response-structure
 */
export interface RawFileUploadInteractionResponse {
  /** `19` for a File Upload */
  type: typeof ComponentType.FileUpload;
  /** Unique identifier for the component */
  id: number;
  /** Developer-defined identifier for the input; 1-100 characters */
  custom_id: string;
  /** IDs of the uploaded files found in the resolved data */
  values: Snowflake[];
}

/**
 * Radio Group Structure
 * @see https://docs.discord.com/developers/components/reference#radio-group-structure
 */
export interface RawRadioGroup {
  /** `21` for radio group */
  type: typeof ComponentType.RadioGroup;
  /** Optional identifier for component */
  id?: number;
  /** Developer-defined identifier for the input; 1-100 characters */
  custom_id: string;
  /** List of options to show; min 2, max 10 */
  options: RawRadioGroupOption[];
  /** Whether a selection is required to submit the modal (defaults to `true`) */
  required?: boolean;
}

/**
 * Radio Group Option Structure
 * @see https://docs.discord.com/developers/components/reference#radio-group-option-structure
 */
export interface RawRadioGroupOption {
  /** Dev-defined value of the option; max 100 characters */
  value: string;
  /** User-facing label of the option; max 100 characters */
  label: string;
  /** Optional description for the option; max 100 characters */
  description?: string;
  /** Shows the option as selected by default */
  default?: boolean;
}

/**
 * Radio Group Interaction Response Structure
 * @see https://docs.discord.com/developers/components/reference#radio-group-interaction-response-structure
 */
export interface RawRadioGroupInteractionResponse {
  /** `21` for a Radio Group */
  type: typeof ComponentType.RadioGroup;
  /** Unique identifier for the component */
  id: number;
  /** Developer-defined identifier for the input; 1-100 characters */
  custom_id: string;
  /** The value of the selected option, or `null` if no option is selected */
  value: string | null;
}

/**
 * Checkbox Group Structure
 * @see https://docs.discord.com/developers/components/reference#checkbox-group-structure
 */
export interface RawCheckboxGroup {
  /** `22` for checkbox group */
  type: typeof ComponentType.CheckboxGroup;
  /** Optional identifier for component */
  id?: number;
  /** Developer-defined identifier for the input; 1-100 characters */
  custom_id: string;
  /** List of options to show; min 1, max 10 */
  options: RawCheckboxGroupOption[];
  /** Minimum number of items that must be chosen; min 0, max 10 (defaults to 1); */
  min_values?: number;
  /** Maximum number of items that can be chosen; min 1, max 10 (defaults to the number of options) */
  max_values?: number;
  /** Whether selecting within the group is required (defaults to `true`) */
  required?: boolean;
}

/**
 * Checkbox Group Option Structure
 * @see https://docs.discord.com/developers/components/reference#checkbox-group-option-structure
 */
export interface RawCheckboxGroupOption {
  /** Dev-defined value of the option; max 100 characters */
  value: string;
  /** User-facing label of the option; max 100 characters */
  label: string;
  /** Optional description for the option; max 100 characters */
  description?: string;
  /** Shows the option as selected by default */
  default?: boolean;
}

/**
 * Checkbox Group Interaction Response Structure
 * @see https://docs.discord.com/developers/components/reference#checkbox-group-interaction-response-structure
 */
export interface RawCheckboxGroupInteractionResponse {
  /** `22` for a Checkbox Group */
  type: typeof ComponentType.CheckboxGroup;
  /** Unique identifier for the component */
  id: number;
  /** Developer-defined identifier for the input; 1-100 characters */
  custom_id: string;
  /** The values of the selected options, or an empty array `[]` if no options are selected */
  values: string[];
}

/**
 * Checkbox Structure
 * @see https://docs.discord.com/developers/components/reference#checkbox-structure
 */
export interface RawCheckbox {
  /** `23` for checkbox */
  type: typeof ComponentType.Checkbox;
  /** Optional identifier for component */
  id?: number;
  /** Developer-defined identifier for the input; 1-100 characters */
  custom_id: string;
  /** Whether the checkbox is selected by default */
  default?: boolean;
}

/**
 * Checkbox Interaction Response Structure
 * @see https://docs.discord.com/developers/components/reference#checkbox-interaction-response-structure
 */
export interface RawCheckboxInteractionResponse {
  /** `23` for a Checkbox */
  type: typeof ComponentType.Checkbox;
  /** Unique identifier for the component */
  id: number;
  /** Developer-defined identifier for the input; 1-100 characters */
  custom_id: string;
  /** The state of the checkbox (`true` if checked, `false` if unchecked) */
  value: boolean;
}

/**
 * Unfurled Media Item Structure
 * @see https://docs.discord.com/developers/components/reference#unfurled-media-item-unfurled-media-item-structure
 */
export interface RawUnfurledMediaItem {
  /** Supports arbitrary urls and `attachment://` references */
  url: string;
  /** The proxied url of the media item */
  proxy_url?: string;
  /** The height of the media item (if image or video) */
  height?: number | null;
  /** The width of the media item (if image or video) */
  width?: number | null;
  /** Thumbhash placeholder (if image or video) */
  placeholder?: string;
  /** Version of the placeholder (if image or video) */
  placeholder_version?: number;
  /** The media type of the content */
  content_type?: string;
  /** Unfurled media item flags combined as a bitfield */
  flags?: number;
  /** The id of the uploaded attachment */
  attachment_id?: Snowflake;
}

/**
 * Unfurled Media Item Flags
 * @see https://docs.discord.com/developers/components/reference#unfurled-media-item-unfurled-media-item-flags
 */
export const UnfurledMediaItemFlags = {
  /** This image is animated */
  IsAnimated: 1 << 0,
} as const;
export type UnfurledMediaItemFlags =
  (typeof UnfurledMediaItemFlags)[keyof typeof UnfurledMediaItemFlags];

/**
 * Component Types
 * @see https://docs.discord.com/developers/components/reference#component-object-component-types
 */
export const ComponentType = {
  /** Container to display a row of interactive components */
  ActionRow: 1,
  /** Button object */
  Button: 2,
  /** Select menu for picking from defined text options */
  StringSelect: 3,
  /** Text input object */
  TextInput: 4,
  /** Select menu for users */
  UserSelect: 5,
  /** Select menu for roles */
  RoleSelect: 6,
  /** Select menu for mentionables (users and roles) */
  MentionableSelect: 7,
  /** Select menu for channels */
  ChannelSelect: 8,
  /** Container to display text alongside an accessory component */
  Section: 9,
  /** Markdown text */
  TextDisplay: 10,
  /** Small image that can be used as an accessory */
  Thumbnail: 11,
  /** Display images and other media */
  MediaGallery: 12,
  /** Displays an attached file */
  File: 13,
  /** Component to add vertical padding between other components */
  Separator: 14,
  /** Container that visually groups a set of components */
  Container: 17,
  /** Container associating a label and description with a component */
  Label: 18,
  /** Component for uploading files */
  FileUpload: 19,
  /** Single-choice set of options */
  RadioGroup: 21,
  /** Multi-selectable group of checkboxes */
  CheckboxGroup: 22,
  /** Single checkbox for yes/no choice */
  Checkbox: 23,
} as const;
export type ComponentType = (typeof ComponentType)[keyof typeof ComponentType];

/** Any select menu component. */
export type RawSelectMenu =
  | RawStringSelect
  | RawUserSelect
  | RawRoleSelect
  | RawMentionableSelect
  | RawChannelSelect;

/**
 * Action Row Child Components
 * @see https://docs.discord.com/developers/components/reference#action-row-action-row-child-components
 */
export type RawActionRowChildComponent = RawButton | RawSelectMenu;

/**
 * Container Child Components
 * @see https://docs.discord.com/developers/components/reference#container-container-child-components
 */
export type RawContainerChildComponent =
  | RawActionRow
  | RawTextDisplay
  | RawSection
  | RawMediaGallery
  | RawSeparator
  | RawFileComponent;

/**
 * Label Child Components
 * @see https://docs.discord.com/developers/components/reference#label-label-child-components
 */
export type RawLabelChildComponent =
  | RawTextInput
  | RawSelectMenu
  | RawFileUpload
  | RawRadioGroup
  | RawCheckboxGroup
  | RawCheckbox;

/**
 * Label Interaction Response Child Components
 * @see https://docs.discord.com/developers/components/reference#label-label-interaction-response-child-components
 */
export type RawLabelInteractionResponseChildComponent =
  | RawTextInputInteractionResponse
  | RawStringSelectInteractionResponse
  | RawUserSelectInteractionResponse
  | RawRoleSelectInteractionResponse
  | RawMentionableSelectInteractionResponse
  | RawChannelSelectInteractionResponse
  | RawFileUploadInteractionResponse
  | RawRadioGroupInteractionResponse
  | RawCheckboxGroupInteractionResponse
  | RawCheckboxInteractionResponse;

/** A component that can be placed at the top level of a message. */
export type RawMessageTopLevelComponent =
  | RawActionRow
  | RawSection
  | RawTextDisplay
  | RawMediaGallery
  | RawFileComponent
  | RawSeparator
  | RawContainer;

/** A component that can be placed at the top level of a modal. */
export type RawModalTopLevelComponent =
  RawLabel | RawTextDisplay | RawActionRow;

/**
 * Any component, as sent or received in a message or a modal.
 * @see https://docs.discord.com/developers/components/reference#component-object
 */
export type RawComponent =
  | RawMessageTopLevelComponent
  | RawLabel
  | RawActionRowChildComponent
  | RawLabelChildComponent
  | RawThumbnail;

/** A top-level component of a submitted modal, with the values typed in. */
export type RawModalSubmitComponent =
  RawLabelInteractionResponse | RawTextDisplayInteractionResponse;
