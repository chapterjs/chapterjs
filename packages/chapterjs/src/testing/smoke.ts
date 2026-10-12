// The checks `chapterjs test` runs without anything written: every command,
// button, menu, form, event and task of the project, once with ordinary
// values and once with the hard ones (empty, at the limit, unicode, each
// choice, someone who left). A check passes when the bot answered and no
// function threw: the content is the scenarios' business.

import type { PermissionName } from '../discord/permissions.js';
import { Permissions } from '../discord/permissions.js';
import { ChannelType } from '../discord/types/channel.js';
import {
  commandName,
  describeCommand,
  type CommandEntry,
} from '../commands/tree.js';
import type { LoadedCommand } from '../commands/declaration.js';
import type { ComponentEntry } from '../components/router.js';
import type { LoadedField } from '../components/modal.js';
import type { Project } from '../cli/project.js';
import { EVENTS, type EventName } from '../events/registry.js';
import type { TaskEntry } from '../tasks/scheduler.js';
import type { Session, TestFile, TestMember, TestWhere } from './harness.js';

/** One thing to check, with the cases it is checked in. */
export interface Check {
  /** What is checked: `command /ping`, `button confirm()`, `event memberJoin`... */
  subject: string;
  /** The file it comes from. */
  file: string;
  cases: Case[];
}

export interface Case {
  /** How this case differs: `with everything`, `with reason at its longest`... */
  label: string;
  run(session: Session): Promise<void>;
}

const UNICODE = '🙂 héllo wörld — ça va ?';
const FILE: TestFile = {
  name: 'photo.png',
  content: 'not really a picture',
  type: 'image/png',
};

/** A text of the length an option allows, at most `max`. */
const textOf = (length: number): string =>
  'a'.repeat(Math.max(0, Math.floor(length)));

/** Who uses a command: someone with the permissions it asks for. */
function userFor(session: Session, command: LoadedCommand): TestMember {
  if (command.permissions === 0n) return session.someone;
  const names: PermissionName[] = new Permissions(
    command.permissions
  ).toArray();
  return session.member('mod', { permissions: names });
}

type Values = Record<string, unknown>;

/** The ordinary value of an option. */
function typical(
  session: Session,
  option: LoadedCommand['options'][number]
): unknown {
  const choices =
    'choices' in option && option.choices
      ? Array.isArray(option.choices)
        ? [...option.choices]
        : Object.values(option.choices as Record<string, string | number>)
      : null;
  if (choices && choices.length > 0) return choices[0];
  switch (option.type) {
    case 'string': {
      const min = option.minLength ?? 0;
      const max = option.maxLength ?? 6000;
      const text = 'hello';
      if (text.length < min) return textOf(min);
      if (text.length > max) return textOf(max);
      return text;
    }
    case 'integer': {
      const value = Math.max(option.min ?? 1, Math.min(option.max ?? 1, 1));
      return Math.round(value);
    }
    case 'number':
      return Math.max(option.min ?? 1.5, Math.min(option.max ?? 1.5, 1.5));
    case 'boolean':
      return true;
    case 'user':
      return session.member('bob');
    case 'role':
      return session.role('Members');
    case 'channel':
      return option.channelTypes &&
        !option.channelTypes.includes(ChannelType.GuildText)
        ? session.channel('smoke-voice', { type: 'voice' })
        : session.channel('general');
    case 'mentionable':
      return session.member('bob');
    case 'attachment':
      return FILE;
  }
}

/** A hard value of an option: its label, and the value once there is a world. */
interface HardValue {
  label: string;
  value: (session: Session, by: TestMember) => unknown;
}

