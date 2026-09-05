import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";
import { FACTS } from "@/lib/marketing/facts";
import { ENTITY } from "@/lib/marketing/demo";
import {
  PILOT_EYEBROW,
  PILOT_LOCATION_MAX_OPTIONS,
  PILOT_LOCATION_OPTIONS,
  isPilotLocationValue,
  pilotBookingAction,
  storedPilotLocation,
} from "@/lib/marketing/pilot-status";
import * as LIVE_CLAIMS from "@/lib/marketing/live-claims";
import { validateWaitlistSubmission } from "@/lib/waitlist";
import { validateMerchantInterest } from "@/lib/merchant-interest";

/**
 * The Nairobi pilot repositioning (founder direction 2026-09-05).
 *
 * MAANTA markets a pilot whose location is **not confirmed**. BBS Mall in
 * Eastleigh may appear only as a potential location; no partnership,
 * permission, desk, staff presence, launch date or operating presence may be
 * implied anywhere a member of the public can read it.
 *
 * These are behavioural guards over the whole public tree — every marketing
 * and funnel page, the shared chrome, metadata, OG images and structured data
 * — because the previous claims spread by being written as literals at each
 * point of use. A page that reintroduces one fails here rather than shipping.
 */

const SRC = path.resolve(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(path.join(SRC, ...p), "utf8");

/** Every public `.tsx` under the marketing and funnel trees, plus shared chrome. */
function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(entry) && !full.includes("__tests__")) out.push(full);
  }
  return out;
}

const PUBLIC_FILES = [
  ...walk(path.join(SRC, "app", "(marketing)")),
  ...walk(path.join(SRC, "app", "(funnel)")),
  ...walk(path.join(SRC, "components", "marketing")),
  ...walk(path.join(SRC, "components", "funnel")),
  path.join(SRC, "lib", "marketing", "pilot-status.ts"),
  path.join(SRC, "lib", "marketing", "nav.ts"),
  path.join(SRC, "lib", "marketing", "og.tsx"),
  path.join(SRC, "lib", "waitlist.ts"),
  path.join(SRC, "lib", "merchant-interest.ts"),
  path.join(SRC, "lib", "waitlist-emails.ts"),
  path.join(SRC, "app", "layout.tsx"),
  path.join(SRC, "app", "manifest.ts"),
].filter((f) => existsSync(f));

/** Rendered source with comments removed — prose in a docblock is not a claim. */
const bodies = PUBLIC_FILES.map((f) => ({ file: path.relative(SRC, f), text: stripComments(readFileSync(f, "utf8")) }));

/** Whitespace-collapsed, because JSX wraps a sentence across lines (the D-lesson from `NODE_REFERENCE_SENTENCE`). */
const flat = bodies.map((b) => ({ ...b, text: b.text.replace(/\s+/g, " ") }));

describe("1 · no public page presents BBS Mall as confirmed", () => {
  const CONFIRMED = [
    /MAANTA (?:opens|is open) (?:first )?at [^.]*BBS/i,
    /\bopens first at\b/i,
    /launch(?:ing)? (?:at|in) [^.]*BBS/i,
    /\bour (?:first|launch) mall\b/i,
    /BBS Mall[^.]{0,40}\bis (?:the )?(?:launch|first) node\b/i,
    /\bMAANTA operates at\b/i,
  ];
  it.each(flat)("$file", ({ text }) => {
    for (const re of CONFIRMED) expect(text, String(re)).not.toMatch(re);
  });

  /**
   * `live-claims.ts` holds a pre-launch AND a post-launch branch for every
   * sentence by design, so its source names the mall in strings that cannot
   * render today. What matters is the value each constant RESOLVES to, which
   * is what a page prints.
   */
  it("resolves every exported claim to a pre-launch value", () => {
    const values = Object.entries(LIVE_CLAIMS).filter(([, v]) => typeof v === "string") as [string, string][];
    expect(values.length).toBeGreaterThan(10);
    for (const [name, value] of values) {
      for (const re of CONFIRMED) expect(value, `${name}: ${value}`).not.toMatch(re);
      if (/BBS/.test(value)) {
        expect(value, name).toMatch(/potential|not (?:a )?confirmed|to be confirmed|no agreement/i);
      }
    }
  });
});

