import { event } from 'chapterjs';
import { levelOf, xp } from './xp';

// The roles a level gives: create them in your server with these names (or
// change the names). A missing role is skipped.
const REWARDS: Record<number, string> = {
  5: 'Active',
  10: 'Regular',
  20: 'Veteran',
};

// One gain per minute per person, so writing ten short messages in a row
// counts as one. Kept in memory: a restart only forgets the last minute.
const COOLDOWN = 60_000;
const lastGain = new Map<string, number>();

// Every message of a member gives 15 to 25 XP. Bots are left out by the
// event itself. Listening to messages needs the Message Content Intent:
// chapterjs dev tells you where to enable it the first time.
export default event({
  name: 'messageCreate',
  async run({ message, guild, t }) {
    const key = `${guild.id}:${message.author.id}`;
    const now = Date.now();
    if (now - (lastGain.get(key) ?? 0) < COOLDOWN) return;
    lastGain.set(key, now);
    // Who gained over a minute ago is forgotten, so the map stays small.
    if (lastGain.size > 1000) {
      for (const [other, at] of lastGain) {
        if (now - at >= COOLDOWN) lastGain.delete(other);
      }
    }

    const gained = 15 + Math.floor(Math.random() * 11);
    const points = await xp.add(message.author.id, gained);
    const before = levelOf(points - gained);
    const level = levelOf(points);
    if (level === before) return;

    await message.reply(
      t('levelUp', { user: message.member.toString(), level })
    );
    for (const [at, name] of Object.entries(REWARDS)) {
      if (Number(at) <= before || Number(at) > level) continue;
      const role = [...guild.roles.values()].find(role => role.name === name);
      if (role) await message.member.addRole(role, `Level ${at}`);
    }
  },
});
