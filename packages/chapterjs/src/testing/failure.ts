// What a check of `chapterjs test` throws when the bot did not do what the
// test expected: a plain sentence, shown with the file and the line of the
// scenario that asked.

/** An expectation of a test that the bot did not meet. */
export class TestFailure extends Error {
  override readonly name = 'TestFailure';

  constructor(message: string) {
    super(message);
  }
}

/** Throws a `TestFailure` unless `condition` holds. */
export function expectThat(condition: boolean, message: string): void {
  if (!condition) throw new TestFailure(message);
}

/** A value as a failure shows it: quoted, cut when very long. */
export function shown(value: unknown): string {
  const text =
    typeof value === 'string' ? JSON.stringify(value) : String(value);
  return text.length > 200 ? `${text.slice(0, 197)}..."` : text;
}