describe("2 · BBS appears only with an explicit qualification", () => {
  const QUALIFIERS = /potential|candidate|being considered|not (?:a )?confirmed|to be confirmed|no agreement|has been confirmed/i;
  // Case-sensitive: the lowercase `bbs` option value is a form slug, not a claim.
  it.each(flat.filter((b) => /BBS/.test(b.text)))("$file qualifies every mention", ({ text }) => {
    // Every sentence naming BBS must carry a qualification in the same sentence.
    const sentences = text.split(/(?<=\.)\s+/).filter((s) => /BBS/.test(s));
    for (const s of sentences) expect(s, s.slice(0, 160)).toMatch(QUALIFIERS);
  });

  it("names the mall as a candidate, never a launch site, in the facts", () => {
    expect(FACTS).not.toHaveProperty("launchMall");
    expect(FACTS.candidateMall).toBe("BBS Mall, Eastleigh");
  });
});

describe("3 · no public page claims an in-mall desk exists", () => {
  const DESK = /\b(?:in-mall desk|the desk at|our desk|desk at BBS)\b/i;
  // "There is no in-mall desk" is the correction, not the claim.
  const DENIED = /\b(?:no|not|never|without)\b[^.]{0,40}\bdesk\b|\bdesk\b[^.]{0,20}\b(?:yet|does not exist)\b/i;
  it.each(flat)("$file", ({ text }) => {
    const sentences = text.split(/(?<=\.)\s+/).filter((x) => DESK.test(x));
    for (const sentence of sentences) {
      expect(sentence, sentence.slice(0, 160)).toMatch(DENIED);
    }
  });

  it("keeps a mall address out of the entity line", () => {
    expect(ENTITY.address).toBeNull();
  });
});

describe("4 · no page claims M-Pesa or card wallet top-up is operational", () => {
  const TOPUP = /\b(?:top ?up|top-up)s?\b[^.]{0,60}\b(?:M-?Pesa|card)\b|\bM-?Pesa\b[^.]{0,40}\btop ?-?up/i;
  it.each(flat)("$file", ({ text }) => {
    expect(text).not.toMatch(TOPUP);
  });
});

describe("5 · demo-feed links resolve to the real demo feed", () => {
  it("points every explore-demo action at /feed", () => {
    const withCta = flat.filter((b) => /Explore demo deals/.test(b.text));
    expect(withCta.length).toBeGreaterThan(3);
    for (const b of withCta) {
      expect(b.text, b.file).toMatch(/DEMO_FEED_HREF|href[:=]\s*"\/feed"/);
    }
  });

  it("serves that route from the product's own feed page", () => {
    expect(existsSync(path.join(SRC, "app", "(shopper)", "feed", "page.tsx"))).toBe(true);
  });
});

describe("6 · the demo disclosure is visible before a deal can be interacted with", () => {
  it("renders the notice above the rails on the feed", () => {
    const feed = stripComments(read("app", "(shopper)", "feed", "page.tsx"));
    const notice = feed.indexOf("<DemoFeedNotice");
    const firstRail = feed.indexOf("<LiveDealCollection");
    expect(notice).toBeGreaterThan(-1);
    expect(firstRail).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(firstRail);
  });

  it("labels every synthetic card, not just the screen", () => {
    const card = stripComments(read("components", "ui", "claude", "deal-card.tsx"));
    expect(card).toContain("DemoBadge");
    expect(card).toMatch(/demo \? <DemoBadge \/> : null/);
    const feed = stripComments(read("app", "(shopper)", "feed", "page.tsx"));
    expect(feed).toMatch(/demo: d\.is_demo === true/);
  });

  it("offers a route back to the marketing site", () => {
    const notice = read("components", "shopper", "demo-feed-notice.tsx");
    expect(notice).toMatch(/href="\/"/);
  });
});

describe("7 · waitlist routes record the audience they were entered from", () => {
  const base = { email: "a@example.com", location: "bbs", consent: true };
  it.each(["shopper", "merchant", "mall_operator"] as const)("stores %s", (segment) => {
    const r = validateWaitlistSubmission({ ...base, segment });
    expect(r.ok && r.data.segment).toBe(segment);
  });

  it("refuses a submission with no audience", () => {
    expect(validateWaitlistSubmission({ ...base }).ok).toBe(false);
  });
});

