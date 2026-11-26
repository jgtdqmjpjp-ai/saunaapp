import * as THREE from "three";
import type { Run, Scene } from "./types";
import { SCENE_DUR, BUBBLE_MS, WALKOUT_MS } from "./constants";
import { rand, clamp, lerp } from "./utils";

// ===== Three.js: 棒人間 =====
type Fig = {
  root: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  mouth: THREE.Mesh;
  skin: THREE.MeshStandardMaterial;
  baseSkin: THREE.Color;
};

const PI = Math.PI;
const STAND_Y = 0.885; // 立った時の腰の高さ

function makeFigure(p: number): Fig {
  const baseSkin = new THREE.Color().setHSL(0.07, 0.45, 0.5 + (p % 4) * 0.06);
  const skin = new THREE.MeshStandardMaterial({ color: baseSkin.clone(), roughness: 0.8 });
  const towel = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL((p * 0.13) % 1, 0.55, 0.72), roughness: 1 });
  const hatMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x111111 });

  const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => {
    const x = new THREE.Mesh(g, m);
    x.castShadow = true;
    return x;
  };
  // 関節から下に伸びる手足
  const limb = (len: number, r: number) => {
    const g = new THREE.CylinderGeometry(r, r * 0.85, len, 8);
    g.translate(0, -len / 2, 0);
    return mesh(g, skin);
  };

  const root = new THREE.Group();
  const waist = mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.22, 12), towel);
  waist.position.y = 0.03;
  root.add(waist);

  const torso = new THREE.Group();
  root.add(torso);
  const spine = mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 10), skin);
  spine.position.y = 0.35;
  torso.add(spine);
  const shoulders = mesh(new THREE.CapsuleGeometry(0.06, 0.3, 4, 8), skin);
  shoulders.rotation.z = PI / 2;
  shoulders.position.y = 0.62;
  torso.add(shoulders);

  const head = new THREE.Group();
  head.position.y = 0.68;
  torso.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.17, 16, 12), skin);
  skull.position.y = 0.18;
  head.add(skull);
  for (const sx of [-0.06, 0.06]) {
    const eye = mesh(new THREE.SphereGeometry(0.022, 8, 6), dark);
    eye.position.set(sx, 0.21, 0.155);
    head.add(eye);
  }
  const mouth = mesh(new THREE.BoxGeometry(0.08, 0.015, 0.02), dark);
  mouth.position.set(0, 0.11, 0.16);
  head.add(mouth);
  const hat = mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.17, 14), hatMat);
  hat.position.y = 0.36;
  head.add(hat);

  const makeArm = (side: number) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.21, 0.62, 0);
    torso.add(arm);
    arm.add(limb(0.3, 0.045));
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    arm.add(elbow);
    elbow.add(limb(0.28, 0.04));
    const hand = mesh(new THREE.SphereGeometry(0.05, 8, 6), skin);
    hand.position.y = -0.3;
    elbow.add(hand);
    return [arm, elbow];
  };
  const [armL, elbowL] = makeArm(-1);
  const [armR, elbowR] = makeArm(1);

  const makeLeg = (side: number) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.09, 0, 0);
    root.add(leg);
    leg.add(limb(0.42, 0.06));
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    leg.add(knee);
    knee.add(limb(0.42, 0.05));
    const foot = mesh(new THREE.BoxGeometry(0.09, 0.05, 0.18), skin);
    foot.position.set(0, -0.44, 0.05);
    knee.add(foot);
    return [leg, knee];
  };
  const [legL, kneeL] = makeLeg(-1);
  const [legR, kneeR] = makeLeg(1);

  return { root, torso, head, armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR, mouth, skin, baseSkin };
}

function resetPose(f: Fig) {
  for (const g of [f.root, f.torso, f.head, f.armL, f.armR, f.elbowL, f.elbowR, f.legL, f.legR, f.kneeL, f.kneeR]) g.rotation.set(0, 0, 0);
  f.armL.rotation.z = -0.12;
  f.armR.rotation.z = 0.12;
  f.mouth.scale.y = 1;
}

