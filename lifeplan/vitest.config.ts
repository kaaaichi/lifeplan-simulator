import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

// NOTE: The task brief specified `environmentMatchGlob` to route `.test.tsx`
// files to jsdom while keeping `.test.ts` on node. That option was removed in
// Vitest 4 (absent from the installed vitest@4.1.9 types/source). The
// documented v4 replacement, `test.projects`, was tried but rejected: it
// silently drops the `--exclude`/`--include` CLI flags for sub-projects
// (see `cliOverrides` allowlist in vitest's cli-api chunk), which breaks the
// `test:unit` script's `--exclude` filtering below.
//
// Instead: keep a flat config (environment defaults to 'node', matching all
// existing pure-TS engine/persistence tests), and opt individual `.test.tsx`
// files into jsdom via a per-file pragma comment, e.g.:
//   // @vitest-environment jsdom
// as the first line of the test file. Missing the pragma fails loudly
// ("document is not defined"), so it's not a silent footgun.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
    setupFiles: ['./tests/setupTests.ts'],
  },
})
