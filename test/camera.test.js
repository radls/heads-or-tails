import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { framing } from "../src/frame.js";

describe("camera frame", () => {
  it("looks from +Z toward -Z with screen-right +X", () => {
    const frame = framing(390 / 844);
    const camera = new PerspectiveCamera(frame.fov, 390 / 844, 0.5, 8000);
    camera.position.set(frame.position.x, frame.position.y, frame.position.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(frame.lookAt.x, frame.lookAt.y, frame.lookAt.z);
    camera.updateMatrixWorld(true);
    const direction = new Vector3();
    camera.getWorldDirection(direction);
    expect(direction.z).toBeLessThan(-0.7);
    expect(direction.y).toBeLessThan(0);
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    expect(right.x).toBeGreaterThan(0.9);
    const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    expect(up.y).toBeGreaterThan(0.7);
    expect(frame.position.z).toBeGreaterThan(0);
  });
});
