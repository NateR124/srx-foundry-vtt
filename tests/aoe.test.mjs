import { describe, it, expect } from "vitest";
import {
  scatterDiceCount,
  resolveScatter,
  scatterDirectionFrom2d6,
  offsetByScatter,
  parseDualDv,
  distance2d,
  blastBand,
  blastDvForBand,
  pointInCone,
  classifyBlastTargets,
  classifyConeTargets,
  isAoeMode,
  aoeShape,
  defaultBlastRadii
} from "../module/rules/aoe.mjs";

describe("scatter", () => {
  it("dice counts by delivery and detonation", () => {
    expect(scatterDiceCount("thrown", "airburst")).toBe(1);
    expect(scatterDiceCount("thrown", "motion")).toBe(2);
    expect(scatterDiceCount("launched", "airburst")).toBe(2);
    expect(scatterDiceCount("launched", "motion")).toBe(3);
  });

  it("direct hit when hits ≥ scatter sum", () => {
    expect(resolveScatter(5, 4)).toEqual({
      directHit: true, scatterMeters: 0, scatterExcess: 1
    });
    expect(resolveScatter(2, 5)).toEqual({
      directHit: false, scatterMeters: 3, scatterExcess: 0
    });
  });

  it("maps 2d6 to 8-way directions", () => {
    expect(scatterDirectionFrom2d6(1, 1).label).toBe("N");
    expect(scatterDirectionFrom2d6(6, 6).label).toBe("NW");
    expect(scatterDirectionFrom2d6(3, 3).degrees).toBe(90);
  });

  it("offsets north by meters (−y)", () => {
    const p = offsetByScatter({ x: 10, y: 10 }, 5, 0);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(5);
  });

  it("offsets east by meters (+x)", () => {
    const p = offsetByScatter({ x: 0, y: 0 }, 3, 90);
    expect(p.x).toBeCloseTo(3);
    expect(p.y).toBeCloseTo(0);
  });
});

describe("dual DV and bands", () => {
  it("parses full/half DV strings", () => {
    expect(parseDualDv("10/5P")).toEqual({ full: 10, half: 5, dvType: "P" });
    expect(parseDualDv("12/6")).toEqual({ full: 12, half: 6, dvType: "P" });
    expect(parseDualDv("8S")).toEqual({ full: 8, half: 4, dvType: "S" });
  });

  it("classifies full / half / out", () => {
    expect(blastBand(3, 5, 10)).toBe("full");
    expect(blastBand(7, 5, 10)).toBe("half");
    expect(blastBand(11, 5, 10)).toBe("out");
    expect(blastDvForBand("full", 10, 5)).toBe(10);
    expect(blastDvForBand("half", 10, 5)).toBe(5);
    expect(blastDvForBand("out", 10, 5)).toBe(0);
  });

  it("classifies blast targets", () => {
    const hits = classifyBlastTargets(
      { x: 0, y: 0 },
      [
        { id: "a", x: 2, y: 0 },
        { id: "b", x: 7, y: 0 },
        { id: "c", x: 20, y: 0 }
      ],
      5,
      10,
      12,
      6
    );
    expect(hits.map((h) => h.id)).toEqual(["a", "b"]);
    expect(hits[0].dv).toBe(12);
    expect(hits[1].dv).toBe(6);
  });
});

describe("shotgun cone", () => {
  it("includes points on axis within range", () => {
    // facing north from origin, point 8m north
    const r = pointInCone({ x: 0, y: 0 }, 0, { x: 0, y: -8 }, 20);
    expect(r.inside).toBe(true);
    expect(r.along).toBeCloseTo(8);
  });

  it("excludes points outside half-width", () => {
    // at 8m along, full width = 4m → half-width 2m from centerline
    // Wait: width = half length → at 8m, width 4m, half-width 2m
    // Our code uses along/4 = 2 for half-width — correct
    const r = pointInCone({ x: 0, y: 0 }, 0, { x: 3, y: -8 }, 20);
    expect(r.inside).toBe(false);
  });

  it("includes points within half-width", () => {
    const r = pointInCone({ x: 0, y: 0 }, 0, { x: 1, y: -8 }, 20);
    expect(r.inside).toBe(true);
  });

  it("classifies cone targets", () => {
    const hits = classifyConeTargets(
      { x: 0, y: 0 },
      0,
      [
        { id: "a", x: 0, y: -5 },
        { id: "b", x: 10, y: -5 }
      ],
      20,
      9
    );
    expect(hits.map((h) => h.id)).toEqual(["a"]);
    expect(hits[0].dv).toBe(9);
  });
});

describe("mode detection", () => {
  it("detects AOE from name and fields", () => {
    expect(isAoeMode({ name: "High Explosive AOE" })).toBe(true);
    expect(isAoeMode({ aoe: "blast" })).toBe(true);
    expect(isAoeMode({ name: "SA" })).toBe(false);
    expect(aoeShape({ name: "Shot" })).toBe("cone");
    expect(aoeShape({ aoe: "blast" })).toBe("blast");
  });

  it("default radii", () => {
    expect(defaultBlastRadii({ fullRadius: 4, halfRadius: 8 })).toEqual({
      fullRadius: 4, halfRadius: 8
    });
    expect(defaultBlastRadii({})).toEqual({ fullRadius: 5, halfRadius: 10 });
  });
});

describe("distance", () => {
  it("euclidean", () => {
    expect(distance2d({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});
