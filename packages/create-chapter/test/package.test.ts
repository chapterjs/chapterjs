import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/** Every file under `dir`, relative to the package root. */
function filesIn(dir: string): string[] {
  return readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => relative(root, join(entry.parentPath, entry.name)))
    .sort();
}

/** What users download from npm. */
describe('the published package', () => {
  let published: string[];

  beforeAll(() => {
    const json = execFileSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    published = (JSON.parse(json)[0].files as { path: string }[])
      .map(file => file.path)
      .sort();
  });

  it('contains the bin, as an executable Node script', () => {
    const bin = pkg.bin['create-chapter'];
    expect(published).toContain(bin.replace(/^\.\//, ''));
    expect(readFileSync(join(root, bin), 'utf8')).toMatch(
      /^#!\/usr\/bin\/env node\n/
    );
  });

  it('contains every built module', () => {
    for (const file of filesIn('dist')) expect(published).toContain(file);
  });

  it('contains every template file, _gitignore and dotfiles included', () => {
    const templateFiles = filesIn('templates');
    expect(templateFiles).toContain('templates/default/_gitignore');
    expect(templateFiles).toContain('templates/default/.env.example');
    for (const file of templateFiles) expect(published).toContain(file);
  });

  it('contains nothing else: no sources, tests or configs', () => {
    for (const file of published) {
      expect(file).toMatch(
        /^(dist\/|templates\/|package\.json$|README|LICENSE)/
      );
    }
  });

  it('has no runtime dependency other than @clack/prompts', () => {
    expect(Object.keys(pkg.dependencies)).toEqual(['@clack/prompts']);
  });
});
