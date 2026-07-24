import { defineConfig, devices } from "@playwright/test";

/**
 * Browser golden-path E2E (tracker E14 / audit PR #35).
 *
 * This suite runs against a DEPLOYED MAANTA app — it needs `E2E_BASE_URL` and
 * Clerk test credentials / storage states, which only exist once a live
 * Supabase + Clerk test env is provisioned (a human/ops task). Until then the
 * specs self-skip (see e2e/golden-path.spec.ts), so this is real coverage when
 * enabled and never a false green in the meantime.
 *
 * `@playwright/test` is intentionally NOT a package.json dependency (keeping it
 * out preserves a valid `npm ci` lockfile for the main build). The opt-in
 * `.github/workflows/e2e.yml` job installs it on demand; locally, run
 * `npm i -D @playwright/test && npx playwright install chromium` first.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
