import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadContract,
  loadFrames,
  loadSmokeFrames,
  resolveRouteDir,
  routeExists,
  sourceFilePath,
} from "./load";
import {
  AUTH_STATES,
  CAPTURE_READINESS,
  EVIDENCE_SOURCES,
  PROTOTYPE_STATUSES,
  ROLES,
  STATUSES,
  contractSchema,
} from "./schema";

/**
 * Layer 1 — static contract. Pure, no browser, runs on every PR.
 *
 * `design/current-reality/frames.json` is a MANUALLY verified, design-authored
 * mirror. It will rot. These assertions are what turn rot into a CI failure
 * instead of a stale document nobody notices: the route check in particular is
 * what catches a renamed route still named in the mirror.
 *
 * Layers 2 (behavioural smoke) and 3 (scripts) are in
 * `e2e/design-truth-smoke.spec.ts` and package.json.
 */

const contract = loadContract();
const frames = loadFrames();

describe("contract parses", () => {
  it("validates against the Zod mirror of frames.schema.json", () => {
    // loadContract() throws with the offending frame id, so reaching here is
    // the assertion. Guard the shape we then rely on.
    expect(frames.length).toBeGreaterThan(0);
    expect(contract.mirror.artifact).toBe("maanta-current-reality");
  });

  it("keeps the fixed truth order: Notion, then repo, then design system", () => {
    expect(contract.mirror.truthOrder).toEqual([
      "notion:product-and-current-state",
      "repo:implementation",
      "design-system:visual",
    ]);
  });

  it("labels itself design-authored, never repo-derived", () => {
    expect(contract.mirror.provenance).toContain("NOT EXTRACTED FROM THE REPO");
  });

  it("uses unique frame ids", () => {
    const ids = frames.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps mirror.frameCount equal to the number of frames", () => {
    // A self-describing count that nothing checks is a count that goes stale.
    // Asserted unconditionally: dropping the field is itself a contract change,
    // and an `if (declared !== undefined)` guard would pass vacuously the moment
    // the field stopped surviving schema parsing — which is exactly what happened
    // before `frameCount` was added to mirrorSchema.
    expect(
      contract.mirror.frameCount,
      "mirror.frameCount is missing or disagrees with frames.length"
    ).toBe(frames.length);
  });

  it("declares the same top-level keys in the JSON schema and the Zod mirror", () => {
    // frames.json points `$schema` at frames.schema.json, whose root closes
    // additionalProperties — so a key modelled only in Zod makes the contract fail
    // validation against the schema it advertises, while every repo test passes.
    // That happened with `landedInRepo`. Comparing the two key sets is cheap and
    // catches the whole class without a JSON-Schema validator dependency.
    const jsonSchema = JSON.parse(
      readFileSync(
        path.join(process.cwd(), "design/current-reality/frames.schema.json"),
        "utf8"
      )
    ) as { properties: Record<string, unknown> };
    const jsonKeys = Object.keys(jsonSchema.properties);
    const zodKeys = Object.keys(contractSchema.shape);

    const missingFromJson = zodKeys.filter((k) => !jsonKeys.includes(k));
    const missingFromZod = jsonKeys.filter((k) => !zodKeys.includes(k));
    expect(
      missingFromJson,
      `modelled in Zod but not in frames.schema.json, so frames.json would fail its own $schema: ${missingFromJson.join(", ")}`
    ).toEqual([]);
    expect(
      missingFromZod,
      `declared in frames.schema.json but not in the Zod mirror: ${missingFromZod.join(", ")}`
    ).toEqual([]);
  });

  it("resolves every landing-record reference", () => {
    // The landing record is repo-authored and unchecked by the schema beyond id
    // shape, so a correction naming a deleted frame — or a closesDrift id absent
    // from drift[] — would otherwise pass both layers.
    const landing = contract.landedInRepo;
    if (!landing) return;
    const driftIds = new Set(contract.drift.map((d) => d.id));
    const frameIds = new Set(frames.map((f) => f.id));
    for (const id of landing.closesDrift) {
      expect(driftIds, `landedInRepo.closesDrift names unknown drift ${id}`).toContain(id);
    }
    // A correction's `frame` field also names non-frame parts of the contract.
    // Enumerated rather than pattern-matched loosely, so a genuine typo in a frame
    // id still fails instead of being waved through as "probably a section".
    const NON_FRAME_TARGETS = ["mirror"];
    for (const c of landing.corrections) {
      const isRule = c.frame.startsWith("runtimeRules.");
      const isDrift = /^D-\d{2}$/.test(c.frame);
      if (isRule || isDrift || NON_FRAME_TARGETS.includes(c.frame)) continue;
      expect(
        frameIds,
        `landedInRepo.corrections names unknown frame ${c.frame}`
      ).toContain(c.frame);
    }
  });

  it("discloses any frame that did not come from the canvas", () => {
    // Every frame authored in Claude Design carries a canvasRef. A frame without
    // one was added repo-side, which is the exact provenance this contract exists
    // to keep honest — so it must be declared in landedInRepo.corrections rather
    // than passed off as design truth.
    const declared = new Set(
      (contract.landedInRepo?.corrections ?? []).map((c) => c.frame)
    );
    for (const f of frames.filter((x) => !x.canvasRef)) {
      expect(
        declared.has(f.id),
        `${f.id} has no canvasRef, so it was not authored in Claude Design. Record it in landedInRepo.corrections, or add the canvasRef that proves it came from the canvas.`
      ).toBe(true);
    }
  });
});

