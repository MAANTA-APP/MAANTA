import { defineConfig, devices } from "@playwright/test";

/**
 * Service-worker offline spec (D235) — a SEPARATE config from
 * `playwright.config.ts` on purpose.
 *
 * The golden-path suite runs against a DEPLOYED app and self-skips without
 * `E2E_BASE_URL` and Clerk storage states. This one is self-contained: it
 * starts a tiny static origin (`e2e-sw/harness/server.mjs`) that serves the
 * real `public/sw.js`, so the worker's offline behaviour can be proven in a
 * real browser on any machine, in CI or locally, with no credentials.
 *
 * Keeping them apart means neither can weaken the other: this suite can never
 * be mistaken for golden-path coverage, and it never skips.
 *
 * `@playwright/test` remains deliberately absent from package.json (see
 * `playwright.config.ts`), so this is run with an on-demand install.
 */
const PORT = Number(process.env.SW_HARNESS_PORT || 4321);

export default defineConfig({
  testDir: "./e2e-sw",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node e2e-sw/harness/server.mjs",
    url: `http://localhost:${PORT}/offline`,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // The image ships one Chromium (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers)
        // and @playwright/test is installed on demand, so its pinned build number
        // will not always match. Point at the binary that exists rather than
        // downloading a second one; PW_CHROMIUM_PATH overrides it elsewhere.
        launchOptions: process.env.PW_CHROMIUM_PATH
          ? { executablePath: process.env.PW_CHROMIUM_PATH }
          : undefined,
      },
    },
  ],
});
