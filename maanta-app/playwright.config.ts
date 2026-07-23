import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import path from "node:path";

// Load E2E env (test Supabase + Clerk) without clobbering anything already set
// in the shell / CI. `.env.e2e` is gitignored; `.env.e2e.example` documents it.
loadEnv({ path: path.resolve(__dirname, ".env.e2e") });

const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  // A real networked app (Clerk sign-in + Supabase RPCs); give assertions room
  // without letting a hang run forever.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: isCI,
  // The specs mutate shared seeded merchants (Nuur/Bilan) via the service role,
  // so they run serially; retries absorb Clerk/Supabase cold starts.
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // A phone-sized viewport: MAANTA's shopper surfaces are mobile-first
    // (max-w-mobile), and the redeem keypad's single-column layout is the one
    // the golden path exercises.
    viewport: { width: 414, height: 896 },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 414, height: 896 } } },
  ],
  // When E2E_BASE_URL is unset, boot the built app locally. Requires the test
  // Supabase + Clerk env to be present so /demo, /login and RPCs actually work.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: BASE_URL,
        timeout: 120_000,
        reuseExistingServer: !isCI,
      },
});
