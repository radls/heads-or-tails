import { describe, expect, it } from "vitest";
import { formatVersion } from "../src/version.js";

describe("formatVersion", () => {
  it("matches the menu line", () => {
    expect(formatVersion("1.0.0", "abc1234")).toBe("v1.0.0 · abc1234");
  });
});
