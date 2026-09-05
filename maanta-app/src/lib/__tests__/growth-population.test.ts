import { describe, it, expect } from "vitest";
import {
  DEFAULT_POPULATION,
  exportFilename,
  inPopulation,
  parsePopulation,
  POPULATION_CHIP,
  POPULATIONS,
} from "@/lib/growth/population";

describe("growth population — the default is Real, never All", () => {
  it("falls back to Real for anything unrecognised", () => {
    expect(parsePopulation(undefined)).toBe("real");
    expect(parsePopulation("")).toBe("real");
    expect(parsePopulation("everything")).toBe("real");
    expect(DEFAULT_POPULATION).toBe("real");
  });

  it("accepts each real population", () => {
    for (const p of POPULATIONS) expect(parsePopulation(p)).toBe(p);
  });

  // The whole point of the chip: a figure that does not say what it counted is a
  // figure that gets quoted without the qualifier.
  it("gives every population a chip that names the exclusion", () => {
    expect(POPULATION_CHIP.real).toMatch(/TEST excluded/);
    expect(POPULATION_CHIP.test).toMatch(/not real signups/);
    expect(POPULATION_CHIP.all).toMatch(/mixed/i);
  });
});

describe("growth population — the predicate", () => {
  it("excludes test rows from Real and real rows from Test", () => {
    expect(inPopulation(false, "real")).toBe(true);
    expect(inPopulation(true, "real")).toBe(false);
    expect(inPopulation(true, "test")).toBe(true);
    expect(inPopulation(false, "test")).toBe(false);
  });

  it("admits both under All", () => {
    expect(inPopulation(true, "all")).toBe(true);
    expect(inPopulation(false, "all")).toBe(true);
  });
});

describe("growth population — the export filename records the population", () => {
  it("names the population in the file, so a CSV cannot be misread later", () => {
    const name = exportFilename("waitlist", "real", new Date("2026-09-04T10:00:00Z"));
    expect(name).toBe("maanta-waitlist-real-2026-09-04.csv");
    expect(exportFilename("waitlist", "all", new Date("2026-09-04T10:00:00Z"))).toContain("-all-");
  });
});
