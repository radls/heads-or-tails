import {
  ACESFilmicToneMapping,
  CanvasTexture,
  CircleGeometry,
  Color,
  DataTexture,
  DirectionalLight,
  Euler,
  FrontSide,
  Group,
  HemisphereLight,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  PCFShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  RGBAFormat,
  Raycaster,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderer,
  Fog,
} from "three";
import { buildCoinGeometries } from "./coin-geometry.js";
import { framing } from "./frame.js";
import { bakeMaps, heightFromImage } from "./normals.js";
import { pixelRatioFor, shadowSizeFor } from "./settings.js";

const MAP_SIZE = 512;

function dataTexture(src, width, height) {
  const data = new Uint8Array(src);
  const tex = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);
  tex.flipY = true;
  tex.colorSpace = NoColorSpace;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function fillCanvas(paint) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.createImageData(512, 512);
  const px = image.data;
  for (let y = 0; y < 512; y += 1) {
    for (let x = 0; x < 512; x += 1) {
      const rgb = paint(x, y);
      const i = (y * 512 + x) * 4;
      px[i] = rgb[0];
      px[i + 1] = rgb[1];
      px[i + 2] = rgb[2];
      px[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function tableCanvases() {
  return {
    wood: fillCanvas((x, y) => {
      // Broad blotches only. Fine horizontal waves turn into stripes once the
      // camera looks along the table.
      const blot = Math.sin(x * 0.016 + y * 0.011) * 0.55 + Math.sin(x * 0.008 - y * 0.012) * 0.45;
      const soft = Math.sin(x * 0.031 + y * 0.027);
      // Per-pixel grain averages out in the mipmaps instead of banding.
      const grain = (hash2(x, y) - 0.5) * 0.12 + Math.sin(y * 0.9 + Math.sin(x * 0.05) * 3) * 0.03;
      const v = 0.5 + blot * 0.06 + soft * 0.025 + grain;
      return [40 + v * 28, 24 + v * 15, 14 + v * 8];
    }),
    felt: fillCanvas((x, y) => {
      const n = Math.sin(x * 0.17 + y * 0.11) * Math.sin(y * 0.13);
      const v = 0.5 + n * 0.04;
      return [18 + v * 16, 58 + v * 28, 46 + v * 18];
    }),
    slate: fillCanvas((x, y) => {
      const v = 0.5 + Math.sin(x * 0.02 + y * 0.015) * 0.04 + Math.sin(y * 0.05) * 0.02;
      const c = 58 + v * 22;
      return [c - 2, c, c + 4];
    }),
  };
}

function makeTableTexture(canvas, renderer) {
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  return tex;
}

function studioEnvironment(renderer) {
  const studio = new Scene();
  studio.background = new Color(0x1a1816);
  const add = (w, h, color, intensity, x, y, z) => {
    const material = new MeshBasicMaterial({ color, side: FrontSide });
    material.color.multiplyScalar(intensity);
    const mesh = new Mesh(new PlaneGeometry(w, h), material);
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    studio.add(mesh);
  };
  add(9, 5.5, 0xfff6ea, 16, 0.4, 5.2, 6.5);
  add(6, 4, 0xd7e6ff, 6, -6.2, 2.4, 2.2);
  add(3.5, 6, 0xffe2b5, 9, 5.5, 3.2, -3.4);
  add(10, 6, 0xc4a078, 2.4, 0, -3.2, 1.5);
  add(7, 2.4, 0xffffff, 7, -1, 7.2, -1);
  // Broad softbox behind the coin: a resting coin seen from the front-top
  // mirrors this region, so without it the faces read as near-black.
  add(14, 6, 0xfff1dc, 1.6, 0, 3.6, -7.5);
  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(studio, 0.08, 0.1, 40);
  pmrem.dispose();
  studio.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
  renderer.setRenderTarget(null);
  return target;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`relief ${url}`));
    image.src = url;
  });
}

