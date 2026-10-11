// The fake Discord of `chapterjs/src/testing/`, closed when the current
// test ends.
import { onTestFinished } from 'vitest';
import {
  fakeDiscord as start,
  type FakeDiscord,
  type FakeDiscordOptions,
  type FakeDiscordRequest,
  type FakeDiscordResponder,
  type FakeDiscordResponse,
} from '../../chapterjs/src/testing/fake-discord.js';

export type {
  FakeDiscord,
  FakeDiscordOptions,
  FakeDiscordRequest,
  FakeDiscordResponder,
  FakeDiscordResponse,
};

/**
 * A local HTTP server that plays the REST API of Discord: tests run the
 * real client against it instead of mocking `fetch`. A route that was not
 * set answers 404 with Discord's "Unknown" error shape. Closed when the
 * current test ends.
 */
export async function fakeDiscord(
  options?: FakeDiscordOptions
): Promise<FakeDiscord> {
  const fake = await start(options);
  onTestFinished(() => fake.close());
  return fake;
}
