#!/usr/bin/env node
// Alias so `pnpm create chapterjs` works too: runs the create-chapter CLI.
// @ts-expect-error create-chapter only ships a bin, without type declarations.
await import('create-chapter/dist/index.js');
