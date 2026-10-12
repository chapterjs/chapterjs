import { embed, store, timestamp, userMention } from 'chapterjs';
import type { Guild, Translator } from 'chapterjs';
import { enter } from './enter';

export interface Giveaway {
  prize: string;
  /** How many people win. */
  winners: number;
  /** When it ends, in ms since 1970: a store keeps JSON, and a Date is not. */
  endsAt: number;
  channelId: string;
  hostId: string;
  /** Who entered: user ids. */
  entrants: string[];
  /** Who won, once it ended. */
  winnerIds: string[];
  ended: boolean;
}

// Every giveaway, kept from one restart to the next: a giveaway of a week
// survives a restart of the bot. One store for the whole bot (`global`), so
// the task that ends them reads everything at once; the key is the server
// and the message, and `entries(guild.id)` lists the ones of a server.
export const giveaways = store<Giveaway>({ scope: 'global' });

// What the message of a giveaway shows, while it runs and once it ended.
export const giveawayCard = embed((t: Translator, giveaway: Giveaway) => ({
  title: `🎁 ${giveaway.prize}`,
  description: [
    giveaway.ended
      ? giveaway.winnerIds.length > 0
        ? t('wonBy', {
            winners: giveaway.winnerIds.map(userMention).join(', '),
          })
        : t('nobodyEntered')
      : t('endsIn', { time: timestamp(giveaway.endsAt, 'R') }),
    t('hostedBy', { host: userMention(giveaway.hostId) }),
  ].join('\n'),
  color: giveaway.ended ? 0x71717a : 0xc026d3,
  footer: { text: t('winnersCount', { count: giveaway.winners }) },
}));

/** Picks `count` people among `entrants`, each one once. */
export function draw(entrants: readonly string[], count: number): string[] {
  const pool = [...entrants];
  const picked: string[] = [];
  while (picked.length < count && pool.length > 0) {
    const [one] = pool.splice(Math.floor(Math.random() * pool.length), 1);
    picked.push(one!);
  }
  return picked;
}

/**
 * Shows who won: the message of the giveaway is changed (its button can't
 * be clicked any more), and the winners are told under it.
 */
export async function announce(
  guild: Guild,
  id: string,
  giveaway: Giveaway,
  t: Translator
): Promise<void> {
  const channel = guild.channels.get(giveaway.channelId);
  if (!channel?.isText()) return;
  // Someone may have deleted the message: the winners are told anyway.
  const message = await channel.fetchMessage(id).catch(() => null);
  await message?.edit({
    embeds: [giveawayCard(t, giveaway)],
    components: [
      enter({
        label: t('entrants', { count: giveaway.entrants.length }),
        disabled: true,
      }),
    ],
  });
  const text =
    giveaway.winnerIds.length > 0
      ? t('congratulations', {
          winners: giveaway.winnerIds.map(userMention).join(', '),
          prize: giveaway.prize,
        })
      : t('nobodyWon', { prize: giveaway.prize });
  await (message ? message.reply(text) : channel.send(text));
}

/**
 * Ends a giveaway and draws its winners, or does nothing when it is already
 * over: the task and the menu may both try, only one draws. An ended
 * giveaway is kept a week, to draw again.
 */
export async function finish(
  guild: Guild,
  id: string,
  t: Translator
): Promise<Giveaway | null> {
  const found = await giveaways.get([guild.id, id]);
  if (!found || found.ended) return null;
  let drawnHere = false;
  const giveaway = await giveaways.update(
    [guild.id, id],
    (current = found) => {
      drawnHere = !current.ended;
      if (current.ended) return current;
      return {
        ...current,
        ended: true,
        winnerIds: draw(current.entrants, current.winners),
      };
    },
    { expires: '7d' }
  );
  if (!drawnHere) return null;
  await announce(guild, id, giveaway, t);
  return giveaway;
}