describe("references resolve", () => {
  it.each(frames.map((f) => [f.id, f.runtimeRule] as const))(
    "%s runtimeRule %s resolves to a key in runtimeRules",
    (_id, rule) => {
      expect(Object.keys(contract.runtimeRules)).toContain(rule);
    }
  );

  it("every driftId resolves to a drift row", () => {
    const driftIds = contract.drift.map((d) => d.id);
    for (const f of frames.filter((x) => x.driftId)) {
      expect(driftIds, `${f.id}.driftId`).toContain(f.driftId!);
    }
  });

  it("keeps every design-ahead frame linked to an OPEN drift row", () => {
    // The incoherence this catches, found 2026-07-29: M8 sat `design-ahead`
    // pointing at D-03, while D-03 described a different feature that had
    // already shipped. A frame held back by a drift row that is closed is a
    // frame held back by nothing — either it ships, or the drift is still open.
    for (const f of frames.filter((x) => x.status === "design-ahead")) {
      const row = contract.drift.find((dr) => dr.id === f.driftId);
      expect(row, `${f.id}.driftId ${f.driftId} not found`).toBeTruthy();
      expect(
        row!.blockedOn,
        `${f.id} is design-ahead but ${f.driftId} is closed (blockedOn: none). Flip the frame to live, or reopen the drift.`
      ).not.toBe("none");
    }
  });

  it("every supersedes resolves to a superseded row", () => {
    const supersededIds = contract.superseded.map((s) => s.id);
    for (const f of frames.filter((x) => x.supersedes)) {
      expect(supersededIds, `${f.id}.supersedes`).toContain(f.supersedes!);
    }
  });

  it("no runtime rule is declared but unused, except by documented exception", () => {
    // A rule nobody references is usually a frame that forgot to cite it. Two
    // are deliberately uncited and must stay that way:
    const ALLOWED_UNREFERENCED: Record<string, string> = {
      "R-VERIFY-ANYWAY":
        "Settled by founder ruling 2026-07-29 (drift D-07 resolved). It governs 10a's location-mismatch state and 13e's dispute intake, but `runtimeRule` is a single id per frame and those frames cite R-RESOLVE-THEN-CHARGE and R-REVERSAL-NOTE respectively. The behaviour is pinned instead by 10a.states including `location-mismatch`, by the assertions below, and by src/app/api/redemptions/preflight/__tests__/route.test.ts.",
      "R-FEE-ON-VERIFIED":
        "Money-path invariant asserted by supabase/tests/*.sql, not owned by a single frame; 10a cites R-RESOLVE-THEN-CHARGE for the UI order.",
    };
    const used = new Set(frames.map((f) => f.runtimeRule));
    const unused = Object.keys(contract.runtimeRules).filter(
      (r) => !used.has(r) && !(r in ALLOWED_UNREFERENCED)
    );
    expect(unused, `unreferenced runtimeRules: ${unused.join(", ")}`).toEqual([]);

    // And the exceptions must still exist, so this list cannot rot silently.
    for (const rule of Object.keys(ALLOWED_UNREFERENCED)) {
      expect(Object.keys(contract.runtimeRules), `stale exception ${rule}`).toContain(rule);
    }
  });
});

