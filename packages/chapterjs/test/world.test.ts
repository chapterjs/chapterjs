// The Discord in memory of `chapterjs test`: the real REST client runs
// against it, and what it answers is what Discord would.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as E from '../src/discord/endpoints.js';
import { ChannelType, type RawChannel } from '../src/discord/types/channel.js';
import { InteractionType } from '../src/discord/types/interaction.js';
import { MessageFlags } from '../src/discord/types/message.js';
import { PermissionFlags } from '../src/discord/types/permissions.js';
import { ALL_PERMISSIONS } from '../src/discord/permissions.js';
import { DiscordApiError } from '../src/rest/errors.js';
import { RestClient } from '../src/rest/rest.js';
import { World } from '../src/testing/world.js';

let world: World;
let rest: RestClient;

beforeEach(async () => {
  world = new World();
  await world.start();
  rest = new RestClient({
    token: 'test-token',
    version: '0.0.0',
    baseUrl: world.discord.url,
    retries: 0,
  });
});

afterEach(() => world.close());

/** A gateway client that identifies, as the shard of the bot does. */
async function connect(): Promise<{
  received: { t?: string | null; d?: unknown }[];
  next(type: string): Promise<unknown>;
  close(): void;
}> {
  const socket = new WebSocket(`${world.gateway.url}/?v=10&encoding=json`);
  const received: { t?: string | null; d?: unknown }[] = [];
  const waiters: { type: string; resolve: (data: unknown) => void }[] = [];
  socket.addEventListener('message', event => {
    const payload = JSON.parse(String(event.data)) as {
      op: number;
      t?: string | null;
      d?: unknown;
    };
    if (payload.op === 10) {
      socket.send(
        JSON.stringify({
          op: 2,
          d: { token: 'test-token', intents: 0, properties: {} },
        })
      );
      return;
    }
    received.push(payload);
    for (let index = waiters.length - 1; index >= 0; index--) {
      if (waiters[index]!.type === payload.t) {
        waiters.splice(index, 1)[0]!.resolve(payload.d);
      }
    }
  });
  const next = (type: string): Promise<unknown> => {
    const found = received.find(payload => payload.t === type);
    if (found) return Promise.resolve(found.d);
    return new Promise(resolve => waiters.push({ type, resolve }));
  };
  await next('GUILD_CREATE');
  return { received, next, close: () => socket.close() };
}

const failure = async (promise: Promise<unknown>): Promise<DiscordApiError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DiscordApiError) return error;
    throw error;
  }
  throw new Error('Expected the request to be refused.');
};

