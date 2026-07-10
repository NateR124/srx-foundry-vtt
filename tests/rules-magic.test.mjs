import { describe, it, expect } from "vitest";
import { baseDrain } from "../module/rules/magic.mjs";
import { consumeService } from "../module/rules/conjuring.mjs";

describe("Magic Rules", () => {
  it("Drain scaling (Force / 2 - wait, SRX uses Force directly)", () => {
    // Note: SRX drain is just Force, but we test the scaling function itself
    expect(baseDrain(5)).toBe(5);
    expect(baseDrain(0)).toBe(0);
  });

  it("Bound spirit service tracking (decrement counter on task)", () => {
    expect(consumeService(3)).toBe(2);
    expect(consumeService(1)).toBe(0);
    expect(consumeService(0)).toBe(0);
  });
});
