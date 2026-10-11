// What `import ... from 'chapterjs/test'` gives: how a test of the bot is
// written. The bot under test, the people and channels of its server and
// what it answers are typed here; `chapterjs test` runs the scenarios.

export { scenario } from './scenario.js';
export type { ScenarioDeclaration } from './scenario.js';
export { TestFailure } from './failure.js';
export type {
  ButtonTarget,
  FieldInputsOf,
  FormTarget,
  OptionInputsOf,
  SelectInput,
  SelectTarget,
  TestAssertions,
  TestBot,
  TestButton,
  TestChannel,
  TestChannelOptions,
  TestChannelType,
  TestFile,
  TestForm,
  TestMember,
  TestMemberOptions,
  TestMenu,
  TestMessage,
  TestReply,
  TestRole,
  TestRoleOptions,
  TestSuggestion,
  TestWhere,
} from './harness.js';
