// The documentation site (apps/docs) follows the package: every public name
// has a page, every method of a reference page exists, and every sample
// compiles against the current API. A change that forgets the docs fails here.
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bin, packageDir, project } from './dev-helpers.js';
import {
  CategoryChannel,
  Channel,
  DMChannel,
  ForumChannel,
  TextChannel,
  ThreadChannel,
  VoiceChannel,
} from '../src/structures/channel.js';
import { GuildEmoji } from '../src/structures/emoji.js';
import { Guild } from '../src/structures/guild.js';
import {
  CommandInteraction,
  ComponentInteraction,
  Interaction,
  ModalInteraction,
} from '../src/structures/interaction.js';
import { Invite } from '../src/structures/invite.js';
import { GuildMember } from '../src/structures/member.js';
import { Message } from '../src/structures/message.js';
import { Role } from '../src/structures/role.js';
import { User } from '../src/structures/user.js';
import { Webhook } from '../src/structures/webhook.js';
import { VoiceConnection } from '../src/voice/connection.js';

const docsDir = join(packageDir, '../../apps/docs');

/** Every page of the site, by its path from `apps/docs`. */
function pages(): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.mdx'))
        found.set(relative(docsDir, path), readFileSync(path, 'utf8'));
    }
  };
  walk(docsDir);
  return found;
}

const site = pages();

/** The names `src/index.ts` and `src/main.ts` export, types included. */
function exportedNames(): string[] {
  const names = new Set<string>();
  for (const file of ['index.ts', 'main.ts']) {
    const source = readFileSync(join(packageDir, 'src', file), 'utf8');
    for (const match of source.matchAll(/export (?:type )?\{([^}]*)\}/g)) {
      for (const entry of match[1]!.split(',')) {
        const name = entry
          .trim()
          .replace(/^type /, '')
          .split(/\s+as\s+/)
          .pop();
        if (name) names.add(name);
      }
    }
  }
  return [...names].sort();
}

/**
 * What a page says in code: inline code, code blocks, and the `name`, `type`
 * and `title` attributes of its components. Prose does not count: naming a
 * `Message` in a sentence is not documenting `Message`.
 */
