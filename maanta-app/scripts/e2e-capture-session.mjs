#!/usr/bin/env node
/**
 * Capture a signed-in browser session for the read-only Admin/Founder
 * acceptance workflow (`.github/workflows/e2e-admin-founder.yml`, D240).
 *
 *   npm run e2e:capture -- admin     https://<preview>.vercel.app
 *   npm run e2e:capture -- cofounder https://<preview>.vercel.app
 *
 * This is the one step that needs a person: a Clerk session is a human signing
 * in, and nothing in CI can do that for them. Everything around the sign-in is
 * done here so the person does only that —
 *
 *   1. a browser opens on the preview's /login (and, first, Vercel's own
 *      sign-in, since previews are protected); they sign in and close it;
 *   2. the session is written to a 0600 file in the OS temp directory — never
 *      inside the repository — and put on the clipboard;
 *   3. they paste it into the GitHub secret named on screen;
 *   4. on Enter, the file and the clipboard are wiped.
 *
 * It refuses a production host. It never prints the session to the terminal.
 * The state is a live session on a production identity: if a capture is ever
 * mishandled, sign that account out everywhere (Clerk → user → sessions) and
 * recapture.
 */
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";

const ROLES = {
  admin: "E2E_ADMIN_STORAGE",
  cofounder: "E2E_COFOUNDER_STORAGE",
};
const SECRETS_PAGE = "https://github.com/MAANTA-APP/MAANTA/settings/environments";
const ENVIRONMENT = "e2e-readonly";

const [role, origin] = process.argv.slice(2);

function fail(msg) {
  console.error(`\n${msg}\n`);
  process.exit(1);
}

if (!ROLES[role]) fail(`First argument must be one of: ${Object.keys(ROLES).join(", ")}.`);
if (!origin || !/^https:\/\//.test(origin)) fail("Second argument must be the preview origin, starting with https://");
if (/maanta\.app/i.test(new URL(origin).host)) {
  fail("That is a production host. Capture against the PR's preview deployment, never maanta.app.");
}

let chromium;
try {
  ({ chromium } = await import("@playwright/test"));
} catch {
  fail(
    "Playwright is not installed in this checkout. Run this once, then try again:\n\n" +
      "  npm i -D --no-save @playwright/test && npx playwright install chromium"
  );
}

const dir = mkdtempSync(join(tmpdir(), "maanta-e2e-"));
const file = join(dir, `${role}.storage-state.json`);
const wipe = () => {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
};
process.on("SIGINT", () => {
  wipe();
  process.exit(130);
});

console.log(`\nOpening ${origin}/login in a browser window.`);
console.log("Sign in there as the " + role + ". When you can see your dashboard, close the window.\n");

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" }).catch(() => {});

// Keep the latest state until the person closes the window; the last snapshot
// taken before the browser goes away is the one that is saved.
let latest = null;
let closed = false;
browser.on("disconnected", () => {
  closed = true;
});
while (!closed) {
  try {
    latest = await context.storageState();
  } catch {
    /* context gone — the loop ends on the next check */
  }
  await new Promise((r) => setTimeout(r, 1500));
}

if (!latest) {
  wipe();
  fail("No browser state was captured. Run it again and close the window only after signing in.");
}
const signedIn = (latest.cookies ?? []).some((c) => /^__session|^__client/.test(c.name));
if (!signedIn) {
  wipe();
  fail(
    "The browser closed without a Clerk session — no sign-in was completed. " +
      "Run it again and close the window only once your dashboard is showing."
  );
}

writeFileSync(file, JSON.stringify(latest), { mode: 0o600 });
chmodSync(file, 0o600);

const onClipboard = copyToClipboard(JSON.stringify(latest));

console.log("Captured.\n");
console.log("Now save it as a GitHub secret — this is the only place it should go:");
console.log(`  1. Open ${SECRETS_PAGE}`);
console.log(`  2. Open the environment "${ENVIRONMENT}" (create it, with required reviewers, if it is not there).`);
console.log(`  3. Add secret  ${ROLES[role]}`);
if (onClipboard) {
  console.log("  4. Paste — the session is on your clipboard.\n");
} else {
  console.log(`  4. Paste the entire contents of this file:\n     ${file}\n`);
}

await new Promise((resolve) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.question("Press Enter once the secret is saved. The file and clipboard are then wiped. ", () => {
    rl.close();
    resolve();
  });
});

wipe();
if (onClipboard) copyToClipboard("");
console.log("\nWiped. Next: Actions → \"E2E (admin + founder acceptance, read-only)\" → Run workflow on the PR's branch, with the preview URL.\n");

function copyToClipboard(text) {
  const attempts =
    process.platform === "darwin"
      ? [["pbcopy", []]]
      : process.platform === "win32"
        ? [["clip", []]]
        : [
            ["wl-copy", []],
            ["xclip", ["-selection", "clipboard"]],
            ["xsel", ["--clipboard", "--input"]],
          ];
  for (const [cmd, args] of attempts) {
    const r = spawnSync(cmd, args, { input: text, stdio: ["pipe", "ignore", "ignore"] });
    if (!r.error && r.status === 0) return true;
  }
  return false;
}
