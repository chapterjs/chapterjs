import { spawn } from 'node:child_process';
import { cpSync, readFileSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, onTestFinished } from 'vitest';
import { packageDir, project, runDev, world } from './dev-helpers.js';

// What the editor shows is decided by the TypeScript language server: these
// tests ask the real one, the way an editor does.

/** The language server of the TypeScript the templates use, if installed. */
function languageServer(): string | null {
  try {
    const require = createRequire(join(packageDir, 'package.json'));
    const fromTypeScript = createRequire(
      require.resolve('typescript/package.json')
    );
    const native = fromTypeScript.resolve(
      `@typescript/typescript-${process.platform}-${process.arch}/package.json`
    );
    return join(dirname(native), 'lib/tsc');
  } catch {
    return null;
  }
}

/**
 * The modules the editor offers to import `name` from, when the cursor is
 * right after it. `settings` is what the editor settings of the project say
 * under "typescript".
 */
async function importsOffered(
  exe: string,
  cwd: string,
  file: string,
  name: string,
  settings: unknown
): Promise<string[]> {
  const child = spawn(exe, ['--lsp', '--stdio'], { cwd });
  onTestFinished(() => void child.kill());
  let buffer = Buffer.alloc(0);
  let lastId = 0;
  const waiting = new Map<number, (message: { result?: unknown }) => void>();
  const send = (message: object) => {
    const text = JSON.stringify({ jsonrpc: '2.0', ...message });
    child.stdin.write(
      `Content-Length: ${Buffer.byteLength(text)}\r\n\r\n${text}`
    );
  };
  const request = (method: string, params: object) =>
    new Promise<{ result?: unknown }>(resolve => {
      waiting.set(++lastId, resolve);
      send({ id: lastId, method, params });
    });
  child.stdout.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const head = buffer.indexOf('\r\n\r\n');
      if (head === -1) return;
      const length = Number(
        /Content-Length: (\d+)/.exec(buffer.subarray(0, head).toString())![1]
      );
      if (buffer.length < head + 4 + length) return;
      const message = JSON.parse(
        buffer.subarray(head + 4, head + 4 + length).toString()
      );
      buffer = buffer.subarray(head + 4 + length);
      if (message.method && message.id !== undefined) {
        // The server asks for the settings of the editor.
        const result =
          message.method === 'workspace/configuration'
            ? message.params.items.map(() => settings)
            : null;
        send({ id: message.id, result });
      } else if (message.id !== undefined) {
        waiting.get(message.id)?.(message);
      }
    }
  });

  const text = readFileSync(file, 'utf8');
  const index = text.indexOf(name) + name.length;
  const before = text.slice(0, index).split('\n');
  const uri = pathToFileURL(file).href;
  const root = pathToFileURL(cwd).href;
  await request('initialize', {
    processId: process.pid,
    rootUri: root,
    workspaceFolders: [{ uri: root, name: 'project' }],
    capabilities: {
      workspace: { configuration: true },
      textDocument: {
        completion: { completionItem: { labelDetailsSupport: true } },
      },
    },
  });
  send({ method: 'initialized', params: {} });
  send({
    method: 'textDocument/didOpen',
    params: {
      textDocument: { uri, languageId: 'typescript', version: 1, text },
    },
  });
  // The project loads in the background: ask until the imports are known.
  for (let attempt = 0; ; attempt++) {
    const { result } = (await request('textDocument/completion', {
      textDocument: { uri },
      position: { line: before.length - 1, character: before.at(-1)!.length },
      context: { triggerKind: 1 },
    })) as {
      result?: {
        items?: { label: string; labelDetails?: { description?: string } }[];
      };
    };
    const offered = (result?.items ?? [])
      .filter(item => item.label === name && item.labelDetails?.description)
      .map(item => item.labelDetails!.description!);
    if (offered.length > 0 || attempt >= 40) return offered;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}

const exe = languageServer();

describe.skipIf(exe === null || process.platform === 'win32')(
  'in the editor',
  () => {
    const template = join(packageDir, '../create-chapter/templates/default');

    /** A project as the scaffolder makes it, with two event folders in use. */
    async function scaffolded() {
      const cwd = project({
        'package.json': JSON.stringify({
          name: 'bot',
          type: 'module',
          dependencies: { chapterjs: '*' },
        }),
        'src/events/ready/online.ts': `import { event } from 'chapterjs';\nexport default event(({ user }) => user.id);\n`,
        // Files being written: `event` is typed, not imported yet.
        'src/events/messageCreate/reply.ts': `export default event(({ message }) => {});\n`,
        'src/events/messageCreate/nested/deep.ts': `export default event(({ message }) => {});\n`,
        // A folder created after the types were written.
        'src/events/memberJoin/welcome.ts': `export default event(({ member }) => {});\n`,
      });
      cpSync(join(template, 'tsconfig.json'), join(cwd, 'tsconfig.json'));
      symlinkSync(
        join(packageDir, 'node_modules/@types'),
        join(cwd, 'node_modules/@types'),
        'dir'
      );
      await runDev(cwd, await world(), ['sync']).exited;
      return cwd;
    }

    it.each([
      'src/events/messageCreate/reply.ts',
      'src/events/messageCreate/nested/deep.ts',
      'src/events/memberJoin/welcome.ts',
    ])(
      'offers to import event from chapterjs, and from nowhere else, in %s',
      async file => {
        const cwd = await scaffolded();
        // No editor setting is needed: the server is given none.
        expect(
          await importsOffered(exe!, cwd, join(cwd, file), 'event', null)
        ).toEqual(['chapterjs']);
      },
      40_000
    );
  }
);
