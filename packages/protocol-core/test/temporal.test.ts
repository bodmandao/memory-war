import { describe, expect, it } from "vitest";
import { closeValidTime, isCurrentAsOf, openValidTime } from "../src/temporal.js";

describe("bi-temporal validity", () => {
  it("an open validity window is current for any time at or after `from`", () => {
    const vt = openValidTime(1000);
    expect(isCurrentAsOf(vt, 1000)).toBe(true);
    expect(isCurrentAsOf(vt, 999_999)).toBe(true);
  });

  it("closing a validity window does not mutate the original object", () => {
    const vt = openValidTime(1000);
    const closed = closeValidTime(vt, 2000);
    expect(vt.until).toBeUndefined(); // original untouched
    expect(closed.until).toBe(2000);
  });

  it("a closed window is current only within [from, until)", () => {
    const vt = closeValidTime(openValidTime(1000), 2000);
    expect(isCurrentAsOf(vt, 999)).toBe(false);
    expect(isCurrentAsOf(vt, 1500)).toBe(true);
    expect(isCurrentAsOf(vt, 2000)).toBe(false);
  });

  it("closing an already-closed window is idempotent (first close wins)", () => {
    const vt = closeValidTime(openValidTime(1000), 2000);
    const reclosed = closeValidTime(vt, 5000);
    expect(reclosed.until).toBe(2000);
  });

  it("rejects closing before the window opened", () => {
    expect(() => closeValidTime(openValidTime(1000), 500)).toThrow(RangeError);
  });
});
