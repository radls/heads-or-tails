import { describe, expect, it } from "vitest";
import { framing } from "../src/frame.js";
import { classifyPointer } from "../src/gesture.js";

describe("gesture", () => {
  it("treats a short press as a tap and scales upward swipes", () => {
    expect(classifyPointer({ dx: 2, dy: -3, distance: 4, width: 390 }).type).toBe("tap");
    const hard = classifyPointer({ dx: 4, dy: -220, distance: 220, width: 390 });
    expect(hard).toEqual({ type: "swipe", power: 1 });
    const soft = classifyPointer({ dx: 30, dy: 40, distance: 50, width: 390 });
    expect(soft.type).toBe("swipe");
    expect(soft.power).toBeGreaterThanOrEqual(0.22);
    expect(soft.power).toBeLessThan(0.5);
  });
});

describe("framing", () => {
  function fraction(frame, diameter) {
    const v = (frame.fov * Math.PI) / 180;
    const h = 2 * Math.atan(Math.tan(v / 2) * frame.aspect);
    const ang = 2 * Math.atan(diameter / 2 / frame.distance);
    return ang / h;
  }

  it("shows the half dollar larger than the dime, and large enough to read", () => {
    const phone = framing(390 / 844);
    const desk = framing(1440 / 900);
    expect(fraction(phone, 30.61)).toBeGreaterThan(fraction(phone, 17.91));
    expect(fraction(phone, 30.61)).toBeGreaterThan(0.28);
    expect(fraction(phone, 30.61)).toBeLessThan(0.62);
    expect(fraction(desk, 30.61)).toBeGreaterThan(0.2);
    expect(phone.position.y).toBeGreaterThan(20);
    expect(phone.position.z).toBeGreaterThan(20);
  });
});
