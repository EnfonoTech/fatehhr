import { describe, expect, it } from "vitest";
import { forgotCheckout } from "./forgot-checkout";

const at = (s: string) => Date.parse(s);

describe("forgotCheckout", () => {
  it("an IN from this morning is a normal open shift", () => {
    expect(forgotCheckout({ log_type: "IN", time: "2026-10-27T04:30:00Z" }, at("2026-10-27T15:00:00Z"))).toBeNull();
  });

  it("an IN from yesterday morning was never closed: pick a finish time that day", () => {
    // Srajan, 26 Oct: IN 07:24 KSA, no OUT; opens the app 27 Oct 07:40 KSA
    const f = forgotCheckout({ log_type: "IN", time: "2026-10-26T04:24:41Z" }, at("2026-10-27T04:40:30Z"))!;
    expect(f).not.toBeNull();
    expect(f.tooOld).toBe(false);
    expect(new Date(f.minMs).toISOString()).toBe("2026-10-26T04:40:30.000Z"); // 24 h back limit
    expect(new Date(f.maxMs).toISOString()).toBe("2026-10-26T20:24:41.000Z"); // IN + 16 h
  });

  it("a shift left open for days cannot be closed from the app", () => {
    const f = forgotCheckout({ log_type: "IN", time: "2026-10-24T04:00:00Z" }, at("2026-10-27T04:00:00Z"))!;
    expect(f.tooOld).toBe(true);
  });

  it("last punch OUT: nothing to close", () => {
    expect(forgotCheckout({ log_type: "OUT", time: "2026-10-20T04:00:00Z" }, at("2026-10-27T04:00:00Z"))).toBeNull();
  });
});
