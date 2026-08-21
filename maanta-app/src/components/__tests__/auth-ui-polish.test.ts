import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * Auth flows must be real forms: Enter in a single-field step submits, and
 * only the primary action is type="submit" — a ghost button left untyped
 * inside a form silently becomes a second submit.
 */
describe("Auth UI polish", () => {
  it("Supabase email login stages are forms with one submit each", () => {
    const src = read("src/components/auth/supabase-email-login.tsx");
    expect(src.match(/<\/form>/g)?.length).toBe(2);
    expect(src.match(/type="submit"/g)?.length).toBe(2);
    expect(src).toContain('type="button"');
  });

  it("verify-phone stages are forms with one submit each", () => {
    const src = read("src/app/verify-phone/page.tsx");
    expect(src.match(/<\/form>/g)?.length).toBe(2);
    expect(src.match(/type="submit"/g)?.length).toBe(2);
    // The OtpInput heading is a <p> — it names itself via ariaLabel, and an
    // unassociated <label> is dead weight to assistive tech.
    expect(src).not.toMatch(/<label[^>]*>\s*Enter the 6-digit code/);
  });
});
