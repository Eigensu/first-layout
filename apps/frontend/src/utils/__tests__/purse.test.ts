import { describe, expect, it } from "vitest";
import { isOverPurse, isOverspent } from "../purse";

describe("purse comparison", () => {
  it("accepts a squad that fits once float rounding is allowed for", () => {
    // 0.1 + 0.2 is 0.30000000000000004.
    expect(isOverPurse(0.1 + 0.2, 0.3)).toBe(false);
    expect(isOverspent(0.3 - (0.1 + 0.2))).toBe(false);
  });

  it("refuses a squad that is really over", () => {
    expect(isOverPurse(100.01, 100)).toBe(true);
    expect(isOverspent(-0.01)).toBe(true);
  });
});
