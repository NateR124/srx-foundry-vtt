/**
 * SRX System Quench Tests
 * Run in-browser via the Quench module (e.g. on CI).
 */

export function registerQuenchTests(quench) {
  quench.registerBatch("srx.core",
    (context) => {
      const { describe, it, expect } = context;
      
      describe("SRX System Core", () => {
        it("Smoke Test", () => {
          expect(game.system.id).to.equal("srx");
        });
      });
    },
    { displayName: "SRX Core Tests" }
  );
}
