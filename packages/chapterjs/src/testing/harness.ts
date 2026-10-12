// What a test drives: the bot of the project, connected to the Discord in
// memory of `world.ts`, and the handles a scenario works with (a member, a
// channel, what the bot answered). Everything a person would do on Discord
// is turned into the payloads Discord would send, given to the real
// routers, and what the bot sends back is read from the world.

import type { PermissionName } from '../discord/permissions.js';
import { Permissions } from '../discord/permissions.js';
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
} from '../discord/types/application-command.js';
import { ChannelType, type RawChannel } from '../discord/types/channel.js';
import type { Locale, Snowflake } from '../discord/types/common.js';
import {
  ComponentType,
  type RawButton,
  type RawComponent,
  type RawModalSubmitComponent,
  type RawSelectMenu,
} from '../discord/types/component.js';
import type { RawGuildMember } from '../discord/types/guild.js';
import {
  InteractionType,
  type RawApplicationCommandInteractionDataOption,
  type RawInteraction,
  type RawResolvedData,
} from '../discord/types/interaction.js';
import {
  MessageFlags,
  MessageType,
  type RawAttachment,
  type RawEmbed,
  type RawMessage,
} from '../discord/types/message.js';
import { PermissionFlags } from '../discord/types/permissions.js';
import type { RawUser } from '../discord/types/user.js';
import type {
  CommandDeclaration,
  CommandOption,
  CommandOptions,
  CommandWhere,
  MenuDeclaration,
  MenuType,
} from '../commands/command.js';
import {
  capitalize,
  commandName,
  describeCommand,
  type CommandEntry,
} from '../commands/tree.js';
import type { ButtonDeclaration } from '../components/button.js';
import { componentStateOf } from '../components/declared.js';
import {
  isPiece,
  renderedOf,
  resolve,
  type ButtonComponent,
  type ModalComponent,
  type SelectComponent,
} from '../components/instance.js';
import type {
  CheckboxesField,
  CheckboxField,
  EntityField,
  FilesField,
  ModalDeclaration,
  ModalField,
  ModalFields,
  NoteField,
  RadioField,
  SelectField,
  TextField,
} from '../components/modal.js';
import type { DataShape } from '../components/custom-id.js';
import type { OptionValue } from '../components/options.js';
import type { ComponentEntry } from '../components/router.js';
import type { SelectDeclaration } from '../components/select.js';
import type { Bot } from '../core/bot.js';
import type { Project, ProjectObserver } from '../cli/project.js';
import type { Log } from '../cli/log.js';
import { translatorOf } from '../messages/translate.js';
import type { TaskEntry } from '../tasks/scheduler.js';
import type { TaskDeclaration } from '../tasks/task.js';
import { toCamelCase, type Camelize } from '../util/case.js';
import { expectThat, shown, TestFailure } from './failure.js';
import { World, type InteractionRecord } from './world.js';

/** The type Discord gives each kind of menu command. */
const MENU_COMMAND_TYPES = {
  user: ApplicationCommandType.User,
  message: ApplicationCommandType.Message,
} as const;

// ── What a scenario sees ─────────────────────────────────────────────

/** A person in the test server. */
export interface TestMember {
  /** The id of the person. */
  readonly id: string;
  /** The username of the person: what `bot.member()` was given. */
  readonly name: string;
  /** The nickname in the server, or `null` without one. */
  readonly nickname: string | null;
  /** The names of the roles of the person. */
  readonly roles: readonly string[];
  /** The permissions of the person in the server. */
  readonly permissions: readonly PermissionName[];
  /** Whether the person is in the server right now. */
  readonly inServer: boolean;
  /** Whether the person is banned from the server. */
  readonly banned: boolean;
  /** Whether the person is timed out right now. */
  readonly timedOut: boolean;
  /** The messages the bot sent to the person in private, oldest first. */
  readonly privateMessages: readonly TestMessage[];
  /** Whether the person may do that in the server. */
  can(permission: PermissionName): boolean;
  /** Whether the person has that role. */
  hasRole(role: string | TestRole): boolean;
}

/** A role of the test server. */
export interface TestRole {
  readonly id: string;
  readonly name: string;
  /** What the role allows. */
  readonly permissions: readonly PermissionName[];
  /** Whether the role still exists. */
  readonly exists: boolean;
}

/** The kinds of channels a test can make. */
export type TestChannelType =
  'text' | 'announcement' | 'voice' | 'category' | 'forum';

/** A channel of the test server, a thread, or a private conversation. */
export interface TestChannel {
  readonly id: string;
  readonly name: string;
  /** What kind of channel it is: `'text'`, `'voice'`, `'thread'`, `'dm'`... */
  readonly type: string;
  /** The topic, or `null`. */
  readonly topic: string | null;
  /** The seconds between two messages of one person (slowmode); `0` for none. */
  readonly slowmode: number;
  /** Whether the channel still exists. */
  readonly exists: boolean;
  /** Every message in it that everyone sees, oldest first (deleted and ephemeral ones left out). */
  readonly messages: readonly TestMessage[];
  /** The newest message, or `null`. */
  readonly last: TestMessage | null;
  /** The threads opened in it. */
  readonly threads: readonly TestChannel[];
  /** For a thread: who is in it. */
  readonly members: readonly TestMember[];
  /** For a thread: whether it is archived. */
  readonly archived: boolean;
  /** For a thread: whether it is locked. */
  readonly locked: boolean;
  /** Whether a member may do that in the channel (its overwrites counted). */
  allows(member: TestMember | TestRole, permission: PermissionName): boolean;
}

/** A button on a message the bot sent. */
export interface TestButton {
  /** The text on the button, or `null` for an emoji alone. */
  readonly label: string | null;
  /** `'primary'`, `'secondary'`, `'success'`, `'danger'`, `'link'` or `'premium'`. */
  readonly style: string;
  readonly disabled: boolean;
  /** The id the framework wrote in it. */
  readonly customId: string | null;
}

/** A select menu on a message the bot sent. */
export interface TestMenu {
  /** `'string'`, `'user'`, `'role'`, `'mentionable'` or `'channel'`. */
  readonly type: string;
  readonly placeholder: string | null;
  readonly disabled: boolean;
  /** For a menu of texts: its options. */
  readonly options: readonly { label: string; value: string }[];
  /** The id the framework wrote in it. */
  readonly customId: string;
}

/** A form the bot opened. */
export interface TestForm {
  readonly title: string;
  /** The names of its fields, in order. */
  readonly fields: readonly string[];
  /** The id the framework wrote in it. */
  readonly customId: string;
}

/** A suggestion the bot gave while someone typed in an option. */
export interface TestSuggestion {
  readonly name: string;
  readonly value: string | number;
}

/** A file someone attaches to a command or a form. */
export interface TestFile {
  /** The name of the file, with its extension: `photo.png`. */
  name: string;
  /** Its content, as text. */
  content?: string;
  /** Its media type: guessed from the name by default. */
  type?: string;
}

/** What is checked of a message or an answer. */
export interface TestAssertions<Self> {
  /** Checks that the text contains `text` (or matches it). */
  says(text: string | RegExp): Self;
  /** Checks that the text is exactly `text`. */
  saysExactly(text: string): Self;
  /** Checks that only the person who asked sees it. */
  isEphemeral(): Self;
  /** Checks that everyone sees it. */
  isPublic(): Self;
  /** Checks that there is a button with this label. */
  hasButton(label: string): Self;
  /** Checks that there is an embed, with this title when given. */
  hasEmbed(title?: string): Self;
  /** Checks that there is no embed. */
  hasNoEmbed(): Self;
  /** Checks that there is no button and no menu. */
  hasNoComponent(): Self;
}

/** A message in the test server. */
export interface TestMessage extends TestAssertions<TestMessage> {
  readonly id: string;
  /** The text of the message. */
  readonly content: string;
  /** Who wrote it; `null` for someone who is not in the world any more. */
  readonly author: TestMember | null;
  /** Whether the bot wrote it. */
  readonly fromBot: boolean;
  /** The embeds, as the bot sent them. */
  readonly embeds: readonly Camelize<RawEmbed>[];
  /** The buttons on it, in order. */
  readonly buttons: readonly TestButton[];
  /** The select menus on it, in order. */
  readonly menus: readonly TestMenu[];
  /** Whether only one person sees it. */
  readonly ephemeral: boolean;
  readonly pinned: boolean;
  /** The channel it is in. */
  readonly channel: TestChannel;
  /** Whether the message was deleted since. */
  readonly deleted: boolean;
  /** The button with this label: to click it. Fails when there is none. */
  button(label: string): TestButton;
  /** The menu, or the one with this placeholder. Fails when there is none. */
  menu(placeholder?: string): TestMenu;
}

/** What the bot answered to a command, a button, a menu or a form. */
export interface TestReply extends TestAssertions<TestReply> {
  /** The message the bot answered with (or changed), or `null` without one. */
  readonly message: TestMessage | null;
  /** The text of the answer; `''` without a message. */
  readonly content: string;
  readonly embeds: readonly Camelize<RawEmbed>[];
  readonly buttons: readonly TestButton[];
  readonly menus: readonly TestMenu[];
  /** The messages sent after the first answer, in order. */
  readonly followUps: readonly TestMessage[];
  /** The form the bot opened, or `null`. */
  readonly form: TestForm | null;
  /** Whether the bot said the answer was coming before answering. */
  readonly deferred: boolean;
  /** Whether the answer changed the message of the component. */
  readonly updated: boolean;
  readonly ephemeral: boolean;
  /** Checks that the bot said the answer was coming ("thinking…"). */
  isDeferred(): TestReply;
  /** Checks that the bot changed the message of the button or menu. */
  updatesMessage(): TestReply;
  /**
   * Checks that the bot opened a form, this one when given: its export
   * (whatever data it carries), the form called with its data, or one found
   * on an answer.
   */
  opensForm<Fields extends ModalFields, Data extends DataShape>(
    form?: ModalDeclaration<Fields, Data> | ModalComponent | TestForm
  ): TestReply;
  /** Checks that the bot answered with nothing visible (a deferred update). */
  changesNothing(): TestReply;
  /** The button with this label, to click it. Fails when there is none. */
  button(label: string): TestButton;
  /** The menu, or the one with this placeholder. Fails when there is none. */
  menu(placeholder?: string): TestMenu;
}

