import { defineConfig, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';

export default mergeConfig(
  shared,
  defineConfig({
    test: {
      // End-to-end tests run the built CLI: build it first.
      globalSetup: ['test/global-setup.ts'],
    },
  })
);
