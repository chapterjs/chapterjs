import type { Guild, TextChannel } from 'chapterjs';

// Plain code, shared by the other files: the channel the bot writes in.
// The one named like `name` when there is one, else the system channel of
// the server (where Discord itself says who joined), else nothing.
export function communityChannel(
  guild: Guild,
  name: string
): TextChannel | null {
  const channels = [...guild.channels.values()];
  const named = channels.find(
    channel => channel.isText() && channel.name === name
  );
  if (named?.isText()) return named;
  const system = guild.systemChannelId
    ? guild.channels.get(guild.systemChannelId)
    : undefined;
  return system?.isText() ? system : null;
}
