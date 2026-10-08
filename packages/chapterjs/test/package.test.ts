import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);

describe('the published package', () => {
  it('has one dependency, the compiler of chapterjs build, and nothing else', () => {
    expect(Object.keys(pkg.dependencies ?? {})).toEqual(['esbuild']);
    expect(pkg.peerDependencies ?? {}).toEqual({});
    expect(pkg.optionalDependencies ?? {}).toEqual({});
  });

  it('runs a bot with Node built-ins only: nothing but the build loads a package', () => {
    const src = fileURLToPath(new URL('../src', import.meta.url));
    const importing: Record<string, string[]> = {};
    for (const entry of readdirSync(src, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
      const file = join(entry.parentPath, entry.name);
      const code = readFileSync(file, 'utf8');
      // Every import of something that is neither a file nor part of Node.
      // The package's own name only appears in examples for developers.
      const packages = [
        ...code.matchAll(/(?:from|import)\s*\(?\s*['"]([^'".][^'"]*)['"]/g),
      ]
        .map(match => match[1]!)
        .filter(
          name =>
            !name.startsWith('node:') &&
            !name.startsWith('#') &&
            name !== 'chapterjs' &&
            // Code the framework writes for a project, not an import.
            !name.includes('${')
        );
      if (packages.length > 0) {
        importing[relative(src, file).split(sep).join('/')] = packages;
      }
    }
    expect(importing).toEqual({ 'cli/build.ts': ['esbuild'] });
    // And only when a build runs: no other command pays for it.
    const build = readFileSync(join(src, 'cli/build.ts'), 'utf8');
    expect(build).toContain("await import('esbuild')");
    expect(build).not.toMatch(/^import .* from 'esbuild'/m);
  });

  it('ships the end-to-end encryption of voice compiled, with its licenses, loaded only by voice', () => {
    expect(pkg.files).toEqual(['dist', 'vendor']);
    const vendor = fileURLToPath(new URL('../vendor/dave', import.meta.url));
    expect(readdirSync(vendor).sort()).toEqual([
      'LICENSE',
      'libdave.d.mts',
      'libdave.mjs',
      'libdave.wasm',
    ]);
    const license = readFileSync(join(vendor, 'LICENSE'), 'utf8');
    for (const part of [
      '=== libdave ===',
      '=== mlspp ===',
      '=== openssl ===',
    ]) {
      expect(license).toContain(part);
    }
    // Loaded the first time a bot joins voice, by this file only.
    const src = fileURLToPath(new URL('../src', import.meta.url));
    const loading: string[] = [];
    for (const entry of readdirSync(src, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
      const code = readFileSync(join(entry.parentPath, entry.name), 'utf8');
      if (code.includes('vendor/dave')) {
        loading.push(
          relative(src, join(entry.parentPath, entry.name)).split(sep).join('/')
        );
      }
    }
    expect(loading).toEqual(['voice/dave.ts']);
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
