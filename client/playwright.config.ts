import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config for Field Task Manager.
 *
 * The .NET backend serves BOTH the Angular SPA and the API on a single origin
 * (http://localhost:5080 — see architecture.md §6.4). These tests drive that one
 * running instance end-to-end; there is no separate dev server.
 *
 * RUNNING (the app must already be up):
 *   1. cd server && dotnet run        # builds the SPA + API, migrates+seeds, serves :5080
 *   2. cd client && npx playwright install   # one-time: download the Chromium build
 *   3. cd client && npm run e2e
 *
 * The seeded Admin (admin / Admin#12345) and the single-port serving are fixed
 * by appsettings.json / the architecture contract; see e2e/README.md.
 */
export default defineConfig({
  testDir: './e2e',

  // Deterministic + isolated: no shared state between tests, no flaky retries.
  fullyParallel: false,
  retries: 0,
  workers: 1,

  // A generous-but-bounded budget: the SPA boot + Leaflet tiles can be slow on
  // a cold first navigation, but nothing here should legitimately take longer.
  timeout: 45_000,
  expect: { timeout: 10_000 },

  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:5080',
    headless: true,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // ---------------------------------------------------------------------------
  // The app is expected to already be running on :5080 (dotnet run in /server).
  // If you would rather have Playwright start it for you, uncomment the block
  // below. It is left OFF by default because the MSBuild SPA build can take a
  // while and the orchestrator runs the server itself.
  // ---------------------------------------------------------------------------
  // webServer: {
  //   command: 'dotnet run --project ../server/FieldTaskManager.Api.csproj',
  //   url: 'http://localhost:5080',
  //   timeout: 180_000,
  //   reuseExistingServer: true,
  // },
});
