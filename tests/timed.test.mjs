import { describe, it, expect } from "vitest";
import {
  createTimedEffect,
  partitionDue,
  enqueueTimed,
  removeTimed,
  scheduleToxinExposure,
  defaultOnsetSeconds
} from "../module/rules/timed.mjs";

describe("timed queue", () => {
  it("partitions due vs remaining by fireAt", () => {
    const q = [
      createTimedEffect({ id: "a", type: "x", fireAt: 100 }),
      createTimedEffect({ id: "b", type: "x", fireAt: 200 }),
      createTimedEffect({ id: "c", type: "x", fireAt: 50 })
    ];
    const { due, remaining } = partitionDue(q, 100);
    expect(due.map((e) => e.id)).toEqual(["c", "a"]);
    expect(remaining.map((e) => e.id)).toEqual(["b"]);
  });

  it("enqueues and removes by id", () => {
    let q = [];
    q = enqueueTimed(q, [createTimedEffect({ id: "1", type: "a", fireAt: 1 })]);
    q = enqueueTimed(q, [createTimedEffect({ id: "2", type: "b", fireAt: 2 })]);
    expect(q).toHaveLength(2);
    q = removeTimed(q, "1");
    expect(q.map((e) => e.id)).toEqual(["2"]);
  });
});

describe("toxin schedule", () => {
  it("ingestion defaults to 10 min onset", () => {
    expect(defaultOnsetSeconds("ingestion")).toBe(600);
    expect(defaultOnsetSeconds("injection")).toBe(0);
  });

  it("builds onset, expire, and retest events", () => {
    const events = scheduleToxinExposure({
      actorUuid: "Actor.x",
      toxinName: "Neuro-Stun",
      power: 4,
      now: 1000,
      onsetSeconds: 0,
      intervalSeconds: 300,
      durationSeconds: 900
    });
    const types = events.map((e) => e.type).sort();
    expect(types).toEqual(["toxinExpire", "toxinOnset", "toxinRetest"]);
    const onset = events.find((e) => e.type === "toxinOnset");
    expect(onset.fireAt).toBe(1000);
    expect(onset.payload.power).toBe(4);
    const retest = events.find((e) => e.type === "toxinRetest");
    expect(retest.fireAt).toBe(1300);
    const exp = events.find((e) => e.type === "toxinExpire");
    expect(exp.fireAt).toBe(1900);
  });

  it("skips retest when interval is 0", () => {
    const events = scheduleToxinExposure({
      actorUuid: "Actor.x",
      toxinName: "X",
      power: 2,
      now: 0,
      intervalSeconds: 0,
      durationSeconds: 60
    });
    expect(events.every((e) => e.type !== "toxinRetest")).toBe(true);
  });
});