/** The hard values of an option. */
function hard(option: LoadedCommand['options'][number]): HardValue[] {
  const choices =
    'choices' in option && option.choices
      ? Array.isArray(option.choices)
        ? [...option.choices]
        : Object.values(option.choices as Record<string, string | number>)
      : null;
  if (choices && choices.length > 0) {
    return choices.slice(1).map(value => ({
      label: `with ${option.name} = ${JSON.stringify(value)}`,
      value: () => value,
    }));
  }
  const fixed = (label: string, value: unknown): HardValue => ({
    label,
    value: () => value,
  });
  switch (option.type) {
    case 'string': {
      const min = option.minLength ?? 0;
      const max = option.maxLength ?? 6000;
      const cases = [
        fixed(
          `with ${option.name} at its longest (${max} characters)`,
          textOf(max)
        ),
      ];
      if (UNICODE.length >= min && UNICODE.length <= max) {
        cases.push(fixed(`with ${option.name} in unicode`, UNICODE));
      }
      if (min > 0)
        cases.push(
          fixed(
            `with ${option.name} at its shortest (${min} characters)`,
            textOf(min)
          )
        );
      return cases;
    }
    case 'integer':
    case 'number': {
      const cases: HardValue[] = [];
      if (option.min !== undefined)
        cases.push(
          fixed(`with ${option.name} at its lowest (${option.min})`, option.min)
        );
      else cases.push(fixed(`with ${option.name} negative`, -1));
      if (option.max !== undefined)
        cases.push(
          fixed(
            `with ${option.name} at its highest (${option.max})`,
            option.max
          )
        );
      else
        cases.push(
          fixed(
            `with ${option.name} huge`,
            option.type === 'integer' ? 1_000_000_000 : 1e9 + 0.5
          )
        );
      if ((option.min ?? -Infinity) <= 0 && (option.max ?? Infinity) >= 0) {
        cases.push(fixed(`with ${option.name} = 0`, 0));
      }
      return cases;
    }
    case 'boolean':
      return [fixed(`with ${option.name} = false`, false)];
    case 'user':
    case 'mentionable':
      return [
        {
          label: `with ${option.name} being who uses it`,
          value: (_, by) => by,
        },
        {
          label: `with ${option.name} being the bot`,
          value: session => session.me,
        },
        {
          label: `with ${option.name} being the owner`,
          value: session => session.owner,
        },
        {
          label: `with ${option.name} being someone who left`,
          value: session => session.member('gone'),
        },
      ];
    case 'role':
      return [
        {
          label: `with ${option.name} = @everyone`,
          value: session => session.role('@everyone'),
        },
      ];
    case 'channel':
      return [];
    case 'attachment':
      return [
        fixed(`with ${option.name} being an empty file`, {
          name: 'empty.txt',
          content: '',
        }),
      ];
  }
}

/** The longest message Discord accepts. */
const MAX_MESSAGE = 2000;

/**
 * The checks of a menu command: used on an ordinary message or person, and
 * on the hard ones (a message at its longest, the bot, the owner, someone
 * who left...).
 */
