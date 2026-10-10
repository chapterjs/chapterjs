#!/usr/bin/env node
import * as p from '@clack/prompts';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import {
  detectPackageManager,
  install,
  installedVersions,
  packageManagers,
  runScript,
  type PackageManager,
} from './package-manager.js';
import { choose } from './choose.js';
import { createProject, validateTargetDir } from './project.js';
import { listTemplates } from './templates.js';
import { nodeTooOld } from './node-version.js';

/** Stops cleanly when the user presses Ctrl+C or Esc on a prompt. */
function orExit<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) {
    p.cancel('Cancelled, nothing was created.');
    process.exit(0);
  }
  return value as Exclude<T, symbol>;
}

// create-chapter and chapterjs are always released with the same version.
const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
) as { version: string };

p.intro(`Create a ChapterJS bot (v${version})`);

const tooOld = nodeTooOld();
if (tooOld) {
  p.cancel(tooOld);
  process.exit(1);
}

// Started now so it runs while the user answers the first question.
const versionsCheck = installedVersions();

// `pnpm create chapter my-bot` skips the first question when the folder is valid.
const argDir = process.argv[2];
const argError = argDir === undefined ? undefined : validateTargetDir(argDir);
if (argError) p.log.warn(argError);
const dir =
  argDir !== undefined && argError === undefined
    ? argDir.trim()
    : orExit(
        await p.text({
          message:
            'Where should the project be created? (. for the current folder)',
          placeholder: 'my-bot',
          defaultValue: 'my-bot',
          validate: value => validateTargetDir(value || 'my-bot'),
        })
      ).trim();

const versions = await versionsCheck;
const pm = orExit(
  await choose<PackageManager>({
    message: 'Which package manager do you want to use?',
    initialValue: detectPackageManager(),
    choices: packageManagers.map(value => {
      const version = versions[value];
      return version === undefined
        ? { value, label: `${value} (not installed)`, disabled: true }
        : { value, hint: `v${version}` };
    }),
    onlyChoice: value => `Using ${value}, the only package manager installed`,
  })
);
if (pm === undefined) {
  p.cancel(
    `No package manager found. Install one of ${packageManagers.join(', ')}, then run this command again.`
  );
  process.exit(1);
}

const templates = await listTemplates();
const template = orExit(
  await choose({
    message: 'Which template do you want to start from?',
    choices: templates.map(({ name, description }) => ({
      value: name,
      hint: description,
    })),
    onlyChoice: value => `Using the ${value} template`,
  })
);
if (template === undefined) {
  p.cancel('No template found. Reinstall create-chapter and try again.');
  process.exit(1);
}

// The exact version, not a range: `create chapter@X` makes a project on
// `chapterjs@X`, and the project only changes version when its developer
// runs the command `chapterjs dev` gives them.
await createProject({
  dir,
  template,
  chapterjsVersion: version,
  packageManager: pm,
});
p.log.success(`Project created in ${resolve(dir)}`);

const spinner = p.spinner();
spinner.start(`Installing dependencies with ${pm}`);
const result = await install(pm, dir);
if (result.ok) {
  spinner.stop(`Dependencies installed with ${pm}`);
} else {
  spinner.error(`The dependencies could not be installed with ${pm}`);
  if (result.output) p.log.message(result.output);
}

const cd = relative(process.cwd(), resolve(dir));
const steps = [
  ...(cd ? [`cd ${cd.includes(' ') ? `"${cd}"` : cd}`] : []),
  ...(result.ok ? [] : [`${pm} install`]),
  'Copy .env.example to .env and fill in BOT_TOKEN and DEV_GUILD_ID',
  runScript(pm, 'dev'),
];
p.note(steps.join('\n'), 'Next steps');
p.outro('Happy building!');