function poseSit(f: Fig, knee = PI / 2) {
  resetPose(f);
  f.legL.rotation.set(-PI / 2, 0, 0.08);
  f.legR.rotation.set(-PI / 2, 0, -0.08);
  f.kneeL.rotation.x = knee;
  f.kneeR.rotation.x = knee;
  // 手は膝の上
  f.armL.rotation.set(-0.55, 0, -0.12);
  f.armR.rotation.set(-0.55, 0, 0.12);
  f.elbowL.rotation.x = -0.6;
  f.elbowR.rotation.x = -0.6;
}

function poseWalk(f: Fig, t: number) {
  resetPose(f);
  const s = Math.sin(t * 11);
  f.legL.rotation.x = s * 0.6;
  f.legR.rotation.x = -s * 0.6;
  f.kneeL.rotation.x = Math.max(0, -s) * 0.9;
  f.kneeR.rotation.x = Math.max(0, s) * 0.9;
  f.armL.rotation.x = -s * 0.6;
  f.armR.rotation.x = s * 0.6;
  f.elbowL.rotation.x = -0.4;
  f.elbowR.rotation.x = -0.4;
}

function poseHug(f: Fig) {
  f.armL.rotation.set(-0.5, 0, 0.45);
  f.armR.rotation.set(-0.5, 0, -0.45);
  f.elbowL.rotation.x = -1.9;
  f.elbowR.rotation.x = -1.9;
}

function poseTalk(f: Fig, t: number) {
  f.armR.rotation.set(-1.1 + Math.sin(t * 9) * 0.3, 0, -0.1);
  f.elbowR.rotation.x = -0.9;
  f.head.rotation.x += Math.sin(t * 12) * 0.08;
  f.mouth.scale.y = 1 + 3 * Math.abs(Math.sin(t * 14));
}

// 顔色: 正=赤らむ, 負=青ざめる
function tint(f: Fig, k: number) {
  f.skin.color.copy(f.baseSkin).lerp(new THREE.Color(k >= 0 ? 0xff3a2a : 0x6fa8ff), Math.min(1, Math.abs(k)));
}

let steamTexture: THREE.Texture | null = null;
function getSteamTexture() {
  if (steamTexture) return steamTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  steamTexture = new THREE.CanvasTexture(c);
  return steamTexture;
}

type Base = { pos: THREE.Vector3; standY: number; aisleZ: number };

