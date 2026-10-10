// What a request takes is not what Discord answers with: a poll answer has
// no id before Discord gives it one, nor does a new forum tag, and a role
// needs one color. These objects compile, so the types let them be written.
import type {
  ChannelCreateOptions,
  GuildChannelEditOptions,
  PollInput,
  RoleCreateOptions,
  RoleEditOptions,
} from 'chapterjs';
import { describe, expect, it } from 'vitest';

describe('what a request takes', () => {
  it('a poll is written without answer ids', () => {
    const poll: PollInput = {
      question: { text: 'Does it work?' },
      answers: [{ pollMedia: { text: 'Yes' } }, { pollMedia: { text: 'No' } }],
      duration: 1,
    };
    expect(poll.answers).toHaveLength(2);
  });

  it('a new forum tag has no id, an existing one keeps its own', () => {
    const create: ChannelCreateOptions = {
      name: 'help',
      availableTags: [
        { name: 'bug', moderated: false, emojiId: null, emojiName: '🐛' },
      ],
    };
    const edit: GuildChannelEditOptions = {
      availableTags: [
        {
          id: '1',
          name: 'bug',
          moderated: true,
          emojiId: null,
          emojiName: null,
        },
        { name: 'idea', moderated: false, emojiId: null, emojiName: '💡' },
      ],
    };
    expect(create.availableTags).toHaveLength(1);
    expect(edit.availableTags).toHaveLength(2);
  });

  it('a role needs its primary color only', () => {
    const create: RoleCreateOptions = {
      name: 'Pink',
      colors: { primaryColor: 0xc026d3 },
    };
    const edit: RoleEditOptions = {
      colors: { primaryColor: 0xc026d3, secondaryColor: 0x000000 },
    };
    expect(create.colors?.primaryColor).toBe(edit.colors?.primaryColor);
  });
});