/** How to make a person for a test. */
export interface TestMemberOptions {
  /** The roles of the person, by name or as `bot.role()` gave them. */
  roles?: readonly (string | TestRole)[];
  /** Permissions given through a role of their own. */
  permissions?: readonly PermissionName[];
  nickname?: string;
  /** Whether the person is a bot. */
  bot?: boolean;
  /** The language of the person: what `t` answers them in. Default: `'en-US'`. */
  locale?: Locale;
}

export interface TestRoleOptions {
  permissions?: readonly PermissionName[];
}

export interface TestChannelOptions {
  /** Default: `'text'`. */
  type?: TestChannelType;
  /** The category it is in. */
  parent?: TestChannel;
  topic?: string;
}

/** Who does something, and where. */
export interface TestWhere {
  /** Who does it. Default: `bot.someone`. */
  by?: TestMember;
  /** Where: a channel, or `'dm'` for a private message with the bot. Default: `#general`. */
  in?: TestChannel | 'dm';
  /** For a button or a menu: the message it is on. Default: a message of the bot. */
  on?: TestMessage | TestReply;
}

/** What a test gives for an option, by its kind. */
type OptionInput<Option extends CommandOption> = Option extends {
  choices: readonly (infer Choice)[];
}
  ? Choice
  : Option extends { choices: Readonly<Record<string, infer Choice>> }
    ? Choice
    : Option['type'] extends 'string'
      ? string
      : Option['type'] extends 'integer' | 'number'
        ? number
        : Option['type'] extends 'boolean'
          ? boolean
          : Option['type'] extends 'user'
            ? TestMember
            : Option['type'] extends 'role'
              ? TestRole
              : Option['type'] extends 'channel'
                ? TestChannel
                : Option['type'] extends 'mentionable'
                  ? TestMember | TestRole
                  : TestFile;

/** The options of a command as a test fills them in. */
export type OptionInputsOf<Options extends CommandOptions> = {
  [
    Name in keyof Options as Options[Name] extends { required: true }
      ? Name
      : never
  ]: OptionInput<Options[Name]>;
} & {
  [
    Name in keyof Options as Options[Name] extends { required: true }
      ? never
      : Name
  ]?: OptionInput<Options[Name]>;
};

/** What a test gives for a field of a form, by its kind. */
type FieldInput<Field extends ModalField> = Field extends TextField
  ? string
  : Field extends SelectField<infer Options>
    ? readonly OptionValue<Options>[]
    : Field extends EntityField
      ? Field['type'] extends 'user'
        ? readonly TestMember[]
        : Field['type'] extends 'role'
          ? readonly TestRole[]
          : Field['type'] extends 'channel'
            ? readonly TestChannel[]
            : readonly (TestMember | TestRole)[]
      : Field extends FilesField
        ? readonly TestFile[]
        : Field extends RadioField<infer Options>
          ? OptionValue<Options>
          : Field extends CheckboxesField<infer Options>
            ? readonly OptionValue<Options>[]
            : Field extends CheckboxField
              ? boolean
              : never;

/** The fields of a form as a test fills them in: a field left out stays empty. */
export type FieldInputsOf<Fields extends ModalFields> = {
  [
    Name in keyof Fields as Fields[Name] extends NoteField ? never : Name
  ]?: FieldInput<Fields[Name]>;
};

/** What a test picks in a menu: texts, or people, roles and channels. */
export type SelectInput = string | TestMember | TestRole | TestChannel;

/** A button, as a test names it: the declaration, an instance, or one found on a message. */
export type ButtonTarget =
  ButtonDeclaration<never> | ButtonComponent | TestButton;
export type SelectTarget =
  SelectDeclaration<never> | SelectComponent | TestMenu;
export type FormTarget<Fields extends ModalFields = ModalFields> =
  ModalDeclaration<Fields, never> | ModalComponent | TestForm;

/**
 * What a menu command is used on in a test: a person for a `'user'` menu,
 * a message for a `'message'` menu.
 */
export type TestMenuTarget<Type extends MenuType = MenuType> = {
  /** The person or the message the menu is used on. */
  readonly on: Type extends 'user' ? TestMember : TestMessage;
};

/** The arguments of `bot.use()`: the options may be left out when none is required. */
type UseArgs<Options extends CommandOptions> =
  {} extends OptionInputsOf<Options>
    ? [options?: OptionInputsOf<Options>, where?: TestWhere]
    : [options: OptionInputsOf<Options>, where?: TestWhere];

/**
 * The bot of the project, running in a Discord in memory: one server, a few
 * people, and everything the bot does kept where the test can read it.
 */
export interface TestBot {
  /** The test server. */
  readonly guild: { readonly id: string; readonly name: string };
  /** The bot itself, as a member of the server. */
  readonly me: TestMember;
  /** The owner of the server. */
  readonly owner: TestMember;
  /** A person with no special rights: who does things when nobody is named. */
  readonly someone: TestMember;
  /** Every request the bot sent to Discord so far. */
  readonly requests: readonly { method: string; path: string; body: unknown }[];
  /**
   * A person of the server, made the first time the name is given. The
   * options only count the first time.
   */
  member(name: string, options?: TestMemberOptions): TestMember;
  /** A role of the server, made the first time the name is given. */
  role(name: string, options?: TestRoleOptions): TestRole;
  /** A channel of the server, made the first time the name is given. `#general` exists. */
  channel(name: string, options?: TestChannelOptions): TestChannel;
  /**
   * Uses a command, as a person would: a slash command with its options,
   * or a menu command on what it is used on (`{ on: message }`,
   * `{ on: member }`; a message menu is used in the channel of its
   * message). Resolves once the bot answered.
   */
  use<Type extends MenuType, Where extends CommandWhere>(
    command: MenuDeclaration<Type, Where>,
    target: TestMenuTarget<Type>,
    where?: TestWhere
  ): Promise<TestReply>;
  use<Options extends CommandOptions, Where extends CommandWhere>(
    command: CommandDeclaration<Options, Where>,
    ...args: UseArgs<Options>
  ): Promise<TestReply>;
  /** Clicks a button. Resolves once the bot answered. */
  click(button: ButtonTarget, where?: TestWhere): Promise<TestReply>;
  /** Picks values in a select menu. Resolves once the bot answered. */
  select(
    menu: SelectTarget,
    values: readonly SelectInput[],
    where?: TestWhere
  ): Promise<TestReply>;
  /** Fills in and sends a form. Resolves once the bot answered. */
  submit<Fields extends ModalFields>(
    form: FormTarget<Fields>,
    fields?: FieldInputsOf<Fields>,
    where?: TestWhere
  ): Promise<TestReply>;
  /** Types in an option with suggestions, and gets what the bot suggests. */
  suggest<Options extends CommandOptions, Where extends CommandWhere>(
    command: CommandDeclaration<Options, Where>,
    option: keyof Options & string,
    typed: string,
    where?: TestWhere
  ): Promise<TestSuggestion[]>;
  /** Sends a message as a person. Resolves once the bot handled it. */
  say(content: string, where?: TestWhere): Promise<TestMessage>;
  /** Reacts to a message as a person. Resolves once the bot handled it. */
  react(
    message: TestMessage,
    emoji: string,
    where?: Pick<TestWhere, 'by'>
  ): Promise<void>;
  /** Makes a person join the server. Resolves once the bot handled it. */
  join(
    member: string | TestMember,
    options?: TestMemberOptions
  ): Promise<TestMember>;
  /** Makes a person leave the server. Resolves once the bot handled it. */
  leave(member: TestMember): Promise<void>;
  /** Runs a task now, as if its time had come. Resolves once it is done. */
  run(task: TaskDeclaration, at?: Date): Promise<void>;
  /**
   * Ends everything the bot waits for (`waitForMessage()`,
   * `waitForClick()`...) as if its time was up: time does not pass in the
   * test server. Resolves once the bot handled it.
   */
  endWaits(): Promise<void>;
  /** Waits for everything the bot started to be done. */
  settle(): Promise<void>;
}

// ── Watching the project ───────────────────────────────────────────

/** What the test runner reads of what the bot said to the developer. */
export interface Captured {
  errors: string[];
  warnings: string[];
  infos: string[];
}

/** A `Log` that keeps what is written, for the runner to show per check. */
export function captureLog(): { log: Log; take(): Captured } {
  let current: Captured = { errors: [], warnings: [], infos: [] };
  return {
    log: {
      success: message => current.infos.push(message),
      info: message => current.infos.push(message),
      reload: message => current.infos.push(message),
      warn: message => current.warnings.push(message),
      error: message => current.errors.push(message),
    },
    take() {
      const taken = current;
      current = { errors: [], warnings: [], infos: [] };
      return taken;
    },
  };
}