function buildWorld(kind: Scene, run: Run) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 16 / 10, 0.1, 100);
  const figs: (Fig | null)[] = [];
  const bases: Base[] = [];
  const leaveT = run.sauners.map((_, p) => run.scripts[kind].find((ev) => ev.p === p && ev.leave)?.t ?? null);
  const talkEvs = run.scripts[kind].filter((ev) => !ev.action && !ev.leave);
  const isTalking = (p: number, e: number) => talkEvs.some((ev) => ev.p === p && e >= ev.t && e < ev.t + BUBBLE_MS);

  const box = (w: number, h: number, d: number, color: THREE.ColorRepresentation, x: number, y: number, z: number, mat?: Partial<THREE.MeshStandardMaterialParameters>) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...mat }));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };

  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(3, 7, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7 });
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
  scene.add(hemi);

  // 立ち昇る湯気
  const steams: { s: THREE.Sprite; x: number; y0: number; z: number; speed: number; h: number }[] = [];
  const addSteam = (count: number, xr: number, y0: number, h: number, z0: number, z1: number, opacity: number) => {
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: getSteamTexture(), transparent: true, opacity, depthWrite: false }));
      const size = rand(1.2, 2.8);
      s.scale.set(size, size, 1);
      scene.add(s);
      steams.push({ s, x: rand(-xr, xr), y0: y0 + rand(0, h), z: rand(z0, z1), speed: rand(0.25, 0.6), h });
    }
  };
  const base0 = (x: number, y: number, z: number, standY: number, aisleZ: number) => bases.push({ pos: new THREE.Vector3(x, y, z), standY, aisleZ });

  let idle: (f: Fig, p: number, t: number) => void = () => {};
  let extra: (t: number, e: number) => void = () => {};
  let afterFigs: () => void = () => {};

  if (kind === "sauna") {
    const lv = run.saunaLv;
    scene.background = new THREE.Color({ tooCold: 0x1a2a40, lukewarm: 0x2c2418, good: 0x2b160a, hot: 0x3d120a, tooHot: 0x5a0d05 }[lv]);
    hemi.color.set({ tooCold: 0xa8c8ff, lukewarm: 0xffe8c8, good: 0xffd2a0, hot: 0xffa070, tooHot: 0xff5030 }[lv]);
    hemi.groundColor.set(0x3a1a08);
    sun.color.set(0xffe0b0);
    box(14, 0.1, 8, 0x6b4a2e, 0, -0.05, 0);
    box(14, 6, 0.2, 0x9c6b3c, 0, 3, -1.6);
    for (let y = 0.4; y < 6; y += 0.45) box(14, 0.03, 0.02, 0x7a4f28, 0, y, -1.49);
    // 上段・下段のベンチ
    box(7.4, 0.12, 0.8, 0xc99a62, 0, 0.94, -0.65);
    box(7.4, 0.88, 0.08, 0xa87a45, 0, 0.44, -0.27);
    box(7.4, 0.12, 0.8, 0xc99a62, 0, 0.39, 0.3);
    box(7.4, 0.39, 0.08, 0xa87a45, 0, 0.195, 0.68);
    // ストーブ
    box(0.9, 0.9, 0.9, 0x2a2a2a, -4.4, 0.45, 0.4, { metalness: 0.6 });
    const fire = box(0.55, 0.22, 0.02, lv === "tooCold" ? 0x222222 : 0xff5a00, -4.4, 0.32, 0.86, { emissive: lv === "tooCold" ? 0x000000 : 0xff4400, emissiveIntensity: 2 });
    for (let i = 0; i < 14; i++) {
      const st = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.09, 0.14)), new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 1 }));
      st.position.set(-4.4 + rand(-0.35, 0.35), 0.98 + rand(0, 0.08), 0.4 + rand(-0.35, 0.35));
      st.castShadow = true;
      scene.add(st);
    }
    const glow = new THREE.PointLight(0xff7a30, lv === "tooCold" ? 0 : 6, 0, 1.2);
    glow.position.set(-4.0, 1.4, 1.0);
    scene.add(glow);
    // 12分計と温度計
    const clockFace = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 32), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    clockFace.rotation.x = PI / 2;
    clockFace.position.set(3.4, 3.1, -1.47);
    scene.add(clockFace);
    const handPivot = new THREE.Group();
    handPivot.position.set(3.4, 3.1, -1.42);
    scene.add(handPivot);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.38, 0.02), new THREE.MeshStandardMaterial({ color: 0xdd0000 }));
    hand.position.y = 0.17;
    handPivot.add(hand);
    box(0.25, 1.6, 0.05, 0xffffff, 2.3, 3.1, -1.47);
    const level = clamp((run.settings.sauna + 10) / 210, 0.02, 1);
    box(0.08, 1.4 * level, 0.04, 0xdd0000, 2.3, 2.4 + 0.7 * level, -1.43);

    addSteam(Math.round(run.settings.humidity / 4), 6, -0.5, 5.5, -1.2, 1.8, 0.12 + run.settings.humidity / 400);

    for (let i = 0; i < 10; i++) {
      const upper = i < 5;
      const col = i % 5;
      if (upper) base0((col - 2) * 1.3 + 0.35, 1.05, -0.62, STAND_Y + 0.45, 1.6);
      else base0((col - 2) * 1.3, 0.5, 0.33, STAND_Y, 1.6);
    }

    idle = (f, p, t) => {
      const lv = run.sauners[p].saunaLv;
      poseSit(f);
      const o = p * 1.7;
      if (lv === "good") {
        f.torso.rotation.x = -0.06;
        f.head.rotation.x = 0.25 + Math.sin(t * 0.8 + o) * 0.12;
        f.root.position.y += Math.sin(t * 2 + o) * 0.01;
        tint(f, 0.2);
      } else if (lv === "hot") {
        f.torso.rotation.z = Math.sin(t * 3 + o) * 0.1;
        f.armR.rotation.set(-2.5 + Math.sin(t * 6 + o) * 0.25, 0, 0.3);
        f.elbowR.rotation.x = -1.4;
        f.head.rotation.x = -0.25;
        tint(f, 0.4);
      } else if (lv === "tooHot") {
        f.torso.rotation.z = Math.sin(t * 22 + o) * 0.2;
        f.armL.rotation.set(-0.4, 0, -2.2 - Math.sin(t * 18 + o) * 0.6);
        f.armR.rotation.set(-0.4, 0, 2.2 + Math.sin(t * 18 + o + 1) * 0.6);
        f.head.rotation.y = Math.sin(t * 12 + o) * 0.4;
        tint(f, 0.6 + Math.sin(t * 8) * 0.2);
      } else if (lv === "lukewarm") {
        f.torso.rotation.x = -0.15;
        f.head.rotation.x = 0.55 + Math.sin(t * 0.7 + o) * 0.15;
        tint(f, 0);
      } else {
        poseHug(f);
        f.torso.rotation.x = 0.25;
        f.root.position.x += Math.sin(t * 70 + o) * 0.02;
        tint(f, -0.5);
      }
    };
    extra = (t, e) => {
      handPivot.rotation.z = -2 * PI * (e / SCENE_DUR.sauna);
      if (lv !== "tooCold") {
        glow.intensity = 6 + Math.sin(t * 13) * 1 + Math.sin(t * 7) * 0.8;
        (fire.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.6 + Math.sin(t * 11) * 0.5;
      }
    };
    camera.position.set(0, 2.6, 7.2);
    camera.lookAt(0, 1.15, -0.2);
  } else if (kind === "water") {
    const lv = run.waterLv;
    scene.background = new THREE.Color(0xcfe0e8);
    hemi.color.set(lv === "tooCold" ? 0xc0d8ff : 0xffffff);
    box(16, 0.1, 10, 0x9fb3bd, 0, -0.05, 0);
    box(16, 6, 0.2, 0xe4ecef, 0, 3, -2.6);
    for (let x = -8; x <= 8; x += 0.5) box(0.02, 6, 0.02, 0xb8c8cf, x, 3, -2.49);
    for (let y = 0.5; y < 6; y += 0.5) box(16, 0.02, 0.02, 0xb8c8cf, 0, y, -2.49);
    // 浴槽
    const tubC = 0x7d8b94;
    box(7.8, 1.0, 0.3, tubC, 0, 0.5, 1.45);
    box(7.8, 1.0, 0.3, tubC, 0, 0.5, -1.45);
    box(0.3, 1.0, 3.2, tubC, -3.75, 0.5, 0);
    box(0.3, 1.0, 3.2, tubC, 3.75, 0.5, 0);
    const waterColor = { tooCold: 0xa6bcff, cold: 0x5ec8f2, good: 0x2bb3d9, nurui: 0x55c9a8, warm: 0xffa860 }[lv];
    const water = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 0.9, 2.6),
      new THREE.MeshStandardMaterial({ color: waterColor, transparent: true, opacity: 0.6, roughness: 0.1, metalness: 0.1, depthWrite: false }),
    );
    water.position.set(0, 0.45, 0);
    scene.add(water);
    // 蛇口から注ぐ水
    box(0.25, 0.25, 0.4, 0xaaaaaa, -3.2, 1.6, -1.45, { metalness: 0.8, roughness: 0.3 });
    const stream = box(0.12, 0.7, 0.12, waterColor, -3.2, 1.2, -1.25, { transparent: true, opacity: 0.5 });

    const ices: THREE.Mesh[] = [];
    if (lv === "tooCold" || lv === "cold") {
      for (let i = 0; i < (lv === "tooCold" ? 16 : 5); i++) {
        const ice = box(0.3, 0.3, 0.3, 0xeef8ff, rand(-3.3, 3.3), 0.88, rand(-1.1, 1.1), { transparent: true, opacity: 0.85, roughness: 0.1 });
        ice.rotation.y = rand(0, PI);
        ices.push(ice);
      }
    }
    if (lv === "warm") addSteam(14, 3.4, 0.8, 2.5, -1.2, 1.2, 0.35);
    if (lv === "nurui") addSteam(4, 3.4, 0.8, 2, -1.2, 1.2, 0.15);

    for (let i = 0; i < 10; i++) {
      const back = i < 5;
      const col = i % 5;
      if (back) base0((col - 2) * 1.35 + 0.35, 0.22, -0.65, STAND_Y, 2.2);
      else base0((col - 2) * 1.35, 0.22, 0.45, STAND_Y, 2.2);
    }

    idle = (f, p, t) => {
      const lv = run.sauners[p].waterLv;
      poseSit(f);
      const o = p * 1.3;
      if (lv === "good") {
        f.torso.rotation.x = -0.25;
        f.head.rotation.x = -0.25;
        f.armL.rotation.set(0, 0, -0.9);
        f.armR.rotation.set(0, 0, 0.9);
        f.root.position.y += Math.sin(t * 1.5 + o) * 0.03;
        tint(f, 0);
      } else if (lv === "cold") {
        poseHug(f);
        f.torso.rotation.z = Math.sin(t * 16 + o) * 0.08;
        f.head.rotation.x = -0.3;
        tint(f, -0.25);
      } else if (lv === "tooCold") {
        poseHug(f);
        f.torso.rotation.x = 0.3;
        f.root.position.x += Math.sin(t * 70 + o) * 0.025;
        tint(f, -0.6);
      } else if (lv === "nurui") {
        f.head.rotation.z = Math.sin(t * 0.8 + o) * 0.25;
        tint(f, 0.05);
      } else {
        f.torso.rotation.x = -0.35;
        f.armL.rotation.set(0, 0, -1.3);
        f.armR.rotation.set(0, 0, 1.3);
        f.head.rotation.z = Math.sin(t * 0.6 + o) * 0.15;
        tint(f, 0.3);
      }
    };
    extra = (t) => {
      water.position.y = 0.45 + Math.sin(t * 2) * 0.01;
      stream.scale.x = 1 + Math.sin(t * 30) * 0.15;
      ices.forEach((ice, i) => {
        ice.position.y = 0.88 + Math.sin(t * 2 + i) * 0.03;
        ice.rotation.y += 0.003;
      });
    };
    camera.position.set(0, 4.6, 5.4);
    camera.lookAt(0, 0.5, -0.2);
  } else {
    scene.background = new THREE.Color(0x0d1433);
    scene.fog = new THREE.Fog(0x0d1433, 12, 30);
    hemi.color.set(0x8fa8ff);
    hemi.groundColor.set(0x203020);
    hemi.intensity = 0.9;
    sun.color.set(0xc8d4ff);
    sun.intensity = 1.3;
    box(40, 0.1, 30, 0x2e5a35, 0, -0.05, -5);
    box(9.5, 0.06, 4.8, 0x8d6e4f, 0, 0.03, 0);
    const starGeo = new THREE.BufferGeometry();
    const starPos: number[] = [];
    for (let i = 0; i < 400; i++) starPos.push(rand(-30, 30), rand(3, 18), rand(-25, -15));
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, fog: false }));
    scene.add(stars);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff6d0, fog: false }));
    moon.position.set(6, 8, -18);
    scene.add(moon);
    for (let i = 0; i < 9; i++) {
      const tree = new THREE.Mesh(new THREE.ConeGeometry(rand(0.6, 1.0), rand(2, 3.5), 8), new THREE.MeshStandardMaterial({ color: 0x173d22 }));
      tree.position.set(-8 + i * 2 + rand(-0.5, 0.5), 1.2, rand(-7, -5));
      scene.add(tree);
    }
    const lantern = new THREE.PointLight(0xffb060, 4, 0, 1.3);
    lantern.position.set(-4.5, 2, 1.5);
    scene.add(lantern);
    box(0.25, 0.35, 0.25, 0xffd08a, -4.5, 1.9, 1.5, { emissive: 0xffa040, emissiveIntensity: 1.5 });
    box(0.06, 1.8, 0.06, 0x333333, -4.5, 0.9, 1.5);

    // ととのい椅子
    const goodIdx: number[] = [];
    for (let i = 0; i < 10; i++) {
      const back = i < 5;
      const x = (i % 5 - 2) * 1.55 + (back ? 0.4 : 0);
      const z = back ? -1.1 : 1.0;
      base0(x, 0.5, z, STAND_Y, 2.5);
      box(0.62, 0.07, 0.62, 0xeeeeee, x, 0.42, z + 0.05);
      for (const [lx, lz] of [[-0.27, -0.22], [0.27, -0.22], [-0.27, 0.32], [0.27, 0.32]]) box(0.04, 0.4, 0.04, 0xcccccc, x + lx, 0.2, z + lz);
      const backrest = box(0.62, 0.85, 0.06, 0xeeeeee, x, 0.82, z - 0.42);
      backrest.rotation.x = -0.5;
      const s = run.sauners[i];
      if (!s.leftAt && s.mood === "good") goodIdx.push(i);
    }
    // ととのった人のキラキラ
    const sparkGeo = new THREE.BufferGeometry();
    const sparkSeed = goodIdx.flatMap((i) => Array.from({ length: 10 }, () => ({ i, dx: rand(-0.4, 0.4), dz: rand(-0.3, 0.3), off: rand(0, 2) })));
    sparkGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Array(sparkSeed.length * 3).fill(0), 3));
    const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xfff08a, size: 0.07, transparent: true, opacity: 0.9 }));
    scene.add(sparks);
    // 天使の輪
    const halos: THREE.Mesh[] = [];

    idle = (f, p, t) => {
      const mood = run.sauners[p].mood;
      poseSit(f, 1.1);
      const o = p * 1.1;
      if (mood === "good") {
        f.torso.rotation.x = -0.5;
        f.head.rotation.x = -0.35 + Math.sin(t * 0.9 + o) * 0.06;
        f.head.rotation.z = Math.sin(t * 0.6 + o) * 0.1;
        f.armL.rotation.set(0.1, 0, -0.45);
        f.armR.rotation.set(0.1, 0, 0.45);
        f.elbowL.rotation.x = 0;
        f.elbowR.rotation.x = 0;
        f.root.position.y += Math.sin(t * 1.2 + o) * 0.04;
        tint(f, 0.15);
      } else if (mood === "mid") {
        f.torso.rotation.x = -0.4;
        f.head.rotation.x = Math.sin(t + o) * 0.1;
        tint(f, 0);
      } else {
        poseHug(f);
        f.torso.rotation.x = -0.1;
        f.head.rotation.y = Math.sin(t * 5 + o) * 0.35;
        f.kneeR.rotation.x = 1.1 + Math.abs(Math.sin(t * 8)) * 0.25;
        tint(f, 0.35);
      }
    };
    extra = (t) => {
      const attr = sparkGeo.getAttribute("position") as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      sparkSeed.forEach((s, k) => {
        const f = figs[s.i];
        if (!f) return;
        f.root.getWorldPosition(v);
        const life = ((t + s.off) % 2) / 2;
        attr.setXYZ(k, v.x + s.dx, v.y + 0.3 + life * 1.4, v.z + s.dz);
      });
      attr.needsUpdate = true;
      halos.forEach((h, i) => (h.rotation.z = t * 2 + i));
      stars.rotation.z = Math.sin(t * 0.1) * 0.005;
    };
    // 天使の輪は人を作った後に付ける
    afterFigs = () => {
      goodIdx.forEach((i) => {
        const f = figs[i];
        if (!f) return;
        const halo = new THREE.Mesh(
          new THREE.TorusGeometry(0.16, 0.025, 8, 24),
          new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffcc00, emissiveIntensity: 1.5 }),
        );
        halo.position.y = 0.6;
        halo.rotation.x = PI / 2;
        f.head.add(halo);
        halos.push(halo);
      });
    };
    camera.position.set(0, 3.6, 7.6);
    camera.lookAt(0, 0.8, 0);
  }

  // 人を配置（前のシーンで帰った人は出さない）
  run.sauners.forEach((s, p) => {
    const absent = (kind === "water" && s.leftAt === "sauna") || (kind === "outdoor" && s.leftAt !== null);
    if (absent) {
      figs.push(null);
      return;
    }
    const f = makeFigure(p);
    f.root.position.copy(bases[p].pos);
    scene.add(f.root);
    figs.push(f);
  });
  afterFigs();

  const tick = (e: number) => {
    const t = e / 1000;
    figs.forEach((f, p) => {
      if (!f) return;
      const b = bases[p];
      const lt = leaveT[p];
      if (lt !== null && e >= lt + WALKOUT_MS) {
        f.root.visible = false;
        return;
      }
      f.root.visible = true;
      f.root.position.copy(b.pos);
      if (lt !== null && e >= lt) {
        // 立ち上がって怒りながら退場
        const k = (e - lt) / WALKOUT_MS;
        if (k < 0.22) {
          const u = k / 0.22;
          resetPose(f);
          f.armL.rotation.z = -1.2 * u - Math.sin(t * 20) * 0.3;
          f.armR.rotation.z = 1.2 * u + Math.sin(t * 20) * 0.3;
          f.root.position.y = lerp(b.pos.y, b.standY, u);
          f.mouth.scale.y = 3;
        } else {
          const u = (k - 0.22) / 0.78;
          const u3 = Math.min(1, u * 3);
          poseWalk(f, t);
          f.root.rotation.y = PI / 2;
          f.root.position.set(b.pos.x + u * 9, lerp(b.standY, STAND_Y, u3) + Math.abs(Math.sin(t * 11)) * 0.05, lerp(b.pos.z, b.aisleZ, u3));
        }
        tint(f, kind === "water" ? -0.4 : 0.5);
        return;
      }
      idle(f, p, t);
      if (isTalking(p, e)) poseTalk(f, t);
    });
    steams.forEach((st) => {
      const y = st.y0 + ((t * st.speed) % st.h);
      st.s.position.set(st.x + Math.sin(t * 0.5 + st.y0) * 0.3, y, st.z);
    });
    extra(t, e);
  };

  const dispose = () => {
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Sprite) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
    });
  };

  return { scene, camera, figs, tick, dispose };
}

