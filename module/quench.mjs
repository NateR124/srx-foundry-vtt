/**
 * SRX Quench integration batches — run in-browser via the Quench module.
 *
 * These exist because the vitest suite only covers the pure rules layer: all
 * four combat criticals found in the architect review (dead initiative
 * override, no re-roll on round 2, permission wedges, invalid Region data)
 * passed 227 unit tests. These batches drive the real documents end-to-end.
 */

const CLEANUP = { actors: [], combats: [], items: [], regionScene: null };

async function makeCharacter(name, extra = {}) {
  const actor = await Actor.create({
    name,
    type: "character",
    ...extra
  });
  CLEANUP.actors.push(actor.id);
  return actor;
}

async function makeThreat(name, extra = {}) {
  const actor = await Actor.create({ name, type: "threat", ...extra });
  CLEANUP.actors.push(actor.id);
  return actor;
}

async function cleanup() {
  if (CLEANUP.combats.length) {
    await Combat.deleteDocuments(CLEANUP.combats.filter((id) => game.combats.get(id)));
    CLEANUP.combats = [];
  }
  if (CLEANUP.actors.length) {
    await Actor.deleteDocuments(CLEANUP.actors.filter((id) => game.actors.get(id)));
    CLEANUP.actors = [];
  }
  if (CLEANUP.items.length) {
    await Item.deleteDocuments(CLEANUP.items.filter((id) => game.items.get(id)));
    CLEANUP.items = [];
  }
}