function menuCheck({ command, file }: CommandEntry): Check {
  const declaration = { config: { run: command.run } };
  const subject = describeCommand(command);
  const dm = command.where === 'dm';
  const cases: Case[] = [];
  const use = (
    session: Session,
    on: (session: Session, by: TestMember) => Promise<unknown> | unknown,
    where: Partial<TestWhere> = {}
  ): Promise<void> => {
    const by = userFor(session, command);
    return Promise.resolve(on(session, by))
      .then(target =>
        session.use(declaration as never, { on: target } as never, {
          by,
          ...where,
        })
      )
      .then(() => {});
  };
  if (command.type === 'message') {
    // The message is written where the menu is used.
    const say =
      (content: string, author?: (session: Session) => TestMember) =>
      (session: Session, by: TestMember) =>
        session.say(content, {
          by: author?.(session) ?? session.someone,
          ...(dm ? { in: 'dm', by } : {}),
        });
    cases.push(
      { label: 'on a message', run: session => use(session, say('Hello!')) },
      {
        label: 'on a message at its longest, with unicode',
        run: session =>
          use(
            session,
            say(`${UNICODE} ${textOf(MAX_MESSAGE)}`.slice(0, MAX_MESSAGE))
          ),
      }
    );
    if (!dm) {
      cases.push(
        {
          label: 'on a message of the owner',
          run: session =>
            use(
              session,
              say('Hello!', current => current.owner)
            ),
        },
        {
          label: 'on a message of someone who left',
          run: session =>
            use(session, async (current, by) => {
              // Not 'gone': the checks share their people, and 'gone' of
              // another check may have left already.
              const writer = current.member('gone-writer');
              const message = await say('Hello!', () => writer)(current, by);
              current.world.members.delete(writer.id);
              return message;
            }),
        }
      );
    }
    if (command.where === 'both') {
      cases.push({
        label: 'in a private message',
        run: session =>
          use(session, (current, by) =>
            current.say('Hello!', { by, in: 'dm' })
          ),
      });
    }
    return { subject, file, cases };
  }
  cases.push(
    {
      label: 'on someone',
      run: session => use(session, current => current.member('alice')),
    },
    { label: 'on who uses it', run: session => use(session, (_, by) => by) },
    { label: 'on the bot', run: session => use(session, current => current.me) }
  );
  if (!dm) {
    cases.push(
      {
        label: 'on the owner',
        run: session => use(session, current => current.owner),
      },
      {
        label: 'on someone who left',
        run: session =>
          use(session, current => {
            const gone = current.member('gone');
            current.world.members.delete(gone.id);
            return gone;
          }),
      }
    );
  }
  if (command.where === 'both') {
    cases.push({
      label: 'in a private message',
      run: session => use(session, (_, by) => by, { in: 'dm' }),
    });
  }
  return { subject, file, cases };
}

/** The checks of the commands. */
function commandChecks(project: Project): Check[] {
  return [...project.commands.values()].map((entry: CommandEntry) => {
    if (entry.command.type !== 'slash') return menuCheck(entry);
    const { command, file } = entry;
    const declaration = { config: { run: command.run } };
    const subject = `command ${commandName(command.path)}`;
    const use = (
      session: Session,
      values: (session: Session, by: TestMember) => Values,
      where: Partial<TestWhere> = {}
    ): Promise<void> => {
      const by = userFor(session, command);
      return session
        .use(declaration as never, values(session, by) as never, {
          by,
          ...where,
        })
        .then(() => {});
    };
    const all = (session: Session): Values =>
      Object.fromEntries(
        command.options.map(option => [option.name, typical(session, option)])
      );
    const required = (session: Session): Values =>
      Object.fromEntries(
        command.options
          .filter(option => option.required)
          .map(option => [option.name, typical(session, option)])
      );
    const cases: Case[] = [
      {
        label: command.options.length > 0 ? 'with every option' : 'as is',
        run: session => use(session, all),
      },
    ];
    if (command.options.some(option => !option.required)) {
      cases.push({
        label: 'with the required options only',
        run: session => use(session, required),
      });
    }
    for (const option of command.options) {
      for (const one of hard(option)) {
        cases.push({
          label: one.label,
          run: session =>
            use(session, (current, by) => {
              const value = one.value(current, by);
              // Someone who left: in the world, but not in the server.
              if (one.label.endsWith('who left')) {
                current.world.members.delete((value as TestMember).id);
              }
              return { ...all(current), [option.name]: value };
            }),
        });
      }
    }
    if (command.where === 'both') {
      cases.push({
        label: 'in a private message',
        run: session => use(session, all, { in: 'dm' }),
      });
    }
    return { subject, file, cases };
  });
}

/** The ordinary data of a component. */
const typicalData = (shape: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(shape).map(([name, field]) => {
      const kind =
        typeof field === 'string' ? field : (field as { type: string }).type;
      return [name, kind === 'string' ? 'value' : kind === 'number' ? 1 : true];
    })
  );

