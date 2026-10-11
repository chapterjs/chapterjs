import { ChannelType, task } from 'chapterjs';
import { communityChannel } from '../welcome/channel';

// A task runs by itself: every Monday at 9:00, in the timezone given. The
// name of the export is the name of the task. `t` is the default language.
export const weekly = task({
  cron: '0 9 * * 1',
  timezone: 'Europe/Paris',
  async run({ guilds, t }) {
    for (const guild of guilds.values()) {
      const channel = communityChannel(guild, 'general');
      if (!channel) continue;
      const channels = [...guild.channels.values()];
      await channel.send({
        embeds: [
          {
            title: t('statsTitle', { server: guild.name }),
            color: 0xc026d3,
            fields: [
              {
                name: t('members'),
                value: String(guild.memberCount ?? '?'),
                inline: true,
              },
              {
                name: t('textChannels'),
                value: String(
                  channels.filter(c => c.type === ChannelType.GuildText).length
                ),
                inline: true,
              },
              {
                name: t('voiceChannels'),
                value: String(
                  channels.filter(c => c.type === ChannelType.GuildVoice).length
                ),
                inline: true,
              },
              {
                name: t('roles'),
                value: String(guild.roles.size - 1),
                inline: true,
              },
            ],
          },
        ],
      });
    }
  },
});
