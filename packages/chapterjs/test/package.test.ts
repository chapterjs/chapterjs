import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);

describe('the published package', () => {
  it('has zero runtime dependencies: only Node built-ins', () => {
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.peerDependencies ?? {}).toEqual({});
    expect(pkg.optionalDependencies ?? {}).toEqual({});
  });

  it('requires the Node version that runs TypeScript natively', () => {
    expect(pkg.engines.node).toBe('>=22.18');
  });

  it('is released with the same version as the scaffolders', () => {
    for (const name of ['create-chapter', 'create-chapterjs']) {
      const other = JSON.parse(
        readFileSync(
          new URL(`../../${name}/package.json`, import.meta.url),
          'utf8'
        )
      );
      expect(other.version).toBe(pkg.version);
    }
  });
});
