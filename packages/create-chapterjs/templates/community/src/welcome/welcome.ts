import { embed, event, type GuildMember } from 'chapterjs';
import { communityChannel } from './channel';

// Runs when someone joins the server. It needs the Server Members Intent:
// chapterjs dev tells you where to enable it the first time.
export default event({
  name: 'memberJoin',
  async run({ member, guild, t }) {
    const channel = communityChannel(guild, 'welcome');
    if (!channel) return;
    await channel.send({
      content: t('welcome', { user: member.toString(), server: guild.name }),
      embeds: [card(member)],
    });
  },
});

// Someone left. `member` is the member as it was, when the bot knew them;
// `user` is always there.
export const goodbye = event({
  name: 'memberLeave',
  async run({ user, member, guild, t }) {
    const channel = communityChannel(guild, 'welcome');
    if (!channel) return;
    await channel.send(
      t('goodbye', { name: member?.displayName ?? user.displayName })
    );
  },
});

// An embed is a function of what it shows, reusable from any file.
export const card = embed((member: GuildMember) => ({
  title: member.displayName,
  description: `You are member #${member.guild.memberCount ?? '?'}.`,
  thumbnail: { url: member.avatarURL() },
  color: 0xc026d3,
}));