/** The hard data of a component, one field at a time. */
function hardData(
  shape: Record<string, unknown>
): { label: string; data: Record<string, unknown> }[] {
  const base = typicalData(shape);
  const cases: { label: string; data: Record<string, unknown> }[] = [];
  for (const [name, field] of Object.entries(shape)) {
    const kind =
      typeof field === 'string' ? field : (field as { type: string }).type;
    const values: unknown[] =
      kind === 'string'
        ? ['', 'a:b\\c', UNICODE]
        : kind === 'number'
          ? [0, -1, 1e15]
          : [false];
    for (const value of values) {
      cases.push({
        label: `with ${name} = ${JSON.stringify(value)}`,
        data: { ...base, [name]: value },
      });
    }
  }
  return cases;
}

/** What a test fills in a field of a form, ordinarily. */
function typicalField(session: Session, loaded: LoadedField): unknown {
  const { field, min, max } = loaded;
  switch (field.type) {
    case 'text': {
      const text = 'hello';
      return text.length < min
        ? textOf(min)
        : text.length > max
          ? textOf(max)
          : text;
    }
    case 'select':
    case 'checkboxes':
      return loaded.options
        .slice(0, Math.max(1, min))
        .map(option => option.value);
    case 'radio':
      return loaded.options[0]?.value;
    case 'checkbox':
      return true;
    case 'user':
      return [session.member('bob')];
    case 'role':
      return [session.role('Members')];
    case 'channel':
      return [session.channel('general')];
    case 'mentionable':
      return [session.member('bob')];
    case 'files':
      return [FILE];
    case 'note':
      return undefined;
  }
}

/** The checks of the buttons, menus and forms. */
function componentChecks(project: Project): Check[] {
  const checks: Check[] = [];
  for (const entry of project.components.values() as Iterable<ComponentEntry>) {
    const { component, file } = entry;
    if (component.kind === 'embed') continue;
    // Only waited for (`message.waitForClick()`): nothing of its own runs.
    if (component.kind !== 'modal' && !component.run) continue;
    const { name, data } = component;
    const target = (values: Record<string, unknown>) => ({
      customId: [
        name,
        ...Object.keys(data).map(key =>
          String(values[key]).replace(/[\\:]/g, c => `\\${c}`)
        ),
      ].join(':'),
      ...(component.kind === 'select'
        ? {
            type: component.type,
            placeholder: null,
            disabled: false,
            options: [],
          }
        : {}),
      ...(component.kind === 'modal' ? { title: '', fields: [] } : {}),
    });
    const where = (session: Session): TestWhere =>
      component.where === 'dm'
        ? { in: 'dm', by: session.someone }
        : { by: session.someone };
    const act = (
      session: Session,
      values: Record<string, unknown>
    ): Promise<unknown> => {
      if (component.kind === 'button') {
        return session.click(target(values) as never, where(session));
      }
      if (component.kind === 'select') {
        const picked =
          component.type === 'string'
            ? component.options
                .slice(0, Math.max(1, component.min))
                .map(option => option.value)
            : component.type === 'user' || component.type === 'mentionable'
              ? [session.member('bob')]
              : component.type === 'role'
                ? [session.role('Members')]
                : [session.channel('general')];
        return session.select(
          target(values) as never,
          picked.length > 0 ? picked : ['value'],
          where(session)
        );
      }
      const fields = Object.fromEntries(
        component.fields
          .filter(loaded => loaded.field.type !== 'note')
          .map(loaded => [loaded.name, typicalField(session, loaded)])
      );
      return session.submit(
        target(values) as never,
        fields as never,
        where(session)
      );
    };
    // The function the file called (`modal()`), and its export, a function too.
    const what = component.kind;
    const cases: Case[] = [
      {
        label: Object.keys(data).length > 0 ? 'with its data' : 'as is',
        run: session => act(session, typicalData(data)).then(() => {}),
      },
    ];
    for (const one of hardData(data)) {
      cases.push({
        label: one.label,
        run: session => act(session, one.data).then(() => {}),
      });
    }
    if (
      component.kind === 'modal' &&
      component.fields.some(
        loaded => !loaded.required && loaded.field.type !== 'note'
      )
    ) {
      cases.push({
        label: 'with the required fields only',
        run: session =>
          session
            .submit(
              target(typicalData(data)) as never,
              Object.fromEntries(
                component.fields
                  .filter(
                    loaded => loaded.required && loaded.field.type !== 'note'
                  )
                  .map(loaded => [loaded.name, typicalField(session, loaded)])
              ) as never,
              where(session)
            )
            .then(() => {}),
      });
    }
    checks.push({ subject: `${what} ${name}()`, file, cases });
  }
  return checks;
}