// 3Dシーンを開始する。戻り値の関数を呼ぶと、後片付け（停止・解放）をする。
// ※ three.js が重いので、page.tsx からは動的 import（必要になった時に読み込む）で呼ぶ。
export function startScene(opts: {
  mount: HTMLDivElement;
  kind: Scene;
  run: Run;
  getElapsed: () => number; // シーン開始からの経過ミリ秒
  getBubbles: () => (HTMLDivElement | null)[]; // 吹き出しの要素（人ごと）
}): () => void {
  const { mount, kind, run, getElapsed, getBubbles } = opts;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);
  const world = buildWorld(kind, run);

  // 画面が縦長（スマホ）になっても、横に見える範囲が変わらないよう、縦の視野角を広げる
  const BASE_ASPECT = 16 / 10;
  const baseFov = world.camera.fov;
  const halfWidth = Math.tan(THREE.MathUtils.degToRad(baseFov / 2)) * BASE_ASPECT;
  const resize = () => {
    const w = mount.clientWidth;
    const h = mount.clientHeight;
    const aspect = w / h;
    renderer.setSize(w, h);
    world.camera.aspect = aspect;
    world.camera.fov = aspect < BASE_ASPECT ? THREE.MathUtils.radToDeg(2 * Math.atan(halfWidth / aspect)) : baseFov;
    world.camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(mount);

  const v = new THREE.Vector3();
  let raf = 0;
  const loop = () => {
    world.tick(getElapsed());
    renderer.render(world.scene, world.camera);
    // 吹き出しを頭の上に追従させる
    const w = mount.clientWidth;
    const h = mount.clientHeight;
    const bubbles = getBubbles();
    const placedBubbles: { left: number; top: number; right: number; bottom: number }[] = [];
    world.figs.forEach((f, p) => {
      const el = bubbles[p];
      if (!el) return;
      if (!f || !f.root.visible) {
        el.style.display = "none";
        return;
      }
      el.style.display = "";
      f.head.getWorldPosition(v);
      v.y += 0.55;
      v.project(world.camera);
      const x = ((v.x + 1) / 2) * w;
      const y = ((1 - v.y) / 2) * h;
      const bubble = el.firstElementChild as HTMLElement | null;
      const bubbleWidth = bubble?.offsetWidth || 120;
      const bubbleHeight = bubble?.offsetHeight || 28;
      let lift = 0;
      // 縦画面で吹き出しが重なったら、先に表示された吹き出しの上へ積む。
      for (let attempt = 0; attempt < 4; attempt++) {
        const box = { left: x - bubbleWidth / 2, top: y - bubbleHeight - lift, right: x + bubbleWidth / 2, bottom: y - lift };
        const overlaps = placedBubbles.some((other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top);
        if (!overlaps) break;
        lift += bubbleHeight + 6;
      }
      placedBubbles.push({ left: x - bubbleWidth / 2, top: y - bubbleHeight - lift, right: x + bubbleWidth / 2, bottom: y - lift });
      el.style.transform = `translate(${x}px, ${y - lift}px) translate(-50%, -100%)`;
    });
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    world.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
  };
}
