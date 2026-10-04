import { defineConfig, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';

export default mergeConfig(
  shared,
  defineConfig({
    // End-to-end tests run the built CLI: build it first, so they never test stale code.
    test: { globalSetup: ['test/global-setup.ts'] },
  })
);