/** How the world makes each event happen. `null`: not simulated yet. */
const TRIGGERS: Partial<
  Record<EventName, (session: Session) => Promise<void>>
> = {
  messageCreate: async session => {
    await session.say('hello from a test', { by: session.member('bob') });
  },
  messageUpdate: async session => {
    const message = await session.say('before', { by: session.member('bob') });
    const raw = session.world.findMessage(message.id)!;
    await session.expectEvent('MESSAGE_UPDATE', () =>
      session.world.editMessage(raw, { content: 'after' })
    );
  },
  messageDelete: async session => {
    const message = await session.say('to delete', {
      by: session.member('bob'),
    });
    const raw = session.world.findMessage(message.id)!;
    await session.expectEvent('MESSAGE_DELETE', () =>
      session.world.deleteMessage(raw)
    );
  },
  memberJoin: async session => {
    await session.join('newcomer');
  },
  memberLeave: async session => {
    await session.leave(session.member('leaver'));
  },
  memberUpdate: async session => {
    const member = session.member('renamed');
    const raw = session.world.members.get(member.id)!;
    raw.nick = 'New nick';
    await session.expectEvent('GUILD_MEMBER_UPDATE', () =>
      session.world.memberUpdated(raw)
    );
  },
  guildUpdate: async session => {
    session.world.guildName = 'Renamed Server';
    await session.emit('GUILD_UPDATE', session.world.guildFields());
  },
  channelCreate: async session => {
    session.channel('created-by-the-test');
    await session.settle();
  },
  channelUpdate: async session => {
    const channel = session.world.findChannel('general')!;
    channel.topic = 'A new topic';
    await session.emit('CHANNEL_UPDATE', channel);
  },
  channelDelete: async session => {
    const channel = session.world.addChannel('to-delete');
    await session.emit('CHANNEL_CREATE', channel);
    session.world.channels.delete(channel.id);
    await session.emit('CHANNEL_DELETE', channel);
  },
  roleCreate: async session => {
    session.role('Created by the test');
    await session.settle();
  },
  roleUpdate: async session => {
    const role = session.world.roles.get(session.role('Members').id)!;
    role.name = 'Members (renamed)';
    await session.emit('GUILD_ROLE_UPDATE', {
      guild_id: session.world.guildId,
      role,
    });
  },
  roleDelete: async session => {
    const role = session.world.roles.get(session.role('To delete').id)!;
    session.world.roles.delete(role.id);
    await session.emit('GUILD_ROLE_DELETE', {
      guild_id: session.world.guildId,
      role_id: role.id,
    });
  },
  banAdd: async session => {
    const banned = session.member('banned');
    const user = session.world.users.get(banned.id)!;
    session.world.bans.set(user.id, { user, reason: 'a test' });
    await session.expectEvent('GUILD_MEMBER_REMOVE', () =>
      session.world.removeMember(user.id)
    );
    await session.emit('GUILD_BAN_ADD', {
      guild_id: session.world.guildId,
      user,
    });
  },
  banRemove: async session => {
    const user = session.world.addUser('unbanned');
    await session.emit('GUILD_BAN_REMOVE', {
      guild_id: session.world.guildId,
      user,
    });
  },
  reactionAdd: async session => {
    const message = await session.say('react to me', {
      by: session.member('bob'),
    });
    await session.react(message, '👍', { by: session.someone });
  },
  reactionRemove: async session => {
    const message = await session.say('reacted', { by: session.member('bob') });
    await session.emit('MESSAGE_REACTION_REMOVE', {
      user_id: session.someone.id,
      channel_id: session.world.findChannel('general')!.id,
      message_id: message.id,
      guild_id: session.world.guildId,
      emoji: { id: null, name: '👍' },
      burst: false,
      type: 0,
    });
  },
  reactionClear: async session => {
    const message = await session.say('cleared', { by: session.member('bob') });
    await session.emit('MESSAGE_REACTION_REMOVE_ALL', {
      channel_id: session.world.findChannel('general')!.id,
      message_id: message.id,
      guild_id: session.world.guildId,
    });
  },
  typingStart: async session => {
    await session.emit('TYPING_START', {
      channel_id: session.world.findChannel('general')!.id,
      guild_id: session.world.guildId,
      user_id: session.someone.id,
      timestamp: Math.floor(Date.now() / 1000),
      member: session.world.members.get(session.someone.id),
    });
  },
  threadMemberJoin: async session => {
    const thread = session.world.addChannel('a thread', {
      type: ChannelType.PublicThread,
      parentId: session.world.findChannel('general')!.id,
    });
    thread.thread_metadata = {
      archived: false,
      auto_archive_duration: 1440,
      archive_timestamp: new Date().toISOString(),
      locked: false,
    };
    await session.emit('THREAD_CREATE', { ...thread, newly_created: true });
    await session.emit('THREAD_MEMBERS_UPDATE', {
      id: thread.id,
      guild_id: session.world.guildId,
      member_count: 2,
      added_members: [
        {
          id: thread.id,
          user_id: session.someone.id,
          join_timestamp: new Date().toISOString(),
          flags: 0,
          member: session.world.members.get(session.someone.id),
        },
      ],
    });
  },
  threadMemberLeave: async session => {
    const thread = session.world.addChannel('another thread', {
      type: ChannelType.PublicThread,
      parentId: session.world.findChannel('general')!.id,
    });
    thread.thread_metadata = {
      archived: false,
      auto_archive_duration: 1440,
      archive_timestamp: new Date().toISOString(),
      locked: false,
    };
    await session.emit('THREAD_CREATE', { ...thread, newly_created: true });
    await session.emit('THREAD_MEMBERS_UPDATE', {
      id: thread.id,
      guild_id: session.world.guildId,
      member_count: 1,
      removed_member_ids: [session.someone.id],
    });
  },
  inviteCreate: async session => {
    await session.emit('INVITE_CREATE', {
      channel_id: session.world.findChannel('general')!.id,
      code: 'smoketest',
      created_at: new Date().toISOString(),
      guild_id: session.world.guildId,
      inviter: session.world.users.get(session.someone.id),
      max_age: 86400,
      max_uses: 0,
      temporary: false,
      uses: 0,
    });
  },
  inviteDelete: async session => {
    await session.emit('INVITE_DELETE', {
      channel_id: session.world.findChannel('general')!.id,
      guild_id: session.world.guildId,
      code: 'smoketest',
    });
  },
  presenceUpdate: async session => {
    await session.emit('PRESENCE_UPDATE', {
      user: { id: session.someone.id },
      guild_id: session.world.guildId,
      status: 'idle',
      activities: [],
      client_status: { desktop: 'idle' },
    });
  },
  voiceJoin: async session => {
    const voice = session.channel('Voice', { type: 'voice' });
    await session.settle();
    await session.emit('VOICE_STATE_UPDATE', voiceState(session, voice.id));
  },
  voiceLeave: async session => {
    const voice = session.channel('Voice', { type: 'voice' });
    await session.settle();
    await session.emit('VOICE_STATE_UPDATE', voiceState(session, voice.id));
    await session.emit('VOICE_STATE_UPDATE', voiceState(session, null));
  },
  voiceMove: async session => {
    const first = session.channel('Voice', { type: 'voice' });
    const second = session.channel('Voice 2', { type: 'voice' });
    await session.settle();
    await session.emit('VOICE_STATE_UPDATE', voiceState(session, first.id));
    await session.emit('VOICE_STATE_UPDATE', voiceState(session, second.id));
  },
  voiceUpdate: async session => {
    const voice = session.channel('Voice', { type: 'voice' });
    await session.settle();
    await session.emit('VOICE_STATE_UPDATE', voiceState(session, voice.id));
    await session.emit('VOICE_STATE_UPDATE', {
      ...voiceState(session, voice.id),
      self_mute: true,
    });
  },
  emojiCreate: async session => {
    await session.emit('GUILD_EMOJIS_UPDATE', {
      guild_id: session.world.guildId,
      emojis: [
        {
          id: session.world.snowflake(),
          name: 'smoke',
          roles: [],
          require_colons: true,
          managed: false,
          animated: false,
          available: true,
        },
      ],
    });
  },
  auditLogEntryCreate: async session => {
    await session.emit('GUILD_AUDIT_LOG_ENTRY_CREATE', {
      id: session.world.snowflake(),
      guild_id: session.world.guildId,
      user_id: session.owner.id,
      target_id: session.someone.id,
      action_type: 20,
      changes: [],
    });
  },
};

