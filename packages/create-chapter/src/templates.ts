import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/** `templates/` ships next to `dist/` in the published package. */
export const templatesDir = fileURLToPath(
  new URL('../templates/', import.meta.url)
);

export interface Template {
  /** Folder name in `templates/`. */
  name: string;
  /** Shown as a hint in the menu, from the template's package.json `description`. */
  description: string | undefined;
}

/** Every folder of `templates/` is a template: adding one needs no code change. */
export async function listTemplates(): Promise<Template[]> {
  const entries = await readdir(templatesDir, { withFileTypes: true });
  const templates = await Promise.all(
    entries
      .filter(entry => entry.isDirectory())
      .map(async (entry): Promise<Template> => {
        const pkg = JSON.parse(
          await readFile(join(templatesDir, entry.name, 'package.json'), 'utf8')
        ) as { description?: unknown };
        const description =
          typeof pkg.description === 'string' ? pkg.description : undefined;
        return { name: entry.name, description };
      })
  );
  // `default` first, so it is the preselected choice.
  return templates.sort((a, b) =>
    a.name === 'default'
      ? -1
      : b.name === 'default'
        ? 1
        : a.name.localeCompare(b.name)
  );
}
