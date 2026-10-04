// Vitest settings shared by every package: each package's vitest.config.ts
// merges this with its own needs. Only a type import, so this file needs no
// dependency at the root of the repository.
import type { ViteUserConfig } from 'vitest/config';

export default {
  test: {
    include: ['test/**/*.test.ts'],
    // A package without tests yet must not fail `pnpm test`.
    passWithNoTests: true,
    // Each test starts from a clean state, whatever the previous one changed.
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    // End-to-end tests start real processes: give them room on slow CI machines.
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text', 'html'],
    },
  },
} satisfies ViteUserConfig;