describe("routes resolve to real pages", () => {
  // THE check that catches a stale route name in the mirror.
  it.each(frames.map((f) => [f.id, f.route] as const))(
    "%s route %s resolves to a page in src/app",
    (id, route) => {
      expect(
        routeExists(route),
        `${id}: no page.tsx resolves for "${route}". Either the route was renamed (fix the mirror) or the screen was deleted (fix the status).`
      ).toBe(true);
    }
  );

  it("resolves dynamic segments to a real dynamic directory", () => {
    // [id] in the contract must land on an actual [param] dir, not be skipped.
    const dynamic = frames.filter((f) => f.route.includes("["));
    expect(dynamic.length).toBeGreaterThan(0);
    for (const f of dynamic) {
      const dir = resolveRouteDir(f.route);
      expect(dir, `${f.id} ${f.route}`).toBeTruthy();
      expect(dir!, `${f.id} resolved outside a dynamic dir`).toMatch(/\[[^\]]+\]/);
    }
  });
});

describe("sourceFiles exist on disk", () => {
  const pairs = frames.flatMap((f) => f.sourceFiles.map((p) => [f.id, p] as const));

  it.each(pairs)("%s sourceFile %s exists", (id, relative) => {
    expect(
      existsSync(sourceFilePath(relative)),
      `${id}: sourceFiles names "${relative}", which is not on disk. A moved file makes the mirror lie about where the screen lives.`
    ).toBe(true);
  });
});