/** Watches what the bot does with the files, to wait for it. */
export class Observer {
  readonly #pending = new Set<Promise<void>>();
  /**
   * The runs of the files waiting for what comes next: each keeps one
   * promise pending that only the test can end (`bot.say()`...).
   */
  readonly #parked = new Set<object>();
  /** Resolves the next time a run starts or stops waiting. */
  #parkChanged: () => void = () => {};
  readonly #interactions = new Map<string, Promise<void>>();
  readonly #interactionWaiters = new Map<
    string,
    (done: Promise<void>) => void
  >();
  readonly #eventWaiters: {
    match: (event: string, data: unknown) => boolean;
    resolve: (done: Promise<void>) => void;
  }[] = [];

  readonly observe: ProjectObserver = {
    waits: {
      parked: run => {
        this.#parked.add(run);
        this.#parkChanged();
      },
      resumed: run => {
        this.#parked.delete(run);
        this.#parkChanged();
      },
    },
    interaction: (raw, done) => {
      const settled = done.then(
        () => {},
        () => {}
      );
      this.#track(settled);
      this.#interactions.set(raw.id, settled);
      const waiter = this.#interactionWaiters.get(raw.id);
      if (waiter) {
        this.#interactionWaiters.delete(raw.id);
        waiter(settled);
      }
    },
    event: (event, data, done) => {
      const settled = done.then(
        () => {},
        () => {}
      );
      this.#track(settled);
      for (let index = this.#eventWaiters.length - 1; index >= 0; index--) {
        const waiter = this.#eventWaiters[index]!;
        if (waiter.match(event, data)) {
          this.#eventWaiters.splice(index, 1);
          waiter.resolve(settled);
        }
      }
    },
  };

  #track(settled: Promise<void>): void {
    this.#pending.add(settled);
    settled.finally(() => this.#pending.delete(settled));
  }

  /**
   * Forgets everything of the world before: a new world starts. What the
   * files of the last one still run (a case given up on) is never waited
   * for again.
   */
  reset(): void {
    this.#interactions.clear();
    this.#pending.clear();
    this.#parked.clear();
    this.#interactionWaiters.clear();
    this.#eventWaiters.length = 0;
  }

  /**
   * Resolves once the files were given the interaction `id`: `settle()`
   * then waits for them to be done with it.
   */
  interaction(id: string, timeout: number): Promise<void> {
    if (this.#interactions.has(id)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#interactionWaiters.delete(id);
        reject(
          new TestFailure(
            `The bot did not receive the interaction within ${timeout / 1000} s.`
          )
        );
      }, timeout);
      this.#interactionWaiters.set(id, () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /**
   * Resolves once the files were given the next event that matches:
   * `settle()` then waits for them to be done with it.
   */
  event(
    match: (event: string, data: unknown) => boolean,
    timeout: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const waiter = {
        match,
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
      };
      const timer = setTimeout(() => {
        const index = this.#eventWaiters.indexOf(waiter);
        if (index !== -1) this.#eventWaiters.splice(index, 1);
        reject(
          new TestFailure(
            `The bot did not receive the event within ${timeout / 1000} s.`
          )
        );
      }, timeout);
      this.#eventWaiters.push(waiter);
    });
  }

  /**
   * Resolves once nothing the files started is still running, but what
   * waits for the test to act (a run waiting for a message, a click...).
   */
  async settle(): Promise<void> {
    do {
      while (this.#pending.size > this.#parked.size) {
        const changed = new Promise<void>(
          resolve => (this.#parkChanged = resolve)
        );
        // Looked at again as soon as one is done: the one left may be a
        // run that waits, which only the test ends.
        await Promise.race([...this.#pending, changed]);
      }
      // Answers sent at the very end have reached the world by now, and a
      // wait given what just happened has started running again.
      await new Promise(resolve => setImmediate(resolve));
    } while (this.#pending.size > this.#parked.size);
  }
}

// ── The handles ──────────────────────────────────────────────────────

const permissionNames = (bits: bigint): PermissionName[] =>
  (Object.keys(PermissionFlags) as PermissionName[]).filter(
    name => (bits & PermissionFlags[name]) !== 0n
  );

const BUTTON_STYLES: Record<number, string> = {
  1: 'primary',
  2: 'secondary',
  3: 'success',
  4: 'danger',
  5: 'link',
  6: 'premium',
};

const MENU_TYPES: Record<number, string> = {
  [ComponentType.StringSelect]: 'string',
  [ComponentType.UserSelect]: 'user',
  [ComponentType.RoleSelect]: 'role',
  [ComponentType.MentionableSelect]: 'mentionable',
  [ComponentType.ChannelSelect]: 'channel',
};

const CHANNEL_TYPES: Record<TestChannelType, ChannelType> = {
  text: ChannelType.GuildText,
  announcement: ChannelType.GuildAnnouncement,
  voice: ChannelType.GuildVoice,
  category: ChannelType.GuildCategory,
  forum: ChannelType.GuildForum,
};

const channelTypeName = (type: ChannelType): string =>
  (Object.entries(CHANNEL_TYPES).find(([, value]) => value === type)?.[0] ??
    (type === ChannelType.Dm
      ? 'dm'
      : type === ChannelType.PublicThread ||
          type === ChannelType.PrivateThread ||
          type === ChannelType.AnnouncementThread
        ? 'thread'
        : 'other')) as string;

/** Every button and menu of a message, wherever they are nested. */
function collectComponents(components: readonly RawComponent[] | undefined): {
  buttons: RawButton[];
  menus: RawSelectMenu[];
} {
  const buttons: RawButton[] = [];
  const menus: RawSelectMenu[] = [];
  const walk = (list: readonly unknown[] | undefined): void => {
    for (const raw of list ?? []) {
      const component = raw as {
        type: number;
        components?: unknown[];
        accessory?: unknown;
      };
      if (component.type === ComponentType.Button) {
        buttons.push(component as RawButton);
      } else if (MENU_TYPES[component.type]) {
        menus.push(component as RawSelectMenu);
      } else {
        walk(component.components);
        if (component.accessory) walk([component.accessory]);
      }
    }
  };
  walk(components);
  return { buttons, menus };
}

/**
 * The message a button or a menu was found on, kept out of sight: clicking
 * it clicks that message, as a person would.
 */
const FOUND_ON = Symbol('found on');

/** The id of the message a handle was found on, if it was found on one. */
const foundOn = (target: unknown): string | undefined =>
  typeof target === 'object' && target !== null
    ? (target as { [FOUND_ON]?: string })[FOUND_ON]
    : undefined;

/** Keeps the message a handle was found on, without showing it. */
const onMessage = <T extends object>(handle: T, messageId: string): T =>
  Object.freeze(Object.defineProperty(handle, FOUND_ON, { value: messageId }));

const buttonHandle = (raw: RawButton, messageId: string): TestButton =>
  onMessage(
    {
      label: raw.label ?? null,
      style: BUTTON_STYLES[raw.style] ?? 'secondary',
      disabled: raw.disabled === true,
      customId: raw.custom_id ?? null,
    },
    messageId
  );

const menuHandle = (raw: RawSelectMenu, messageId: string): TestMenu =>
  onMessage(
    {
      type: MENU_TYPES[raw.type] ?? 'string',
      placeholder: raw.placeholder ?? null,
      disabled: raw.disabled === true,
      options:
        'options' in raw
          ? raw.options.map(option => ({
              label: option.label,
              value: option.value,
            }))
          : [],
      customId: raw.custom_id,
    },
    messageId
  );

/** Checks a message or an answer; written once for both. */
function check<Self>(
  self: Self,
  what: string,
  get: () => {
    content: string;
    embeds: readonly Camelize<RawEmbed>[];
    buttons: readonly TestButton[];
    menus: readonly TestMenu[];
    ephemeral: boolean;
    present: boolean;
  }
): TestAssertions<Self> {
  const present = (): ReturnType<typeof get> => {
    const state = get();
    expectThat(state.present, `${what} has no message to check.`);
    return state;
  };
  return {
    says(text) {
      const { content } = present();
      const matches =
        typeof text === 'string' ? content.includes(text) : text.test(content);
      expectThat(
        matches,
        `${what} should say ${typeof text === 'string' ? shown(text) : text}, it says ${shown(content)}.`
      );
      return self;
    },
    saysExactly(text) {
      const { content } = present();
      expectThat(
        content === text,
        `${what} should say exactly ${shown(text)}, it says ${shown(content)}.`
      );
      return self;
    },
    isEphemeral() {
      expectThat(
        present().ephemeral,
        `${what} should be ephemeral (seen by one person), it is seen by everyone.`
      );
      return self;
    },
    isPublic() {
      expectThat(
        !present().ephemeral,
        `${what} should be seen by everyone, it is ephemeral.`
      );
      return self;
    },
    hasButton(label) {
      const { buttons } = present();
      expectThat(
        buttons.some(button => button.label === label),
        `${what} should have a button ${shown(label)}, its buttons are: ${buttons.map(button => shown(button.label ?? '')).join(', ') || 'none'}.`
      );
      return self;
    },
    hasEmbed(title) {
      const { embeds } = present();
      expectThat(
        embeds.length > 0,
        `${what} should have an embed, it has none.`
      );
      if (title !== undefined) {
        expectThat(
          embeds.some(embed => embed.title === title),
          `${what} should have an embed titled ${shown(title)}, its embeds are titled: ${embeds.map(embed => shown(embed.title ?? '')).join(', ')}.`
        );
      }
      return self;
    },
    hasNoEmbed() {
      const { embeds } = present();
      expectThat(
        embeds.length === 0,
        `${what} should have no embed, it has ${embeds.length}.`
      );
      return self;
    },
    hasNoComponent() {
      const { buttons, menus } = present();
      expectThat(
        buttons.length === 0 && menus.length === 0,
        `${what} should have no button or menu, it has ${buttons.length} button(s) and ${menus.length} menu(s).`
      );
      return self;
    },
  };
}

/** The bot in its world, with the handles a test works with. */
export class Session implements TestBot {
  readonly world: World;
  readonly project: Project;
  readonly bot: Bot;
  readonly #observer: Observer;
  readonly #timeout: number;
  readonly #members = new Map<Snowflake, TestMember>();
  readonly #roles = new Map<Snowflake, TestRole>();
  readonly #channels = new Map<Snowflake, TestChannel>();
  readonly #messages = new Map<Snowflake, TestMessage>();
  #someone: TestMember | null = null;

  constructor(
    world: World,
    project: Project,
    bot: Bot,
    observer: Observer,
    options: { timeout?: number } = {}
  ) {
    this.world = world;
    this.project = project;
    this.bot = bot;
    this.#observer = observer;
    this.#timeout = options.timeout ?? 5000;
  }

  get guild() {
    return { id: this.world.guildId, name: this.world.guildName };
  }

  get me(): TestMember {
    return this.#member(this.world.botId);
  }

  get owner(): TestMember {
    return this.#member(this.world.ownerId);
  }

  get someone(): TestMember {
    return (this.#someone ??= this.member('someone'));
  }

  get requests() {
    return this.world.discord.requests.map(({ method, path, body }) => ({
      method,
      path,
      body,
    }));
  }

  // ── Handles ──

  #member(id: Snowflake): TestMember {
    let handle = this.#members.get(id);
    if (handle) return handle;
    const { world } = this;
    const user = (): RawUser => world.users.get(id)!;
    const member = (): RawGuildMember | undefined => world.members.get(id);
    const self = this;
    handle = Object.freeze({
      id,
      get name() {
        return user().username;
      },
      get nickname() {
        return member()?.nick ?? null;
      },
      get roles() {
        return (member()?.roles ?? [])
          .map(roleId => world.roles.get(roleId)?.name)
          .filter((name): name is string => name !== undefined);
      },
      get permissions() {
        return permissionNames(world.permissionsOf(id));
      },
      get inServer() {
        return member() !== undefined;
      },
      get banned() {
        return world.bans.has(id);
      },
      get timedOut() {
        const until = member()?.communication_disabled_until;
        return typeof until === 'string' && Date.parse(until) > Date.now();
      },
      get privateMessages() {
        return (
          world.messages
            .get(
              [...world.channels.values()].find(
                channel =>
                  channel.type === ChannelType.Dm &&
                  channel.recipients?.[0]?.id === id
              )?.id ?? ''
            )
            ?.map(raw => self.#message(raw)) ?? []
        );
      },
      can: (permission: PermissionName) =>
        new Permissions(world.permissionsOf(id)).has(permission),
      hasRole: (role: string | TestRole) =>
        (member()?.roles ?? []).some(roleId =>
          typeof role === 'string'
            ? world.roles.get(roleId)?.name === role
            : roleId === role.id
        ),
    });
    this.#members.set(id, handle);
    return handle;
  }

  #role(id: Snowflake): TestRole {
    let handle = this.#roles.get(id);
    if (handle) return handle;
    const { world } = this;
    handle = Object.freeze({
      id,
      get name() {
        return world.roles.get(id)?.name ?? '';
      },
      get permissions() {
        return permissionNames(BigInt(world.roles.get(id)?.permissions ?? '0'));
      },
      get exists() {
        return world.roles.has(id);
      },
    });
    this.#roles.set(id, handle);
    return handle;
  }

  #channel(id: Snowflake): TestChannel {
    let handle = this.#channels.get(id);
    if (handle) return handle;
    const { world } = this;
    const self = this;
    const raw = (): RawChannel | undefined => world.channels.get(id);
    // What only one person saw (an ephemeral answer) is not in the channel.
    const messages = (): TestMessage[] =>
      (world.messages.get(id) ?? [])
        .filter(
          message => ((message.flags ?? 0) & MessageFlags.Ephemeral) === 0
        )
        .map(message => self.#message(message));
    handle = Object.freeze({
      id,
      get name() {
        return raw()?.name ?? '';
      },
      get type() {
        return raw() ? channelTypeName(raw()!.type) : 'deleted';
      },
      get topic() {
        return raw()?.topic ?? null;
      },
      get slowmode() {
        return raw()?.rate_limit_per_user ?? 0;
      },
      get exists() {
        return raw() !== undefined;
      },
      get messages() {
        return messages();
      },
      get last() {
        return messages().at(-1) ?? null;
      },
      get threads() {
        return [...world.channels.values()]
          .filter(
            channel => channel.parent_id === id && world.isThread(channel)
          )
          .map(thread => self.#channel(thread.id));
      },
      get members() {
        return [...(world.threadMembers.get(id) ?? [])].map(userId =>
          self.#member(userId)
        );
      },
      get archived() {
        return raw()?.thread_metadata?.archived === true;
      },
      get locked() {
        return raw()?.thread_metadata?.locked === true;
      },
      allows: (who: TestMember | TestRole, permission: PermissionName) => {
        const channel = raw();
        if (!channel) return false;
        const isRole = !('inServer' in who);
        const base = isRole
          ? BigInt(world.roles.get(who.id)?.permissions ?? '0')
          : world.permissionsOf(who.id);
        if ((base & PermissionFlags.Administrator) !== 0n) return true;
        let permissions = base;
        const overwrites = channel.permission_overwrites ?? [];
        const apply = (overwriteId: Snowflake): void => {
          const overwrite = overwrites.find(one => one.id === overwriteId);
          if (!overwrite) return;
          permissions &= ~BigInt(overwrite.deny);
          permissions |= BigInt(overwrite.allow);
        };
        apply(world.guildId);
        if (!isRole) {
          for (const roleId of world.members.get(who.id)?.roles ?? [])
            apply(roleId);
        } else {
          apply(who.id);
        }
        apply(who.id);
        return new Permissions(permissions).has(permission);
      },
    });
    this.#channels.set(id, handle);
    return handle;
  }

  #message(raw: RawMessage): TestMessage {
    let handle = this.#messages.get(raw.id);
    if (handle) return handle;
    const { world } = this;
    const self = this;
    const current = (): RawMessage => world.findMessage(raw.id) ?? raw;
    const parts = () => {
      const message = current();
      const { buttons, menus } = collectComponents(message.components);
      return {
        content: message.content,
        embeds: toCamelCase(message.embeds) as Camelize<RawEmbed>[],
        buttons: buttons.map(button => buttonHandle(button, raw.id)),
        menus: menus.map(menu => menuHandle(menu, raw.id)),
        ephemeral: ((message.flags ?? 0) & MessageFlags.Ephemeral) !== 0,
        present: true,
      };
    };
    const base = {
      id: raw.id,
      get content() {
        return current().content;
      },
      get author() {
        return world.users.has(raw.author.id)
          ? self.#member(raw.author.id)
          : null;
      },
      fromBot: raw.author.id === world.botId,
      get embeds() {
        return parts().embeds;
      },
      get buttons() {
        return parts().buttons;
      },
      get menus() {
        return parts().menus;
      },
      get ephemeral() {
        return parts().ephemeral;
      },
      get pinned() {
        return current().pinned;
      },
      channel: this.#channel(raw.channel_id),
      get deleted() {
        return world.findMessage(raw.id) === undefined;
      },
      button(label: string): TestButton {
        const found = parts().buttons.find(button => button.label === label);
        expectThat(
          found !== undefined,
          `The message has no button ${shown(label)}: its buttons are ${
            parts()
              .buttons.map(button => shown(button.label ?? ''))
              .join(', ') || 'none'
          }.`
        );
        return found!;
      },
      menu(placeholder?: string): TestMenu {
        const { menus } = parts();
        const found =
          placeholder === undefined
            ? menus[0]
            : menus.find(menu => menu.placeholder === placeholder);
        expectThat(
          found !== undefined,
          placeholder === undefined
            ? 'The message has no menu.'
            : `The message has no menu with the placeholder ${shown(placeholder)}.`
        );
        return found!;
      },
    };
    handle = Object.freeze(
      Object.assign(
        base,
        check(base as unknown as TestMessage, 'The message', parts)
      )
    ) as unknown as TestMessage;
    this.#messages.set(raw.id, handle);
    return handle;
  }

  #reply(record: InteractionRecord): TestReply {
    const self = this;
    const message = (): TestMessage | null =>
      record.original ? self.#message(record.original) : null;
    const parts = () => {
      const found = message();
      return {
        content: found?.content ?? '',
        embeds: found?.embeds ?? [],
        buttons: found?.buttons ?? [],
        menus: found?.menus ?? [],
        ephemeral: found?.ephemeral ?? false,
        present: found !== null,
      };
    };
    const base = {
      get message() {
        return message();
      },
      get content() {
        return parts().content;
      },
      get embeds() {
        return parts().embeds;
      },
      get buttons() {
        return parts().buttons;
      },
      get menus() {
        return parts().menus;
      },
      get followUps() {
        return record.followUps.map(raw => self.#message(raw));
      },
      get form(): TestForm | null {
        if (!record.modal) return null;
        return Object.freeze({
          title: record.modal.title,
          fields: record.modal.components
            .map(component => {
              const label = component as { component?: { custom_id?: string } };
              return label.component?.custom_id;
            })
            .filter((name): name is string => typeof name === 'string'),
          customId: record.modal.custom_id,
        });
      },
      deferred: record.deferred,
      updated: record.updated,
      get ephemeral() {
        return parts().ephemeral;
      },
      isDeferred() {
        expectThat(
          record.deferred,
          'The bot should have said the answer was coming (interaction.defer()), it answered right away.'
        );
        return reply;
      },
      updatesMessage() {
        expectThat(
          record.updated,
          'The bot should have changed the message of the component (interaction.update()), it answered with a new message instead.'
        );
        return reply;
      },
      opensForm(form?: unknown) {
        expectThat(
          record.modal !== null,
          `The bot should have opened a form, it ${record.original ? `answered ${shown(record.original.content)}` : 'opened none'}.`
        );
        if (form) {
          // Only the name is compared: the form itself names it, with no
          // need for the data it was opened with.
          const state = componentStateOf(form);
          const expected =
            state?.kind === 'modal' && state.bound
              ? state.bound.name
              : typeof form === 'object' && 'customId' in form
                ? (form as TestForm).customId
                : self.#customIdOf(form, 'modal');
          const opened = record.modal!.custom_id.split(':')[0];
          expectThat(
            opened === expected.split(':')[0],
            `The bot should have opened the form ${expected.split(':')[0]}, it opened ${opened}.`
          );
        }
        return reply;
      },
      changesNothing() {
        expectThat(
          record.deferred &&
            record.updated &&
            record.followUps.length === 0 &&
            record.callbacks.length === 1 &&
            (record.original === null ||
              record.original.edited_timestamp === null),
          'The bot should have changed nothing (interaction.deferUpdate() alone), it answered something.'
        );
        return reply;
      },
      button(label: string): TestButton {
        const found = message();
        expectThat(
          found !== null,
          'The bot answered with no message: there is no button to find.'
        );
        return found!.button(label);
      },
      menu(placeholder?: string): TestMenu {
        const found = message();
        expectThat(
          found !== null,
          'The bot answered with no message: there is no menu to find.'
        );
        return found!.menu(placeholder);
      },
    };
    const reply = Object.freeze(
      Object.assign(
        base,
        check(base as unknown as TestReply, 'The answer', parts)
      )
    ) as unknown as TestReply;
    return reply;
  }

  // ── Making things ──

  member(name: string, options: TestMemberOptions = {}): TestMember {
    const existing = this.world.findUser(name);
    if (existing) return this.#member(existing.id);
    const user = this.world.addUser(name, {
      ...(options.bot ? { bot: true } : {}),
      locale: options.locale ?? 'en-US',
    });
    const roles = (options.roles ?? []).map(role =>
      typeof role === 'string' ? this.role(role).id : role.id
    );
    if (options.permissions && options.permissions.length > 0) {
      roles.push(
        this.role(`${name} permissions`, { permissions: options.permissions })
          .id
      );
    }
    this.world.addMember(user.id, {
      roles,
      nick: options.nickname ?? null,
    });
    return this.#member(user.id);
  }

  role(name: string, options: TestRoleOptions = {}): TestRole {
    for (const role of this.world.roles.values()) {
      if (role.name === name) return this.#role(role.id);
    }
    const role = this.world.addRole(name, {
      permissions: new Permissions([...(options.permissions ?? [])]).bits,
    });
    if (this.#connected()) {
      this.world.dispatch('GUILD_ROLE_CREATE', {
        guild_id: this.world.guildId,
        role,
      });
    }
    return this.#role(role.id);
  }

  channel(name: string, options: TestChannelOptions = {}): TestChannel {
    const existing = this.world.findChannel(name);
    if (existing) return this.#channel(existing.id);
    const channel = this.world.addChannel(name, {
      type: CHANNEL_TYPES[options.type ?? 'text'],
      parentId: options.parent?.id ?? null,
      topic: options.topic ?? null,
    });
    if (this.#connected()) this.world.dispatch('CHANNEL_CREATE', channel);
    return this.#channel(channel.id);
  }

  #connected(): boolean {
    const connection = this.world.gateway.connections.at(-1);
    return connection !== undefined && !connection.closed;
  }

  // ── Doing things ──

  /** Who does something: the member given, or someone. */
  #actor(where: TestWhere | undefined): RawUser {
    const id = where?.by?.id ?? this.someone.id;
    const user = this.world.users.get(id);
    if (!user)
      throw new TestFailure(
        `${where?.by?.name ?? 'This person'} is not in this world.`
      );
    return user;
  }

  /** The channel something happens in. */
  #place(
    where: TestWhere | undefined,
    actor: RawUser,
    forDm: boolean
  ): RawChannel {
    if (where?.in === 'dm' || (where?.in === undefined && forDm)) {
      return this.world.dm(actor.id);
    }
    const id = where?.in?.id ?? this.world.findChannel('general')!.id;
    const channel = this.world.channels.get(id);
    if (!channel) {
      throw new TestFailure(
        `The channel ${where?.in ? `#${where.in.name}` : '#general'} does not exist any more.`
      );
    }
    return channel;
  }

  #token(): string {
    return `token-${this.world.snowflake()}`;
  }

  /** An interaction as Discord would send it. */
  #rawInteraction(
    type: InteractionType,
    actor: RawUser,
    channel: RawChannel,
    data: RawInteraction['data'],
    message?: RawMessage
  ): RawInteraction {
    const inGuild = channel.guild_id !== undefined;
    const member = inGuild ? this.world.members.get(actor.id) : undefined;
    if (inGuild && !member) {
      throw new TestFailure(
        `${actor.username} is not in the server: they can not use anything there.`
      );
    }
    const id = this.world.snowflake();
    return {
      id,
      application_id: this.world.applicationId,
      type,
      data,
      ...(inGuild
        ? {
            guild_id: channel.guild_id,
            guild: {
              id: channel.guild_id,
              locale: 'en-US',
              features: [],
            } as never,
            member: {
              ...member!,
              permissions: this.world.permissionsOf(actor.id).toString(),
            },
            guild_locale: 'en-US',
            app_permissions: this.world
              .permissionsOf(this.world.botId)
              .toString(),
            context: 0,
            authorizing_integration_owners: { '0': channel.guild_id! },
          }
        : {
            user: actor,
            app_permissions: '0',
            context: 1,
            authorizing_integration_owners: { '1': actor.id },
          }),
      channel_id: channel.id,
      channel: {
        id: channel.id,
        type: channel.type,
        ...(channel.name ? { name: channel.name } : {}),
      },
      token: this.#token(),
      version: 1,
      ...(message ? { message } : {}),
      locale: actor.locale ?? 'en-US',
      entitlements: [],
      attachment_size_limit: 10 * 1024 * 1024,
    };
  }

  /** Makes the interaction happen and waits for the bot to be done with it. */
  async #interact(raw: RawInteraction): Promise<InteractionRecord> {
    const waiting = this.#observer.interaction(raw.id, this.#timeout);
    const record = this.world.interaction(raw);
    await waiting;
    await this.#observer.settle();
    return record;
  }

  #commandEntry(
    declaration:
      CommandDeclaration<CommandOptions, CommandWhere> | MenuDeclaration
  ): CommandEntry {
    const run = declaration?.config?.run;
    const entry = [...this.project.commands.values()].find(
      one => one.command.run === run
    );
    if (!entry) {
      throw new TestFailure(
        `This command is not loaded: is it exported from a file of src/ (export const ping = command({ ... })), and did its file load without error?`
      );
    }
    return entry;
  }

  use<Type extends MenuType, Where extends CommandWhere>(
    command: MenuDeclaration<Type, Where>,
    target: TestMenuTarget<Type>,
    where?: TestWhere
  ): Promise<TestReply>;
  use<Options extends CommandOptions, Where extends CommandWhere>(
    command: CommandDeclaration<Options, Where>,
    ...args: UseArgs<Options>
  ): Promise<TestReply>;
  async use(
    command: CommandDeclaration | MenuDeclaration,
    ...args: unknown[]
  ): Promise<TestReply> {
    const entry = this.#commandEntry(command as never);
    if (entry.command.type !== 'slash') {
      return this.#useMenu(
        entry,
        args[0] as TestMenuTarget | undefined,
        args[1] as TestWhere | undefined
      );
    }
    const [given = {}, where] = args as [Record<string, unknown>?, TestWhere?];
    const actor = this.#actor(where);
    const channel = this.#place(where, actor, entry.command.where === 'dm');
    const { options, resolved } = this.#commandOptions(entry, given, channel);
    const raw = this.#rawInteraction(
      InteractionType.ApplicationCommand,
      actor,
      channel,
      this.#commandData(entry, options, resolved)
    );
    return this.#reply(await this.#interact(raw));
  }

  async suggest<Options extends CommandOptions, Where extends CommandWhere>(
    command: CommandDeclaration<Options, Where>,
    option: keyof Options & string,
    typed: string,
    where?: TestWhere
  ): Promise<TestSuggestion[]> {
    const entry = this.#commandEntry(command as never);
    const declared = entry.command.options.find(one => one.name === option);
    if (!declared) {
      throw new TestFailure(
        `${commandName(entry.command.path)} has no option "${option}": its options are ${entry.command.options.map(one => one.name).join(', ') || 'none'}.`
      );
    }
    const actor = this.#actor(where);
    const channel = this.#place(where, actor, entry.command.where === 'dm');
    const isNumber = declared.type === 'integer' || declared.type === 'number';
    const value =
      isNumber && typed !== '' && Number.isFinite(Number(typed))
        ? Number(typed)
        : typed;
    const focused: RawApplicationCommandInteractionDataOption = {
      name: option,
      type: OPTION_TYPES[declared.type],
      value,
      focused: true,
    };
    const raw = this.#rawInteraction(
      InteractionType.ApplicationCommandAutocomplete,
      actor,
      channel,
      this.#commandData(entry, [focused], {})
    );
    const record = await this.#interact(raw);
    return (record.suggestions ?? []).map(choice => ({
      name: choice.name,
      value: choice.value,
    }));
  }

  /**
   * Uses a menu command on a person or a message, as Discord's client
   * does: on a message, in the channel of that message; on a person, where
   * `where` says (`#general`, or the private conversation of a
   * `where: 'dm'` command, by default).
   */
  async #useMenu(
    entry: CommandEntry,
    target: TestMenuTarget | undefined,
    where: TestWhere | undefined
  ): Promise<TestReply> {
    const { type, path, where: place } = entry.command;
    const kind = MENU_COMMAND_TYPES[type as MenuType];
    const name = describeCommand(entry.command);
    const on = target?.on as TestMember | TestMessage | undefined;
    const actor = this.#actor(where);
    const resolved: RawResolvedData = {};
    let channel: RawChannel;
    let targetId: Snowflake;
    if (type === 'message') {
      const message =
        on && !this.#isMember(on) ? this.world.findMessage(on.id) : undefined;
      if (!message) {
        throw new TestFailure(
          on && !this.#isMember(on)
            ? `The message ${on.id} does not exist any more: ${name} can not be used on it.`
            : `${capitalize(name)} is used on a message: bot.use(command, { on: message }), with a message of the test (await bot.say('...'), or one the bot sent).`
        );
      }
      const found = this.world.channels.get(message.channel_id);
      if (!found) {
        throw new TestFailure(
          `The channel of the message ${message.id} does not exist any more.`
        );
      }
      channel = found;
      targetId = message.id;
      (resolved.messages ??= {})[message.id] = message;
    } else {
      if (!this.#isMember(on)) {
        throw new TestFailure(
          `${capitalize(name)} is used on a person: bot.use(command, { on: bot.member('alice') }).`
        );
      }
      channel = this.#place(where, actor, place === 'dm');
      targetId = this.#resolveMember(
        `${capitalize(name)}`,
        on,
        resolved,
        channel
      );
    }
    const registered = this.world.guildCommands.find(
      command => command.name === path[0] && command.type === kind
    );
    const raw = this.#rawInteraction(
      InteractionType.ApplicationCommand,
      actor,
      channel,
      {
        id: registered?.id ?? this.world.snowflake(),
        name: path[0]!,
        type: kind,
        target_id: targetId,
        resolved,
        ...(channel.guild_id ? { guild_id: channel.guild_id } : {}),
      } as never
    );
    return this.#reply(await this.#interact(raw));
  }

  /** The `data` of a command interaction, subcommands nested as Discord does. */
  #commandData(
    entry: CommandEntry,
    options: RawApplicationCommandInteractionDataOption[],
    resolved: RawResolvedData
  ): RawInteraction['data'] {
    const [name, ...rest] = entry.command.path;
    let nested = options;
    for (const part of [...rest].reverse()) {
      nested = [
        {
          name: part,
          type:
            rest.indexOf(part) === 0 && rest.length === 2
              ? ApplicationCommandOptionType.SubCommandGroup
              : ApplicationCommandOptionType.SubCommand,
          options: nested,
        },
      ];
    }
    const registered = this.world.guildCommands.find(
      command =>
        command.name === name &&
        (command.type ?? ApplicationCommandType.ChatInput) ===
          ApplicationCommandType.ChatInput
    );
    return {
      id: registered?.id ?? this.world.snowflake(),
      name: name!,
      type: ApplicationCommandType.ChatInput,
      options: nested,
      ...(Object.keys(resolved).length > 0 ? { resolved } : {}),
      guild_id: this.world.guildId,
    } as never;
  }

  /** The options as Discord sends them, checked as its client would. */
  #commandOptions(
    entry: CommandEntry,
    given: Record<string, unknown>,
    channel: RawChannel
  ): {
    options: RawApplicationCommandInteractionDataOption[];
    resolved: RawResolvedData;
  } {
    const name = commandName(entry.command.path);
    const declared = entry.command.options;
    for (const key of Object.keys(given)) {
      if (!declared.some(option => option.name === key)) {
        throw new TestFailure(
          `${name} has no option "${key}": its options are ${declared.map(option => option.name).join(', ') || 'none'}.`
        );
      }
    }
    const options: RawApplicationCommandInteractionDataOption[] = [];
    const resolved: RawResolvedData = {};
    for (const option of declared) {
      const value = given[option.name];
      if (value === undefined) {
        if (option.required) {
          throw new TestFailure(
            `The option "${option.name}" of ${name} is required: Discord would not let the command be sent without it.`
          );
        }
        continue;
      }
      const what = `The option "${option.name}" of ${name}`;
      options.push({
        name: option.name,
        type: OPTION_TYPES[option.type],
        value: this.#optionValue(what, option, value, resolved, channel),
      });
    }
    return { options, resolved };
  }

  #optionValue(
    what: string,
    option: CommandEntry['command']['options'][number],
    value: unknown,
    resolved: RawResolvedData,
    channel: RawChannel
  ): string | number | boolean {
    const choices =
      'choices' in option && option.choices
        ? Array.isArray(option.choices)
          ? [...option.choices]
          : Object.values(option.choices as Record<string, string | number>)
        : null;
    if (choices && !choices.includes(value as never)) {
      throw new TestFailure(
        `${what} must be one of its choices (${choices.map(shown).join(', ')}), got ${shown(value)}.`
      );
    }
    switch (option.type) {
      case 'string': {
        if (typeof value !== 'string') {
          throw new TestFailure(`${what} is a text, got ${shown(value)}.`);
        }
        if (option.minLength !== undefined && value.length < option.minLength) {
          throw new TestFailure(
            `${what} is ${option.minLength} characters at least, got ${value.length}.`
          );
        }
        if (option.maxLength !== undefined && value.length > option.maxLength) {
          throw new TestFailure(
            `${what} is ${option.maxLength} characters at most, got ${value.length}.`
          );
        }
        return value;
      }
      case 'integer':
      case 'number': {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new TestFailure(`${what} is a number, got ${shown(value)}.`);
        }
        if (option.type === 'integer' && !Number.isInteger(value)) {
          throw new TestFailure(`${what} is a whole number, got ${value}.`);
        }
        if (option.min !== undefined && value < option.min) {
          throw new TestFailure(
            `${what} is ${option.min} at least, got ${value}.`
          );
        }
        if (option.max !== undefined && value > option.max) {
          throw new TestFailure(
            `${what} is ${option.max} at most, got ${value}.`
          );
        }
        return value;
      }
      case 'boolean':
        if (typeof value !== 'boolean') {
          throw new TestFailure(
            `${what} is true or false, got ${shown(value)}.`
          );
        }
        return value;
      case 'user':
        return this.#resolveMember(what, value, resolved, channel);
      case 'role':
        return this.#resolveRole(what, value, resolved);
      case 'mentionable':
        return this.#isMember(value)
          ? this.#resolveMember(what, value, resolved, channel)
          : this.#resolveRole(what, value, resolved);
      case 'channel':
        return this.#resolveChannel(what, value, resolved);
      case 'attachment':
        return this.#resolveFile(what, value, resolved);
    }
  }

  #isMember(value: unknown): value is TestMember {
    return typeof value === 'object' && value !== null && 'inServer' in value;
  }

  #resolveMember(
    what: string,
    value: unknown,
    resolved: RawResolvedData,
    channel: RawChannel
  ): string {
    if (!this.#isMember(value)) {
      throw new TestFailure(
        `${what} is a person (bot.member('alice')), got ${shown(value)}.`
      );
    }
    const user = this.world.users.get(value.id);
    if (!user)
      throw new TestFailure(`${what}: ${value.name} is not in this world.`);
    (resolved.users ??= {})[user.id] = user;
    const member = channel.guild_id
      ? this.world.members.get(user.id)
      : undefined;
    if (member) {
      const { user: _user, ...rest } = member;
      (resolved.members ??= {})[user.id] = {
        ...rest,
        permissions: this.world.permissionsOf(user.id).toString(),
      };
    }
    return user.id;
  }

  #resolveRole(
    what: string,
    value: unknown,
    resolved: RawResolvedData
  ): string {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('exists' in value) ||
      'inServer' in value ||
      'messages' in value
    ) {
      throw new TestFailure(
        `${what} is a role (bot.role('Moderator')), got ${shown(value)}.`
      );
    }
    const role = this.world.roles.get((value as TestRole).id);
    if (!role)
      throw new TestFailure(`${what}: that role does not exist any more.`);
    (resolved.roles ??= {})[role.id] = role;
    return role.id;
  }

  #resolveChannel(
    what: string,
    value: unknown,
    resolved: RawResolvedData
  ): string {
    if (typeof value !== 'object' || value === null || !('messages' in value)) {
      throw new TestFailure(
        `${what} is a channel (bot.channel('general')), got ${shown(value)}.`
      );
    }
    const channel = this.world.channels.get((value as TestChannel).id);
    if (!channel)
      throw new TestFailure(`${what}: that channel does not exist any more.`);
    (resolved.channels ??= {})[channel.id] = {
      id: channel.id,
      type: channel.type,
      name: channel.name,
      ...(channel.guild_id ? { guild_id: channel.guild_id } : {}),
      ...(channel.parent_id !== undefined
        ? { parent_id: channel.parent_id }
        : {}),
      permissions: this.world.permissionsOf(this.world.botId).toString(),
      ...(channel.thread_metadata
        ? { thread_metadata: channel.thread_metadata }
        : {}),
    };
    return channel.id;
  }

  #resolveFile(
    what: string,
    value: unknown,
    resolved: RawResolvedData
  ): string {
    const file = value as TestFile;
    if (
      typeof file !== 'object' ||
      file === null ||
      typeof file.name !== 'string'
    ) {
      throw new TestFailure(
        `${what} is a file ({ name: 'photo.png', content: '...' }), got ${shown(value)}.`
      );
    }
    const attachment: RawAttachment = {
      id: this.world.snowflake(),
      filename: file.name,
      size: Buffer.byteLength(file.content ?? ''),
      url: `https://cdn.discordapp.test/${file.name}`,
      proxy_url: `https://media.discordapp.test/${file.name}`,
      ...(file.type ? { content_type: file.type } : {}),
    };
    (resolved.attachments ??= {})[attachment.id] = attachment;
    return attachment.id;
  }

  /** The id and kind of a component, from how the test named it. */
  #customIdOf(
    target: unknown,
    expected: 'button' | 'select' | 'modal'
  ): string {
    if (typeof target === 'object' && target !== null && 'customId' in target) {
      const id = (target as { customId: string | null }).customId;
      if (typeof id !== 'string') {
        throw new TestFailure(
          'This button has no id: it is a link or a premium button, which the bot never hears of.'
        );
      }
      return id;
    }
    const state = componentStateOf(target);
    if (state && !state.bound) {
      throw new TestFailure(
        `This ${state.kind} is not loaded: is it exported from a file of src/, and did its file load without error?`
      );
    }
    if (!isPiece(target)) {
      throw new TestFailure(
        `Give the ${expected === 'modal' ? 'form' : expected === 'select' ? 'menu' : 'button'} itself (its export, called with its data when it has some) or one found on an answer (reply.button('Confirm')), got ${shown(target)}.`
      );
    }
    const rendered = renderedOf(target, 'The component given to the test');
    if (rendered.kind !== expected) {
      throw new TestFailure(
        `Expected a ${expected === 'modal' ? 'form' : expected === 'select' ? 'menu' : 'button'}, got a ${rendered.kind}.`
      );
    }
    const raw = resolve(
      rendered,
      translatorOf(this.bot.ctx, { person: 'en-US', ephemeral: true })
    ).raw as { custom_id?: string };
    if (typeof raw.custom_id !== 'string') {
      throw new TestFailure('This component has no id the bot could hear of.');
    }
    return raw.custom_id;
  }

  #componentEntry(
    kind: 'button' | 'select' | 'modal',
    customId: string
  ): ComponentEntry | undefined {
    const name = customId.split(':')[0];
    return [...this.project.components.values()].find(
      entry => entry.component.kind === kind && entry.component.name === name
    );
  }

  /** The message a component is on: the one given, or one of the bot. */
  #messageFor(
    where: TestWhere | undefined,
    actor: RawUser,
    channel: RawChannel,
    component: RawComponent,
    target?: unknown
  ): RawMessage {
    const given = where?.on;
    // Found on a message: that message, as long as it is there.
    const found = given ? undefined : foundOn(target);
    const sent = found ? this.world.findMessage(found) : undefined;
    if (sent) return sent;
    if (given) {
      const id = 'message' in given ? given.message?.id : given.id;
      const found = id ? this.world.findMessage(id) : undefined;
      if (!found) {
        throw new TestFailure(
          'message' in given
            ? 'The answer given in "on" has no message: the bot answered with none.'
            : 'The message given in "on" was deleted.'
        );
      }
      return found;
    }
    // Not sent: a message of the bot the person is looking at.
    return {
      id: this.world.snowflake(),
      channel_id: channel.id,
      author: this.world.bot,
      content: '',
      timestamp: new Date().toISOString(),
      edited_timestamp: null,
      tts: false,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      attachments: [],
      embeds: [],
      pinned: false,
      type: MessageType.Default,
      flags: 0,
      components: [
        { type: ComponentType.ActionRow, components: [component as never] },
      ],
      interaction_metadata: {
        id: this.world.snowflake(),
        type: InteractionType.ApplicationCommand,
        user: actor,
        authorizing_integration_owners: {},
      },
    };
  }

  async click(button: ButtonTarget, where?: TestWhere): Promise<TestReply> {
    const customId = this.#customIdOf(button, 'button');
    const entry = this.#componentEntry('button', customId);
    const actor = this.#actor(where);
    const channel = this.#place(
      where,
      actor,
      entry?.component.kind === 'button' && entry.component.where === 'dm'
    );
    const message = this.#messageFor(
      where,
      actor,
      channel,
      { type: ComponentType.Button, style: 2, custom_id: customId },
      button
    );
    const raw = this.#rawInteraction(
      InteractionType.MessageComponent,
      actor,
      channel,
      { custom_id: customId, component_type: ComponentType.Button },
      message
    );
    return this.#reply(await this.#interact(raw));
  }

  async select(
    menu: SelectTarget,
    values: readonly SelectInput[],
    where?: TestWhere
  ): Promise<TestReply> {
    const customId = this.#customIdOf(menu, 'select');
    const entry = this.#componentEntry('select', customId);
    const actor = this.#actor(where);
    const channel = this.#place(
      where,
      actor,
      entry?.component.kind === 'select' && entry.component.where === 'dm'
    );
    const type =
      typeof menu === 'object' && menu !== null && 'customId' in menu
        ? (menu as TestMenu).type
        : entry?.component.kind === 'select'
          ? entry.component.type
          : 'string';
    const resolved: RawResolvedData = {};
    const what = `What is picked in ${customId.split(':')[0]}`;
    const picked = values.map(value => {
      if (type === 'string') {
        if (typeof value !== 'string') {
          throw new TestFailure(
            `${what} is a text (the value of an option), got ${shown(value)}.`
          );
        }
        return value;
      }
      if (type === 'user')
        return this.#resolveMember(what, value, resolved, channel);
      if (type === 'role') return this.#resolveRole(what, value, resolved);
      if (type === 'channel')
        return this.#resolveChannel(what, value, resolved);
      return this.#isMember(value)
        ? this.#resolveMember(what, value, resolved, channel)
        : this.#resolveRole(what, value, resolved);
    });
    if (entry?.component.kind === 'select') {
      const { min, max, options, name } = entry.component;
      if (picked.length < min || picked.length > max) {
        throw new TestFailure(
          `${name} takes ${min === max ? min : `${min} to ${max}`} value(s): Discord would not let ${picked.length} be sent.`
        );
      }
      if (type === 'string' && options.length > 0) {
        const allowed = options.map(option => option.value);
        for (const value of picked) {
          if (!allowed.includes(value)) {
            throw new TestFailure(
              `${name} has no option ${shown(value)}: its options are ${allowed.map(shown).join(', ')}.`
            );
          }
        }
      }
    }
    const componentType =
      SELECT_COMPONENT_TYPES[type] ?? ComponentType.StringSelect;
    const message = this.#messageFor(
      where,
      actor,
      channel,
      {
        type: componentType,
        custom_id: customId,
        ...(componentType === ComponentType.StringSelect
          ? { options: [] }
          : {}),
      } as never,
      menu
    );
    const raw = this.#rawInteraction(
      InteractionType.MessageComponent,
      actor,
      channel,
      {
        custom_id: customId,
        component_type: componentType,
        values: picked,
        ...(Object.keys(resolved).length > 0 ? { resolved } : {}),
      },
      message
    );
    return this.#reply(await this.#interact(raw));
  }

  async submit<Fields extends ModalFields>(
    form: FormTarget<Fields>,
    fields: FieldInputsOf<Fields> = {} as FieldInputsOf<Fields>,
    where?: TestWhere
  ): Promise<TestReply> {
    const customId = this.#customIdOf(form, 'modal');
    const entry = this.#componentEntry('modal', customId);
    if (!entry || entry.component.kind !== 'modal') {
      throw new TestFailure(
        `The form ${customId.split(':')[0]} is not loaded: is it exported from a file of src/, and did its file load without error?`
      );
    }
    const modal = entry.component;
    const actor = this.#actor(where);
    const channel = this.#place(where, actor, modal.where === 'dm');
    const given = fields as Record<string, unknown>;
    for (const key of Object.keys(given)) {
      if (
        !modal.fields.some(
          field => field.name === key && field.field.type !== 'note'
        )
      ) {
        throw new TestFailure(
          `The form ${modal.name} has no field "${key}": its fields are ${modal.fields
            .filter(field => field.field.type !== 'note')
            .map(field => field.name)
            .join(', ')}.`
        );
      }
    }
    const resolved: RawResolvedData = {};
    const components: RawModalSubmitComponent[] = [];
    let id = 1;
    for (const loaded of modal.fields) {
      const { name, field, required, min, max } = loaded;
      if (field.type === 'note') continue;
      const what = `The field "${name}" of ${modal.name}`;
      const value = given[name];
      const count = (list: readonly unknown[]): void => {
        if (required && list.length === 0) {
          throw new TestFailure(
            `${what} is required: Discord would not let the form be sent empty.`
          );
        }
        if (list.length > 0 && (list.length < min || list.length > max)) {
          throw new TestFailure(
            `${what} takes ${min === max ? min : `${min} to ${max}`} value(s), got ${list.length}.`
          );
        }
      };
      let component: unknown;
      switch (field.type) {
        case 'text': {
          const text = value === undefined ? '' : value;
          if (typeof text !== 'string')
            throw new TestFailure(`${what} is a text, got ${shown(value)}.`);
          if (required && text === '') {
            throw new TestFailure(
              `${what} is required: Discord would not let the form be sent empty.`
            );
          }
          if (text !== '' && (text.length < min || text.length > max)) {
            throw new TestFailure(
              `${what} is ${min} to ${max} characters, got ${text.length}.`
            );
          }
          component = {
            type: ComponentType.TextInput,
            id: id++,
            custom_id: name,
            value: text,
          };
          break;
        }
        case 'select':
        case 'checkboxes': {
          const list = value === undefined ? [] : value;
          if (
            !Array.isArray(list) ||
            list.some(one => typeof one !== 'string')
          ) {
            throw new TestFailure(
              `${what} is a list of option values, got ${shown(value)}.`
            );
          }
          const allowed = loaded.options.map(option => option.value);
          for (const one of list) {
            if (!allowed.includes(one)) {
              throw new TestFailure(
                `${what} has no option ${shown(one)}: its options are ${allowed.map(shown).join(', ')}.`
              );
            }
          }
          count(list);
          component = {
            type:
              field.type === 'select'
                ? ComponentType.StringSelect
                : ComponentType.CheckboxGroup,
            id: id++,
            custom_id: name,
            values: list,
          };
          break;
        }
        case 'radio': {
          if (value === undefined) {
            if (required)
              throw new TestFailure(
                `${what} is required: Discord would not let the form be sent without a choice.`
              );
            component = {
              type: ComponentType.RadioGroup,
              id: id++,
              custom_id: name,
              value: null,
            };
            break;
          }
          const allowed = loaded.options.map(option => option.value);
          if (typeof value !== 'string' || !allowed.includes(value)) {
            throw new TestFailure(
              `${what} is one of ${allowed.map(shown).join(', ')}, got ${shown(value)}.`
            );
          }
          component = {
            type: ComponentType.RadioGroup,
            id: id++,
            custom_id: name,
            value,
          };
          break;
        }
        case 'checkbox':
          if (value !== undefined && typeof value !== 'boolean') {
            throw new TestFailure(
              `${what} is true or false, got ${shown(value)}.`
            );
          }
          component = {
            type: ComponentType.Checkbox,
            id: id++,
            custom_id: name,
            value: value === true,
          };
          break;
        case 'files': {
          const list = value === undefined ? [] : value;
          if (!Array.isArray(list))
            throw new TestFailure(
              `${what} is a list of files, got ${shown(value)}.`
            );
          count(list);
          component = {
            type: ComponentType.FileUpload,
            id: id++,
            custom_id: name,
            values: list.map(file => this.#resolveFile(what, file, resolved)),
          };
          break;
        }
        default: {
          const list = value === undefined ? [] : value;
          if (!Array.isArray(list))
            throw new TestFailure(`${what} is a list, got ${shown(value)}.`);
          count(list);
          const picked = list.map(one =>
            field.type === 'user'
              ? this.#resolveMember(what, one, resolved, channel)
              : field.type === 'role'
                ? this.#resolveRole(what, one, resolved)
                : field.type === 'channel'
                  ? this.#resolveChannel(what, one, resolved)
                  : this.#isMember(one)
                    ? this.#resolveMember(what, one, resolved, channel)
                    : this.#resolveRole(what, one, resolved)
          );
          component = {
            type: SELECT_COMPONENT_TYPES[field.type],
            id: id++,
            custom_id: name,
            values: picked,
            resolved,
          };
        }
      }
      components.push({
        type: ComponentType.Label,
        id: id++,
        component,
      } as never);
    }
    const opened = where?.on
      ? this.#messageFor(where, actor, channel, {
          type: ComponentType.Button,
          style: 2,
          custom_id: 'opened',
        })
      : undefined;
    const raw = this.#rawInteraction(
      InteractionType.ModalSubmit,
      actor,
      channel,
      {
        custom_id: customId,
        components,
        ...(Object.keys(resolved).length > 0 ? { resolved } : {}),
      },
      opened
    );
    return this.#reply(await this.#interact(raw));
  }

  async say(content: string, where?: TestWhere): Promise<TestMessage> {
    const actor = this.#actor(where);
    const channel = this.#place(where, actor, false);
    if (channel.guild_id && !this.world.members.has(actor.id)) {
      throw new TestFailure(
        `${actor.username} is not in the server: they can not write there.`
      );
    }
    const id = this.world.snowflake();
    const done = this.#observer.event(
      (type, data) =>
        type === 'MESSAGE_CREATE' && (data as RawMessage).id === id,
      this.#timeout
    );
    const message = this.world.createMessage(
      channel.id,
      actor,
      { content },
      {},
      {
        id,
      }
    );
    await done;
    await this.#observer.settle();
    return this.#message(message);
  }

  async react(
    message: TestMessage,
    emoji: string,
    where?: Pick<TestWhere, 'by'>
  ): Promise<void> {
    const actor = this.#actor(where);
    const raw = this.world.findMessage(message.id);
    if (!raw) throw new TestFailure('That message was deleted.');
    const channel = this.world.channels.get(raw.channel_id)!;
    const [name, id] = emoji.includes(':')
      ? emoji.split(':')
      : [emoji, undefined];
    const done = this.#observer.event(
      (type, data) =>
        type === 'MESSAGE_REACTION_ADD' &&
        (data as { message_id: string }).message_id === raw.id,
      this.#timeout
    );
    this.world.dispatch('MESSAGE_REACTION_ADD', {
      user_id: actor.id,
      channel_id: raw.channel_id,
      message_id: raw.id,
      ...(channel.guild_id
        ? {
            guild_id: channel.guild_id,
            member: this.world.members.get(actor.id),
          }
        : {}),
      emoji: { id: id ?? null, name },
      burst: false,
      type: 0,
    });
    await done;
    await this.#observer.settle();
  }

  async join(
    member: string | TestMember,
    options?: TestMemberOptions
  ): Promise<TestMember> {
    let user: RawUser | undefined;
    if (typeof member === 'string') {
      user =
        this.world.findUser(member) ??
        this.world.addUser(member, {
          ...(options?.bot ? { bot: true } : {}),
          locale: options?.locale ?? 'en-US',
        });
    } else {
      user = this.world.users.get(member.id);
    }
    if (!user) throw new TestFailure('That person is not in this world.');
    if (this.world.members.has(user.id)) {
      throw new TestFailure(`${user.username} is already in the server.`);
    }
    if (this.world.bans.has(user.id)) {
      throw new TestFailure(
        `${user.username} is banned: Discord would not let them join.`
      );
    }
    const roles = (options?.roles ?? []).map(role =>
      typeof role === 'string' ? this.role(role).id : role.id
    );
    if (options?.permissions && options.permissions.length > 0) {
      roles.push(
        this.role(`${user.username} permissions`, {
          permissions: options.permissions,
        }).id
      );
    }
    const raw = this.world.addMember(user.id, {
      roles,
      nick: options?.nickname ?? null,
    });
    const done = this.#observer.event(
      (type, data) =>
        type === 'GUILD_MEMBER_ADD' &&
        (data as RawGuildMember).user?.id === user!.id,
      this.#timeout
    );
    this.world.dispatch('GUILD_MEMBER_ADD', {
      ...raw,
      guild_id: this.world.guildId,
    });
    await done;
    await this.#observer.settle();
    return this.#member(user.id);
  }

  async leave(member: TestMember): Promise<void> {
    if (!this.world.members.has(member.id)) {
      throw new TestFailure(`${member.name} is not in the server.`);
    }
    const done = this.#observer.event(
      (type, data) =>
        type === 'GUILD_MEMBER_REMOVE' &&
        (data as { user: RawUser }).user.id === member.id,
      this.#timeout
    );
    this.world.removeMember(member.id);
    await done;
    await this.#observer.settle();
  }

  async run(task: TaskDeclaration, at = new Date()): Promise<void> {
    const run = (task as { config?: { run?: unknown } })?.config?.run;
    const entry: TaskEntry | undefined = [...this.project.tasks.values()].find(
      one => one.task.run === run
    );
    if (!entry) {
      throw new TestFailure(
        'This task is not loaded: is it exported from a file of src/ (export const weekly = task({ ... })), and did its file load without error?'
      );
    }
    await this.project.runTask(entry, this.bot, at);
    await this.#observer.settle();
  }

  settle(): Promise<void> {
    return this.#observer.settle();
  }

  async endWaits(): Promise<void> {
    this.bot.ctx.waiters?.close();
    await this.#observer.settle();
  }

  /**
   * Sends a gateway event to the bot and waits for the files to be done
   * with it. For the checks of `chapterjs test`, not for scenarios.
   */
  async emit(type: string, data: unknown): Promise<void> {
    const done = this.#observer.event(event => event === type, this.#timeout);
    this.world.dispatch(type, data);
    await done;
    await this.#observer.settle();
  }

  /**
   * Runs `act`, which makes the world send the event `type`, and waits for
   * the files to be done with it.
   */
  async expectEvent(type: string, act: () => void): Promise<void> {
    const done = this.#observer.event(event => event === type, this.#timeout);
    act();
    await done;
    await this.#observer.settle();
  }
}

const OPTION_TYPES: Record<
  CommandOption['type'],
  ApplicationCommandOptionType
> = {
  string: ApplicationCommandOptionType.String,
  integer: ApplicationCommandOptionType.Integer,
  number: ApplicationCommandOptionType.Number,
  boolean: ApplicationCommandOptionType.Boolean,
  user: ApplicationCommandOptionType.User,
  role: ApplicationCommandOptionType.Role,
  channel: ApplicationCommandOptionType.Channel,
  mentionable: ApplicationCommandOptionType.Mentionable,
  attachment: ApplicationCommandOptionType.Attachment,
};

const SELECT_COMPONENT_TYPES: Record<string, ComponentType> = {
  string: ComponentType.StringSelect,
  user: ComponentType.UserSelect,
  role: ComponentType.RoleSelect,
  mentionable: ComponentType.MentionableSelect,
  channel: ComponentType.ChannelSelect,
};