export function registerQuenchTests(quench) {
  quench.registerBatch("srx.combat.integration",
    (context) => {
      const { describe, it, expect, after } = context;

      after(cleanup);

      describe("Multi-pass initiative (Combat document)", () => {
        let combat, charActor, threatActor;

        it("creates a combat with SRX document classes", async () => {
          charActor = await makeCharacter("Quench Char");
          threatActor = await makeThreat("Quench Threat");
          combat = await Combat.create({});
          CLEANUP.combats.push(combat.id);
          await combat.createEmbeddedDocuments("Combatant", [
            { actorId: charActor.id },
            { actorId: threatActor.id }
          ]);
          expect(combat.constructor.name).to.equal("SrxCombat");
          expect(combat.combatants.contents[0].constructor.name).to.equal("SrxCombatant");
        });

        it("rollAll produces SRX initiative (not the 1d6 fallback ceiling)", async () => {
          // getInitiativeRoll must be the override: a character with
          // Quickness Q rolls max(Qd6 + accel, 1) — never null after rollAll
          await combat.rollAll();
          for (const c of combat.combatants) {
            expect(c.initiative, `${c.name} initiative`).to.not.equal(null);
            expect(c.initiative).to.be.at.least(1);
          }
        });

        it("start → pass counter is 1", async () => {
          await combat.startCombat();
          expect(combat.pass).to.equal(1);
        });

        it("end of pass subtracts 10 and reaches pass 2", async () => {
          const [a, b] = combat.combatants.contents;
          await combat.updateEmbeddedDocuments("Combatant", [
            { _id: a.id, initiative: 25 },
            { _id: b.id, initiative: 8 }
          ]);
          combat.setupTurns();
          await combat.update({ turn: 0 });

          // Two combatants act, then the pass rolls over
          await combat.nextTurn();
          await combat.nextTurn();

          expect(combat.pass).to.equal(2);
          const scores = combat.combatants.contents.map((c) => c.initiative).sort((x, y) => y - x);
          expect(scores[0]).to.equal(15);
          expect(scores[1]).to.equal(-2);
        });

        it("pass 2+ skips combatants at initiative ≤ 0", async () => {
          // Only the 15-score combatant acts; ending their turn must advance
          // the pass instead of giving the -2 combatant a turn
          await combat.nextTurn();
          expect(combat.pass).to.equal(3);
        });

        it("new Combat Turn re-rolls initiative and resets the pass", async () => {
          const roundBefore = combat.round;
          await combat.nextRound();
          expect(combat.round).to.equal(roundBefore + 1);
          expect(combat.pass).to.equal(1);
          // The round-2 bug: rollAll only rolls null initiative, so without
          // the null-reset everyone kept depleted scores
          for (const c of combat.combatants) {
            expect(c.initiative, `${c.name} re-rolled`).to.not.equal(null);
            expect(c.initiative).to.be.at.least(1);
          }
        });
      });

      describe("Attack outcome → apply damage round-trip", () => {
        it("applies unresisted damage from the attack-outcome card", async () => {
          const { postAttackOutcome, applyDamageFromCard } = await import("./combat/pipeline.mjs");
          const attacker = await makeCharacter("Quench Attacker");
          const defender = await makeCharacter("Quench Defender");

          const msg = await postAttackOutcome({
            attacker,
            defender,
            item: null,
            mode: { name: "Test Strike" },
            rollResult: { hits: 8 },
            baseDv: 3,
            dvType: "P"
          });
          expect(msg, "attack-outcome message").to.not.equal(null);
          expect(msg.getFlag("srx", "type")).to.equal("attackOutcome");

          const before = defender.system.monitors.physical.value;
          await applyDamageFromCard(msg);
          expect(defender.system.monitors.physical.value).to.be.above(before);
        });
      });

      describe("AOE Regions", () => {
        it("blast regions actually validate and appear on the scene", async function () {
          if (!canvas?.scene) this.skip();
          const { placeBlastRegions, cleanupAoeRegions } = await import("./canvas/aoe.mjs");
          const before = canvas.scene.regions.size;
          // This throws (rejected NumberField) if elevation is ±Infinity
          const created = await placeBlastRegions({
            centerPx: { x: 500, y: 500 },
            fullRadius: 2,
            halfRadius: 4,
            name: "Quench Blast"
          });
          expect(created.length).to.equal(2);
          expect(canvas.scene.regions.size).to.equal(before + 2);
          await cleanupAoeRegions();
          expect(canvas.scene.regions.size).to.equal(before);
        });
      });
    },
    { displayName: "SRX: Combat integration (initiative, pipeline, regions)" }
  );

  quench.registerBatch("srx.magic.integration",
    (context) => {
      const { describe, it, expect, after } = context;
      after(cleanup);

      describe("Cast gates", () => {
        it("Magic 0 cannot cast", async () => {
          const mundane = await makeCharacter("Quench Mundane");
          const [spell] = await mundane.createEmbeddedDocuments("Item", [
            { name: "Quench Bolt", type: "spell", system: { category: "combat", pattern: "direct" } }
          ]);
          const result = await mundane.castSpell(spell);
          expect(result).to.equal(null);
        });

        it("non-self spell without targets is refused", async () => {
          const mage = await makeCharacter("Quench Mage", {
            system: { special: { magic: { base: 4 } } }
          });
          expect(mage.system.special.magic.value).to.be.at.least(1);
          const [spell] = await mage.createEmbeddedDocuments("Item", [
            { name: "Quench Bolt 2", type: "spell", system: { category: "combat", pattern: "direct" } }
          ]);
          game.user.updateTokenTargets([]);
          const result = await mage.castSpell(spell);
          expect(result).to.equal(null);
        });
      });

      describe("Sustain lifecycle", () => {
        it("addSustained / endSustained round-trips and clears warding", async () => {
          const { addSustained, endSustained, getSustained, sustainPenaltyForActor } =
            await import("./magic/sustain.mjs");
          const mage = await makeCharacter("Quench Sustainer");
          const ward = await makeCharacter("Quench Warded");

          await ward.setFlag("srx", "wardingBonus", 3);
          const entry = await addSustained(mage, {
            spellName: "Quench Aegis",
            force: 3,
            netForce: 3,
            targetUuid: ward.uuid,
            warding: 3
          });
          expect(getSustained(mage).length).to.equal(1);
          expect(sustainPenaltyForActor(mage)).to.equal(-2);

          await endSustained(mage, entry.id);
          expect(getSustained(mage).length).to.equal(0);
          expect(ward.getFlag("srx", "wardingBonus")).to.equal(undefined);
        });
      });

      describe("Conjuring", () => {
        it("summonSpirit creates an anima actor; resummon releases the prior one", async () => {
          const { summonSpirit } = await import("./magic/conjure.mjs");
          const shaman = await makeCharacter("Quench Shaman", {
            system: { special: { magic: { base: 4 } } }
          });

          await summonSpirit(shaman, { force: 2, form: "Quench Spirit A" });
          const firstUuid = shaman.getFlag("srx", "activeSpiritUuid");
          expect(firstUuid, "first anima uuid").to.be.a("string");
          const first = await fromUuid(firstUuid);
          expect(first?.getFlag("srx", "anima")).to.be.ok;
          CLEANUP.actors.push(first.id);

          await summonSpirit(shaman, { force: 2, form: "Quench Spirit B" });
          const secondUuid = shaman.getFlag("srx", "activeSpiritUuid");
          expect(secondUuid).to.not.equal(firstUuid);
          expect(await fromUuid(firstUuid), "prior spirit released").to.equal(null);
          const second = await fromUuid(secondUuid);
          if (second) CLEANUP.actors.push(second.id);
        });
      });
    },
    { displayName: "SRX: Magic integration (gates, sustain, conjuring)" }
  );

  quench.registerBatch("srx.import.integration",
    (context) => {
      const { describe, it, expect, after } = context;
      after(cleanup);

      describe("Catalog keys", () => {
        it("uses the real builder filenames", async () => {
          const { CATALOG_FILES } = await import("./import/parse-catalog.mjs");
          expect(CATALOG_FILES).to.have.property("KnowledgeDomains.txt.deploy");
          expect(CATALOG_FILES).to.have.property("MagArtGear.txt.deploy");
          expect(CATALOG_FILES).to.not.have.property("Knowledge.txt.deploy");
        });
      });

      describe("Threat mapping vs schema validation", () => {
        it('a real-world "P/S" dvType entry survives Actor.create', async () => {
          const { mapThreatToActorData } = await import("./import/threats/parse-threats.mjs");
          const data = mapThreatToActorData({
            name: "Quench P/S Threat",
            threatRating: 9,
            attacks: [
              { name: "Dual Strike", pool: 10, dv: { n: null, raw: "(F+3)P Fire", type: "P/S", element: "fire" }, action: "complex" }
            ]
          });
          // Normalization must have happened before validation
          expect(data.system.threatRating).to.equal(6);
          expect(data.system.attacks[0].dvType).to.equal("PS");
          expect(data.system.attacks[0].dv).to.equal(9); // F(=TR 6 clamped... F+3)

          const actor = await Actor.create(data);
          CLEANUP.actors.push(actor.id);
          expect(actor.system.attacks[0].dvType).to.equal("PS");
        });
      });
    },
    { displayName: "SRX: Import integration (schema-validated creation)" }
  );
}