describe('the world', () => {
  it('starts with a server, its owner, the bot as an admin and #general', () => {
    const guild = world.guildPayload();
    expect(guild.name).toBe('Test Server');
    expect(guild.owner_id).toBe(world.ownerId);
    expect(guild.members).toHaveLength(2);
    expect(
      (guild.channels as RawChannel[]).map(channel => channel.name)
    ).toEqual(['general']);
    expect(guild.roles.map(role => role.name)).toEqual([
      '@everyone',
      'Test Bot',
    ]);
    expect(world.permissionsOf(world.botId)).toBe(ALL_PERMISSIONS);
    expect(world.permissionsOf(world.ownerId)).toBe(ALL_PERMISSIONS);
  });

  it('gives ids that never repeat, across worlds too', () => {
    const other = new World();
    const ids = new Set<string>();
    for (let index = 0; index < 100; index++) {
      ids.add(world.snowflake());
      ids.add(other.snowflake());
    }
    expect(ids.size).toBe(200);
    expect(BigInt(world.snowflake()) > BigInt(other.guildId)).toBe(true);
  });

  it('computes the permissions of a member from their roles', () => {
    const alice = world.addUser('alice');
    world.addMember(alice.id);
    expect(
      world.permissionsOf(alice.id) & PermissionFlags.SendMessages
    ).not.toBe(0n);
    expect(world.permissionsOf(alice.id) & PermissionFlags.BanMembers).toBe(0n);
    const mods = world.addRole('Mods', {
      permissions: PermissionFlags.BanMembers,
    });
    world.members.get(alice.id)!.roles.push(mods.id);
    expect(world.permissionsOf(alice.id) & PermissionFlags.BanMembers).not.toBe(
      0n
    );
    world.addRole('Admins', { permissions: PermissionFlags.Administrator });
    expect(world.permissionsOf('nobody')).toBe(0n);
  });

  it('answers the application and the gateway', async () => {
    const application = await rest.request(E.GetCurrentApplication, []);
    expect(application.id).toBe(world.applicationId);
    expect(application.bot?.username).toBe('Test Bot');
    const gateway = await rest.request(E.GetGatewayBot, []);
    expect(gateway.url).toBe(world.gateway.url);
    expect(gateway.shards).toBe(1);
  });

  it('knows its server and nothing else', async () => {
    const guild = await rest.request(E.GetGuild, [world.guildId]);
    expect(guild.name).toBe('Test Server');
    const refused = await failure(rest.request(E.GetGuild, ['1']));
    expect(refused.status).toBe(404);
    expect(refused.code).toBe(10004);
    const unknownMember = await failure(
      rest.request(E.GetGuildMember, [world.guildId, '2'])
    );
    expect(unknownMember.code).toBe(10007);
    const unknownUser = await failure(rest.request(E.GetUser, ['3']));
    expect(unknownUser.code).toBe(10013);
  });

  describe('messages', () => {
    it('keeps what the bot sends, newest first when asked', async () => {
      const general = world.findChannel('general')!;
      const first = await rest.request(E.CreateMessage, [general.id], {
        body: { content: 'one' },
      });
      await rest.request(E.CreateMessage, [general.id], {
        body: { content: 'two', embeds: [{ title: 'Hi' }] },
      });
      expect(first.author.id).toBe(world.botId);
      expect((first as { member?: unknown }).member).toBeDefined();
      const list = await rest.request(E.GetChannelMessages, [general.id], {
        query: { limit: 10 },
      });
      expect(list.map(message => message.content)).toEqual(['two', 'one']);
      expect(list[0]!.embeds[0]!.title).toBe('Hi');
      const before = await rest.request(E.GetChannelMessages, [general.id], {
        query: { before: list[0]!.id },
      });
      expect(before.map(message => message.content)).toEqual(['one']);
    });

    it('replies, edits, pins and deletes', async () => {
      const general = world.findChannel('general')!;
      const original = await rest.request(E.CreateMessage, [general.id], {
        body: { content: 'original' },
      });
      const reply = await rest.request(E.CreateMessage, [general.id], {
        body: {
          content: 'reply',
          message_reference: { message_id: original.id },
        },
      });
      expect(reply.referenced_message?.id).toBe(original.id);
      expect(reply.type).toBe(19);
      const edited = await rest.request(
        E.EditMessage,
        [general.id, original.id],
        { body: { content: 'changed' } }
      );
      expect(edited.content).toBe('changed');
      expect(edited.edited_timestamp).not.toBeNull();
      await rest.request(E.PinMessage, [general.id, original.id]);
      expect(world.findMessage(original.id)?.pinned).toBe(true);
      await rest.request(E.DeleteMessage, [general.id, original.id]);
      const gone = await failure(
        rest.request(E.GetChannelMessage, [general.id, original.id])
      );
      expect(gone.code).toBe(10008);
      await rest.request(E.BulkDeleteMessages, [general.id], {
        body: { messages: [reply.id, 'not-there'] },
      });
      expect(world.messages.get(general.id)).toEqual([]);
    });

    it('keeps the files sent with a message', async () => {
      const general = world.findChannel('general')!;
      const message = await rest.request(E.CreateMessage, [general.id], {
        body: { content: 'with a file' },
        files: [{ name: 'notes.txt', data: 'hello' }],
      });
      expect(message.attachments.map(file => file.filename)).toEqual([
        'notes.txt',
      ]);
      expect(message.attachments[0]!.size).toBe(5);
    });

    it('leaves ephemeral answers out of the history', async () => {
      const general = world.findChannel('general')!;
      await rest.request(E.CreateMessage, [general.id], {
        body: { content: 'secret', flags: MessageFlags.Ephemeral },
      });
      await rest.request(E.CreateMessage, [general.id], {
        body: { content: 'public' },
      });
      const list = await rest.request(E.GetChannelMessages, [general.id]);
      expect(list.map(message => message.content)).toEqual(['public']);
    });
  });

  describe('members, roles and bans', () => {
    it('changes a member, their roles, and tells the bot', async () => {
      const client = await connect();
      const alice = world.addUser('alice');
      world.addMember(alice.id);
      const role = await rest.request(E.CreateGuildRole, [world.guildId], {
        body: { name: 'Helpers', permissions: '0', color: 1 },
      });
      expect(role.name).toBe('Helpers');
      expect(await client.next('GUILD_ROLE_CREATE')).toMatchObject({
        role: { name: 'Helpers' },
      });
      await rest.request(E.AddGuildMemberRole, [
        world.guildId,
        alice.id,
        role.id,
      ]);
      expect(world.members.get(alice.id)!.roles).toEqual([role.id]);
      const updated = await rest.request(
        E.ModifyGuildMember,
        [world.guildId, alice.id],
        {
          body: {
            nick: 'Al',
            communication_disabled_until: '2099-01-01T00:00:00Z',
          },
        }
      );
      expect(updated.nick).toBe('Al');
      expect(updated.communication_disabled_until).toBe('2099-01-01T00:00:00Z');
      await rest.request(E.RemoveGuildMemberRole, [
        world.guildId,
        alice.id,
        role.id,
      ]);
      expect(world.members.get(alice.id)!.roles).toEqual([]);
      const missing = await failure(
        rest.request(E.AddGuildMemberRole, [world.guildId, alice.id, '0'])
      );
      expect(missing.code).toBe(10011);
      await rest.request(E.DeleteGuildRole, [world.guildId, role.id]);
      expect(world.roles.has(role.id)).toBe(false);
      client.close();
    });

    it('kicks and bans, with the reason, and unbans', async () => {
      const alice = world.addUser('alice');
      world.addMember(alice.id);
      const bob = world.addUser('bob');
      world.addMember(bob.id);
      await rest.request(E.RemoveGuildMember, [world.guildId, alice.id]);
      expect(world.members.has(alice.id)).toBe(false);
      await rest.request(E.CreateGuildBan, [world.guildId, bob.id], {
        body: {},
        reason: 'spam',
      });
      expect(world.members.has(bob.id)).toBe(false);
      expect(world.bans.get(bob.id)?.reason).toBe('spam');
      const ban = await rest.request(E.GetGuildBan, [world.guildId, bob.id]);
      expect(ban.user.username).toBe('bob');
      const bans = await rest.request(E.GetGuildBans, [world.guildId]);
      expect(bans).toHaveLength(1);
      await rest.request(E.RemoveGuildBan, [world.guildId, bob.id]);
      expect(world.bans.size).toBe(0);
      const notBanned = await failure(
        rest.request(E.RemoveGuildBan, [world.guildId, bob.id])
      );
      expect(notBanned.code).toBe(10026);
      const result = await rest.request(E.BulkGuildBan, [world.guildId], {
        body: { user_ids: [alice.id, 'nobody'] },
      });
      expect(result).toEqual({
        banned_users: [alice.id],
        failed_users: ['nobody'],
      });
    });
  });

  describe('channels and threads', () => {
    it('creates, changes and deletes channels', async () => {
      const created = await rest.request(
        E.CreateGuildChannel,
        [world.guildId],
        {
          body: {
            name: 'rules',
            type: ChannelType.GuildText,
            topic: 'Read me',
          },
        }
      );
      expect(created.topic).toBe('Read me');
      const changed = await rest.request(E.ModifyChannel, [created.id], {
        body: { rate_limit_per_user: 5, name: 'the-rules' },
      });
      expect(changed.rate_limit_per_user).toBe(5);
      expect(changed.name).toBe('the-rules');
      await rest.request(
        E.EditChannelPermissions,
        [created.id, world.guildId],
        {
          body: {
            type: 0,
            allow: '0',
            deny: PermissionFlags.SendMessages.toString(),
          },
        }
      );
      expect(
        world.channels.get(created.id)?.permission_overwrites
      ).toHaveLength(1);
      await rest.request(E.DeleteChannelPermission, [
        created.id,
        world.guildId,
      ]);
      expect(world.channels.get(created.id)?.permission_overwrites).toEqual([]);
      await rest.request(E.DeleteCloseChannel, [created.id]);
      expect(world.channels.has(created.id)).toBe(false);
      const gone = await failure(rest.request(E.GetChannel, [created.id]));
      expect(gone.code).toBe(10003);
    });

    it('starts threads from a message or from nothing, with their members', async () => {
      const general = world.findChannel('general')!;
      const message = await rest.request(E.CreateMessage, [general.id], {
        body: { content: 'let us talk' },
      });
      const fromMessage = await rest.request(
        E.StartThreadFromMessage,
        [general.id, message.id],
        { body: { name: 'talk' } }
      );
      expect(fromMessage.id).toBe(message.id);
      expect(fromMessage.type).toBe(ChannelType.PublicThread);
      expect(
        (world.findMessage(message.id)!.flags ?? 0) & MessageFlags.HasThread
      ).not.toBe(0);
      const alone = await rest.request(
        E.StartThreadWithoutMessage,
        [general.id],
        {
          body: {
            name: 'private',
            type: ChannelType.PrivateThread,
            invitable: false,
          },
        }
      );
      expect(alone.type).toBe(ChannelType.PrivateThread);
      expect(alone.thread_metadata?.invitable).toBe(false);
      const alice = world.addUser('alice');
      world.addMember(alice.id);
      await rest.request(E.AddThreadMember, [alone.id, alice.id]);
      const members = await rest.request(E.ListThreadMembers, [alone.id]);
      expect(members.map(member => member.user_id).sort()).toEqual(
        [world.botId, alice.id].sort()
      );
      await rest.request(E.RemoveThreadMember, [alone.id, alice.id]);
      await rest.request(E.LeaveThread, [alone.id]);
      expect(world.threadMembers.get(alone.id)?.size).toBe(0);
      const archived = await rest.request(E.ModifyChannel, [alone.id], {
        body: { archived: true, locked: true },
      });
      expect(archived.thread_metadata?.archived).toBe(true);
      expect(archived.thread_metadata?.locked).toBe(true);
      const notAThread = await failure(
        rest.request(E.AddThreadMember, [general.id, alice.id])
      );
      expect(notAThread.code).toBe(10003);
    });

    it('opens a private conversation once per person', async () => {
      const alice = world.addUser('alice');
      const dm = await rest.request(E.CreateDm, [], {
        body: { recipient_id: alice.id },
      });
      expect(dm.type).toBe(ChannelType.Dm);
      const again = await rest.request(E.CreateDm, [], {
        body: { recipient_id: alice.id },
      });
      expect(again.id).toBe(dm.id);
      const sent = await rest.request(E.CreateMessage, [dm.id], {
        body: { content: 'psst' },
      });
      expect((sent as { member?: unknown }).member).toBeUndefined();
      const nobody = await failure(
        rest.request(E.CreateDm, [], { body: { recipient_id: '0' } })
      );
      expect(nobody.code).toBe(10013);
    });
  });

  describe('interactions', () => {
    const rawInteraction = (type: number, data: unknown) => ({
      id: world.snowflake(),
      application_id: world.applicationId,
      type,
      data,
      guild_id: world.guildId,
      channel_id: world.findChannel('general')!.id,
      member: world.members.get(world.ownerId),
      token: `token-${world.snowflake()}`,
      version: 1,
      app_permissions: '0',
      locale: 'en-US' as const,
      entitlements: [],
      authorizing_integration_owners: {},
      attachment_size_limit: 1,
    });

    it('records the answer, the follow-ups, and refuses a second answer', async () => {
      const client = await connect();
      const raw = rawInteraction(InteractionType.ApplicationCommand, {
        id: '1',
        name: 'ping',
        type: 1,
      });
      const record = world.interaction(raw as never);
      expect(await client.next('INTERACTION_CREATE')).toMatchObject({
        id: raw.id,
      });
      const response = await rest.request(
        E.CreateInteractionResponse,
        [raw.id, raw.token],
        {
          body: { type: 4, data: { content: 'Pong', flags: 64 } },
          query: { with_response: true },
          auth: false,
        }
      );
      expect(response?.resource?.message?.content).toBe('Pong');
      expect(response?.interaction.response_message_ephemeral).toBe(true);
      expect(record.original?.content).toBe('Pong');
      expect(record.original?.interaction_metadata?.user.id).toBe(
        world.ownerId
      );
      const twice = await failure(
        rest.request(E.CreateInteractionResponse, [raw.id, raw.token], {
          body: { type: 4, data: { content: 'again' } },
          auth: false,
        })
      );
      expect(twice.code).toBe(40060);
      const followUp = await rest.request(
        E.CreateFollowupMessage,
        [world.applicationId, raw.token],
        { body: { content: 'more' }, auth: false }
      );
      expect(record.followUps.map(message => message.content)).toEqual([
        'more',
      ]);
      await rest.request(
        E.EditFollowupMessage,
        [world.applicationId, raw.token, followUp.id],
        { body: { content: 'more, edited' }, auth: false }
      );
      expect(record.followUps[0]?.content).toBe('more, edited');
      await rest.request(
        E.DeleteFollowupMessage,
        [world.applicationId, raw.token, followUp.id],
        { auth: false }
      );
      expect(record.followUps).toEqual([]);
      const edited = await rest.request(
        E.EditOriginalInteractionResponse,
        [world.applicationId, raw.token],
        { body: { content: 'Pong!' }, auth: false }
      );
      expect(edited.content).toBe('Pong!');
      await rest.request(
        E.DeleteOriginalInteractionResponse,
        [world.applicationId, raw.token],
        { auth: false }
      );
      expect(record.original).toBeNull();
      const unknown = await failure(
        rest.request(E.CreateInteractionResponse, ['0', 'nope'], {
          body: { type: 4, data: {} },
          auth: false,
        })
      );
      expect(unknown.code).toBe(10062);
      client.close();
    });

    it('records a deferred answer, a form, suggestions and an update', async () => {
      const client = await connect();
      const deferred = rawInteraction(InteractionType.ApplicationCommand, {
        id: '1',
        name: 'slow',
        type: 1,
      });
      const first = world.interaction(deferred as never);
      await rest.request(
        E.CreateInteractionResponse,
        [deferred.id, deferred.token],
        {
          body: { type: 5, data: { flags: 64 } },
          auth: false,
        }
      );
      expect(first.deferred).toBe(true);
      expect((first.original?.flags ?? 0) & MessageFlags.Loading).not.toBe(0);
      const done = await rest.request(
        E.EditOriginalInteractionResponse,
        [world.applicationId, deferred.token],
        { body: { content: 'finally' }, auth: false }
      );
      expect((done.flags ?? 0) & MessageFlags.Loading).toBe(0);
      expect((done.flags ?? 0) & MessageFlags.Ephemeral).not.toBe(0);

      const modal = rawInteraction(InteractionType.ApplicationCommand, {
        id: '1',
        name: 'form',
        type: 1,
      });
      const second = world.interaction(modal as never);
      await rest.request(E.CreateInteractionResponse, [modal.id, modal.token], {
        body: {
          type: 9,
          data: { custom_id: 'ask', title: 'Ask', components: [] },
        },
        auth: false,
      });
      expect(second.modal?.title).toBe('Ask');
      expect(second.original).toBeNull();

      const typing = rawInteraction(
        InteractionType.ApplicationCommandAutocomplete,
        {
          id: '1',
          name: 'find',
          type: 1,
        }
      );
      const third = world.interaction(typing as never);
      await rest.request(
        E.CreateInteractionResponse,
        [typing.id, typing.token],
        {
          body: { type: 8, data: { choices: [{ name: 'A', value: 'a' }] } },
          auth: false,
        }
      );
      expect(third.suggestions).toEqual([{ name: 'A', value: 'a' }]);

      const general = world.findChannel('general')!;
      const message = await rest.request(E.CreateMessage, [general.id], {
        body: { content: 'click me' },
      });
      const click = {
        ...rawInteraction(InteractionType.MessageComponent, {
          custom_id: 'go',
          component_type: 2,
        }),
        message,
      };
      const fourth = world.interaction(click as never);
      await rest.request(E.CreateInteractionResponse, [click.id, click.token], {
        body: { type: 7, data: { content: 'clicked' } },
        auth: false,
      });
      expect(fourth.updated).toBe(true);
      expect(world.findMessage(message.id)?.content).toBe('clicked');

      const silent = {
        ...rawInteraction(InteractionType.MessageComponent, {
          custom_id: 'go',
          component_type: 2,
        }),
        message,
      };
      const fifth = world.interaction(silent as never);
      await rest.request(
        E.CreateInteractionResponse,
        [silent.id, silent.token],
        {
          body: { type: 6 },
          auth: false,
        }
      );
      expect(fifth.deferred).toBe(true);
      expect(fifth.original?.id).toBe(message.id);
      await rest.request(
        E.EditOriginalInteractionResponse,
        [world.applicationId, silent.token],
        { body: { content: 'later' }, auth: false }
      );
      expect(world.findMessage(message.id)?.content).toBe('later');
      client.close();
    });
  });

  describe('what it does not model', () => {
    it('lets a documented change through, and refuses to invent what it has not', async () => {
      const invite = await rest.request(
        E.CreateChannelInvite,
        [world.findChannel('general')!.id],
        { body: { max_age: 60 } }
      );
      expect(invite).toMatchObject({ max_age: 60 });
      expect(typeof (invite as { id?: string }).id).toBe('string');
      const pins = await failure(
        rest.request(E.GetChannelPins, [world.findChannel('general')!.id])
      );
      expect(pins.status).toBe(404);
      expect(pins.message).toContain(
        'has nothing for GET /channels/{channel.id}/messages/pins'
      );
      await expect(
        rest.request(E.ModifyGuildWidget, [world.guildId], {
          body: { enabled: true },
        })
      ).resolves.toMatchObject({ enabled: true });
      const nowhere = await fetch(`${world.discord.url}/v10/nothing/at/all`);
      expect(nowhere.status).toBe(404);
      expect(await nowhere.json()).toEqual({
        message: '404: Not Found',
        code: 0,
      });
    });

    it('registers the commands and gives them back', async () => {
      const registered = await rest.request(
        E.BulkOverwriteGuildApplicationCommands,
        [world.applicationId, world.guildId],
        { body: [{ name: 'ping', description: 'Pong', type: 1 }] as never }
      );
      expect(registered[0]).toMatchObject({
        name: 'ping',
        guild_id: world.guildId,
      });
      expect(typeof registered[0]!.id).toBe('string');
      const listed = await rest.request(E.GetGuildApplicationCommands, [
        world.applicationId,
        world.guildId,
      ]);
      expect(listed).toEqual(registered);
      expect(
        await rest.request(E.GetGlobalApplicationCommands, [
          world.applicationId,
        ])
      ).toEqual([]);
    });
  });
});
