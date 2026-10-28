import { describe, expect, it } from "vitest";
import { forgotCheckout } from "./forgot-checkout";

const at = (s: string) => Date.parse(s);

describe("forgotCheckout", () => {
  it("an IN from this morning is a normal open shift", () => {
    expect(forgotCheckout({ log_type: "IN", time: "2026-10-27T04:30:00Z" }, at("2026-10-27T15:00:00Z"))).toBeNull();
  });

  it("an IN from yesterday morning was never closed: pick a finish time that day", () => {
    // Srajan, 26 Oct: IN 07:24 KSA, no OUT; opens the app the same night at 01:40 KSA
    const f = forgotCheckout({ log_type: "IN", time: "2026-10-26T04:24:41Z" }, at("2026-10-26T22:40:30Z"))!;
    expect(f).not.toBeNull();
    expect(f.autoClosed).toBe(false);
    expect(new Date(f.minMs).toISOString()).toBe("2026-10-26T04:24:41.000Z"); // from the check-in
    expect(new Date(f.maxMs).toISOString()).toBe("2026-10-26T20:24:41.000Z"); // IN + 16 h
  });

  it("a night shift can only finish on the second day", () => {
    const inAt = new Date(2026, 9, 26, 19, 0); // 7 pm local
    const now = new Date(2026, 9, 27, 13, 0).getTime(); // 18 h later
    const f = forgotCheckout({ log_type: "IN", time: inAt.toISOString() }, now)!;
    expect(f.autoClosed).toBe(false);
    expect(f.minMs).toBe(new Date(2026, 9, 27, 0, 0).getTime());
  });

  it("after 24 h the system closes it: the employee checks in again", () => {
    const f = forgotCheckout({ log_type: "IN", time: "2026-10-24T04:00:00Z" }, at("2026-10-27T04:00:00Z"))!;
    expect(f.autoClosed).toBe(true);
  });

  it("last punch OUT: nothing to close", () => {
    expect(forgotCheckout({ log_type: "OUT", time: "2026-10-20T04:00:00Z" }, at("2026-10-27T04:00:00Z"))).toBeNull();
  });
});