describe("8 · the location selector is a short, configured list", () => {
  it("offers no more than ten founder-approved choices", () => {
    expect(PILOT_LOCATION_OPTIONS.length).toBeLessThanOrEqual(PILOT_LOCATION_MAX_OPTIONS);
    expect(PILOT_LOCATION_OPTIONS.length).toBeGreaterThan(0);
  });

  it("names BBS only as a potential pilot location", () => {
    const bbs = PILOT_LOCATION_OPTIONS.find((o) => o.value === "bbs");
    expect(bbs?.label).toMatch(/potential pilot location/i);
  });

  it("invents no mall partnerships", () => {
    for (const o of PILOT_LOCATION_OPTIONS) {
      if (o.value === "bbs") continue;
      expect(o.label).not.toMatch(/mall|centre|center/i);
    }
  });

  it("is the one list both public forms render", () => {
    const signup = stripComments(read("app", "(funnel)", "waitlist", "signup-form.tsx"));
    expect(signup).toContain("WAITLIST_LOCATION_OPTIONS");
    const join = stripComments(read("app", "(funnel)", "merchants", "join", "join-form.tsx"));
    expect(join).toContain("MERCHANT_MALL_OPTIONS");
    const merchantLib = read("lib", "merchant-interest.ts");
    expect(merchantLib).toContain("PILOT_LOCATION_OPTIONS");
  });
});

describe("9 · the server rejects a location outside the configuration", () => {
  const base = { segment: "shopper", email: "a@example.com", consent: true };
  it("refuses an unlisted value rather than defaulting it", () => {
    for (const bad of ["karen-crossroads", "westgate", "", "BBS Mall", 1, null, undefined]) {
      expect(validateWaitlistSubmission({ ...base, location: bad }).ok, String(bad)).toBe(false);
    }
  });

  it("applies the same list on the merchant endpoint", () => {
    const merchant = {
      shopName: "S",
      contactName: "C",
      phone: "0712345678",
      floor: "GF",
      unit: "12",
      contactConsent: true,
    };
    expect(validateMerchantInterest({ ...merchant, mall: "karen-crossroads" }).ok).toBe(false);
    expect(validateMerchantInterest({ ...merchant, mall: "bbs" }).ok).toBe(true);
  });

  it("resolves a listed value to its stored preference, and 'other' to the free text", () => {
    expect(isPilotLocationValue("bbs")).toBe(true);
    expect(isPilotLocationValue("nope")).toBe(false);
    expect(storedPilotLocation("bbs", null)).toBe(FACTS.candidateMall);
    expect(storedPilotLocation("other", " Garden City ")).toBe("Garden City");
    expect(storedPilotLocation("other", "")).toBeNull();
    expect(storedPilotLocation("other", "x".repeat(200))).toBeNull();
  });
});