function codeOf(content: string): string {
  const parts: string[] = [];
  for (const match of content.matchAll(/```[^\n]*\n([\s\S]*?)```/g))
    parts.push(match[1]!);
  const withoutBlocks = content.replace(/```[^\n]*\n[\s\S]*?```/g, '');
  for (const match of withoutBlocks.matchAll(/`([^`\n]+)`/g))
    parts.push(match[1]!);
  for (const match of withoutBlocks.matchAll(
    /\b(?:name|type|title)=(?:"([^"]*)"|'([^']*)')/g
  ))
    parts.push(match[1] ?? match[2]!);
  return parts.join('\n');
}

const siteCode = [...site.values()].map(codeOf).join('\n');

describe('the documentation site', () => {
  it('has pages', () => {
    expect(site.size).toBeGreaterThan(30);
    expect(site.has('index.mdx')).toBe(true);
  });

  it('lists every page of docs.json and no page twice', () => {
    const config = JSON.parse(
      readFileSync(join(docsDir, 'docs.json'), 'utf8')
    ) as { navigation: unknown };
    const listed: string[] = [];
    const collect = (node: unknown): void => {
      if (typeof node === 'string') listed.push(node);
      else if (Array.isArray(node)) node.forEach(collect);
      else if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
          if (key === 'pages' || key === 'root') collect(value);
          else if (typeof value === 'object') collect(value);
        }
      }
    };
    collect(config.navigation);
    expect(new Set(listed).size).toBe(listed.length);
    for (const page of listed) {
      expect(site.has(`${page}.mdx`), `${page}.mdx is in docs.json`).toBe(true);
    }
    for (const page of site.keys()) {
      expect(listed, `${page} is a page of the site`).toContain(
        page.replace(/\.mdx$/, '')
      );
    }
  });

  // The site is in English and in French (`fr/`): every page has its
  // translation, at the same path under `fr/`, and nothing exists in one
  // language only.
  it('has every page in both languages', () => {
    const english = [...site.keys()].filter(page => !page.startsWith('fr/'));
    const french = [...site.keys()].filter(page => page.startsWith('fr/'));
    for (const page of english) {
      expect(site.has(`fr/${page}`), `fr/${page} translates ${page}`).toBe(
        true
      );
    }
    for (const page of french) {
      expect(site.has(page.slice(3)), `${page} translates a page`).toBe(true);
    }
  });

  it.each(exportedNames())('documents `%s`', name => {
    expect(siteCode).toMatch(new RegExp(`(?<![\\w$])${name}(?![\\w$])`));
  });
});

/**
 * The public members of a class: everything on its prototype chain below
 * `Object`, except what is private by convention.
 */
function membersOf(type: new (...args: never[]) => unknown): {
  methods: string[];
  properties: string[];
} {
  const methods = new Set<string>();
  const properties = new Set<string>();
  for (
    let proto: object | null = type.prototype as object;
    proto && proto !== Object.prototype;
    proto = Object.getPrototypeOf(proto) as object | null
  ) {
    for (const [name, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(proto)
    )) {
      if (name === 'constructor' || name.startsWith('_')) continue;
      if (typeof descriptor.value === 'function') methods.add(name);
      else properties.add(name);
    }
  }
  return { methods: [...methods].sort(), properties: [...properties].sort() };
}

const structures: {
  type: new (...args: never[]) => unknown;
  pages: string[];
}[] = [
  { type: Guild, pages: ['reference/guild.mdx'] },
  { type: GuildMember, pages: ['reference/member.mdx'] },
  { type: User, pages: ['reference/user.mdx'] },
  { type: Role, pages: ['reference/role.mdx'] },
  { type: GuildEmoji, pages: ['reference/emoji.mdx'] },
  { type: Invite, pages: ['reference/invite.mdx'] },
  { type: Webhook, pages: ['reference/webhook.mdx'] },
  { type: VoiceConnection, pages: ['reference/voice-connection.mdx'] },
  { type: Message, pages: ['reference/message.mdx'] },
  { type: Interaction, pages: ['reference/interaction.mdx'] },
  { type: CommandInteraction, pages: ['reference/interaction.mdx'] },
  { type: ComponentInteraction, pages: ['reference/interaction.mdx'] },
  { type: ModalInteraction, pages: ['reference/interaction.mdx'] },
  { type: Channel, pages: ['reference/channels/index.mdx'] },
  ...(
    [
      ['text', TextChannel],
      ['voice', VoiceChannel],
      ['category', CategoryChannel],
      ['forum', ForumChannel],
      ['thread', ThreadChannel],
      ['dm', DMChannel],
    ] as const
  ).map(([page, type]) => ({
    type,
    pages: [`reference/channels/${page}.mdx`, 'reference/channels/index.mdx'],
  })),
];

// Each structure is checked on its English page and on its French one: the
// translation keeps every heading and field, only the words change.
describe.each(
  structures.flatMap(entry =>
    ['', 'fr/'].map(
      language =>
        [
          `${entry.type.name}${language ? ' (fr)' : ''}`,
          { ...entry, pages: entry.pages.map(page => language + page) },
        ] as const
    )
  )
)('the reference of %s', (name, { type, pages: pagesOf }) => {
  const content = pagesOf.map(page => site.get(page) ?? '').join('\n');
  const headings = [...content.matchAll(/^#{3,4} ([\w]+)\(\)/gm)].map(
    match => match[1]!
  );
  const fields = [...content.matchAll(/<ResponseField name="([\w]+)"/g)].map(
    match => match[1]!
  );
  const { methods, properties } = membersOf(type);

  it('exists', () => {
    expect(site.has(pagesOf[0]!), `${pagesOf[0]} exists`).toBe(true);
  });

  it.each(methods)('has a section for %s()', method => {
    expect(headings, `### ${method}() in ${pagesOf.join(' or ')}`).toContain(
      method
    );
  });

  it.each(properties)('lists the property %s', property => {
    expect(
      fields,
      `<ResponseField name="${property}"> in ${pagesOf.join(' or ')}`
    ).toContain(property);
  });

  // A page shared by several classes (the index of the channels, the
  // interactions) may have a heading for a method of any of them.
  const own = [
    ...(site.get(pagesOf[0]!) ?? '').matchAll(/^#{3,4} ([\w]+)\(\)/gm),
  ].map(match => match[1]!);
  const known = new Set(
    structures
      .filter(entry => entry.pages.includes(pagesOf[0]!.replace(/^fr\//, '')))
      .flatMap(entry => membersOf(entry.type).methods)
  );
  it.each(own.length > 0 ? own : ['toJSON'])(
    'describes no method %s() that does not exist',
    method => {
      expect([...known], `${name}.${method}() exists`).toContain(method);
    }
  );
});

/**
 * A `ts` block that is a program: a user file (its title is its path in the
 * project) or a function taking a structure. The blocks that only show a
 * signature are left out.
 */
function samples(): { page: string; path: string; code: string }[] {
  const found: { page: string; path: string; code: string }[] = [];
  const taken = new Map<string, string>();
  for (const [page, content] of site) {
    let index = 0;
    for (const match of content.matchAll(
      /```ts(?:[ \t]+([^\n]*))?\n([\s\S]*?)```/g
    )) {
      const title = (match[1] ?? '').trim().split(/\s+/)[0] ?? '';
      const code = match[2]!
        .replace(/^\n+/, '')
        .replace(/^ {2,}/gm, line => line.slice(line.length % 2));
      const isFile = /^src\/.+\.ts$/.test(title);
      const isProgram =
        isFile ||
        /^(?:import|export|function|async function|const|let|class)\s/m.test(
          code
        );
      if (!isProgram) continue;
      index += 1;
      let path = isFile
        ? title
        : `src/lib/${page.replace(/\.mdx$/, '').replace(/[\\/]/g, '-')}-${index}.ts`;
      // The same file shown twice with different content: both are checked.
      if (taken.has(path) && taken.get(path) !== code) {
        path = path.replace(/\.ts$/, `-${index}.ts`);
      }
      taken.set(path, code);
      found.push({ page, path, code });
    }
  }
  return found;
}

describe.skipIf(process.platform === 'win32')('the samples', () => {
  it('compile against the current API', () => {
    const all = samples();
    expect(all.length).toBeGreaterThan(20);
    const cwd = project({});
    const origin = new Map<string, string>();
    for (const { page, path, code } of all) {
      const file = join(cwd, path);
      mkdirSync(dirname(file), { recursive: true });
      // A snippet without import nor export is still its own module.
      const module = /^(?:import|export)\s/m.test(code)
        ? code
        : `${code}\nexport {};\n`;
      writeFileSync(file, module);
      origin.set(path, page);
    }
    // The files of public/ a sample sends must exist, to be typed.
    for (const { code } of all) {
      for (const match of code.matchAll(/asset\('([^']+)'/g)) {
        const file = join(cwd, 'public', match[1]!);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, '');
      }
    }
    cpSync(
      join(packageDir, '../create-chapter/templates/default/tsconfig.json'),
      join(cwd, 'tsconfig.json')
    );
    symlinkSync(
      join(packageDir, 'node_modules/@types'),
      join(cwd, 'node_modules/@types'),
      'dir'
    );
    // What installing does: the types of `chapterjs` for each folder.
    execFileSync(process.execPath, [bin, 'sync'], { cwd, stdio: 'pipe' });
    expect(existsSync(join(cwd, '.chapterjs/tsconfig.json'))).toBe(true);
    let output = '';
    try {
      execFileSync(
        join(packageDir, 'node_modules/.bin/tsc'),
        ['-b', '--pretty', 'false'],
        { cwd, encoding: 'utf8', stdio: 'pipe' }
      );
    } catch (error) {
      const failed = error as { stdout?: string; stderr?: string };
      output = `${failed.stdout ?? ''}${failed.stderr ?? ''}`;
    }
    // Each error names the page its sample comes from.
    const explained = output.replace(/^(src\/[^\s(]+)/gm, (path: string) =>
      origin.has(path) ? `${origin.get(path)} (${path})` : path
    );
    expect(explained, 'every sample of the docs compiles').toBe('');
  });
});
