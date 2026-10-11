#!/usr/bin/env node
// Alias so `pnpm create chapter` works too: runs the create-chapterjs CLI.
// @ts-expect-error create-chapterjs only ships a bin, without type declarations.
await import('create-chapterjs/dist/index.js');