function smoother(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/**
 * Renderer, table, coin, and camera.
 * The camera sits on +Z looking toward −Z, so screen-right is world +X.
 * Design-top of a heads-up coin is local −Z, which that view puts at the top of the picture.
 */
export function createStage(canvas) {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.setClearColor(0x14110e, 1);

  const scene = new Scene();
  scene.background = new Color(0x14110e);
  // The table falls off into the dark backdrop instead of a flat bright plane.
  scene.fog = new Fog(0x14110e, 190, 620);
  let envTarget = null;
  try {
    envTarget = studioEnvironment(renderer);
    scene.environment = envTarget.texture;
  } catch (error) {
    console.warn("heads-or-tails: studio environment failed", error);
  }

  const camera = new PerspectiveCamera(30, 1, 0.5, 8000);
  const homePos = new Vector3();
  const homeLook = new Vector3(0, 1.2, 0);
  const camPos = new Vector3();
  const camLook = new Vector3();
  const wantPos = new Vector3();
  const wantLook = new Vector3();

  const hemi = new HemisphereLight(0xfff4e6, 0x2a241e, 0.3);
  scene.add(hemi);
  const sun = new DirectionalLight(0xfff7ee, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 700;
  sun.shadow.camera.left = -140;
  sun.shadow.camera.right = 140;
  sun.shadow.camera.top = 140;
  sun.shadow.camera.bottom = -140;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.6;
  sun.shadow.radius = 2.5;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);
  scene.add(sun.target);

  const canvases = tableCanvases();
  const textures = {
    wood: makeTableTexture(canvases.wood, renderer),
    felt: makeTableTexture(canvases.felt, renderer),
    slate: makeTableTexture(canvases.slate, renderer),
  };
  const tableMat = new MeshStandardMaterial({
    map: textures.wood,
    roughness: 0.86,
    metalness: 0.02,
    envMapIntensity: 0.35,
  });
  const table = new Mesh(new PlaneGeometry(2400, 2400), tableMat);
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  scene.add(table);

  const blob = new Mesh(
    new CircleGeometry(1, 48),
    new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.2;
  blob.renderOrder = 2;
  scene.add(blob);

  const coin = new Group();
  scene.add(coin);
  const faceMat = {
    obverse: new MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 1,
      roughness: 1,
      envMapIntensity: 1.15,
    }),
    reverse: new MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 1,
      roughness: 1,
      envMapIntensity: 1.15,
    }),
  };
  const edgeMat = new MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 1,
    roughness: 0.28,
    vertexColors: true,
    envMapIntensity: 1.15,
  });
  let obverseMesh = null;
  let reverseMesh = null;
  let edgeMesh = null;

  const geoCache = new Map();
  const mapCache = new Map();
  let coinDef = null;
  let token = 0;
  let fade = 1;
  let fadeGoal = 1;
  const fadeWaiters = [];

  const restPos = new Vector3();
  const restQuat = new Quaternion();
  const shownPos = new Vector3();
  const shownQuat = new Quaternion();
  const inspectQuat = new Quaternion();
  const inspectEuler = new Euler(0, 0, 0, "YXZ");
  const inspectPos = new Vector3();
  const raycaster = new Raycaster();
  const inspect = {
    active: false,
    returning: false,
    dragging: false,
    blend: 0,
    yaw: 0.35,
    pitch: 0.62,
  };
  const inspectWaiters = [];
  let reduced = false;
  let quality = "auto";
  let moving = false;
  let tableName = "wood";

  function applyOpacity() {
    const transparent = fade < 0.98;
    for (const mat of [faceMat.obverse, faceMat.reverse, edgeMat]) {
      mat.opacity = fade;
      mat.transparent = transparent;
    }
  }

  function flushFade() {
    if (Math.abs(fade - fadeGoal) > 0.02) return;
    while (fadeWaiters.length) fadeWaiters.pop()();
  }

  function layout() {
    const aspect = camera.aspect > 0 ? camera.aspect : 1;
    const frame = framing(aspect, 30);
    homePos.set(frame.position.x, frame.position.y, frame.position.z);
    homeLook.set(frame.lookAt.x, frame.lookAt.y, frame.lookAt.z);
    camera.fov = frame.fov;
    camera.updateProjectionMatrix();
  }

  function resize() {
    const width = canvas.clientWidth || window.innerWidth || 1;
    const height = canvas.clientHeight || window.innerHeight || 1;
    camera.aspect = width / Math.max(1, height);
    layout();
    const memory = navigator.deviceMemory;
    renderer.setPixelRatio(pixelRatioFor(quality, window.devicePixelRatio, memory));
    renderer.setSize(width, height, false);
    if (reduced) {
      camPos.copy(homePos);
      camLook.copy(homeLook);
    }
  }

  function applyShadowSize() {
    const size = shadowSizeFor(quality, navigator.deviceMemory);
    sun.shadow.mapSize.set(size, size);
    if (sun.shadow.map) {
      sun.shadow.map.dispose();
      sun.shadow.map = null;
    }
  }

  function paintMetal(def) {
    for (const mat of [faceMat.obverse, faceMat.reverse]) {
      mat.color.set(def.color);
      mat.metalness = 1;
      mat.clearcoat = def.clearcoat;
      mat.clearcoatRoughness = def.clearcoatRoughness;
      mat.envMapIntensity = def.envIntensity;
      mat.roughness = 1;
    }
    edgeMat.envMapIntensity = def.envIntensity;
    edgeMat.clearcoat = def.clearcoat * 0.6;
    edgeMat.clearcoatRoughness = def.clearcoatRoughness;
    edgeMat.roughness = def.roughness;
  }

  function mountGeometry(def) {
    let built = geoCache.get(def.key);
    if (!built) {
      built = buildCoinGeometries(def);
      try {
        built.obverse.computeTangents();
        built.reverse.computeTangents();
      } catch {
        // The normal-map shader falls back to screen-space derivatives.
      }
      geoCache.set(def.key, built);
    }
    coin.clear();
    obverseMesh = new Mesh(built.obverse, faceMat.obverse);
    reverseMesh = new Mesh(built.reverse, faceMat.reverse);
    edgeMesh = new Mesh(built.edge, edgeMat);
    for (const mesh of [obverseMesh, reverseMesh, edgeMesh]) {
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      coin.add(mesh);
    }
    coinDef = def;
    paintMetal(def);
  }

  async function mapsFor(def) {
    const cached = mapCache.get(def.key);
    if (cached) return cached;
    const base = import.meta.env.BASE_URL || "/";
    const [obverseImage, reverseImage] = await Promise.all([
      loadImage(`${base}coins/${def.key}_obv.webp`),
      loadImage(`${base}coins/${def.key}_rev.webp`),
    ]);
    const bake = (image) => {
      const height = heightFromImage(image, MAP_SIZE, def.reliefBlur || 0);
      const maps = bakeMaps(height, MAP_SIZE, MAP_SIZE, def);
      return {
        normal: dataTexture(maps.normal, MAP_SIZE, MAP_SIZE),
        roughness: dataTexture(maps.roughness, MAP_SIZE, MAP_SIZE),
        ao: dataTexture(maps.ao, MAP_SIZE, MAP_SIZE),
      };
    };
    const record = { obverseImage, reverseImage, obverse: bake(obverseImage), reverse: bake(reverseImage) };
    mapCache.set(def.key, record);
    return record;
  }

  function applyMaps(record) {
    const bind = (mat, maps) => {
      mat.normalMap = maps.normal;
      mat.normalScale = new Vector2(1, 1);
      mat.roughnessMap = maps.roughness;
      mat.aoMap = maps.ao;
      mat.aoMapIntensity = 0.85;
      mat.needsUpdate = true;
    };
    bind(faceMat.obverse, record.obverse);
    bind(faceMat.reverse, record.reverse);
  }

  function finishInspect() {
    inspect.returning = false;
    inspect.active = false;
    inspect.blend = 0;
    while (inspectWaiters.length) inspectWaiters.pop()();
  }

  const api = {
    resize,
    render() {
      renderer.render(scene, camera);
    },
    setReduced(next) {
      reduced = Boolean(next);
      if (reduced) {
        camPos.copy(homePos);
        camLook.copy(homeLook);
        camera.position.copy(camPos);
        camera.lookAt(camLook);
      }
    },
    setQuality(next) {
      quality = next || "auto";
      applyShadowSize();
      resize();
    },
    setTable(name) {
      const key = textures[name] ? name : "wood";
      tableName = key;
      tableMat.map = textures[key];
      if (key === "felt") {
        tableMat.roughness = 0.98;
        tableMat.metalness = 0;
        tableMat.envMapIntensity = 0.18;
      } else if (key === "slate") {
        tableMat.roughness = 0.42;
        tableMat.metalness = 0.08;
        tableMat.envMapIntensity = 0.55;
      } else {
        tableMat.roughness = 0.86;
        tableMat.metalness = 0.02;
        tableMat.envMapIntensity = 0.35;
      }
      tableMat.needsUpdate = true;
    },
    tableName() {
      return tableName;
    },
    async setCoin(def, { fadeIn = true } = {}) {
      const mine = ++token;
      mountGeometry(def);
      if (!fadeIn || reduced) {
        fade = 1;
        fadeGoal = 1;
      } else {
        fade = 0.2;
        fadeGoal = 1;
      }
      applyOpacity();
      const record = await mapsFor(def);
      if (mine !== token) return null;
      applyMaps(record);
      if (fade >= 0.98) flushFade();
      return record;
    },
    whenFaded() {
      if (Math.abs(fade - fadeGoal) <= 0.02) return Promise.resolve();
      return new Promise((resolve) => fadeWaiters.push(resolve));
    },
    reliefImages() {
      const cached = coinDef ? mapCache.get(coinDef.key) : null;
      return cached ? { obverse: cached.obverseImage, reverse: cached.reverseImage } : null;
    },
    coinDef() {
      return coinDef;
    },
    syncBody(body) {
      const p = body.translation();
      const q = body.rotation();
      restPos.set(p.x, p.y, p.z);
      restQuat.set(q.x, q.y, q.z, q.w);
      if (!inspect.active && !inspect.returning) {
        coin.position.copy(restPos);
        coin.quaternion.copy(restQuat);
      }
    },
    enterInspect() {
      inspect.active = true;
      inspect.returning = false;
      inspect.dragging = false;
      inspect.yaw = 0.35;
      inspect.pitch = 0.62;
    },
    exitInspect() {
      if (!inspect.active && !inspect.returning) return;
      inspect.active = false;
      inspect.returning = true;
      inspect.dragging = false;
      if (reduced) {
        inspect.blend = 0;
        finishInspect();
      }
    },
    whenInspectDone() {
      if (!inspect.active && !inspect.returning) return Promise.resolve();
      return new Promise((resolve) => inspectWaiters.push(resolve));
    },
    isInspecting() {
      return inspect.active || inspect.returning;
    },
    drag(dx, dy) {
      inspect.dragging = true;
      inspect.yaw += dx * 0.012;
      inspect.pitch = Math.min(1.2, Math.max(-0.35, inspect.pitch + dy * 0.008));
    },
    setDragging(next) {
      inspect.dragging = Boolean(next);
    },
    hit(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      const y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
      raycaster.setFromCamera({ x, y }, camera);
      return raycaster.intersectObject(coin, true).length > 0;
    },
    update(dt, phase) {
      const step = Number.isFinite(dt) ? Math.min(0.05, Math.max(0, dt)) : 0;
      if (fadeGoal !== fade) {
        const k = reduced ? 1 : 1 - Math.pow(0.001, Math.max(step, 0.001));
        fade += (fadeGoal - fade) * Math.min(1, k * 2.4);
        if (Math.abs(fadeGoal - fade) < 0.01) fade = fadeGoal;
        applyOpacity();
        flushFade();
      }

      const goal = inspect.active ? 1 : 0;
      if (inspect.active || inspect.returning) {
        if (reduced) inspect.blend = goal;
        else inspect.blend += (goal - inspect.blend) * Math.min(1, step * 4.5);
        if (!reduced && inspect.active && !inspect.dragging) inspect.yaw += step * 0.45;
        if (inspect.returning && inspect.blend < 0.012) finishInspect();
        inspectEuler.set(inspect.pitch, inspect.yaw, 0);
        inspectQuat.setFromEuler(inspectEuler);
        camera.getWorldDirection(inspectPos);
        inspectPos.multiplyScalar(homePos.length() * 0.4).add(camera.position);
        const blend = smoother(inspect.blend);
        shownPos.lerpVectors(restPos, inspectPos, blend);
        shownQuat.copy(restQuat).slerp(inspectQuat, blend);
        coin.position.copy(shownPos);
        coin.quaternion.copy(shownQuat);
      } else {
        coin.position.copy(restPos);
        coin.quaternion.copy(restQuat);
      }

      const framingCoin = !reduced && !inspect.active && !inspect.returning;
      if (framingCoin) {
        const flying = phase === "flying" || phase === "settling";
        const lift = Math.max(0, restPos.y - 1.2);
        const lookY = flying ? 1.2 + lift * 0.82 : 1.2;
        wantLook.set(restPos.x, lookY, restPos.z);
        const offsetX = homePos.x - homeLook.x;
        const offsetY = homePos.y - homeLook.y;
        const offsetZ = homePos.z - homeLook.z;
        const dist0 = Math.hypot(offsetX, offsetY, offsetZ) || 1;
        const halfFov = Math.tan((camera.fov * Math.PI) / 360);
        const span = (coinDef ? coinDef.diameter : 24) * 0.55;
        const above = Math.max(0, restPos.y - lookY + span);
        const dist = Math.max(dist0, above / (halfFov * 0.7));
        const scale = dist / dist0;
        wantPos.set(wantLook.x + offsetX * scale, wantLook.y + offsetY * scale, wantLook.z + offsetZ * scale);
      } else if (reduced) {
        wantPos.copy(homePos);
        wantLook.copy(homeLook);
      }
      if (reduced) {
        camPos.copy(homePos);
        camLook.copy(homeLook);
      } else if (step === 0 && !inspect.active && !inspect.returning) {
        camPos.copy(wantPos);
        camLook.copy(wantLook);
      } else {
        const rate = phase === "flying" || phase === "settling" ? 14 : 7;
        const k = 1 - Math.exp(-rate * Math.max(step, 0.001));
        camPos.lerp(wantPos, Math.min(1, k));
        camLook.lerp(wantLook, Math.min(1, k));
      }
      if (camPos.lengthSq() < 1) camPos.copy(homePos);
      camera.position.copy(camPos);
      camera.lookAt(camLook);

      const focusX = inspect.active ? 0 : restPos.x;
      const focusZ = inspect.active ? 0 : restPos.z;
      sun.position.set(focusX + 64, 210, focusZ + 86);
      sun.target.position.set(focusX, 0, focusZ);
      sun.target.updateMatrixWorld();

      const radius = coinDef ? coinDef.diameter / 2 : 12;
      const height = Math.max(0, coin.position.y - (coinDef ? coinDef.thickness / 2 : 1));
      const grounded = Math.max(0, 1 - height / 160);
      blob.visible = !inspect.active && !inspect.returning;
      blob.position.x = coin.position.x;
      blob.position.z = coin.position.z;
      blob.scale.setScalar(radius * (0.92 + height / 220));
      blob.material.opacity = 0.5 * grounded;

      moving = Math.abs(fade - fadeGoal) > 0.02
        || inspect.active
        || inspect.returning
        || camPos.distanceToSquared(wantPos) > 0.35
        || camLook.distanceToSquared(wantLook) > 0.2;
    },
    needsFrame(phase) {
      return phase === "flying" || phase === "settling" || moving;
    },
  };

  resize();
  camPos.copy(homePos);
  camLook.copy(homeLook);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  return api;
}