describe("smoke eligibility is complete and honest", () => {
  const smoke = loadSmokeFrames();

  it("matches the number of frames marked smoke", () => {
    // Anti-fake-sync: a smoke-marked frame can never sit uncovered because the
    // Playwright suite generates from this same list.
    expect(smoke.length).toBe(frames.filter((f) => f.smoke).length);
  });

  it("covers every role that has a smoke-eligible surface", () => {
    const roles = new Set(smoke.map((f) => f.role));
    for (const role of ROLES) {
      expect(roles, `no smoke frame for role ${role}`).toContain(role);
    }
  });

  it("never smoke-tests unshipped behaviour", () => {
    for (const f of smoke) {
      expect(f.status, `${f.id}`).not.toBe("design-ahead");
    }
  });

  it.each(smoke.map((f) => [f.id] as const))(
    "%s declares an anchor, a role and an auth state",
    (id) => {
      const f = smoke.find((x) => x.id === id)!;
      expect(f.expectedHeading ?? f.expectedAnchor).toBeTruthy();
      expect(f.requiredRole).toBeTruthy();
      expect(AUTH_STATES).toContain(f.authState);
    }
  );

  it.each(smoke.map((f) => [f.id] as const))(
    "%s anchor text exists in the source it names",
    (id) => {
      // Cheap guard that runs without a browser: the anchor the smoke suite
      // will look for must at least be present in the frame's own sources.
      // Catches a renamed heading long before the Playwright suite runs.
      const f = smoke.find((x) => x.id === id)!;
      const anchor = f.expectedHeading ?? f.expectedAnchor!;
      const sources = f.sourceFiles
        .map((rel) => sourceFilePath(rel))
        .filter((abs) => existsSync(abs))
        .map((abs) => readFileSync(abs, "utf8"));
      const dir = resolveRouteDir(f.route);
      const local = dir
        ? readdirSync(dir)
            .filter((n) => /\.tsx?$/.test(n))
            .map((n) => readFileSync(path.join(dir, n), "utf8"))
        : [];
      // JSX must escape apostrophes (`react/no-unescaped-entities`), so the
      // source says `can&apos;t` where the DOM — and therefore Playwright —
      // sees `can't`. Normalise before comparing, or every anchor containing an
      // apostrophe would fail here while passing in the browser.
      const normalise = (s: string) =>
        s
          .replace(/&apos;|&#39;|&rsquo;|&lsquo;/g, "'")
          .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
          .replace(/&amp;/g, "&")
          // Typographic characters written literally in either the source or the
          // contract, which the DOM renders identically to their ASCII forms.
          .replace(/[\u2018\u2019]/g, "'")
          .replace(/[\u201C\u201D]/g, '"');
      const haystack = normalise([...sources, ...local].join("\n"));
      expect(
        haystack.includes(normalise(anchor)),
        `${id}: the contract promises the anchor "${anchor}" on ${f.route}, but it appears in none of the frame's sourceFiles or co-located files. Add the anchor to the app, or correct the contract.`
      ).toBe(true);
    }
  );
});

describe("settled rulings stay settled", () => {
  // Drift D-07 was resolved by founder ruling on 2026-07-29: a location
  // mismatch still redeems and the dispute goes to admin. The rule text used to
  // say "DISPUTED / Unresolved"; if that language ever returns, or 10a stops
  // declaring the mismatch state, the contract has quietly reopened a decision
  // that was made — and someone may build the superseded hard-reject branch.
  it("no longer describes verify-anyway as disputed", () => {
    const rule = contract.runtimeRules["R-VERIFY-ANYWAY"];
    expect(rule).toBeTruthy();
    expect(rule).not.toMatch(/DISPUTED|Unresolved|D-07/i);
    expect(rule).toMatch(/still redeems/i);
    // "Still redeems" alone would survive dropping the fee or the note
    // requirement — both of which the ruling settled explicitly. A mismatched
    // redemption IS verified, so the KES 30 applies, and undoing it is a separate
    // note-required admin action (R-REVERSAL-NOTE), never an automatic waiver.
    expect(rule).toMatch(/KES 30 fee applies/i);
    expect(rule).toMatch(/note-required admin action/i);
  });

  it("keeps the location-mismatch state declared and covered on frame 10a", () => {
    const f = frames.find((x) => x.id === "10a")!;
    expect(f.states).toContain("location-mismatch");
    expect(f.stateCoverage.covered).toContain("location-mismatch");
    expect(f.stateCoverage.missing).not.toContain("location-mismatch");
  });

  it("keeps D-01 decided: the third feed section is Deals Near Me", () => {
    // Founder decision 2026-07-29. The rule text must name the section, and the
    // repo's label must match — src/lib/__tests__/feed-sections.test.ts pins the
    // constant itself. Reopening this row would re-invite "All active deals".
    const row = contract.drift.find((dr) => dr.id === "D-01")!;
    expect(row.blockedOn).toBe("none");
    expect(row.what).toMatch(/Deals Near Me/);

    const rule = contract.runtimeRules["R-FEED-ORDER"];
    expect(rule).toMatch(/Deals Near Me/);
    expect(rule).toMatch(/Flash deals/);
    expect(rule).toMatch(/Priority placements/);
    // The order is frozen, so the three must appear in it.
    expect(rule.indexOf("Flash deals")).toBeLessThan(rule.indexOf("Priority placements"));
    expect(rule.indexOf("Priority placements")).toBeLessThan(rule.indexOf("Deals Near Me"));
    // And it must not describe the rail as generic global inventory.
    expect(rule).not.toMatch(/all active deals/i);
  });

  it("keeps D-06 closed: capability-driven rails, and pending never means credited", () => {
    const row = contract.drift.find((dr) => dr.id === "D-06")!;
    expect(row.blockedOn).toBe("none");

    const rule = contract.runtimeRules["R-STRIPE-PHASE-1"];
    // The order must stay described as capability-driven, not as a fixed
    // preference for either provider — that is what makes M-Pesa going live an
    // ops event rather than a code change.
    expect(rule).toMatch(/capability-driven/i);
    expect(rule).toMatch(/pending never means credited/i);
    // And the unsettled-vs-failed distinction must not be dropped: a charged
    // card that has not credited is not a failure.
    expect(rule).toMatch(/unsettled/i);
  });

  it("keeps D-12 closed: pricing copy is governed and the launch offer stays withdrawn", () => {
    const row = contract.drift.find((dr) => dr.id === "D-12")!;
    expect(row.blockedOn).toBe("none");
    expect(row.detail).toMatch(/withdrawn/i);
    // 12e's own content must not describe a launch offer again — the copy guard
    // in src/__tests__/cash-only-and-copy.test.ts covers the rendered page; this
    // covers the contract's description of it.
    const f = frames.find((x) => x.id === "12e")!;
    const text = `${f.job} ${f.notes ?? ""} ${f.captureReadinessReason ?? ""}`;
    expect(text).not.toMatch(/launch offer:/i);
    expect(text).not.toMatch(/first month[^.]{0,30}free/i);
  });

  it.each([
    ["D-02", /see-all/i],
    ["D-03", /archive/i],
    ["D-04", /limit is enforced/i],
    ["D-05", /four-way/i],
    ["D-08", /committed/i],
  ])("keeps %s closed against the repo", (id, expected) => {
    // Each was verified shipped on 2026-07-29 with file evidence recorded in
    // landedInRepo.corrections. Reopening one silently would re-invite work
    // that is already done.
    const row = contract.drift.find((dr) => dr.id === id)!;
    expect(row, `${id} missing`).toBeTruthy();
    expect(row.blockedOn, `${id} reopened`).toBe("none");
    expect(row.what).toMatch(expected);
  });

  it("records D-07 as resolved, not as blocked on a product decision", () => {
    const d07 = contract.drift.find((d) => d.id === "D-07")!;
    expect(d07.blockedOn).toBe("none");
    // blockedOn alone would still allow a revert to current-mismatch.
    expect(d07.classification).toBe("historical");
    expect(d07.detail).toMatch(/still redeems/i);
  });

  it("keeps 12d's launch credit config-gated, per node, and absent-able", () => {
    // The Node 0 opening credit is the counterpart to D-12's withdrawn Elite
    // offer: it stays because config, the decisions log and activate_merchant all
    // back it. What must never come back is drawing it as unconditional.
    const f = frames.find((x) => x.id === "12d")!;
    expect(f.runtimeRule).toBe("R-LAUNCH-CREDIT-CONFIG");

    // The absent state is the whole point — a promo that cannot disappear is the
    // bug this frame records as fixed.
    expect(f.states).toContain("credit-absent");
    expect(f.stateCoverage.missing).toEqual([]);

    const rule = contract.runtimeRules["R-LAUNCH-CREDIT-CONFIG"];
    expect(rule).toMatch(/app_config/);
    expect(rule).toMatch(/PER NODE/);
    // Naming the keys is what lets ops see, from the contract alone, which
    // switches control the promise.
    for (const key of [
      "node0_opening_credit_kes",
      "node0_opening_credit_merchant_cap",
      "node0_launch_node",
      "node0_launch_period_ends_at",
    ]) {
      expect(rule, `R-LAUNCH-CREDIT-CONFIG omits ${key}`).toContain(key);
    }
  });
});

describe("capture readiness is safe", () => {
  it("keeps every founder and admin surface internal-only", () => {
    for (const f of frames.filter((x) => x.role === "founder" || x.role === "admin")) {
      expect(f.captureReadiness, `${f.id} is ${f.role}`).toBe("internal-only");
    }
  });

  it("gives a reason for every label except safe-now", () => {
    for (const f of frames.filter((x) => x.captureReadiness !== "safe-now")) {
      expect(f.captureReadinessReason, `${f.id}`).toBeTruthy();
    }
  });
});

describe("no declared enum value is unexercised", () => {
  // Anti-fake-sync 8: an enum value nobody uses is either dead schema or a
  // frame that should have used it. `allowedUnused` documents the exceptions.
  const allowedUnused: Record<string, string[]> = {
    // No frame is blocked by design, by product, or by code. M8 was the only
    // `blocked-code` frame and its reason was stale — the charge-disclosure step
    // ships — so it is now `live` / `current-not-clickable` (2026-07-29).
    prototypeStatus: ["blocked-design", "blocked-product", "blocked-code"],
    // Nothing is design-ahead any more: M8 was the last one, and D-02..D-05 all
    // closed as already-shipped. A future unshipped frame reintroduces both this
    // status and `repo-partial`, and must link an OPEN drift row (asserted above).
    status: ["design-ahead"],
    evidenceSource: ["repo-partial"],
    // The contract carries no redirect-only frame yet.
    authState: [],
  };

  const check = (
    field: string,
    values: readonly string[],
    used: Set<string>
  ) => {
    const unused = values.filter(
      (v) => !used.has(v) && !(allowedUnused[field] ?? []).includes(v)
    );
    expect(unused, `${field}: unexercised enum values ${unused.join(", ")}`).toEqual([]);
  };

  it("exercises every role, status, prototypeStatus, captureReadiness and evidenceSource", () => {
    check("role", ROLES, new Set(frames.map((f) => f.role)));
    check("status", STATUSES, new Set(frames.map((f) => f.status)));
    check(
      "prototypeStatus",
      PROTOTYPE_STATUSES,
      new Set(frames.map((f) => f.prototypeStatus))
    );
    check(
      "captureReadiness",
      CAPTURE_READINESS,
      new Set(frames.map((f) => f.captureReadiness))
    );
    check(
      "evidenceSource",
      EVIDENCE_SOURCES,
      new Set(frames.map((f) => f.evidenceSource))
    );
  });
});
