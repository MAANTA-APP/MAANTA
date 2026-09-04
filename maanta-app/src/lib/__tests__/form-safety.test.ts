import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";
import {
  CLOSED_FORM_API_MESSAGE,
  CLOSED_FORM_COPY,
  FORM_STATUS,
  isFormCollecting,
  type PublicForm,
} from "@/lib/marketing/forms";
import { ENTITY } from "@/lib/marketing/demo";
import { POST as contactPost } from "@/app/api/contact/route";
import { POST as waitlistPost } from "@/app/api/waitlist/route";

/**
 * Form safety — founder ruling 2026-09-04 (`10 §4`).
 *
 * A public form collects only when its data path is proven **and** legal
 * review has cleared it (FC1 — which gate governs is unruled, so both must
 * pass). Until then a form is non-collecting, and "non-collecting" has four
 * rules the ruling states: never a silent failure, no count or queue
 * position, a working alternative, and the real reason.
 *
 * This suite pins the state (`FORM_STATUS`), the copy rules, and — the part
 * that makes "closed" true rather than cosmetic — that the API routes refuse
 * while their form is closed. A page that hides its inputs while the route
 * still accepts a POST is a form that collects from anyone with a cached
 * page or a curl, which is D28 in a new coat.
 */

const SRC = path.resolve(__dirname, "..", "..");
const read = (rel: string) => stripComments(readFileSync(path.join(SRC, rel), "utf8"));

const CLOSED = (Object.keys(FORM_STATUS) as PublicForm[]).filter((f) => !isFormCollecting(f));

describe("form safety (founder ruling 2026-09-04, FC1 pending)", () => {
  it("holds /contact and /waitlist non-collecting until FC1 is ruled; /merchants/join stores nothing and stays open", () => {
    // Change these only against a founder ruling — the module docblock says
    // which ruling each state is waiting on.
    expect(FORM_STATUS).toEqual({ contact: "closed", waitlist: "closed", merchantJoin: "open" });
  });

  it("closed-state copy gives the real reason, a working alternative, and no count", () => {
    for (const form of Object.keys(CLOSED_FORM_COPY) as PublicForm[]) {
      const c = CLOSED_FORM_COPY[form];
      const all = `${c.heading} ${c.body} ${c.alternative}`;
      expect(all, `${form}: the alternative must be the live inbox`).toContain(ENTITY.email);
      expect(all, `${form}: no "N people already joined", no queue position`).not.toMatch(
        /\d+\s*(people|shops|merchants|already|in the queue|ahead of you)|queue position|already joined/i
      );
      expect(all, `${form}: the heading names the state`).toMatch(/closed for now|temporarily unavailable/);
    }
    // The two collecting forms explain why they paused; the contact form only
    // points at the channels that work (its copy in the ruling is two lines).
    expect(CLOSED_FORM_COPY.waitlist.body).toMatch(/checking how we store and protect/);
    expect(CLOSED_FORM_COPY.merchantJoin.body).toMatch(/checking how we store and protect/);
  });

  it("the API routes refuse with a 503 and the alternative while their form is closed", async () => {
    const routes: Record<Exclude<PublicForm, "merchantJoin">, (r: Request) => Promise<Response>> = {
      contact: contactPost,
      waitlist: waitlistPost,
    };
    for (const form of ["contact", "waitlist"] as const) {
      if (!CLOSED.includes(form)) continue;
      const res = await routes[form](
        new Request("http://localhost/api/x", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Test",
            contact: "test@example.com",
            message: "hello",
            segment: "shopper",
            fullName: "Test Person",
            email: "test@example.com",
            phone: "0712345678",
            consent: true,
          }),
        })
      );
      expect(res.status, `${form} must refuse, not accept and discard`).toBe(503);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe(CLOSED_FORM_API_MESSAGE[form]);
      expect(body.error).toContain(ENTITY.email);
    }
    // Non-vacuity: this assertion only means something while at least one
    // route is closed. When both reopen, delete it deliberately.
    expect(CLOSED.filter((f) => f !== "merchantJoin").length).toBeGreaterThan(0);
  });

  it("each surface reads the flag rather than a private copy of the decision", () => {
    for (const rel of [
      "components/marketing/EnquiryRouter.tsx",
      "app/(marketing)/waitlist/page.tsx",
      "app/(marketing)/merchants/join/join-form.tsx",
      "app/api/contact/route.ts",
      "app/api/waitlist/route.ts",
    ]) {
      expect(read(rel), `${rel} must gate on isFormCollecting`).toMatch(/isFormCollecting\(/);
    }
  });

  it("the build gate knows the closed state for every prerendered form route", () => {
    const script = readFileSync(path.join(SRC, "..", "scripts", "check-server-forms.mjs"), "utf8");
    expect(script).toContain(`closedNeedle: "${CLOSED_FORM_COPY.contact.heading}"`);
    expect(script).toContain(`closedNeedle: "${CLOSED_FORM_COPY.merchantJoin.heading}"`);
    expect(script).toContain("a closed form must render no inputs");
  });

  it("/merchants/join makes no request and no call or visit promise", () => {
    const form = read("app/(marketing)/merchants/join/join-form.tsx");
    expect(form).not.toMatch(/fetch\(|\/api\//);
    expect(form).not.toMatch(/We will call you|come to your shop/i);
    expect(form).toContain("We will be in touch before we open at BBS Mall.");
  });
});
