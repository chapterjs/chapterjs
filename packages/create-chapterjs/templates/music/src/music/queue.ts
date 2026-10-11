import type { Attachment, Guild, VoiceConnection } from 'chapterjs';

// Plain code: this file declares nothing, so the framework leaves it alone.
// It keeps the queue of each server and plays it, song after song.

export interface Song {
  /** What play() takes: a file sent on Discord, or a link. */
  source: Attachment | string;
  title: string;
  /** Who asked for it: a mention. */
  requestedBy: string;
}

interface Queue {
  songs: Song[];
  current: Song | null;
}

const queues = new Map<string, Queue>();

/** The queue of a server, made on first use. */
export function queueOf(guild: Guild): Queue {
  let queue = queues.get(guild.id);
  if (!queue) {
    queue = { songs: [], current: null };
    queues.set(guild.id, queue);
  }
  return queue;
}

/**
 * Plays the queue of a server until it is empty, then leaves the channel.
 * Called once when the first song is added; a song added meanwhile is
 * picked up by the loop. A song that can't be played (a dead link, ffmpeg
 * missing) is skipped and said in the channel.
 */
export async function playQueue(
  guild: Guild,
  voice: VoiceConnection,
  say: (text: string) => Promise<unknown>
): Promise<void> {
  const queue = queueOf(guild);
  if (queue.current) return;
  let song: Song | undefined;
  while ((song = queue.songs.shift())) {
    queue.current = song;
    try {
      await voice.play(song.source);
    } catch (error) {
      await say(`⚠ ${song.title}: ${(error as Error).message}`);
    }
  }
  queue.current = null;
  // /leave may have made the bot leave already.
  if (voice.connected) await voice.leave();
}

/** Empties the queue of a server: when the bot stops or leaves. */
export function clearQueue(guild: Guild): void {
  queueOf(guild).songs.length = 0;
}
