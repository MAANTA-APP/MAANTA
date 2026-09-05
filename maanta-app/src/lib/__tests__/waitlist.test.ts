import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  normalizeWaitlistPhone,
  validateWaitlistSubmission,
  WAITLIST_SEGMENTS,
  WAITLIST_SEGMENT_OPTIONS,
} from "@/lib/waitlist";
import {
  WAITLIST_ACTIVATED_CHANNELS,
  WAITLIST_CONSENTED_CHANNELS,
  WAITLIST_CONSENT_TEXT,
} from "@/lib/waitlist";
import { readdirSync, statSync } from "node:fs";
import { waitlistConfirmationEmail } from "@/lib/waitlist-emails";

const validBody = {
  segment: "shopper",
  fullName: "Amina Yusuf",
  email: "Amina@Example.com",
  phone: "0712 345 678",
  consent: true,
};

describe("normalizeWaitlistPhone", () => {
  it("normalizes Kenyan formats to +254 E.164", () => {
    expect(normalizeWaitlistPhone("0712345678")).toBe("+254712345678");
    expect(normalizeWaitlistPhone("0712 345 678")).toBe("+254712345678");
    expect(normalizeWaitlistPhone("712345678")).toBe("+254712345678");
    expect(normalizeWaitlistPhone("254712345678")).toBe("+254712345678");
    expect(normalizeWaitlistPhone("+254712345678")).toBe("+254712345678");
    expect(normalizeWaitlistPhone("+2540712345678")).toBe("+254712345678");
    expect(normalizeWaitlistPhone("0110123456")).toBe("+254110123456");
  });

  it("passes through plausible non-Kenyan E.164 numbers", () => {
    expect(normalizeWaitlistPhone("+4791234567")).toBe("+4791234567");
  });

  it("rejects invalid numbers and non-strings", () => {
    expect(normalizeWaitlistPhone("12345")).toBeNull();
    expect(normalizeWaitlistPhone("+254812345678")).toBeNull();
    expect(normalizeWaitlistPhone("07123")).toBeNull();
    expect(normalizeWaitlistPhone("not a phone")).toBeNull();
    expect(normalizeWaitlistPhone(712345678)).toBeNull();
    expect(normalizeWaitlistPhone(null)).toBeNull();
  });
});

describe("validateWaitlistSubmission", () => {
  it("accepts a valid shopper submission and normalizes email + phone", () => {
    const result = validateWaitlistSubmission(validBody);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segment).toBe("shopper");
      expect(result.data.email).toBe("amina@example.com");
      expect(result.data.phone).toBe("+254712345678");
      expect(result.data.businessName).toBeNull();
    }
  });

  it("accepts merchant and mall_operator segments with optional fields", () => {
    const result = validateWaitlistSubmission({
      ...validBody,
      segment: "mall_operator",
      businessName: "  Garden City  ",
      note: "Interested in a pilot",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segment).toBe("mall_operator");
      expect(result.data.businessName).toBe("Garden City");
      expect(result.data.note).toBe("Interested in a pilot");
    }
  });

  it("rejects unknown or free-text segments", () => {
    for (const segment of ["Shopper", "operator", "", null, undefined]) {
      expect(validateWaitlistSubmission({ ...validBody, segment }).ok).toBe(false);
    }
  });

  // Board 2 (2026-09-05): the shopper form asks for a first name "so we can
  // greet you properly" and nothing more. A blank name is a greeting that says
  // "there", not a rejected signup.
  it("accepts a missing name as null, and still rejects a bad email or phone", () => {
    const blank = validateWaitlistSubmission({ ...validBody, fullName: "  " });
    expect(blank.ok).toBe(true);
    if (blank.ok) expect(blank.data.fullName).toBeNull();
    expect(validateWaitlistSubmission({ ...validBody, email: "not-an-email" }).ok).toBe(false);
    expect(validateWaitlistSubmission({ ...validBody, phone: "12" }).ok).toBe(false);
  });

  it("rejects missing consent", () => {
    expect(validateWaitlistSubmission({ ...validBody, consent: false }).ok).toBe(false);
    expect(validateWaitlistSubmission({ ...validBody, consent: "yes" }).ok).toBe(false);
  });

  it("rejects non-object bodies", () => {
    expect(validateWaitlistSubmission(null).ok).toBe(false);
    expect(validateWaitlistSubmission("hi").ok).toBe(false);
  });
});

