// The public/ folder: its files are listed in the types of the project, so
// the editor offers them to asset(), and sent when a message asks for one.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '@chapterjs/test-utils';
import { describe, expect, it } from 'vitest';
import {
  asset,
  isAssetFile,
  readAsset,
  setPublicDir,
} from '../src/assets/asset.js';
import {
  listPublic,
  publicDeclarations,
  watchPublic,
} from '../src/assets/public.js';
import { buildMessage } from '../src/structures/payload.js';
import {
  connected,
  GENERAL,
  GUILD,
  project,
  rawMessage,
  runDev,
  world,
} from './dev-helpers.js';

/** A project folder with these files in public/. */
function withPublic(files: Record<string, string>): string {
  const dir = tempDir();
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, 'public', path, '..'), { recursive: true });
    writeFileSync(join(dir, 'public', path), content);
  }
  return dir;
}

describe('the public/ folder', () => {
  it('lists its files, nested ones included, sorted, without hidden ones', async () => {
    const dir = withPublic({
      'b.png': '',
      'a.txt': '',
      'photos/monday.png': '',
      'photos/2024/new year.jpg': '',
      '.DS_Store': '',
      'photos/.hidden': '',
    });
    expect(await listPublic(dir)).toEqual([
      'a.txt',
      'b.png',
      'photos/2024/new year.jpg',
      'photos/monday.png',
    ]);
    expect(await listPublic(tempDir())).toEqual([]);
  });

  it('declares the files as a type, and asset() with it', () => {
    expect(publicDeclarations(['a.png', "it's.txt"])).toBe(
      `import type { AssetFile, AssetOptions } from '#chapterjs';

declare module 'chapterjs' {
  /**
   * A file of the public/ folder of your project, as a path from it:
   * \`'photos/monday.png'\`.
   */
  export type PublicFile = 
    | "a.png"
    | "it's.txt";

  /**
   * A file of the public/ folder of your project, to send with a message:
   * \`files: [asset('photos/monday.png')]\`. The editor lists the files of the
   * folder; the file is read when the message is sent.
   */
  export function asset(path: PublicFile, options?: AssetOptions): AssetFile;
}
`
    );
    expect(publicDeclarations([])).toContain('export type PublicFile = never;');
    expect(publicDeclarations([])).toContain(
      'The folder is empty or missing: put files in it, and they are listed here.'
    );
  });

  it('sees a file put in the folder as soon as the folder is created', async () => {
    const dir = tempDir();
    const seen: string[][] = [];
    let changes = 0;
    const watcher = watchPublic(dir, () => {
      changes++;
      void listPublic(dir).then(files => seen.push(files));
      // Written while the folder only begins to be watched: the system
      // may not tell, the folder as it was found must.
      if (changes === 1) writeFileSync(join(dir, 'public/logo.png'), 'PNG');
    });
    try {
      mkdirSync(join(dir, 'public'));
      const deadline = Date.now() + 5000;
      while (!seen.some(files => files.includes('logo.png'))) {
        if (Date.now() > deadline) throw new Error(`Never seen: ${seen}`);
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    } finally {
      watcher.close();
    }
  });
});

describe('asset()', () => {
  it('makes a file to send, named after the file by default', () => {
    const file = asset('photos/monday.png');
    expect(isAssetFile(file)).toBe(true);
    expect(file).toEqual({ name: 'monday.png', path: 'photos/monday.png' });
    expect(Object.isFrozen(file)).toBe(true);
    expect(
      asset('/photos\\monday.png', {
        name: 'day1.png',
        description: 'Monday',
        spoiler: true,
        contentType: 'image/png',
      })
    ).toEqual({
      name: 'day1.png',
      path: 'photos/monday.png',
      description: 'Monday',
      spoiler: true,
      contentType: 'image/png',
    });
    expect(isAssetFile({ name: 'a', path: 'a' })).toBe(false);
  });

  it.each([
    [
      '',
      {},
      "asset() takes the path of a file inside public/, like asset('photos/monday.png').",
    ],
    [3, {}, 'asset() takes the path of a file inside public/'],
    [
      '../secret.env',
      {},
      'asset() only reads inside public/: "../secret.env" leaves it.',
    ],
    [
      'photos//a.png',
      {},
      'asset() only reads inside public/: "photos//a.png" leaves it.',
    ],
    [
      'a.png',
      'x',
      "The options of asset() are an object like { description: '...' }.",
    ],
    [
      'a.png',
      { size: 1 },
      '"size" is not an option of asset(). Options are: name, description, spoiler, contentType.',
    ],
    [
      'a.png',
      { name: '' },
      'The name of an asset is a file name with its extension, like "chart.png", got "".',
    ],
    [
      'a.png',
      { name: 'x/y.png' },
      'The name of an asset is a file name with its extension',
    ],
  ])('refuses %j %j', (path, options, message) => {
    expect(() => asset(path as never, options as never)).toThrow(message);
  });

  it('is read when the message is sent, from public/ only', async () => {
    const dir = withPublic({ 'photos/monday.png': 'PNG!' });
    setPublicDir(dir);
    expect(
      new TextDecoder().decode(await readAsset(asset('photos/monday.png')))
    ).toBe('PNG!');
    await expect(readAsset(asset('photos/tuesday.png'))).rejects.toThrow(
      'There is no file public/photos/tuesday.png in your project: put it there, or pick one of the files the editor lists in asset().'
    );
    await expect(
      readAsset({ name: 'x', path: '../package.json' } as never)
    ).rejects.toThrow(
      'asset() only reads inside public/: "../package.json" leaves it.'
    );
    const built = buildMessage({
      files: [asset('photos/monday.png', { contentType: 'image/png' })],
    });
    expect(built.files).toHaveLength(1);
    expect(built.files![0]).toMatchObject({
      name: 'monday.png',
      contentType: 'image/png',
    });
    expect(typeof built.files![0]!.data).toBe('function');
    expect(built.body.attachments).toEqual([{ id: 0, filename: 'monday.png' }]);
  });

  it('is refused with a plain message outside a bot the CLI runs', async () => {
    setPublicDir('');
    // `setPublicDir('')` points at ./public: an empty project dir is the
    // same as none, for this message.
    await expect(readAsset(asset('nope.png'))).rejects.toThrow(
      /There is no file public\/nope.png/
    );
  });

  it('keeps the names of the files of a message apart', () => {
    expect(() =>
      buildMessage({ files: [asset('a/chart.png'), asset('b/chart.png')] })
    ).toThrow(
      "Two files of the message are named chart.png: Discord tells them apart by their name. Give one another name (asset(path, { name: '...' }))."
    );
    expect(() =>
      buildMessage({
        files: [
          asset('a/chart.png'),
          asset('b/chart.png', { name: 'other.png' }),
        ],
      })
    ).not.toThrow();
    expect(() =>
      buildMessage({ files: [{ name: 'a.png', data: (() => '') as never }] })
    ).toThrow(
      "The data of the file a.png is its content (a text, a Buffer, an ArrayBuffer or a Blob), or asset('...') for a file of public/."
    );
  });
});

const waitUntil = async (check: () => boolean, what: string) => {
  const deadline = Date.now() + 6000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};

describe.skipIf(process.platform === 'win32')('files of public/', () => {
  it('are typed for the editor, sent with messages, and followed while dev runs', async () => {
    const fake = await world();
    const cwd = project({
      'public/photos/monday.png': 'PNG!',
      'public/notes.txt': 'notes',
      'src/commands/photo.ts': `import { asset, command, gallery } from 'chapterjs';
export default command({
  name: 'photo',
  description: 'Sends a photo',
  async run({ interaction, channel }) {
    await channel.send({
      content: 'Here',
      files: [asset('photos/monday.png', { description: 'Monday' }), asset('notes.txt', { name: 'today.txt' })],
    });
    await interaction.reply({ components: [gallery(['attachment://monday.png'])], files: [asset('photos/monday.png')] });
  },
});
`,
      'src/commands/missing.ts': `import { asset, command } from 'chapterjs';
export default command({
  name: 'missing',
  description: 'Sends a photo that is not there',
  async run({ channel }) {
    await channel.send({ files: [asset('photos/tuesday.png' as 'photos/monday.png')] });
  },
});
`,
    });
    const cli = runDev(cwd, fake);
    await cli.waitFor('✓ 2 commands loaded');
    const connection = await connected(fake);

    const types = join(cwd, '.chapterjs/types/project.d.ts');
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(types, 'utf8')).toContain(
      'export type PublicFile = \n    | "notes.txt"\n    | "photos/monday.png";'
    );
    expect(readFileSync(types, 'utf8')).toContain(
      "import type { AssetFile, AssetOptions } from '../../node_modules/chapterjs/dist/index.js';\n\ndeclare module 'chapterjs' {"
    );

    const sent = rawMessage('100000000000000090', 'Here');
    fake.discord.on('POST', `/channels/${GENERAL}/messages`, { body: sent });
    const callback = `/interactions/100000000000000701/token-100000000000000701/callback`;
    fake.discord.on('POST', callback, {
      body: {
        interaction: { id: '1', type: 2 },
        resource: { type: 4, message: sent },
      },
    });
    const use = (id: string, name: string) => ({
      id,
      application_id: '100000000000000002',
      type: 2,
      token: `token-${id}`,
      version: 1,
      guild_id: GUILD,
      channel_id: GENERAL,
      locale: 'en-US',
      member: {
        user: {
          id: '100000000000000003',
          username: 'alice',
          discriminator: '0',
        },
        roles: [],
        permissions: '1024',
        joined_at: '2024-01-01T00:00:00Z',
        deaf: false,
        mute: false,
        flags: 0,
      },
      app_permissions: '0',
      entitlements: [],
      authorizing_integration_owners: {},
      attachment_size_limit: 1,
      data: { id: '100000000000000500', name, type: 1 },
    });
    connection.dispatch(
      'INTERACTION_CREATE',
      use('100000000000000701', 'photo')
    );
    await waitUntil(
      () => fake.discord.requestsTo('POST', callback).length === 1,
      'the answer'
    );
    const [message] = fake.discord.requestsTo(
      'POST',
      `/channels/${GENERAL}/messages`
    );
    expect(message!.files).toEqual({
      'files[0]': {
        name: 'monday.png',
        type: expect.any(String),
        text: 'PNG!',
      },
      'files[1]': {
        name: 'today.txt',
        type: expect.any(String),
        text: 'notes',
      },
    });
    expect(message!.body).toMatchObject({
      content: 'Here',
      attachments: [
        { id: 0, filename: 'monday.png', description: 'Monday' },
        { id: 1, filename: 'today.txt' },
      ],
    });
    const [answer] = fake.discord.requestsTo('POST', callback);
    expect(answer!.files['files[0]']).toMatchObject({
      name: 'monday.png',
      text: 'PNG!',
    });
    expect(
      (answer!.body as { data: { flags: number } }).data.flags & (1 << 15)
    ).toBe(1 << 15);

    // A file that is not there: the developer is told which one.
    const other = `/interactions/100000000000000702/token-100000000000000702/callback`;
    fake.discord.on('POST', other, {});
    connection.dispatch(
      'INTERACTION_CREATE',
      use('100000000000000702', 'missing')
    );
    await cli.waitFor(
      '✗ src/commands/missing.ts:6 There is no file public/photos/tuesday.png in your project: put it there, or pick one of the files the editor lists in asset().'
    );

    // A file added while dev runs is typed at once.
    writeFileSync(join(cwd, 'public/photos/tuesday.png'), 'PNG2');
    await cli.waitFor('↻ public/ changed: types updated');
    expect(readFileSync(types, 'utf8')).toContain('"photos/tuesday.png"');

    cli.signal('SIGTERM');
    await cli.exited;
  });

  it('are watched for as soon as the folder is created', async () => {
    const fake = await world();
    const cwd = project({
      'src/commands/ping.ts': `import { command } from 'chapterjs';
export default command({ name: 'ping', description: 'd', async run({ interaction }) { await interaction.reply('Pong!'); } });
`,
    });
    const cli = runDev(cwd, fake);
    await cli.waitFor('✓ Connected');
    const types = join(cwd, '.chapterjs/types/project.d.ts');
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(types, 'utf8')).toContain(
      'export type PublicFile = never;'
    );
    mkdirSync(join(cwd, 'public'));
    await new Promise(resolve => setTimeout(resolve, 200));
    writeFileSync(join(cwd, 'public/logo.png'), 'PNG');
    await cli.waitFor('↻ public/ changed: types updated');
    await waitUntil(
      () => readFileSync(types, 'utf8').includes('"logo.png"'),
      'the types'
    );
    cli.signal('SIGTERM');
    await cli.exited;
  });
});
