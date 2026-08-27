import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { QrCheckIn } from "@/app/(shopper)/qr/[token]/qr-check-in";

// The QR landing states that render without a network call (SSR — effects
// never run here). Product rules pinned: no claim never auto-claims and
// links only to the EXISTING shop page; several claims ask rather than
// guess; already-checked-in says so and offers a cancel that names what it
// does NOT do.

const TOKEN = "a".repeat(32);

function render(props: Partial<Parameters<typeof QrCheckIn>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(QrCheckIn, {
      token: TOKEN,
      merchantId: "merchant-1",
      merchantName: "Pepper Pot",
      merchantFloor: "1st floor",
      claims: [],
      alreadyCheckedInFor: null,
      ...props,
    })
  );
}

describe("QrCheckIn states", () => {
  it("no active claim: says so and links to the shop's existing page only", () => {
    const html = render();
    expect(html).toContain("You don&#x27;t have an active claim for this shop.");
    expect(html).toContain("/shops/merchant-1");
    expect(html).toContain("View this shop&#x27;s deals");
  });

  it("several claims: asks which deal, never guesses", () => {
    const html = render({
      claims: [
        { redemptionId: "r1", dealTitle: "Summer Abaya" },
        { redemptionId: "r2", dealTitle: "Shoe Deal" },
      ],
    });
    expect(html).toContain("Which deal are you using?");
    expect(html).toContain("Summer Abaya");
    expect(html).toContain("Shoe Deal");
  });

  it("one claim: goes straight into checking in", () => {
    const html = render({
      claims: [{ redemptionId: "r1", dealTitle: "Summer Abaya" }],
    });
    expect(html).toContain("Checking you in…");
  });

  it("already checked in: says so, and cancel names what it does NOT do", () => {
    const html = render({
      claims: [{ redemptionId: "r1", dealTitle: "Summer Abaya" }],
      alreadyCheckedInFor: "r1",
    });
    expect(html).toContain("already checked in");
    expect(html).toContain("Staff will call your name.");
    expect(html).toContain("Cancel check-in");
    expect(html).toContain("your claim stays valid");
  });

  it("the single-claim branch always resolves to a real screen (D196)", () => {
    // The cancel-stranding class of defect: the single-claim auto-check-in
    // effect is one-shot, so any state falling back to `idle` renders
    // "Checking you in…" forever with nothing in flight. SSR cannot run the
    // cancel handler, but it can prove the one effect-free single-claim
    // branch reaches a terminal screen — and the source below pins that
    // cancel no longer targets `idle` at all.
    const html = render({
      claims: [{ redemptionId: "r1", dealTitle: "Summer Abaya" }],
      alreadyCheckedInFor: "r1",
    });
    expect(html).not.toContain("Checking you in");
    expect(html).toContain("Cancel check-in");
  });

  it("cancel lands in its own terminal state, never back in idle (D196)", () => {
    const src = readFileSync(
      path.resolve(process.cwd(), "src/app/(shopper)/qr/[token]/qr-check-in.tsx"),
      "utf8"
    );
    const cancelBody = src.slice(
      src.indexOf("const cancel = useCallback"),
      src.indexOf("const shopLine")
    );
    expect(cancelBody).toContain('kind: "cancelled"');
    expect(cancelBody).not.toContain('kind: "idle"');
    // And the state it lands in must actually render something.
    expect(src).toContain('state.kind === "cancelled"');
    expect(src).toContain("You&apos;ve left the queue");
  });

  it("never uses amber — check-in is not a money action", () => {
    for (const html of [
      render(),
      render({ claims: [{ redemptionId: "r1", dealTitle: "A" }], alreadyCheckedInFor: "r1" }),
    ]) {
      expect(html).not.toContain("text-brand");
    }
  });
});