const voiceState = (session: Session, channelId: string | null) => ({
  guild_id: session.world.guildId,
  channel_id: channelId,
  user_id: session.someone.id,
  member: session.world.members.get(session.someone.id),
  session_id: 'voice-session',
  deaf: false,
  mute: false,
  self_deaf: false,
  self_mute: false,
  self_video: false,
  suppress: false,
  request_to_speak_timestamp: null,
});

/** The checks of the events: one occurrence each, when the world can make it. */
function eventChecks(project: Project): {
  checks: Check[];
  notSimulated: string[];
} {
  const checks: Check[] = [];
  const notSimulated: string[] = [];
  const seen = new Set<EventName>();
  for (const { event, file } of project.events.values()) {
    if (event.name === 'ready' || seen.has(event.name)) continue;
    seen.add(event.name);
    const trigger = TRIGGERS[event.name];
    if (!trigger || !(event.name in EVENTS)) {
      notSimulated.push(event.name);
      continue;
    }
    checks.push({
      subject: `event ${event.name}`,
      file,
      cases: [{ label: 'once', run: session => trigger(session) }],
    });
  }
  return { checks, notSimulated };
}

/** The checks of the tasks: one run each. */
function taskChecks(project: Project): Check[] {
  return [...project.tasks.values()].map((entry: TaskEntry) => ({
    subject: `task ${entry.task.name}`,
    file: entry.file,
    cases: [
      {
        label: 'once',
        run: async session => {
          await session.project.runTask(entry, session.bot);
          await session.settle();
        },
      },
    ],
  }));
}

/**
 * The check of the presence, when it has functions: each runs once, as
 * the rotation would run it.
 */
function presenceChecks(project: Project): Check[] {
  const file = project.presenceFile;
  const presence = project.presence;
  if (!file || !presence) return [];
  const hasFunctions =
    typeof presence.activities === 'function' ||
    presence.activities.some(one => typeof one.name === 'function');
  if (!hasFunctions) return [];
  return [
    {
      subject: 'the presence',
      file,
      cases: [
        {
          label: 'once',
          run: session => session.project.runPresence(session.bot),
        },
      ],
    },
  ];
}

/** Every check of the project, in the order of the report. */
export function smokeChecks(project: Project): {
  checks: Check[];
  notSimulated: string[];
} {
  const events = eventChecks(project);
  return {
    checks: [
      ...commandChecks(project),
      ...componentChecks(project),
      ...events.checks,
      ...taskChecks(project),
      ...presenceChecks(project),
    ],
    notSimulated: events.notSimulated,
  };
}
