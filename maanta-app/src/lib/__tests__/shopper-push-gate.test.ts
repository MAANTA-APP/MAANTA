import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { SHOPPER_PUSH_SENDER_EXISTS } from "@/lib/shopper-push";
import { stripComments } from "./helpers/comment-stripping";

/**
 * Drift **D234** — do not ask a shopper for push permission until something can
 * send them one.
 *
 * ## What this guards, and why it is not just "assert false"
 *
 * A test pinning `SHOPPER_PUSH_SENDER_EXISTS === false` would have to be edited
 * by the same person who flips the flag, which makes it a comment. So the
 * assertion is a **relationship**: the flag may be true only when the codebase
 * actually contains a shopper-facing sender.
 *
 * "A sender" is defined mechanically as a module that imports
 * `sendPushNotification` from `@/lib/webpush`, other than:
 *
 *  - `lib/webpush.ts` itself, which defines it;
 *  - `lib/notify-merchant.ts`, which is the **merchant** sender — its callers
 *    are the Stripe and IntaSend webhooks, and it reads the merchant's own
 *    `users.push_subscription` row.
 *
 * If that set is empty the flag must be false, and the sheet must not render.
 * If someone writes the D232 favourite-merchant notification, the set becomes
 * non-empty, this test stops constraining the flag, and the same change can
 * flip it. The flag therefore cannot drift ahead of the code it describes in
 * either direction.
 *
 * ## What is deliberately NOT asserted
 *
 * That the subscribe machinery is removed. It is correct and stays:
 * `/api/push/subscribe` writes `users.push_subscription`, which
 * `notify-merchant` already reads. Only the *asking* is held, so a sender
 * written later inherits working plumbing rather than rebuilding it.
 */

const SRC = path.resolve(__dirname, "..", "..");

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "__tests__") continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const rel = (f: string) => path.relative(SRC, f).replace(/\\/g, "/");

/** Modules that import the push sender, minus the definition and the merchant one. */
function shopperSenderModules(): string[] {
  const EXCLUDED = new Set(["lib/webpush.ts", "lib/notify-merchant.ts"]);
  return walk(SRC)
    .filter((f) => !EXCLUDED.has(rel(f)))
    .filter((f) => /sendPushNotification/.test(stripComments(readFileSync(f, "utf8"))))
    .map(rel);
}

describe("D234 — the push prompt waits for a sender", () => {
  it("keeps the flag false while no shopper-facing sender exists", () => {
    const senders = shopperSenderModules();
    if (senders.length === 0) {
      expect(
        SHOPPER_PUSH_SENDER_EXISTS,
        "SHOPPER_PUSH_SENDER_EXISTS is true, but nothing outside lib/notify-merchant.ts\n" +
          "sends a push. A shopper who accepts would receive nothing, and browser\n" +
          "permission is close to one-shot — a block cannot be re-prompted.\n" +
          "Ship the sender (D232) in the same change that flips the flag."
      ).toBe(false);
    } else {
      // A sender exists. The flag is now the author's call, not this test's —
      // but leaving it false means the sender has no audience, which is worth
      // saying out loud rather than passing silently.
      expect(
        SHOPPER_PUSH_SENDER_EXISTS,
        `a shopper push sender now exists (${senders.join(", ")}), so the opt-in\n` +
          "sheet should be turned back on: set SHOPPER_PUSH_SENDER_EXISTS to true."
      ).toBe(true);
    }
  });

  it("gates both the effect and the render on the flag", () => {
    const src = stripComments(
      readFileSync(path.join(SRC, "app", "(shopper)", "feed", "notification-opt-in.tsx"), "utf8")
    );
    expect(
      /if \(!SHOPPER_PUSH_SENDER_EXISTS\) return;/.test(src),
      "the effect no longer checks the flag — it would schedule a sheet that\n" +
        "never paints, and a later edit could open it."
    ).toBe(true);
    expect(
      /if \(!SHOPPER_PUSH_SENDER_EXISTS\) return null;/.test(src),
      "the render no longer checks the flag, so the sheet can paint and request\n" +
        "permission again."
    ).toBe(true);
  });

  it("keeps permission requests to that one gated component", () => {
    // A second call site would bypass the gate entirely. `usePwaInstall`
    // registers the service worker, which is fine — that asks for nothing.
    const offenders = walk(SRC)
      .filter((f) =>
        /Notification\.requestPermission|pushManager\.subscribe/.test(
          stripComments(readFileSync(f, "utf8"))
        )
      )
      .map(rel)
      .filter((f) => f !== "app/(shopper)/feed/notification-opt-in.tsx");
    expect(
      offenders,
      "another surface requests notification permission or subscribes to push,\n" +
        "outside the gated opt-in sheet. Route it through the same gate."
    ).toEqual([]);
  });

  it("keeps the subscribe plumbing, so a future sender inherits it", () => {
    const src = stripComments(
      readFileSync(path.join(SRC, "app", "(shopper)", "feed", "notification-opt-in.tsx"), "utf8")
    );
    expect(
      /\/api\/push\/subscribe/.test(src) && /pushManager\.subscribe/.test(src),
      "the subscribe path was deleted rather than gated. D234 holds the ASKING,\n" +
        "not the plumbing — users.push_subscription is already read by\n" +
        "notify-merchant, so this code is what a shopper sender will reuse."
    ).toBe(true);
  });
});
