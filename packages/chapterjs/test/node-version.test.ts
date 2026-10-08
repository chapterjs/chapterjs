// ChapterJS runs on Node.js 24 and later: an older one is refused at once,
// with what to install.
import { describe, expect, it } from 'vitest';
import { MINIMUM_NODE, nodeTooOld } from '../src/cli/node-version.js';

describe('the version of Node.js', () => {
  it.each(['24.0.0', '24.18.0', '25.1.0', '30.0.0'])(
    '%s is enough',
    version => {
      expect(nodeTooOld(version)).toBeNull();
    }
  );

  it.each(['23.11.1', '22.18.0', '20.9.0', '18.0.0'])(
    '%s is refused, saying what to install',
    version => {
      expect(nodeTooOld(version)).toBe(
        `ChapterJS needs Node.js 24 or newer, and this is Node.js ${version}. Install the LTS version from https://nodejs.org, then run the command again.`
      );
    }
  );

  it('is the one of package.json', async () => {
    const { readFileSync } = await import('node:fs');
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    ) as { engines: { node: string } };
    expect(pkg.engines.node).toBe(`>=${MINIMUM_NODE}`);
  });

  it('this one runs the tests', () => {
    expect(nodeTooOld()).toBeNull();
  });
});