export function reliefThumb(coin, image) {
  // Emboss-shade the relief map with a raking light so silver and gold
  // thumbnails keep their contrast instead of washing out to white.
  const size = 128;
  const src = document.createElement("canvas");
  src.width = size;
  src.height = size;
  const sctx = src.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(image, 0, 0, size, size);
  const h = sctx.getImageData(0, 0, size, size).data;
  const out = sctx.createImageData(size, size);
  const px = out.data;
  const base = hexRgb(coin.color);
  const at = (x, y) => h[(Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))) * 4] / 255;
  const c = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const r = Math.hypot(x - c + 0.5, y - c + 0.5) / (c - 3);
      if (r > 1) {
        px[i + 3] = 0;
        continue;
      }
      const dx = at(x + 1, y) - at(x - 1, y);
      const dy = at(x, y + 1) - at(x, y - 1);
      const light = Math.max(-1, Math.min(1, (-dx * 0.7 - dy * 0.7) * 3.2));
      const height = at(x, y);
      const sheen = 1 - 0.35 * Math.min(1, Math.hypot(x - c * 0.7, y - c * 0.6) / size);
      const k = (0.5 + 0.22 * height + 0.42 * light) * sheen;
      px[i] = Math.min(255, base[0] * k + 40 * Math.max(0, light));
      px[i + 1] = Math.min(255, base[1] * k + 36 * Math.max(0, light));
      px[i + 2] = Math.min(255, base[2] * k + 30 * Math.max(0, light));
      px[i + 3] = r > 0.985 ? Math.round(255 * (1 - (r - 0.985) / 0.015)) : 255;
    }
  }
  sctx.clearRect(0, 0, size, size);
  sctx.putImageData(out, 0, 0);
  sctx.beginPath();
  sctx.arc(c, c, c - 3, 0, Math.PI * 2);
  sctx.lineWidth = 2;
  sctx.strokeStyle = "rgba(20, 16, 12, 0.55)";
  sctx.stroke();
  return src.toDataURL("image/png");
}

function hexRgb(color) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(color).trim());
  if (!m) return [190, 190, 190];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function proceduralThumb(coin) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(48, 42, 8, 64, 68, 70);
  grad.addColorStop(0, "#fff8ea");
  grad.addColorStop(0.45, coin.color);
  grad.addColorStop(1, "#1c1814");
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255, 246, 230, 0.75)";
  ctx.stroke();
  ctx.fillStyle = "#1a1612";
  ctx.font = "600 26px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(coin.value, 64, 66);
  return canvas.toDataURL("image/png");
}
