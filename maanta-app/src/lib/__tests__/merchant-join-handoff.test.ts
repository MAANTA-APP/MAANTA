import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stashMerchantJoin, takeMerchantJoin } from "../merchant-join-handoff";
import { walk } from "./helpers/source-files";
import { stripComments as codeOnly } from "./helpers/comment-stripping";

/**
 * The `/merchants/join` → `/merchant/onboard` phone handoff.
 *
 * Carrying the number as a query parameter — `?phone=…&cc=…` — wrote a phone
 * number, the primary identifier in this market, into browser history, the
 * `Referer` header and the PostHog `$current_url` attached to every event on
 * both pages. Found in review of PR #153; the parameter had been added in the
 * same PR to stop the join form discarding what it collected.
 *
 * Two things are asserted: the storage handoff behaves (including the
 * read-once contract), and the URL parameter does not come back.
 */

const SRC = path.resolve(__dirname, "..", "..");

describe("merchant join handoff", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("round-trips a number", () => {
    stashMerchantJoin({ cc: "+254", phone: "712345678" });
    expect(takeMerchantJoin()).toEqual({ cc: "+254", phone: "712345678" });
  });

  it("clears on read, so a later visit in the same tab is not prefilled", () => {
    stashMerchantJoin({ cc: "+254", phone: "712345678" });
    takeMerchantJoin();
    expect(takeMerchantJoin()).toBeNull();
  });

  it("returns null when nothing was stashed", () => {
    expect(takeMerchantJoin()).toBeNull();
  });

  it("strips non-digits and caps length", () => {
    stashMerchantJoin({ cc: "+254", phone: "0712 345 678 (mobile) 999999999" });
    expect(takeMerchantJoin()?.phone).toBe("071234567899999");
  });

  it("falls back to +254 for an implausible country code", () => {
    stashMerchantJoin({ cc: "javascript:alert(1)", phone: "712345678" });
    expect(takeMerchantJoin()?.cc).toBe("+254");
  });

  it("survives corrupt storage rather than throwing into a render", () => {
    sessionStorage.setItem("maanta.merchant-join", "{not json");
    expect(takeMerchantJoin()).toBeNull();
  });

  it("does not throw when storage is unavailable", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    });
    expect(() => stashMerchantJoin({ cc: "+254", phone: "712345678" })).not.toThrow();
    expect(takeMerchantJoin()).toBeNull();
  });

  it("never puts a phone number in a URL", () => {
    // The regression, guarded at its source. A phone in a query string is
    // visible to history, Referer and every URL-derived analytics property.
    const offenders: string[] = [];
    for (const f of walk(path.join(SRC, "app"), [".tsx", ".ts"])) {
      codeOnly(readFileSync(f, "utf8"))
        .split("\n")
        .forEach((line, i) => {
          if (/(?:params|searchParams|URLSearchParams)[\s\S]*\bphone\b/.test(line) ||
              /[?&](?:phone|cc)=/.test(line)) {
            offenders.push(`${path.relative(SRC, f)}:${i + 1}  ${line.trim()}`);
          }
        });
    }
    expect(
      offenders,
      "A phone number must not travel in a query string — use " +
        "@/lib/merchant-join-handoff (sessionStorage):\n" +
        offenders.join("\n")
    ).toEqual([]);
  });
});