describe("10 · a form error never renders a success state", () => {
  it("shows success only for a 2xx with ok:true", () => {
    const src = stripComments(read("app", "(funnel)", "waitlist", "signup-form.tsx"));
    // A 5xx or a thrown fetch sets the failure panel...
    expect(src).toMatch(/res\.status >= 500[\s\S]{0,120}setDone\(\{ state: "failed" \}\)/);
    expect(src).toMatch(/catch \{[\s\S]{0,80}setDone\(\{ state: "failed" \}\)/);
    // ...and a non-ok body sets an error, never `joined`.
    expect(src).toMatch(/!res\.ok \|\| body\?\.ok !== true[\s\S]{0,140}setError/);
    const joinedAt = src.indexOf('setDone({ state: body?.alreadyJoined');
    const guardAt = src.indexOf("body?.ok !== true");
    expect(guardAt).toBeGreaterThan(-1);
    expect(joinedAt).toBeGreaterThan(guardAt);
  });

  it("says nothing was saved when the write failed", () => {
    const src = read("app", "(funnel)", "waitlist", "signup-form.tsx");
    expect(src).toMatch(/Nothing was saved/i);
  });
});

describe("11 · the public CTAs are present and reachable", () => {
  it("carries all three header actions, on desktop and in the mobile sheet", () => {
    const nav = read("lib", "marketing", "nav.ts");
    expect(nav).toMatch(/HEADER_CTA[\s\S]{0,200}Explore demo deals/);
    expect(nav).toMatch(/HEADER_WAITLIST[\s\S]{0,80}Join waitlist/);
    expect(nav).toMatch(/HEADER_SIGN_IN[\s\S]{0,80}Sign in/);
    const header = stripComments(read("components", "marketing", "SiteHeader.tsx"));
    for (const token of ["HEADER_CTA", "HEADER_WAITLIST", "HEADER_SIGN_IN"]) {
      // Once in the desktop bar and once in the mobile sheet.
      expect(header.split(`{${token}.label}`).length - 1, token).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps every control at a 44px touch target", () => {
    const header = read("components", "marketing", "SiteHeader.tsx");
    expect(header).not.toMatch(/h-10 w-10/);
    expect(header).toMatch(/min-h-11/);
  });
});

describe("12 · the About page carries no founder biography", () => {
  const REMOVED = [
    /born in norway/i, /somali parents/i, /asylum seek/i, /raised in the uk/i,
    /aston university/i, /politics and economics/i, /by descent/i, /first company/i,
  ];
  it("removes every biographical detail", () => {
    const about = stripComments(read("app", "(marketing)", "about", "page.tsx")).replace(/\s+/g, " ");
    for (const re of REMOVED) expect(about, String(re)).not.toMatch(re);
  });

  it("keeps the product-centred structure", () => {
    const about = read("app", "(marketing)", "about", "page.tsx");
    expect(about).toContain("How the idea began");
    expect(about).toContain("What MAANTA is building");
    expect(about).toContain("What MAANTA does not do");
  });
});

describe("13 · operator copy is proposed, not deployed", () => {
  it("never states staffing or deployment in the present tense", () => {
    const ops = stripComments(read("app", "(marketing)", "mall-operators", "page.tsx")).replace(/\s+/g, " ");
    const PRESENT = [
      /\bour team is in the building\b/i,
      /\bagents work the floor\b/i,
      /\bsignage goes up\b/i,
      /\ba node manager coordinates\b/i,
      /\byou have one person to call\b/i,
      /\bthe node team is in the building\b/i,
    ];
    for (const re of PRESENT) expect(ops, String(re)).not.toMatch(re);
  });

  it("uses conditional language where it describes the model", () => {
    const ops = read("app", "(marketing)", "mall-operators", "page.tsx");
    expect(ops).toMatch(/would|proposed|if a pilot is agreed/i);
    expect(ops).toContain("Nobody is deployed anywhere yet");
  });

  it("mentions BBS Mall exactly once, in the bounded status block", () => {
    const ops = stripComments(read("app", "(marketing)", "mall-operators", "page.tsx"));
    expect(ops.split(/BBS/).length - 1).toBeLessThanOrEqual(1);
  });
});

describe("14 · visible FAQ copy and structured data cannot drift", () => {
  it("generates the schema from the same arrays the accordion renders", () => {
    const faq = stripComments(read("app", "(marketing)", "faq", "page.tsx"));
    expect(faq).toMatch(/faqPageSchema\(\[\.\.\.shopperFaqs, \.\.\.merchantFaqs, \.\.\.mallOperatorFaqs\]\)/);
    // One definition each: a second array is a second source of truth.
    for (const name of ["shopperFaqs", "merchantFaqs", "mallOperatorFaqs"]) {
      expect(faq.split(`const ${name} =`).length - 1, name).toBe(1);
    }
  });

  it("answers the location question truthfully in both", () => {
    const faq = stripComments(read("app", "(marketing)", "faq", "page.tsx")).replace(/\s+/g, " ");
    expect(faq).not.toMatch(/which malls are live/i);
    expect(faq).toMatch(/Where will the first pilot run/i);
  });
});

describe("15 · header and footer imply no operating presence", () => {
  it("replaces the footer location block with the pilot status", () => {
    const footer = stripComments(read("components", "marketing", "SiteFooter.tsx"));
    expect(footer).toContain("FOOTER_PILOT_LINE_1");
    expect(footer).not.toMatch(/In-mall desk/);
    expect(footer).not.toMatch(/ENTITY\.address/);
  });

  it("shows the pilot status line, not a mall, under the lockup", () => {
    expect(PILOT_EYEBROW).toBe("Nairobi pilot · location to be confirmed");
  });

  it("names the footer's location link as a potential one", () => {
    const nav = read("lib", "marketing", "nav.ts");
    expect(nav).not.toMatch(/BBS Mall \(Node 0\)/);
    expect(nav).toContain("Potential first location");
  });
});

describe("booking · never publish a broken CTA", () => {
  it("falls back to the contact route when no Calendly URL is configured", () => {
    const action = pilotBookingAction();
    if (process.env.NEXT_PUBLIC_PILOT_BOOKING_URL) {
      expect(action.external).toBe(true);
      expect(action.href).toMatch(/^https:\/\//);
    } else {
      expect(action.external).toBe(false);
      expect(action.href).toBe("/contact?topic=mall-operator");
      expect(action.label).not.toMatch(/^Book /);
    }
  });

  it("reads the URL from configuration, never a literal in a component", () => {
    for (const b of bodies) {
      expect(b.text, b.file).not.toMatch(/calendly\.com/i);
    }
  });
});
