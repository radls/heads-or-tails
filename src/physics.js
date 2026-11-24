import RAPIER from "@dimforge/rapier3d-compat";
import { faceFromQuaternion, faceUpDot, flattenQuaternion, rotateVector } from "./face.js";

/** Fixed step. Fast mode runs more of these per frame; it does not change dt. */
export const FIXED_DT = 1 / 240;
export const SETTLE_HOLD = 0.4;
export const SIM_TIMEOUT = 8;
const GRAVITY = 9810;

let initPromise = null;

export function initPhysics() {
  initPromise ??= RAPIER.init().then(() => RAPIER);
  return initPromise;
}

function cylinderVolume(coin) {
  const radius = coin.diameter / 2;
  return Math.PI * radius * radius * coin.thickness;
}

/**
 * Rigid-body coin on a fixed table. Units: millimetres, grams, seconds.
 * @param {object} coin
 * @param {{ next: Function, range: Function, signed: Function }} rng
 */
export function createSimulation(coin, rng) {
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  world.lengthUnit = 1000;
  world.timestep = FIXED_DT;
  world.numSolverIterations = 8;
  world.maxCcdSubsteps = 4;
  if (world.integrationParameters) {
    world.integrationParameters.normalizedAllowedLinearError = 0.00015;
  }

  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -20, 0));
  const groundCollider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(2000, 20, 2000).setFriction(0.48).setRestitution(0.36),
    ground,
  );

  const arena = 420;
  const wallH = 500;
  const thick = 20;
  const wall = (x, y, z, hx, hy, hz) => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.35).setRestitution(0.18),
      body,
    );
  };
  wall(0, wallH, -(arena + thick), arena + thick, wallH, thick);
  wall(0, wallH, arena + thick, arena + thick, wallH, thick);
  wall(-(arena + thick), wallH, 0, thick, wallH, arena + thick);
  wall(arena + thick, wallH, 0, thick, wallH, arena + thick);

  const eventQueue = new RAPIER.EventQueue(true);
  const sim = {
    world,
    groundCollider,
    coin,
    rng,
    body: null,
    collider: null,
    phase: "idle",
    flipTime: 0,
    settleHold: 0,
    result: null,
    recoveries: 0,
    nudgedForTimeout: false,
    prevSpeed: 0,
    _spawn(nextCoin) {
      if (sim.body) world.removeRigidBody(sim.body);
      sim.coin = nextCoin;
      const radius = nextCoin.diameter / 2;
      const half = nextCoin.thickness / 2;
      const density = nextCoin.mass / cylinderVolume(nextCoin);
      const desc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, half + 0.2, 0)
        .setCanSleep(false)
        .setCcdEnabled(true)
        .setSoftCcdPrediction(8)
        .setLinearDamping(0.06)
        .setAngularDamping(0.12);
      sim.body = world.createRigidBody(desc);
      sim.collider = world.createCollider(
        RAPIER.ColliderDesc.cylinder(half, radius)
          .setDensity(density)
          .setFriction(0.46)
          .setRestitution(0.32)
          .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Average)
          .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Average)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
          .setContactForceEventThreshold(30),
        sim.body,
      );
      sim.phase = "idle";
      sim.result = null;
      sim.flipTime = 0;
      sim.settleHold = 0;
      sim.prevSpeed = 0;
    },
  };

  sim._spawn(coin);

  sim.setSurface = (friction, restitution) => {
    groundCollider.setFriction(friction);
    groundCollider.setRestitution(restitution);
  };

  sim.swapCoin = (nextCoin) => {
    sim._spawn(nextCoin);
    sim.placeHeadsUp();
  };

  sim.placeHeadsUp = () => {
    const half = sim.coin.thickness / 2;
    sim.body.setTranslation({ x: 0, y: half + 0.15, z: 0 }, true);
    sim.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    sim.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    sim.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    sim.body.setEnabled(true);
    sim.phase = "idle";
    sim.result = null;
    sim.flipTime = 0;
    sim.settleHold = 0;
    sim.nudgedForTimeout = false;
    sim.prevSpeed = 0;
  };

  sim.launch = (power = 0.55, opts = {}) => {
    const p = Math.min(1, Math.max(0, power));
    const reduced = Boolean(opts.reduced);
    const mass = sim.body.mass();
    const height = 95 + p * 300;
    const vy = Math.sqrt(2 * GRAVITY * height) * (1 + sim.rng.signed(0.04));
    const horiz = (reduced ? 10 : 35) + p * (reduced ? 14 : 80);
    const hx = sim.rng.signed(horiz);
    const hz = sim.rng.signed(horiz);
    const safeY = sim.coin.diameter / 2 + 3;
    const pos = sim.body.translation();
    sim.body.setTranslation({ x: pos.x, y: Math.max(pos.y, safeY), z: pos.z }, true);
    const axisAngle = sim.rng.range(0, Math.PI * 2);
    const ax = Math.cos(axisAngle);
    const az = Math.sin(axisAngle);
    const phase = sim.rng.range(0, Math.PI * 2);
    const s = Math.sin(phase / 2);
    const c = Math.cos(phase / 2);
    sim.body.setRotation({ x: ax * s, y: 0, z: az * s, w: c }, true);
    sim.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    sim.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    sim.body.applyImpulse({ x: hx * mass, y: vy * mass, z: hz * mass }, true);
    const revs = 16 + p * 18 + sim.rng.signed(1.5);
    const omega = revs * Math.PI * 2;
    sim.body.setAngvel(
      {
        x: ax * omega,
        y: sim.rng.signed(0.06) * omega,
        z: az * omega,
      },
      true,
    );
    sim.phase = "flying";
    sim.flipTime = 0;
    sim.settleHold = 0;
    sim.result = null;
    sim.nudgedForTimeout = false;
    sim.prevSpeed = Math.hypot(hx, vy, hz);
    sim.body.setEnabled(true);
  };

  function nudge() {
    const mass = sim.body.mass();
    const dir = sim.rng.range(0, Math.PI * 2);
    sim.body.applyImpulse(
      {
        x: Math.cos(dir) * 14 * mass,
        y: 55 * mass,
        z: Math.sin(dir) * 14 * mass,
      },
      true,
    );
    sim.body.setAngvel(
      {
        x: sim.rng.signed(18),
        y: sim.rng.signed(2),
        z: sim.rng.signed(18),
      },
      true,
    );
  }

  function finish(face, forced) {
    const pos = sim.body.translation();
    const flat = flattenQuaternion(sim.body.rotation()) ?? (face === "tails"
      ? { x: 1, y: 0, z: 0, w: 0 }
      : { x: 0, y: 0, z: 0, w: 1 });
    const half = sim.coin.thickness / 2;
    sim.body.setTranslation({ x: pos.x, y: half + 0.02, z: pos.z }, true);
    sim.body.setRotation(flat, true);
    sim.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    sim.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    sim.phase = "idle";
    sim.result = {
      face,
      simSeconds: sim.flipTime,
      forced,
    };
    sim.settleHold = 0;
  }

  sim.step = () => {
    if (sim.phase === "idle") {
      return { impact: 0, phase: "idle", settled: false, face: faceFromQuaternion(sim.body.rotation()), rattle: false };
    }
    world.timestep = FIXED_DT;
    world.step(eventQueue);
    let contacted = false;
    eventQueue.drainCollisionEvents((_a, _b, started) => {
      if (started) contacted = true;
    });
    eventQueue.drainContactForceEvents(() => {
      contacted = true;
    });
    sim.flipTime += FIXED_DT;

    let pos = sim.body.translation();
    let linNow = sim.body.linvel();
    const horiz = Math.hypot(linNow.x, linNow.z);
    if (horiz > 900) {
      const scale = 900 / horiz;
      sim.body.setLinvel({ x: linNow.x * scale, y: linNow.y, z: linNow.z * scale }, true);
      linNow = sim.body.linvel();
    }
    if (pos.y < -12 || Math.abs(pos.x) > arena + 30 || Math.abs(pos.z) > arena + 30) {
      sim.recoveries += 1;
      const half = sim.coin.thickness / 2;
      sim.body.setTranslation(
        {
          x: Math.max(-120, Math.min(120, pos.x)),
          y: Math.max(half + 4, pos.y),
          z: Math.max(-120, Math.min(120, pos.z)),
        },
        true,
      );
      sim.body.setLinvel({ x: linNow.x * 0.15, y: Math.abs(linNow.y) * 0.2 + 80, z: linNow.z * 0.15 }, true);
      pos = sim.body.translation();
    }

    const lin = sim.body.linvel();
    const ang = sim.body.angvel();
    const speed = Math.hypot(lin.x, lin.y, lin.z);
    const angSpeed = Math.hypot(ang.x, ang.y, ang.z);
    const q = sim.body.rotation();
    const up = faceUpDot(q);
    const face = faceFromQuaternion(q);
    const drop = sim.prevSpeed - speed;
    sim.prevSpeed = speed;
    // A coin on its edge has its center about one radius up, not one thickness.
    const radius = sim.coin.diameter / 2;
    const onTable = pos.y < radius + 5;
    let impact = 0;
    if (contacted && drop > 70 && onTable && lin.y < 500) impact = drop;
    const rattle = contacted && onTable && drop > 22 && drop <= 70 && sim.phase === "settling";

    if (sim.phase === "flying" && (impact > 0 || (onTable && lin.y < 40))) {
      sim.phase = "settling";
    }

    // Cylinder colliders have no rim to catch, so an edge spin can sing forever.
    // Bleed it only while the coin is nearly on edge. That does not pick a face.
    if (sim.phase === "settling" && onTable) {
      const absUp = Math.abs(up);
      if (absUp < 0.4) {
        const bleed = angSpeed > 8 ? 0.985 : 0.97;
        sim.body.setAngvel({ x: ang.x * bleed, y: ang.y * bleed, z: ang.z * bleed }, false);
      } else if (absUp >= 0.2 && absUp < 0.9 && angSpeed < 18 && speed < 500) {
        const u = rotateVector(q, 0, 1, 0);
        const sign = up > 0 ? 1 : -1;
        // ω = u × (sign * world up) lays the winning face down. The opposite
        // cross product would tip the coin onto the other side.
        const add = 22 * FIXED_DT;
        sim.body.setAngvel(
          {
            x: ang.x * 0.992 - sign * u.z * add,
            y: ang.y * 0.996,
            z: ang.z * 0.992 + sign * u.x * add,
          },
          false,
        );
      } else if (absUp > 0.9 && speed < 500) {
        sim.body.setLinvel({ x: lin.x * 0.988, y: lin.y, z: lin.z * 0.988 }, false);
        sim.body.setAngvel({ x: ang.x * 0.975, y: ang.y * 0.99, z: ang.z * 0.975 }, false);
      }
    }

    const absUp = Math.abs(up);
    const calm = onTable && speed < 45 && angSpeed < 1.6 && Math.abs(lin.y) < 35;
    let settled = false;
    if (calm && absUp >= 0.85) {
      sim.settleHold += FIXED_DT;
      if (sim.settleHold >= SETTLE_HOLD) {
        finish(face === "tails" ? "tails" : "heads", false);
        settled = true;
      }
    } else if (onTable && absUp < 0.2 && speed < 90 && angSpeed < 8) {
      sim.settleHold += FIXED_DT;
      if (sim.settleHold > 0.12) {
        nudge();
        sim.settleHold = 0;
      }
    } else if (speed > 140 || angSpeed > 10 || !onTable) {
      sim.settleHold = 0;
    }

    if (!sim.result && sim.flipTime > SIM_TIMEOUT && !sim.nudgedForTimeout) {
      nudge();
      sim.nudgedForTimeout = true;
      sim.settleHold = 0;
      console.warn("heads-or-tails: flip exceeded 8s, nudging");
    }
    if (!sim.result && sim.flipTime > SIM_TIMEOUT + 0.75) {
      const decided = Math.abs(up) < 0.2 ? (sim.rng.next() < 0.5 ? "heads" : "tails") : face === "tails" ? "tails" : "heads";
      finish(decided, true);
      settled = true;
      console.warn("heads-or-tails: force-settled flip");
    }

    return { impact, phase: sim.phase, settled, face, rattle, speed };
  };

  sim.placeHeadsUp();
  return sim;
}