// Frozen rule: shoppers, merchants, and mall operators are separate audiences
// from the FIRST signup. The landing form used to hardcode segment=shopper, so
// every merchant captured there landed in the shopper audience. These are
// ratchets — they fail the moment an entry point stops asking.
describe("waitlist segment capture", () => {
  const SRC = path.resolve(__dirname, "..", "..");
  const read = (...p: string[]) => readFileSync(path.join(SRC, ...p), "utf8");
  // Role selection is step 1 of the funnel (board 2); the cards are the entry point.
  const WAITLIST = ["app", "(funnel)", "waitlist", "role-select.tsx"];

  it("offers every segment, in canonical order", () => {
    expect(WAITLIST_SEGMENT_OPTIONS.map((o) => o.value)).toEqual([
      ...WAITLIST_SEGMENTS,
    ]);
    for (const o of WAITLIST_SEGMENT_OPTIONS) expect(o.label.trim()).not.toBe("");
  });

  it("never hardcodes a segment at an entry point", () => {
    for (const file of [WAITLIST]) {
      const src = read(...file);
      expect(
        /segment:\s*["'](shopper|merchant|mall_operator)["']/.test(src),
        `${file.join("/")} pins a literal segment — the visitor must choose`
      ).toBe(false);
    }
  });

  it("drives both entry points from the shared option list", () => {
    for (const file of [WAITLIST]) {
      expect(read(...file), `${file.join("/")} should not define its own list`)
        .toContain("WAITLIST_SEGMENT_OPTIONS");
    }
  });
});

// D269 (founder ruling 2026-09-05): email is the launch channel, and the consent
// a person ticks already covers the two channels the board wants next, so adding
// WhatsApp or SMS later never means asking early signups again.
//
// The invariant that goes with it: CONSENTED CHANNEL ≠ ACTIVATED CHANNEL. The
// wording naming a channel activates nothing; activation is a separate ruling
// with its own provider, operational and compliance readiness.
describe("waitlist consent names every channel it may one day use", () => {
  it("covers email, WhatsApp and SMS, and the right to leave", () => {
    for (const word of ["email", "WhatsApp", "SMS", "unsubscribe"]) {
      expect(WAITLIST_CONSENT_TEXT).toContain(word);
    }
    expect([...WAITLIST_CONSENTED_CHANNELS]).toEqual(["email", "whatsapp", "sms"]);
  });

  it("activates email only, and every activated channel is a consented one", () => {
    expect([...WAITLIST_ACTIVATED_CHANNELS]).toEqual(["email"]);
    for (const c of WAITLIST_ACTIVATED_CHANNELS) {
      expect(WAITLIST_CONSENTED_CHANNELS).toContain(c);
    }
  });

  // Activation is a ruling, not a dependency install. Until D269's channel
  // posture is re-examined, no WhatsApp or SMS sender exists in the codebase.
  it("has no WhatsApp or SMS sender in lib/ or app/api", () => {
    const SRC = path.resolve(__dirname, "..", "..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name !== "__tests__") walk(full);
        } else if (/\.tsx?$/.test(name)) files.push(full);
      }
    };
    walk(path.join(SRC, "lib"));
    walk(path.join(SRC, "app", "api"));
    const senders = files.filter((f) =>
      /twilio|africastalking|africa's talking|graph\.facebook\.com|sendSms\(|sendWhatsApp\(/i.test(
        readFileSync(f, "utf8")
      )
    );
    expect(senders.map((f) => path.relative(SRC, f))).toEqual([]);
  });
});

describe("waitlistConfirmationEmail", () => {
  it("produces distinct copy per segment", () => {
    const subjects = WAITLIST_SEGMENTS.map(
      (s) => waitlistConfirmationEmail(s, "Amina Yusuf").subject
    );
    expect(new Set(subjects).size).toBe(3);
  });

  it("states the KES 30 success fee plainly in the merchant email", () => {
    const email = waitlistConfirmationEmail("merchant", "Amina Yusuf");
    expect(email.html).toContain("KES 30");
    expect(email.text).toContain("KES 30");
  });

  it("greets by first name and escapes HTML in the name", () => {
    const email = waitlistConfirmationEmail("shopper", "<b>Amina</b> Yusuf");
    expect(email.html).not.toContain("<b>Amina</b>");
    expect(email.html).toContain("&lt;b&gt;Amina&lt;/b&gt;");
    expect(waitlistConfirmationEmail("shopper", "Amina Yusuf").text).toContain("Hi Amina");
  });
});
