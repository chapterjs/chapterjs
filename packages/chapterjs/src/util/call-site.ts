// Where a call of the files was made, for an error that comes later. An
// error made after an `await` only has the lines of the files in its stack
// when they awaited the call: `member.ban()` written without `await`, and
// refused by Discord, would point nowhere in the project. `callSite()` is
// taken when the call is made, before anything is awaited, and
// `fromSite()` adds its lines to the error, so `locate()` finds the line
// that asked whether the call was awaited or not.

/** The stack of the moment a call is made. */
export function callSite(): Error {
  return new Error('Called here');
}

/** Adds where the call was made to an error that came later. */
export function fromSite(error: unknown, site: Error): unknown {
  if (!(error instanceof Error) || typeof error.stack !== 'string') {
    return error;
  }
  const frames = (site.stack ?? '').split('\n').slice(1).join('\n');
  if (frames && !error.stack.includes(frames)) {
    error.stack = `${error.stack}\n${frames}`;
  }
  return error;
}
