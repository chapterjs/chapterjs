import { command, task, timestamp } from 'chapterjs';
import { announce, draw, finish, giveaways } from './giveaways';

// A task runs by itself: every minute, the giveaways whose time is up end.
// `now` is when the run was due; `t` speaks the default language, since a
// task runs for no one in particular.
export const drawGiveaways = task({
  every: '1m',
  async run({ guilds, now, t }) {
    for (const { key, value } of await giveaways.entries()) {
      const [guildId, id] = key;
      const guild = guilds.get(guildId!);
      if (guild && !value.ended && value.endsAt <= now.getTime()) {
        await finish(guild, id!, t);
      }
    }
  },
});

// /giveaway list: the giveaways running in this server.
export const list = command({
  name: 'giveaway list',
  ephemeral: true,
  async run({ interaction, guild, t }) {
    const running = (await giveaways.entries(guild.id)).filter(
      entry => !entry.value.ended
    );
    if (running.length === 0) {
      await interaction.reply(t('noneRunning'));
      return;
    }
    await interaction.reply(
      running
        .map(({ key, value }) =>
          t('runningLine', {
            prize: value.prize,
            time: timestamp(value.endsAt, 'R'),
            link: `https://discord.com/channels/${guild.id}/${value.channelId}/${key[1]}`,
          })
        )
        .join('\n')
    );
  },
});

// Menu commands: right click the message of a giveaway, Apps. `type:
// 'message'` gives `run` the message clicked. Their names are translated
// here: language files only describe slash commands.
export const endNow = command({
  type: 'message',
  name: 'End giveaway',
  locales: { fr: { name: 'Terminer le concours' } },
  permissions: ['ManageGuild'],
  ephemeral: true,
  async run({ interaction, message, guild, t }) {
    const ended = await finish(guild, message.id, t);
    await interaction.reply(ended ? t('endedNow') : t('notRunning'));
  },
});

export const reroll = command({
  type: 'message',
  name: 'Reroll giveaway',
  locales: { fr: { name: 'Retirer au sort' } },
  permissions: ['ManageGuild'],
  ephemeral: true,
  async run({ interaction, message, guild, t }) {
    const key = [guild.id, message.id];
    const found = await giveaways.get(key);
    if (!found?.ended) {
      await interaction.reply(t('notEnded'));
      return;
    }
    // New winners among who did not win yet, when there are enough.
    const giveaway = await giveaways.update(key, (current = found) => {
      const others = current.entrants.filter(
        id => !current.winnerIds.includes(id)
      );
      return {
        ...current,
        winnerIds: draw(
          others.length > 0 ? others : current.entrants,
          current.winners
        ),
      };
    });
    await announce(guild, message.id, giveaway, t);
    await interaction.reply(t('rerolled'));
  },
});
