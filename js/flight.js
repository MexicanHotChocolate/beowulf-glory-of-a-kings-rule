import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import {
  plateVert, plateFrag, threadVert, threadFrag, flatVert, snowVert, snowFrag, emberVert, emberFrag, veilFrag,
  breathFrag, sparkVert, skyVert, skyFrag, moteVert, moteFrag, scrimFrag, ashVert, ashFrag,
} from "./shaders.js";
import { Q } from "./quality.js";

/* ==========================================================================
   Block 3: the flight.
   The seven scenes hang in the sky, each at its own angle, and the camera
   travels between them the way the story moves. Every leg is a different
   move, never a slide:
     approach  down the braid, through the dusk, to the first painting
     01 -> 02  it tips down into the sea, turns under the water, comes up in Heorot
     02 -> 03  it banks through the tear in the fight
     03 -> 04  the warning crumbles to ash and the wind turns the camera round a corner
     04 -> 05  it tilts down and drops through a blizzard into the barrow
     05        it cranes up the barrow wall as the dragon comes into view
     05 -> 06  it spirals through the dragon's fire
     06 -> 07  it turns round through the smoke of the pyre
     end       it rises with the sparks and looks up into the Milky Way
   The sky is two photographs (dusk over the sea, then night), so every turn
   shows real space. Dust hangs in the air for depth. The gold and blue strands
   run beside the camera, drawn on just ahead of it.
   ========================================================================== */

export const UNIT_VH = 110;                    // scroll length of one unit (vh)
export const APPROACH = 100 / UNIT_VH;         // the section slides in from below first
const FOV = 30;

// [arrive, leave] for each scene, in units
const TIMES = [[0.95, 1.55], [2.15, 2.75], [3.25, 3.85], [4.45, 5.05], [5.65, 6.5], [7.0, 7.6], [8.2, 8.8]];
export const UNITS = 9.4;
export const arriveU = (k) => TIMES[k][0];
export const leaveU = (k) => TIMES[k][1];
const dwell = (k) => TIMES[k][1] - TIMES[k][0];

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const easeInOut = (t) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const rand = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const cr = (p0, p1, p2, p3, t) => {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

/* What hangs at each scene. Points in a painting are [across, up from the bottom] (0..1).
   tear:   the painting rips from top to bottom at this point across, and opens.
   ash:    the painting crumbles into ash as the camera leaves.
   grip:   where the gold strand loops (Beowulf's hand on Grendel).
   burn:   where the dragon's fire starts when its painting burns away.
   above:  this painting hangs above the scene's first one (by this many screen
           heights); "crane" says when, in the resting time, the camera rises to it.
   breath: the dragon's fire, from [mouth] to [target] in the upper painting.
   weapons: the real sword and shield of "I hereby renounce sword and the shelter
           of the broad shield", which drop into the sea as the camera dives.    */
export const STOPS = [
  { plates: [{ key: "sailing-to-daneland" }], weapons: true, into: "approach" },
  { plates: [{ key: "beowulf-and-grendel-bacon", tear: 0.6 }], grip: [0.76, 0.34, 0.55], into: "sea" },
  { plates: [{ key: "head-of-grendel", ash: true }], drift: 0.13, into: "rip" },
  { plates: [{ key: "barrow-in-winter" }], snow: true, mound: [0.42, 0.38, 0.4], into: "corner" },
  { plates: [{ key: "thief-steals-cup" }, { key: "dragon", above: 1.2, burn: [0.95, 0.85] }],
    embers: "dragon", crane: [0.4, 0.66], breath: [[1.04, 0.95], [0.56, 0.82]], into: "descend" },
  { plates: [{ key: "wiglaf" }], into: "burn" },
  { plates: [{ key: "funeral" }], embers: "funeral", into: "turn" },
];

// Where the subject of each painting is (0..1 across, 0..1 down from the top).
const FOCUS = {
  "sailing-to-daneland": [0.5, 0.45], "beowulf-and-grendel-bacon": [0.5, 0.4], "head-of-grendel": [0.5, 0.4], "barrow-in-winter": [0.55, 0.5],
  "thief-steals-cup": [0.5, 0.55], dragon: [0.5, 0.4], wiglaf: [0.5, 0.42], funeral: [0.42, 0.5],
};

/* How each painting moves. depth: how far it opens up into layers (from its depth
   map); sky: weather drifting in the far distance; fire: flames that breathe;
   glint: gold catching the light; hall: firelight flicker; water: [water line up
   from the bottom, right-hand limit, strength] for ripples and glints.        */
const LIFE = {
  "sailing-to-daneland": { depth: 0.24, sky: 0.9, water: [0.4, 1.1, 1.2] },
  "beowulf-and-grendel-bacon": { depth: 0.3 },
  "head-of-grendel": { depth: 0.32, sky: 1 },
  "barrow-in-winter": { depth: 0.26, sky: 0.8 },
  "thief-steals-cup": { depth: 0.22, glint: 1.6 },
  dragon: { depth: 0.24, fire: 1.2, sky: 0.3 },
  wiglaf: { depth: 0.22, sky: 0.8 },
  funeral: { depth: 0.22, fire: 1.3, water: [0.42, 0.55, 1] },
};

// How each scene's frame is turned (yaw, radians) relative to the one before.
const TURN = [0, 0.61, -0.5, -Math.PI / 2, 0, 0.45, 2.5];
const MARGIN = 0.05;                              // soft margin round each painting (fraction of its size)
const DUSK_FOG = new THREE.Color(0.08, 0.12, 0.22), NIGHT_FOG = new THREE.Color(0.025, 0.035, 0.06);

export class Flight {
  constructor(stage) {
    this.stage = stage;
    this.shared = { uDpr: { value: stage.dpr }, uFog: { value: DUSK_FOG.clone() } };
    this.u = -APPROACH;
    this.pre = 0;                                     // 0..1 down the braid, before the flight starts
    this.camZ = 0;
    this.ready = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 8, 90000);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);
    this.plates = [];
    this.threads = {};
    this.groups = STOPS.map(() => { const g = new THREE.Group(); this.scene.add(g); return g; });
    this.mouse = stage.mouse;
    this.tmp = new THREE.Vector3();
    this.euler = new THREE.Euler(0, 0, 0, "YXZ");
  }

  setDpr(dpr) { this.shared.uDpr.value = dpr; }

  async load() {
    const small = window.innerWidth < 700;
    const suffix = small ? "-1000" : Q.plates === "xl" ? "-xl" : "";
    const loader = new THREE.TextureLoader();
    const get = (url) => new Promise((res) => loader.load(url, res, undefined, () => res(null)));
    const defs = STOPS.flatMap((s) => s.plates);
    const big = Q.tier === "high";
    const [textures, depths, dusk, night] = await Promise.all([
      Promise.all(defs.map((def) => get(`assets/web/plates/${def.key}${suffix}.webp`))),
      Promise.all(defs.map((def) => (LIFE[def.key] ? get(`assets/web/depth/${def.key}.png`) : null))),
      get(`assets/web/sky/sky-dusk-${big ? "4k" : "2k"}.webp`),
      get(`assets/web/sky/sky-night-${big ? "6k" : "4k"}.webp`),
    ]);
    if (textures.some((t) => !t)) throw new Error("a painting failed to load");
    for (const t of [dusk, night]) {
      if (!t) continue;
      t.colorSpace = THREE.NoColorSpace;
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
      t.wrapS = THREE.RepeatWrapping;
    }
    this.duskTex = dusk;
    this.nightTex = night;
    const maxAniso = this.stage.renderer.capabilities.getMaxAnisotropy();
    const flat = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    flat.needsUpdate = true;
    const gx = Math.round(260 * Q.grid), gy = Math.round(260 * Q.grid);
    let i = 0;
    STOPS.forEach((stop, k) => {
      stop.plates.forEach((def, j) => {
        const tex = textures[i], depth = depths[i];
        i++;
        tex.colorSpace = THREE.NoColorSpace;
        tex.anisotropy = maxAniso;
        if (depth) {
          depth.colorSpace = THREE.NoColorSpace;
          depth.generateMipmaps = false;
          depth.minFilter = THREE.LinearFilter;
        }
        const life = LIFE[def.key] || {};
        const aspect = tex.image.width / tex.image.height;
        const uniforms = {
          uMap: { value: tex }, uVis: { value: 1 }, uDpr: this.shared.uDpr, uFog: this.shared.uFog, uFogAmt: { value: 0.85 },
          uImgA: { value: new THREE.Vector2(1, 1) }, uImgB: { value: new THREE.Vector2(0, 0) }, uFeather: { value: MARGIN / (1 - 2 * MARGIN) },
          uLocal: { value: new THREE.Matrix4() }, uGroup: { value: new THREE.Matrix4() },
          uBlur: { value: 0 }, uAsh: { value: 0 },
          uDepth: { value: depth || flat }, uDepthAmt: { value: depth ? life.depth || 0 : 0 }, uEye: { value: V(0, 0, 0) }, uLift: { value: 1 },
          uTime: { value: 0 }, uD: { value: 1000 }, uNear: { value: 1 }, uAspect: { value: aspect }, uSweep: { value: new THREE.Vector2(0, 1) },
          uLife: { value: V(life.sky || 0, life.fire || 0, life.glint || 0) },
          uWater: { value: V(...(life.water || [0, 0, 0])) },
          uHall: { value: new THREE.Vector2(life.hall || 0, aspect) },
          uBurn: { value: 0 }, uBurnFrom: { value: new THREE.Vector2(...(def.burn || [0, 0])) }, uRip: { value: 0 }, uOpen: { value: 0 },
          uFlare: { value: V(0, 0, 0) },
        };
        // Soft-edged, so they are drawn as see-through layers (back to front) over the sky.
        const mesh = new THREE.Mesh(
          depth ? new THREE.PlaneGeometry(1, 1, gx, gy) : new THREE.PlaneGeometry(1, 1),
          new THREE.ShaderMaterial({
            vertexShader: plateVert, fragmentShader: plateFrag, uniforms, transparent: true, premultipliedAlpha: true, depthWrite: true,
            defines: def.tear ? { TEAR: 1 } : {}, side: THREE.DoubleSide,
          }));
        mesh.frustumCulled = false;                    // the vertex shader moves everything
        mesh.renderOrder = 1;
        mesh.visible = false;
        this.groups[k].add(mesh);
        this.plates.push({ mesh, uniforms, stop: k, index: j, def, aspect, tex, depth });
      });
    });
    this.buildSky();
    this.buildMotes();
    this.buildFx();
    this.buildAsh();
    this.loadWeapons(0);
    this.ready = true;
    this.resize();
  }

  /* ---------------------------------------------------------------- the sky, dust, the shade behind the words */
  buildSky() {
    this.skyU = {
      uDusk: { value: this.duskTex }, uNight: { value: this.nightTex }, uMix: { value: 0 }, uTime: { value: 0 },
      uYawD: { value: 0.1 }, uYawN: { value: 0.16 }, uExpD: { value: 1 }, uExpN: { value: 1 },
    };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.ShaderMaterial({
      vertexShader: skyVert, fragmentShader: skyFrag, uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, depthTest: false,
    }));
    this.sky.renderOrder = -100;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    this.scrim = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      vertexShader: flatVert, fragmentShader: scrimFrag, transparent: true, premultipliedAlpha: true, depthWrite: false, depthTest: false,
      uniforms: { uAmt: { value: 0 }, uDir: { value: 0 } },
    }));
    this.scrim.renderOrder = 19;
    this.scrim.frustumCulled = false;
    this.camera.add(this.scrim);
  }

  buildMotes() {
    const N = Math.round(2600 * Math.max(0.5, Q.fx));
    const a = new Float32Array(N * 4);
    for (let i = 0; i < a.length; i++) a[i] = rand();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(a, 4));
    this.moteU = { uCam: { value: V(0, 0, 0) }, uBox: { value: 4000 }, uTime: { value: 0 }, uDpr: this.shared.uDpr, uD: { value: 1000 }, uAmt: { value: 0.7 } };
    this.motes = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: moteVert, fragmentShader: moteFrag, uniforms: this.moteU, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    }));
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 8;
    this.scene.add(this.motes);
  }

  /* "I hereby renounce sword": a real sword (Poly Haven's scanned antique estoc) hangs
     in the first scene, catching a sunset sky in its steel, and drops into the sea as you dive. */
  loadWeapons(stop) {
    const pmrem = new THREE.PMREMGenerator(this.stage.renderer);
    new RGBELoader().load("assets/web/env/venice-sunset-1k.hdr", (hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.environment = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();
    });
    this.weapons = { stop, group: new THREE.Group() };
    this.groups[stop].add(this.weapons.group);
    new GLTFLoader().load("assets/web/models/sword-estoc.glb", (g) => {
      const sword = g.scene;
      sword.traverse((o) => {
        if (!o.isMesh) return;
        if (o.material.map) o.material.map.colorSpace = THREE.NoColorSpace;   // this page writes plain sRGB values
        o.material.envMapIntensity = 1.5;
      });
      const holder = new THREE.Group();
      holder.add(sword);
      this.weapons.group.add(holder);
      this.weapons.sword = holder;
      this.weapons.swordModel = sword;
      this.placeWeapons();
    });
  }

  placeWeapons() {
    const w = this.weapons;
    if (!w || !this.L) return;
    const { W, H, D } = this.L;
    const zS = 0.5 * D, kS = (D - zS) / D;                 // how much nearer than the painting
    w.swordHome = V(-0.02 * W * kS, 0.03 * H * kS, zS);
    if (w.swordModel) w.swordModel.scale.setScalar((0.74 * H * kS) / 1.49);      // the model is 1.49 m long
  }

  updateWeapons(time) {
    const w = this.weapons;
    if (!w || !w.swordHome) return;
    const u = this.u, H = this.L.H, m = this.mouse;
    const drop = smooth(leaveU(w.stop) - 0.08, leaveU(w.stop) + 0.26, u);
    w.group.visible = drop < 0.999 && this.plates.some((p) => p.stop === w.stop && p.mesh.visible);
    if (w.sword) {
      w.sword.position.copy(w.swordHome);
      w.sword.position.y += -drop * drop * H * 1.3 + Math.sin(time * 0.9) * 4;
      w.sword.position.x -= drop * H * 0.1;
      w.sword.rotation.set(m.y * 0.1, time * 0.4 + m.x * 0.6, drop * 1.7 + Math.sin(time * 0.6) * 0.04);
    }
  }

  /* ---------------------------------------------------------------- layout */
  layout() {
    const W = this.W, H = this.H;
    const stacked = W < 700 || H > W * 1.15;
    const L = { stacked, W, H };
    L.D = H / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    L.r = stacked ? 4.3 : 5.5;                     // cord radius (px)
    const D = L.D;
    // Each scene's frame: yaw, and C, where the camera rests in front of it.
    const yaw = [], C = [];
    let psi = 0;
    for (let k = 0; k < STOPS.length; k++) { psi += TURN[k]; yaw.push(psi); }
    const b = (k) => this.basis(yaw[k]);
    C[0] = V(0, 0, D);
    C[1] = C[0].clone().addScaledVector(b(0).f, 3.0 * D).addScaledVector(b(0).r, -0.25 * W).add(V(0, -0.1 * H, 0));
    C[2] = C[1].clone().addScaledVector(b(1).f, 2.8 * D).addScaledVector(b(1).r, 0.15 * W);
    C[3] = C[2].clone().addScaledVector(b(2).r, 0.75 * D).addScaledVector(b(2).f, 0.35 * D);
    C[4] = C[3].clone().add(V(0, -2.6 * H, 0)).addScaledVector(b(3).f, 0.15 * D);
    C[5] = C[4].clone().add(V(0, 1.3 * H, 0)).addScaledVector(b(4).f, 2.7 * D).addScaledVector(b(4).r, -0.15 * W);
    C[6] = C[5].clone().addScaledVector(b(5).n, 0.35 * D).addScaledVector(b(5).r, -0.3 * D);
    L.yaw = yaw;
    L.P = C.map((c, k) => c.clone().addScaledVector(b(k).n, -D));
    this.groups.forEach((g, k) => {
      g.position.copy(L.P[k]);
      g.rotation.set(0, yaw[k], 0);
      g.updateMatrixWorld(true);
    });
    return L;
  }

  basis(psi) {
    return { n: V(Math.sin(psi), 0, Math.cos(psi)), r: V(Math.cos(psi), 0, -Math.sin(psi)), f: V(-Math.sin(psi), 0, -Math.cos(psi)) };
  }

  /* Scene k's local point -> the world. */
  toW(k, x, y, z) { return this.groups[k].localToWorld(V(x, y, z)); }

  /* Where a painting sits in its scene: wide ones cover the screen (with room for the
     camera to drift), tall ones stand full height on the right with the words beside them. */
  plateRect(p) {
    const { W, H, stacked } = this.L, a = p.aspect;
    let pw, ph, cx = 0, cy = 0;
    if (stacked) {
      pw = Math.min(0.92 * W, 0.6 * H * a); ph = pw / a; cy = 0.16 * H;
    } else if (a >= 1.1) {
      pw = Math.max(1.14 * W, 1.14 * H * a); ph = pw / a;
      const [fu] = FOCUS[p.def.key] || [0.5];
      const lim = (pw - 1.08 * W) / 2;
      cx = Math.max(-lim, Math.min(lim, (0.5 - fu) * pw + 0.1 * W));
    } else {
      ph = 1.1 * H; pw = ph * a; cx = W / 2 - pw / 2 + 0.03 * W;
    }
    if (p.def.above) cy += this.L.H * p.def.above;
    return { cx, cy, hw: pw / 2, hh: ph / 2, z: p.index > 0 ? 3 : 0 };
  }

  resize() {
    const W = (this.W = window.innerWidth);
    const H = (this.H = window.innerHeight);
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    if (!this.ready || W < 50 || H < 50) return;     // a hidden window has no size yet; it is laid out on the next resize
    const L = (this.L = this.layout());
    const D = L.D;
    this.braid = { x: -0.2 * W, z: L.P[0].z + 2.1 * D, top: 1.7 * H };
    for (const p of this.plates) {
      const r = (p.rect = this.plateRect(p));
      const U = p.uniforms;
      const s = 1 + 2 * MARGIN;
      p.mesh.scale.set(r.hw * 2 * s, r.hh * 2 * s, 1);
      p.mesh.position.set(r.cx, r.cy, r.z);
      p.mesh.updateMatrix();
      p.mesh.updateMatrixWorld(true);
      U.uLocal.value.copy(p.mesh.matrix);
      U.uGroup.value.copy(this.groups[p.stop].matrixWorld);
      U.uImgA.value.set(s, s);
      U.uImgB.value.set(-MARGIN, -MARGIN);
      U.uD.value = D;
      const crane = STOPS[p.stop].crane;
      U.uEye.value.copy(this.restPos(p.stop, crane ? (p.def.above ? 0.85 : 0.15) : 0.5));
      U.uSweep.value.set(0, 1);
      if (p.def.tear) {
        const x0 = (p.def.tear + MARGIN) / s - 0.5;               // the rip, in the plate's own units
        p.mesh.geometry.dispose();
        p.mesh.geometry = this.buildTear(x0);
        p.diveX = r.cx + x0 * 2 * r.hw * s;                       // the camera flies out through the rip (scene units)
      }
    }
    this.buildLegs();
    try { this.buildThreads(); } catch (err) { console.warn("strands skipped", err); }
    this.placeFx();
    this.placeWeapons();
    this.placeAsh();
    this.moteU.uD.value = D;
    this.moteU.uBox.value = 2.6 * D;
    this.scrim.position.set(0, 0, -0.28 * D);
    this.scrim.scale.set(0.28 * W * 1.02, 0.28 * H * 1.02, 1);
    this.scrim.material.uniforms.uDir.value = L.stacked ? 1 : 0;
    // the Milky Way's arch where the camera ends up looking at the very end
    const end = this.pose(UNITS, false);
    const f = V(0, 0, -1).applyEuler(this.euler.set(end.pitch, end.yaw, 0, "YXZ"));
    const lon = Math.atan2(f.x, -f.z);
    this.skyU.uYawN.value = 0.66 - 0.5 - lon / (Math.PI * 2);
  }

  /* Image point [across, up] -> the scene's local frame (lifted by depth d the same way
     the shader lifts it, so a strand can sit on something in a painting). */
  onPaintingLocal(p, iu, iv, d = 0) {
    const r = p.rect;
    const w = V(r.cx - r.hw + iu * 2 * r.hw, r.cy - r.hh + iv * 2 * r.hh, r.z);
    const eyeL = this.groups[p.stop].worldToLocal(p.uniforms.uEye.value.clone());
    return w.lerp(eyeL, d * p.uniforms.uDepthAmt.value);
  }

  onPainting(p, iu, iv, d = 0) { return this.groups[p.stop].localToWorld(this.onPaintingLocal(p, iu, iv, d)); }

  /* The fight painting in two halves that meet along a ragged rip ("sinews split,
     the bone-lappings burst"). Each half is a fine grid, so it keeps its depth. */
  buildTear(x0) {
    const rip = (y) => x0 + 0.018 * Math.sin(y * 9.0 + 0.7) + 0.011 * Math.sin(y * 23.0 + 1.9) + 0.005 * Math.sin(y * 61.0);
    const NS = Math.round(110 * Q.grid), NT = Math.round(200 * Q.grid);
    const pos = [], uv = [], tear = [], index = [];
    for (const side of [-1, 1]) {
      const base = pos.length / 3;
      for (let j = 0; j <= NT; j++) {
        const y = -0.5 + j / NT;
        const xr = rip(y);
        for (let i = 0; i <= NS; i++) {
          const x = side * 0.5 + (xr - side * 0.5) * (i / NS);
          pos.push(x, y, 0); uv.push(x + 0.5, y + 0.5); tear.push(side, Math.abs(x - xr));
        }
      }
      for (let j = 0; j < NT; j++) {
        for (let i = 0; i < NS; i++) {
          const a = base + j * (NS + 1) + i, b = a + NS + 1;
          index.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("aTear", new THREE.Float32BufferAttribute(tear, 2));
    g.setIndex(index);
    return g;
  }

  /* ---------------------------------------------------------------- the ash
     Hrothgar's painting coming apart into flakes that carry its colours. */
  buildAsh() {
    const p = this.plates.find((q) => q.def.ash);
    if (!p) return;
    const gx = Math.round(330 * Math.sqrt(Math.max(0.35, Q.fx))), gy = Math.round(gx / p.aspect);
    const N = gx * gy;
    const img = new Float32Array(N * 2), rnd = new Float32Array(N * 4);
    for (let j = 0, n = 0; j < gy; j++) {
      for (let i = 0; i < gx; i++, n++) {
        img[n * 2] = (i + 0.5 + (rand() - 0.5) * 0.8) / gx;
        img[n * 2 + 1] = (j + 0.5 + (rand() - 0.5) * 0.8) / gy;
        for (let c = 0; c < 4; c++) rnd[n * 4 + c] = rand();
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute("aImg", new THREE.BufferAttribute(img, 2));
    g.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 4));
    this.ashU = {
      uMap: { value: p.tex }, uDepth: { value: p.uniforms.uDepth.value }, uAsh: { value: 0 }, uDpr: this.shared.uDpr, uD: { value: 1000 },
      uDepthAmt: { value: p.uniforms.uDepthAmt.value }, uFlake: { value: 1 }, uTime: { value: 0 },
      uHalf: { value: new THREE.Vector2(1, 1) }, uCenter: { value: new THREE.Vector2() }, uEyeL: { value: V(0, 0, 0) }, uWind: { value: V(1, 0.2, 0.3) },
    };
    this.ash = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: ashVert, fragmentShader: ashFrag, uniforms: this.ashU, transparent: true, premultipliedAlpha: true, depthWrite: false,
    }));
    this.ash.frustumCulled = false;
    this.ash.renderOrder = 6;
    this.ash.visible = false;
    this.groups[p.stop].add(this.ash);
    this.ashPlate = p;
  }

  placeAsh() {
    const p = this.ashPlate;
    if (!p) return;
    const r = p.rect, D = this.L.D;
    const A = this.ashU;
    A.uHalf.value.set(r.hw, r.hh);
    A.uCenter.value.set(r.cx, r.cy);
    A.uEyeL.value.copy(this.groups[p.stop].worldToLocal(p.uniforms.uEye.value.clone()));
    A.uD.value = D;
    A.uFlake.value = (2 * r.hw) / Math.round(330 * Math.sqrt(Math.max(0.35, Q.fx))) * 0.9;
    // the wind blows toward the next scene, round the corner the camera is about to turn
    A.uWind.value.set(1.0, 0.18, 0.55);
  }

  /* ---------------------------------------------------------------- weather
     Snow at the winter barrow; the blizzard, the smoke and the light ash that carry the
     camera between scenes; sparks off the fire. */
  buildFx() {
    const seeds = (count) => {
      const a = new Float32Array(count * 4);
      for (let i = 0; i < a.length; i++) a[i] = rand();
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      g.setAttribute("aSeed", new THREE.BufferAttribute(a, 4));
      return g;
    };
    const points = (geo, mat, order) => {
      const o = new THREE.Points(geo, mat);
      o.frustumCulled = false;
      o.renderOrder = order;
      o.visible = false;
      return o;
    };
    const fx = Q.fx;
    const snowMat = (size, nearCut) => new THREE.ShaderMaterial({
      vertexShader: snowVert, fragmentShader: snowFrag, transparent: true, depthWrite: false,
      uniforms: {
        uBox: { value: V(1, 1, 1) }, uTime: { value: 0 }, uFall: { value: 0.055 }, uWind: { value: 0 }, uDrift: { value: new THREE.Vector2() },
        uRush: { value: 0 }, uDpr: this.shared.uDpr, uD: { value: 1000 }, uSize: { value: size }, uFade: { value: 0 },
        uNearCut: { value: nearCut }, uColor: { value: new THREE.Color(0.9, 0.93, 1.0) },
      },
    });
    this.snow = points(seeds(Math.round(2400 * fx)), snowMat(1, 0.05), 7);
    this.storm = points(seeds(Math.round(2600 * fx)), snowMat(1.3, 0.04), 21);
    this.veil = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      vertexShader: flatVert, fragmentShader: veilFrag, transparent: true, depthWrite: false, depthTest: false,
      uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uWind: { value: 0 }, uEdge: { value: -1 }, uDir: { value: new THREE.Vector2(1, 0) },
        uColor: { value: new THREE.Color() }, uColor2: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() } },
    }));
    this.veil.renderOrder = 20;
    this.veil.frustumCulled = false;
    this.veil.visible = false;
    this.groups[STOPS.findIndex((s) => s.snow)].add(this.snow);
    this.camera.add(this.storm, this.veil);
    const emberMat = () => new THREE.ShaderMaterial({
      vertexShader: emberVert, fragmentShader: emberFrag, transparent: true, depthWrite: false,
      // Added as light; leaves the layer's coverage alone so it composites cleanly.
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      uniforms: {
        uBox: { value: V(1, 1, 1) }, uTime: { value: 0 }, uRise: { value: 0 }, uDpr: this.shared.uDpr,
        uD: { value: 1000 }, uAmount: { value: 0 },
      },
    });
    this.embers = [];
    STOPS.forEach((s, k) => {
      if (!s.embers) return;
      const e = { stop: k, key: s.embers, obj: points(seeds(Math.round(520 * Math.max(0.6, fx))), emberMat(), 7), rise: rand() };
      this.groups[k].add(e.obj);
      this.embers.push(e);
    });
    // sparks swept along in the smoke of the pyre, attached to the camera
    this.smokeSparks = points(seeds(Math.round(420 * Math.max(0.6, fx))), emberMat(), 22);
    this.camera.add(this.smokeSparks);
    this.wind = 0; this.stormWind = 0; this.rush = 0; this.drift = new THREE.Vector2(); this.veilWind = 0; this.sparkRise = 0;

    this.breaths = [];
    STOPS.forEach((s, k) => {
      if (!s.breath) return;
      const additive = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
      const jet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
        vertexShader: flatVert, fragmentShader: breathFrag, transparent: true, depthWrite: false, ...additive,
        uniforms: { uTime: { value: 0 }, uAmount: { value: 0 } },
      }));
      jet.frustumCulled = false;
      jet.renderOrder = 7;
      jet.visible = false;
      const sparks = points(seeds(Math.round(700 * Math.max(0.6, fx))), new THREE.ShaderMaterial({
        vertexShader: sparkVert, fragmentShader: emberFrag, transparent: true, depthWrite: false, ...additive,
        uniforms: { uFrom: { value: V(0, 0, 0) }, uTo: { value: V(0, 0, 0) }, uTime: { value: 0 },
          uDpr: this.shared.uDpr, uD: { value: 1000 }, uAmount: { value: 0 } },
      }), 7);
      this.groups[k].add(jet, sparks);
      this.breaths.push({ stop: k, jet, sparks });
    });
  }

  placeFx() {
    const { W, H, D } = this.L;
    this.snow.position.set(0, 0, 0.46 * D);
    this.snow.material.uniforms.uBox.value.set(1.6 * W, 1.3 * H, 0.86 * D);
    this.storm.position.set(0, 0, -0.78 * D);
    this.storm.material.uniforms.uBox.value.set(2.4 * W, 1.8 * H, 1.45 * D);
    this.veil.position.set(0, 0, -0.3 * D);
    this.veil.scale.set(0.4 * W, 0.4 * H, 1);
    this.smokeSparks.position.set(0, 0, -0.9 * D);
    this.smokeSparks.material.uniforms.uBox.value.set(2.2 * W, 1.6 * H, 0.9 * D);
    this.smokeSparks.material.uniforms.uD.value = D;
    for (const o of [this.snow, this.storm]) o.material.uniforms.uD.value = D;
    for (const b of this.breaths) {
      const p = this.plates.find((q) => q.stop === b.stop && q.def.above);
      const [[mu, mv], [tu, tv]] = STOPS[b.stop].breath;
      const M = this.onPaintingLocal(p, mu, mv, 0.55), T = this.onPaintingLocal(p, tu, tv, 0.55);
      M.z += 30; T.z += 30;
      const dx = T.x - M.x, dy = T.y - M.y;
      b.jet.position.set((M.x + T.x) / 2, (M.y + T.y) / 2, (M.z + T.z) / 2);
      b.jet.scale.set(Math.hypot(dx, dy) * 1.1, H * 0.2, 1);
      b.jet.rotation.set(0, 0, Math.atan2(dy, dx));
      const SU = b.sparks.material.uniforms;
      SU.uFrom.value.copy(M); SU.uTo.value.copy(T); SU.uD.value = D;
      b.target = [tu, tv];
    }
    for (const e of this.embers) {
      const [x, y, w, h] = e.key === "dragon" ? [0.32 * W, 1.2 * H, 0.8 * W, 1.25 * H] : [-0.1 * W, -0.05 * H, 1.0 * W, 1.2 * H];
      e.obj.position.set(x, y, 0.24 * D);
      e.baseY = y;
      e.obj.material.uniforms.uBox.value.set(w, h, 0.42 * D);
      e.obj.material.uniforms.uD.value = D;
    }
  }

  updateFx(time, dt) {
    const u = this.u;
    const kSnow = STOPS.findIndex((s) => s.snow);
    const sv = smooth(arriveU(kSnow) - 0.35, arriveU(kSnow) - 0.05, u) * (1 - smooth(leaveU(kSnow) + 0.05, leaveU(kSnow) + 0.25, u));
    const S = this.snow.material.uniforms;
    this.wind += dt * 0.006;
    S.uTime.value = time; S.uWind.value = this.wind; S.uFade.value = sv;
    this.snow.visible = sv > 0.01;

    // Between scenes: what the camera travels through.
    const kAsh = STOPS.findIndex((s) => s.into === "corner") - 1;
    const kDown = STOPS.findIndex((s) => s.into === "descend") - 1;
    const kSmoke = STOPS.findIndex((s) => s.into === "turn") - 1;
    const bump = (k, a, b, c, d) => smooth(leaveU(k) + a, leaveU(k) + b, u) * (1 - smooth(arriveU(k + 1) - c, arriveU(k + 1) - d, u));
    const ashAir = bump(kAsh, 0.0, 0.14, 0.2, 0.04);
    const storm = bump(kDown, -0.04, 0.12, 0.2, 0.02);
    const smoke = bump(kSmoke, 0.0, 0.14, 0.2, 0.02);
    const dark = smooth(leaveU(kDown) + 0.22, leaveU(kDown) + 0.36, u) * (1 - smooth(arriveU(kDown + 1) - 0.16, arriveU(kDown + 1) - 0.01, u));

    const T = this.storm.material.uniforms;
    this.stormWind += dt * (0.1 + storm * 0.25);
    this.rush += dt * (0.08 + storm * 0.3);
    this.drift.y += dt * storm * 0.6;                     // dropping: the snow streams up past you
    T.uTime.value = time; T.uWind.value = this.stormWind; T.uRush.value = this.rush; T.uFade.value = storm;
    T.uDrift.value.copy(this.drift);
    this.storm.visible = storm > 0.01;

    const Z = this.veil.material.uniforms;
    this.veilWind += dt * (0.08 + 0.4 * Math.max(storm, ashAir, smoke));
    Z.uTime.value = time; Z.uWind.value = this.veilWind;
    if (smoke > 0.001) {
      Z.uAmt.value = Math.pow(smoke, 1.2) * 1.0;
      Z.uColor.value.setRGB(0.04, 0.035, 0.035); Z.uColor2.value.setRGB(0.42, 0.32, 0.26);
      Z.uGlow.value.setRGB(0.55, 0.2, 0.05);
      Z.uDir.value.set(-1, 0.15);                         // turning left: the smoke streams right to left... and the other way round
      Z.uEdge.value = 1.4 * smooth(0, 0.6, smoke) - 0.1;
    } else if (storm > 0.001) {
      Z.uAmt.value = Math.pow(storm, 1.5) * 0.9;
      const c = dark;
      Z.uColor.value.setRGB(0.55 - 0.53 * c, 0.6 - 0.57 * c, 0.72 - 0.67 * c);
      Z.uColor2.value.setRGB(0.82 - 0.76 * c, 0.86 - 0.8 * c, 0.95 - 0.88 * c);
      Z.uDir.value.set(0, 1);
      Z.uGlow.value.setRGB(0, 0, 0);
      Z.uEdge.value = -1;
    } else {
      Z.uAmt.value = ashAir * 0.3;
      Z.uColor.value.setRGB(0.35, 0.34, 0.33); Z.uColor2.value.setRGB(0.62, 0.6, 0.58);
      Z.uGlow.value.setRGB(0, 0, 0);
      Z.uDir.value.set(-1, 0);
      Z.uEdge.value = -1;
    }
    this.veil.visible = Z.uAmt.value > 0.004;

    this.sparkRise += dt * 0.25;
    const SS = this.smokeSparks.material.uniforms;
    SS.uTime.value = time; SS.uRise.value = this.sparkRise; SS.uAmount.value = smoke * 1.3;
    this.smokeSparks.visible = smoke > 0.01;

    if (this.ash) {
      const a = this.ashPlate.uniforms.uAsh.value;
      this.ashU.uAsh.value = a;
      this.ashU.uTime.value = time;
      this.ash.visible = a > 0.0 && a < 0.999;
    }

    for (const b of this.breaths) {
      // Once the camera has risen to it, the dragon breathes in bursts; it roars as the painting burns.
      const p = this.plates.find((q) => q.stop === b.stop && q.def.above);
      const c = STOPS[b.stop].crane, t = (u - arriveU(b.stop)) / dwell(b.stop);
      const up = smooth(c[1] - 0.12, c[1] + 0.06, t);
      const burn = p.uniforms.uBurn.value;
      const cyc = (time / 3.1) % 1;
      const breathe = 0.3 + 0.7 * smooth(0, 0.1, cyc) * (1 - smooth(0.6, 0.85, cyc));
      const amt = (p.mesh.visible ? 1 : 0) * up * Math.max(breathe * (1 - burn), 1.4 * Math.sin(Math.PI * Math.min(1, burn * 1.6)));
      b.jet.material.uniforms.uTime.value = time;
      b.jet.material.uniforms.uAmount.value = amt;
      b.jet.visible = amt > 0.01;
      const SU = b.sparks.material.uniforms;
      SU.uTime.value = time; SU.uAmount.value = amt;
      b.sparks.visible = amt > 0.01;
      p.uniforms.uFlare.value.set(b.target[0], b.target[1], amt * 0.9);
    }
    for (const e of this.embers) {
      const p = this.plates.find((q) => q.stop === e.stop && q.def.key === e.key);
      const v = p.mesh.visible ? 1 : 0;
      const b = p.uniforms.uBurn.value;
      // the funeral's sparks pour upward as the camera rises with them at the end
      const lift = e.key === "funeral" ? smooth(leaveU(e.stop) - 0.05, leaveU(e.stop) + 0.25, u) : 0;
      const amt = Math.max(v * (0.6 * (1 - b) + 1.9 * Math.sin(Math.PI * b)), lift * 1.6);
      e.rise += dt * (0.09 + 0.3 * b + 0.35 * lift);
      e.obj.scale.set(1, 1 + lift * 3.2, 1);
      e.obj.position.y = e.baseY + lift * this.L.H * 1.4;
      const E = e.obj.material.uniforms;
      E.uTime.value = time; E.uRise.value = e.rise; E.uAmount.value = amt;
      e.obj.visible = amt > 0.01;
    }
  }

  /* ---------------------------------------------------------------- the camera
     Resting: a slow drift and push-in, so the painting opens up in layers.
     Travelling: each leg is a few keyframes (where, and how the camera is turned),
     joined by smooth curves. */
  restLocal(k, t) {
    const { W, H, D } = this.L;
    const side = k % 2 ? 1 : -1;
    const c = STOPS[k].crane, up = STOPS[k].plates.find((p) => p.above);
    const lift = c && up ? smooth(c[0], c[1], t) * H * (up.above + 0.1) : 0;   // rises to the painting above
    const drift = STOPS[k].drift || 0.05;
    return V(side * (t - 0.5) * W * drift, 0.02 * H - t * 0.03 * H + lift, D * (1 - 0.14 * t));
  }

  restPos(k, t) { const l = this.restLocal(k, t); return this.toW(k, l.x, l.y, l.z); }

  /* While craning up, the camera tips back to look up at what is coming. */
  craneTilt(k, t) {
    const c = STOPS[k].crane;
    return c ? Math.sin(Math.PI * clamp01((t - c[0]) / (c[1] - c[0]))) * 0.12 : 0;
  }

  buildLegs() {
    const { W, H, D, yaw } = this.L;
    const b = (k) => this.basis(yaw[k]);
    const R = (k, t) => this.restPos(k, t);
    const key = (s, pos, yw, pitch = 0, roll = 0) => ({ s, pos, yaw: yw, pitch, roll });
    this.legs = [];
    for (let k = 0; k < STOPS.length - 1; k++) {
      const into = STOPS[k + 1].into, a = R(k, 1), z = R(k + 1, 0), y0 = yaw[k], y1 = yaw[k + 1];
      let keys;
      if (into === "sea") {
        // Tips down toward the water, goes under, turns while under the sea, comes up facing Heorot.
        const dive = this.toW(k, 0.02 * W, -0.42 * H, 0.42 * D);
        const deep = dive.clone().lerp(z.clone().add(V(0, -0.55 * H, 0)), 0.55);
        keys = [key(0, a, y0), key(0.3, dive, y0 + 0.04, -0.5, 0.02), key(0.64, deep, y0 + (y1 - y0) * 0.62, -0.1, 0.08), key(1, z, y1)];
      } else if (into === "rip") {
        // Through the rip in the fight, banking with the turn.
        const p = this.plates.find((q) => q.stop === k && q.def.tear);
        const dx = p ? p.diveX : 0;
        keys = [key(0, a, y0), key(0.42, this.toW(k, dx * 0.85, 0.02 * H, 0.18 * D), y0 - 0.06, 0, -0.1),
          key(0.64, this.toW(k, dx * 0.6, 0, -0.45 * D), y0 + (y1 - y0) * 0.55, 0.02, -0.17), key(1, z, y1)];
      } else if (into === "corner") {
        // Round a corner with the wind: a quarter turn to the right.
        const m1 = a.clone().addScaledVector(b(k).r, 0.2 * D).addScaledVector(b(k).n, 0.1 * D);
        const m2 = a.clone().lerp(z, 0.62).addScaledVector(b(k).n, 0.06 * D);
        keys = [key(0, a, y0), key(0.34, m1, y0 - 0.42, 0.02, -0.06), key(0.66, m2, y0 + (y1 - y0) * 0.84, 0.02, -0.05), key(1, z, y1)];
      } else if (into === "descend") {
        // Tilts down into the drop, falls through the blizzard, levels out at the hoard.
        const m1 = a.clone().add(V(0, -0.25 * H, 0)).addScaledVector(b(k).f, 0.1 * D);
        const m2 = a.clone().lerp(z, 0.62).addScaledVector(b(k).f, 0.05 * D);
        const m3 = z.clone().add(V(0, 0.25 * H, 0));
        keys = [key(0, a, y0), key(0.24, m1, y0, -0.95), key(0.6, m2, y0, -1.15, 0.03), key(0.86, m3, y1, -0.3), key(1, z, y1)];
      } else if (into === "burn") {
        // Spirals through the hole the fire leaves in the dragon painting.
        const p = this.plates.find((q) => q.stop === k && q.def.above);
        const cx = p.rect.cx * 0.7, cy = p.rect.cy;
        keys = [key(0, a, y0), key(0.38, this.toW(k, cx, cy, 0.22 * D), y0 + 0.05, 0, 0.24),
          key(0.62, this.toW(k, cx * 0.7, cy, -0.55 * D), y0 + (y1 - y0) * 0.55, 0, 0.44), key(1, z, y1)];
      } else {
        // Turns round through the smoke to the pyre behind.
        const m1 = a.clone().addScaledVector(b(k).n, 0.3 * D).addScaledVector(b(k).r, -0.15 * D);
        const m2 = m1.clone().lerp(z, 0.5).addScaledVector(b(k).n, 0.1 * D);
        keys = [key(0, a, y0), key(0.4, m1, y0 + 0.9, 0.02, 0.06), key(0.7, m2, y0 + (y1 - y0) * 0.78, 0.02, 0.04), key(1, z, y1)];
      }
      this.legs.push({ keys, curve: new THREE.CatmullRomCurve3(keys.map((q) => q.pos), false, "centripetal") });
    }
  }

  legPose(k, s) {
    const { keys, curve } = this.legs[k];
    const e = easeInOut(s);
    let i = 0;
    while (i < keys.length - 2 && e > keys[i + 1].s) i++;
    const f = clamp01((e - keys[i].s) / (keys[i + 1].s - keys[i].s));
    const t = (i + f) / (keys.length - 1);
    const pick = (name) => cr(keys[Math.max(0, i - 1)][name], keys[i][name], keys[i + 1][name], keys[Math.min(keys.length - 1, i + 2)][name], f);
    return { pos: curve.getPoint(t), yaw: pick("yaw"), pitch: pick("pitch"), roll: pick("roll") };
  }

  /* The camera at scroll position u: where it is and how it is turned. */
  pose(u, now = true) {
    const L = this.L, D = L.D, H = L.H;
    const n = STOPS.length;
    if (now && this.inPre()) {
      // Following the braid down through the dusk: starts right up against it, backs off, sinks.
      const p = this.pre, B = this.braid;
      const zd = p < 0.35 ? 0.035 + 0.465 * smooth(0, 0.35, p) : 0.5 + 0.5 * smooth(0.62, 1, p);
      return {
        pos: V(B.x * (1 - smooth(0.55, 1, p)), B.top + (0.02 * H - B.top) * easeInOut(p), B.z + D * zd),
        yaw: 0, pitch: -0.1 * smooth(0.3, 0.7, p) * (1 - smooth(0.8, 1, p)),
        // Rolled to line up with the woven border the opening dives into, then straightens.
        roll: -1.13 * (1 - smooth(0.02, 0.32, p)),
      };
    }
    if (u < arriveU(0)) {
      const t = easeInOut((u + APPROACH) / (arriveU(0) + APPROACH));
      const r0 = this.restPos(0, 0);
      return { pos: V(r0.x * t, r0.y, L.P[0].z + D * (3.1 - 2.1 * t)), yaw: 0, pitch: 0, roll: 0 };
    }
    for (let k = 0; k < n; k++) {
      if (u <= leaveU(k)) {
        const t = (u - arriveU(k)) / dwell(k);
        return { pos: this.restPos(k, t), yaw: L.yaw[k], pitch: this.craneTilt(k, t), roll: 0 };
      }
      if (k < n - 1 && u <= arriveU(k + 1)) return this.legPose(k, (u - leaveU(k)) / (arriveU(k + 1) - leaveU(k)));
    }
    // The end: rise off the funeral with the sparks and look up into the Milky Way.
    const t = easeInOut((u - leaveU(n - 1)) / (UNITS - leaveU(n - 1)));
    const s = this.restPos(n - 1, 1);
    return { pos: s.add(V(0, t * 2.6 * H, 0)).addScaledVector(this.basis(L.yaw[n - 1]).f, -t * 0.2 * D), yaw: L.yaw[n - 1], pitch: 1.0 * smooth(0, 0.85, t), roll: 0 };
  }

  /* ---------------------------------------------------------------- threads
     The gold strand (the warrior) and the blue one (the leader). Every point
     carries the scroll position at which it is drawn, so the strands are drawn
     on just ahead of the camera whichever way it is going. */
  buildThreads() {
    const { W, H, D } = this.L;
    const gold = [], blue = [];
    const add = (list, pts, u0, u1) => {
      let total = 0;
      const acc = [0];
      for (let i = 1; i < pts.length; i++) { total += pts[i].distanceTo(pts[i - 1]); acc.push(total); }
      pts.forEach((p, i) => list.push({ p, u: u0 + (u1 - u0) * (total > 0 ? acc[i] / total : 1) }));
    };
    const loc = (k, pts) => pts.map((p) => this.groups[k].localToWorld(p));
    const rectOf = (k) => this.plates.find((p) => p.stop === k && !p.def.above).rect;
    // Beside the camera all the way along a leg: the two strands spiral round the edge of the
    // view, a little ahead of it, so they frame the move and never cross the middle.
    const rail = (k, phase, turns = 0.65, n = 34) => {
      const pts = [], tags = [];
      const half = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      for (let i = 0; i <= n; i++) {
        const s = i / n, q = this.legPose(k, s);
        this.euler.set(q.pitch, q.yaw, q.roll, "YXZ");
        const f = V(0, 0, -1).applyEuler(this.euler), r = V(1, 0, 0).applyEuler(this.euler), up = V(0, 1, 0).applyEuler(this.euler);
        const ahead = 0.85 * D, hh = ahead * half, hw = hh * (W / H);
        const th = phase + s * turns * Math.PI * 2;
        pts.push(q.pos.clone().addScaledVector(f, ahead).addScaledVector(r, Math.cos(th) * hw * 0.9).addScaledVector(up, Math.sin(th) * hh * 0.84));
      }
      return pts;
    };
    // Stitch through a painting: in front across one side, through it, out the back.
    const stitch = (r, flip) => {
      const s = flip ? -1 : 1;
      return [
        V(r.cx - s * (r.hw + 0.05 * W), r.cy + r.hh + 0.08 * H, r.z + 140),
        V(r.cx - s * r.hw * 0.35, r.cy + r.hh * 0.4, r.z + 80),
        V(r.cx + s * r.hw * 0.25, r.cy - r.hh * 0.05, r.z - 70),
        V(r.cx + s * (r.hw * 0.6), r.cy - r.hh * 0.55, r.z - 0.18 * D),
      ];
    };
    const legU = (k, s) => leaveU(k) + (arriveU(k + 1) - leaveU(k)) * s;

    // The braid. The opening dives into the woven gold-and-blue border of the hall
    // hanging; that border becomes these two real cords, twisted round each other, and
    // the camera follows the braid down through the dusk. At the bottom it comes apart:
    // gold leads on into the first painting, blue drops away and comes back at passage 03.
    const R0 = rectOf(0);
    const B = this.braid;
    const pre = -APPROACH - 0.001;
    {
      const rB = this.L.r * 1.3, pitch = this.L.r * 15;
      const yTop = B.top + 1.2 * H, steps = Math.ceil(yTop / (pitch / 9));
      const g = [], bl = [];
      for (let i = 0; i <= steps; i++) {
        const y = yTop * (1 - i / steps), th = (y / pitch) * Math.PI * 2;
        g.push(V(B.x + rB * Math.cos(th), y, B.z + rB * Math.sin(th)));
        bl.push(V(B.x - rB * Math.cos(th), y, B.z - rB * Math.sin(th)));
      }
      add(gold, g, pre, pre);
      add(blue, bl, pre, pre);
      add(gold, [V(B.x - 0.05 * W, -0.12 * H, B.z - 0.25 * D), V(-0.38 * W, 0.16 * H, this.L.P[0].z + 1.3 * D)], -APPROACH, arriveU(0) - 0.35);
      // blue drops away below the view and comes up behind passage 03
      const behind2 = this.toW(2, rectOf(2).cx + rectOf(2).hw * 0.1, -0.3 * H, -0.4 * D);
      add(blue, [V(B.x + 0.06 * W, -0.3 * H, B.z - 0.06 * D), V(B.x + 0.2 * W, -0.9 * H, B.z - 0.25 * D),
        V(0.6 * W, -2.0 * H, this.L.P[0].z + 0.4 * D), behind2.clone().add(V(0, -1.6 * H, 0)), behind2], -APPROACH, arriveU(2) - 0.3);
    }

    // 01, then under the sea
    add(gold, loc(0, stitch(R0, false)), arriveU(0) - 0.3, leaveU(0) - 0.1);
    add(gold, rail(0, Math.PI * 0.9), legU(0, -0.25), legU(0, 0.9));

    // 02: gold loops round Beowulf's hand where it grips Grendel's head.
    {
      const r = rectOf(1);
      const fp = this.plates.find((p) => p.stop === 1);
      const grip = this.onPaintingLocal(fp, ...STOPS[1].grip);
      const cx = grip.x, cy = grip.y, cz = grip.z;
      const rad = Math.max(30, r.hh * 0.1);
      const pts = [V(r.cx - r.hw - 0.04 * W, r.cy + r.hh + 0.08 * H, cz + 140), V(cx - rad * 1.8, cy + rad * 1.6, cz + 70)];
      for (let i = 0; i <= 14; i++) {
        const a = Math.PI * 0.75 - (i / 14) * Math.PI * 2.1;
        pts.push(V(cx + rad * Math.cos(a), cy + rad * Math.sin(a), cz + 30 + 60 * Math.sin(a)));
      }
      pts.push(V(r.cx + r.hw * 0.4, r.cy - r.hh * 0.45, r.z - 70), V(r.cx + r.hw * 0.7, r.cy - r.hh * 0.7, r.z - 0.18 * D));
      add(gold, loc(1, pts), arriveU(1) - 0.06, leaveU(1) - 0.1);
    }
    add(gold, rail(1, Math.PI * 1.1), legU(1, -0.25), legU(1, 0.9));

    // 03: gold stitches the other way; blue comes up through the painting from behind.
    {
      const r = rectOf(2);
      add(gold, loc(2, stitch(r, true)), arriveU(2) - 0.06, leaveU(2) - 0.1);
      add(blue, loc(2, [V(r.cx + r.hw * 0.05, r.cy + r.hh * 0.05, r.z - 0.3 * D), V(r.cx + r.hw * 0.42, r.cy - r.hh * 0.36, r.z + 90),
        V(r.cx + r.hw * 0.7, r.cy - r.hh * 0.75, r.z + 30), V(r.cx + r.hw * 0.3, r.cy - r.hh * 0.85, r.z - 0.2 * D)]), arriveU(2) - 0.16, leaveU(2) - 0.1);
    }
    add(gold, rail(2, Math.PI * 0.85, 0.5), legU(2, -0.2), legU(2, 0.9));
    add(blue, rail(2, Math.PI * 1.85, 0.5), legU(2, -0.2), legU(2, 0.9));

    // 04: braided tight into a ring round the old grave mound in the snow.
    {
      const bp = this.plates.find((p) => p.def.key === "barrow-in-winter");
      const mound = this.onPaintingLocal(bp, ...STOPS[3].mound);
      const eye = this.groups[3].worldToLocal(bp.uniforms.uEye.value.clone());
      const f = (eye.z - mound.z - 160) / (eye.z - mound.z);
      const ring = { x: eye.x + (mound.x - eye.x) * f, y: eye.y + (mound.y - eye.y) * f - H * 0.02, z: mound.z + 160, rx: W * 0.09 * f, ry: H * 0.045 * f, rz: 80 };
      const ringPoint = (phi) => V(ring.x + ring.rx * Math.cos(phi), ring.y + ring.ry * Math.sin(phi), ring.z + ring.rz * Math.cos(phi));
      const startPhi = Math.PI / 2 + 0.6;
      const under = V(ring.x - 0.02 * W, ring.y + 0.03 * H, -0.06 * D);
      const g = [under.clone(), ringPoint(startPhi).add(V(0, 60, 180))], bl = [under.clone().add(V(24, 18, 0)), ringPoint(startPhi).add(V(30, 80, 200))];
      const n = 90, turns = 1.08, twists = 9, rad = 11;
      for (let i = 1; i <= n; i++) {
        const phi = startPhi - (i / n) * turns * Math.PI * 2;
        const p = ringPoint(phi);
        const radial = V(Math.cos(phi), Math.sin(phi), 0.4 * Math.cos(phi)).normalize();
        const a = (i / n) * twists * Math.PI * 2;
        g.push(p.clone().addScaledVector(radial, Math.cos(a) * rad).add(V(0, 0, Math.sin(a) * rad)));
        bl.push(p.clone().addScaledVector(radial, -Math.cos(a) * rad).add(V(0, 0, -Math.sin(a) * rad)));
      }
      const r = rectOf(3);
      g.push(V(r.cx + r.hw * 0.3, r.cy - r.hh * 0.8, -0.2 * D));
      bl.push(V(r.cx + r.hw * 0.36, r.cy - r.hh * 0.75, -0.22 * D));
      add(gold, loc(3, g), arriveU(3) - 0.08, leaveU(3) - 0.08);
      add(blue, loc(3, bl), arriveU(3) - 0.08, leaveU(3) - 0.08);
    }
    add(gold, rail(3, Math.PI * 0.6, 0.9), legU(3, -0.15), legU(3, 0.92));
    add(blue, rail(3, Math.PI * 1.6, 0.9), legU(3, -0.15), legU(3, 0.92));

    // 05: the strands pull apart: gold yanked forward and left, blue back and right.
    {
      const r = rectOf(4);
      add(gold, loc(4, [V(r.cx - r.hw * 0.6, r.cy + r.hh + 0.06 * H, r.z + 140), V(r.cx - r.hw * 0.15, r.cy + r.hh * 0.25, r.z + 70),
        V(r.cx - r.hw * 0.1, r.cy - r.hh * 1.08, r.z + 150), V(-0.62 * W, r.cy - r.hh * 1.7, r.z + 0.45 * D),
        V(-0.3 * W, r.cy - r.hh * 0.4, r.z - 0.25 * D), V(-1.0 * W, 0.7 * H, -0.3 * D), V(-0.85 * W, 1.4 * H, -0.36 * D)]), arriveU(4) - 0.06, leaveU(4) - 0.13);
      add(blue, loc(4, [V(r.cx + r.hw * 0.6, r.cy + r.hh + 0.05 * H, r.z + 60), V(r.cx + r.hw * 0.3, r.cy + r.hh * 0.1, r.z - 90),
        V(0.72 * W, r.cy - r.hh * 0.35, r.z - 0.3 * D), V(1.0 * W, 0.8 * H, -0.3 * D), V(0.6 * W, 1.8 * H, -0.38 * D)]), arriveU(4) - 0.06, leaveU(4) - 0.13);
    }
    add(gold, rail(4, Math.PI * 1.0, 0.8), legU(4, -0.1), legU(4, 0.9));
    add(blue, rail(4, Math.PI * 2.0, 0.8), legU(4, -0.1), legU(4, 0.9));

    // 06: gold reaches Wiglaf and snaps. Blue carries on alone.
    {
      const r = rectOf(5);
      add(gold, loc(5, [V(r.cx - r.hw - 0.03 * W, r.cy + r.hh + 0.07 * H, r.z + 140), V(r.cx - r.hw * 0.5, r.cy + r.hh * 0.36, r.z + 70),
        V(r.cx - r.hw * 0.22, r.cy + r.hh * 0.12, r.z + 60), V(r.cx - r.hw * 0.3, r.cy - r.hh * 0.14, r.z + 80)]), arriveU(5) - 0.04, leaveU(5) - 0.15);
      add(blue, loc(5, [V(r.cx + r.hw * 0.35, r.cy + r.hh + 0.06 * H, r.z + 120), V(r.cx + r.hw * 0.55, r.cy + r.hh * 0.05, r.z + 70),
        V(r.cx + r.hw * 0.75, r.cy - r.hh * 0.6, r.z - 40), V(r.cx + r.hw * 0.2, r.cy - r.hh * 0.9, r.z - 0.25 * D)]), arriveU(5) - 0.04, leaveU(5) - 0.1);
    }
    // 07: round through the smoke to the funeral, then up with the sparks into the night.
    add(blue, rail(5, Math.PI * 1.3, 0.6), legU(5, -0.1), legU(5, 0.92));
    {
      const r = rectOf(6);
      add(blue, loc(6, [V(r.cx + r.hw * 0.2, r.cy - r.hh * 0.3, r.z + 90), V(r.cx - r.hw * 0.1, r.cy + r.hh * 0.2, r.z + 60),
        V(-0.3 * W, 0.6 * H, 0.3 * D), V(-0.34 * W, 1.5 * H, 0.22 * D), V(-0.3 * W, 2.6 * H, 0.12 * D), V(-0.26 * W, 3.8 * H, -0.2 * D)]),
        arriveU(6) - 0.04, UNITS - 0.05);
    }

    this.makeThread("gold", gold, { color: [0.86, 0.65, 0.29], shadow: [0.42, 0.26, 0.08], metal: 1.0, fray: true });
    this.makeThread("blue", blue, { color: [0.72, 0.8, 1.0], shadow: [0.2, 0.3, 0.68], metal: 0.25, fray: false });
  }

  makeThread(name, list, opt) {
    const old = this.threads[name];
    if (old) { old.mesh.geometry.dispose(); this.scene.remove(old.mesh); delete this.threads[name]; }
    list = list.filter((q, i) => Number.isFinite(q.p.x + q.p.y + q.p.z + q.u) && (i === 0 || q.p.distanceToSquared(list[i - 1].p) > 1e-6));
    const pts = list.map((q) => q.p);
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    const length = curve.getLength();
    if (!(length > 1)) return;
    const segs = Math.min(7000, Math.ceil(length / 7));
    const geo = new THREE.TubeGeometry(curve, segs, this.L.r * 0.85, Q.tier === "low" ? 10 : 16, false);
    const uniforms = {
      uColor: { value: V(...opt.color) },
      uShadow: { value: V(...opt.shadow) },
      uReveal: { value: 0 },
      uLength: { value: length },
      uFray: { value: opt.fray ? 1 - 210 / length : 2 },
      uMetal: { value: opt.metal },
      uDimU: { value: -1 }, uNearFade: { value: 0.32 * this.L.D },
      uFog: this.shared.uFog, uD: { value: this.L.D },
    };
    const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: threadVert, fragmentShader: threadFrag, uniforms }));
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    this.scene.add(mesh);
    // Evenly spaced samples along the strand: height (for the braid) and draw time (for the flight).
    const N = 3000;
    const ys = new Float32Array(N + 1), zs = new Float32Array(N + 1), tags = new Float32Array(N + 1);
    let maxTag = -Infinity;
    for (let i = 0; i <= N; i++) {
      const s = i / N, t = curve.getUtoTmapping(s);
      const p = curve.getPoint(t);
      ys[i] = p.y; zs[i] = p.z;
      const f = t * (list.length - 1), k = Math.min(list.length - 2, Math.floor(f));
      const tag = list[k].u + (list[k + 1].u - list[k].u) * (f - k);
      maxTag = Math.max(maxTag, tag);          // never earlier than what comes before it
      tags[i] = maxTag;
    }
    let bi = 0;
    while (bi < N && tags[bi + 1] <= -APPROACH - 0.0005) bi++;
    this.threads[name] = { mesh, uniforms, ys, zs, tags, reveal: 0, braidEnd: bi / N };
    if (opt.fray) this.makeFibres(curve, opt);
  }

  /* A few loose fibres where the gold strand snapped. */
  makeFibres(curve, opt) {
    for (const f of this.fibres || []) { f.mesh.geometry.dispose(); this.scene.remove(f.mesh); }
    this.fibres = [];
    const end = curve.getPointAt(1), tan = curve.getTangentAt(1);
    [-0.9, -0.45, 0.1, 0.55, 1.0].forEach((a, i) => {
      const len = 46 + (i % 3) * 22;
      const dir = V(tan.x * Math.cos(a) - tan.y * Math.sin(a), tan.x * Math.sin(a) + tan.y * Math.cos(a), tan.z + (i - 2) * 0.15).normalize();
      const side = V(-dir.y, dir.x, 0).normalize();
      const pts = [end.clone().addScaledVector(tan, -14)];
      for (let j = 1; j <= 4; j++) {
        const t = j / 4;
        pts.push(end.clone().addScaledVector(dir, len * t).addScaledVector(side, Math.sin(t * 3 + i) * 7 * t));
      }
      const c = new THREE.CatmullRomCurve3(pts);
      const uniforms = {
        uColor: { value: V(...opt.color) }, uShadow: { value: V(...opt.shadow) },
        uReveal: { value: 0 }, uLength: { value: c.getLength() }, uFray: { value: 2 }, uMetal: { value: opt.metal }, uDimU: { value: -1 },
      };
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(c, 24, 1.3, 6, false),
        new THREE.ShaderMaterial({ vertexShader: threadVert, fragmentShader: threadFrag, uniforms }));
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.fibres.push({ mesh, uniforms });
    });
  }

  /* How much of a strand is drawn: down the braid by height; after that by draw time. */
  revealFor(thread, pre, cam) {
    const { ys, zs, tags } = thread, N = tags.length - 1;
    if (pre) {
      const D = this.L.D;
      const yCut = cam.y - 0.55 * this.L.H, zCut = this.braid.z - 0.05 * D - smooth(0.6, 1, this.pre) * 1.25 * D;
      const lim = Math.floor(thread.braidEnd * N);
      for (let i = 0; i <= lim; i++) if (ys[i] < yCut || zs[i] < zCut) return i / N;
      return lim / N;
    }
    const target = this.u + 0.04;
    let lo = 0, hi = N;
    while (lo < hi) {                                  // first sample drawn later than now
      const mid = (lo + hi) >> 1;
      if (tags[mid] <= target) lo = mid + 1; else hi = mid;
    }
    return Math.max(thread.braidEnd, lo / N);
  }

  /* ---------------------------------------------------------------- timing */
  setProgress(p) { this.u = p * (UNITS + APPROACH) - APPROACH; }
  setPre(p) { this.pre = p; }
  inPre() { return this.pre < 1 && this.u <= -APPROACH + 1e-4; }

  isActive() { return this.ready && (this.pre > 0.002 || this.u > -APPROACH + 0.01) && this.u < UNITS - 0.002; }

  /* For the sea crossing in the composite: 0..1 while it is under way, 0 otherwise. */
  sea() {
    const k = STOPS.findIndex((s) => s.into === "sea") - 1;
    const a = leaveU(k) - 0.02, b = arriveU(k + 1) - 0.04;
    return this.u <= a || this.u >= b ? 0 : (this.u - a) / (b - a);
  }

  /* The map's sky: the night sky seen from where the flight ends (for the composite). */
  endView() {
    const q = this.pose(UNITS, false);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(q.pitch, q.yaw, 0, "YXZ"));
    return { basis: new THREE.Matrix3().setFromMatrix4(m), yaw: this.skyU.uYawN.value };
  }

  stopOpacity(k) {
    const u = this.u;
    return smooth(arriveU(k) - 0.2, arriveU(k) + 0.02, u) * (1 - smooth(leaveU(k) - 0.04, leaveU(k) + 0.08, u));
  }

  activeStop() {
    for (let k = 0; k < STOPS.length; k++) if (this.u >= arriveU(k) - 0.3 && this.u < leaveU(k) + 0.2) return k;
    return -1;
  }

  /* Which scene the camera is at or flying out of. */
  current() {
    const u = this.u;
    for (let k = 0; k < STOPS.length; k++) if (u < leaveU(k)) return k;
    return STOPS.length - 1;
  }

  /* Where scene k's words should sit so they move with their painting: a point just in
     front of the painting, projected through the real camera, against where it sits
     when the camera is at rest. Returns screen pixels from the middle and a scale. */
  textOffset(k) {
    if (!this.L) return null;
    const t = clamp01((this.u - arriveU(k)) / dwell(k));
    const l = this.restLocal(k, t), D = this.L.D;
    const P = this.toW(k, l.x, l.y, 0.34 * D);
    const zr = l.z - 0.34 * D;
    const v = P.clone().applyMatrix4(this.camera.matrixWorldInverse);
    const zc = -v.z;
    if (zc < 0.12 * D) return null;
    P.project(this.camera);
    if (Math.abs(P.x) > 3 || Math.abs(P.y) > 3) return null;
    return { x: P.x * this.W / 2, y: -P.y * this.H / 2, s: Math.min(3, zr / zc) };
  }

  update(time) {
    if (!this.ready) return;
    const L = this.L, D = L.D, u = this.u;
    const dt = Math.min(0.05, Math.max(0, time - (this.lastT ?? time)));
    this.lastT = time;
    const cam = this.pose(u);
    const m = this.mouse;
    // a little parallax from the mouse, in the camera's own directions
    this.camera.rotation.set(cam.pitch + m.y * 0.015, cam.yaw - m.x * 0.025, cam.roll + Math.sin(u * 1.1) * 0.005, "YXZ");
    const right = V(1, 0, 0).applyEuler(this.camera.rotation), up = V(0, 1, 0).applyEuler(this.camera.rotation);
    this.camera.position.copy(cam.pos).addScaledVector(right, m.x * L.W * 0.022).addScaledVector(up, -m.y * L.H * 0.02);
    // The fight shakes the hall: small jolts while you read, a hard shake as it tears.
    const tk = STOPS.findIndex((s) => s.plates.some((d) => d.tear));
    if (tk >= 0) {
      const rest = smooth(arriveU(tk) - 0.1, arriveU(tk) + 0.05, u) * (1 - smooth(leaveU(tk) - 0.1, leaveU(tk), u));
      const rip = smooth(leaveU(tk) - 0.08, leaveU(tk) - 0.02, u) * (1 - smooth(leaveU(tk) + 0.06, leaveU(tk) + 0.16, u));
      const jolt = Math.pow(Math.max(0, Math.sin(time * 2.3)), 24);
      const amp = rest * jolt * 5 + rip * 9;
      this.camera.position.addScaledVector(right, (Math.sin(time * 71) + Math.sin(time * 37)) * amp).addScaledVector(up, (Math.cos(time * 63) + Math.sin(time * 29)) * amp);
    }
    this.camera.updateMatrixWorld(true);
    this.camZ = this.camera.position.z;

    // the sky: dusk over the sea, night from "years later" on
    const kNight = STOPS.findIndex((s) => s.into === "corner") - 1;
    const night = this.inPre() ? 0 : smooth(leaveU(kNight) + 0.04, arriveU(kNight + 1) - 0.06, u);
    this.skyU.uMix.value = night;
    this.skyU.uTime.value = time;
    this.sky.position.copy(this.camera.position);
    this.sky.scale.setScalar(80000);
    this.shared.uFog.value.copy(DUSK_FOG).lerp(NIGHT_FOG, night);
    this.moteU.uCam.value.copy(this.camera.position);
    this.moteU.uTime.value = time;
    this.moteU.uAmt.value = 0.55 + 0.25 * night;

    // the shade behind the words comes and goes with them
    let words = 0;
    for (let k = 0; k < STOPS.length; k++) words = Math.max(words, this.stopOpacity(k));
    this.scrim.material.uniforms.uAmt.value = words;
    this.scrim.visible = words > 0.002;

    // Paintings are always where they hang; a scene is drawn from just before the camera
    // leaves the one before it until just after the camera reaches the next one.
    const inPre = this.inPre();
    const drawn = (k) => {
      if (inPre) return k === 0;
      const a = k === 0 ? -Infinity : leaveU(k - 1) - 0.35;
      const b = k < STOPS.length - 1 ? arriveU(k + 1) + 0.12 : Infinity;
      return u > a && u < b;
    };
    for (const p of this.plates) {
      const U = p.uniforms;
      const near = drawn(p.stop);
      U.uTime.value = time;
      const dist = p.mesh.getWorldPosition(this.tmp).distanceTo(this.camera.position);
      U.uBlur.value = smooth(1.8 * D, 3.6 * D, dist) * 1.4;   // a gentle focus pull as you arrive, never a smear
      // far off to one side, the layers flatten a little so nothing stretches
      const off = this.camera.position.distanceTo(U.uEye.value) / D;
      U.uLift.value = 1 - 0.65 * smooth(0.15, 1.1, off);
      if (p.def.ash) U.uAsh.value = smooth(leaveU(p.stop) - 0.03, leaveU(p.stop) + 0.38, u);
      p.mesh.visible = near && U.uAsh.value < 0.999;
      if (p.def.tear) {
        // The rip runs down as the words go, then the halves swing open and you fly through.
        const L0 = leaveU(p.stop);
        U.uRip.value = clamp01((u - (L0 - 0.07)) / 0.11);
        U.uOpen.value = clamp01((u - (L0 + 0.03)) / 0.24);
      }
      if (p.def.burn) U.uBurn.value = smooth(leaveU(p.stop) - 0.04, leaveU(p.stop) + 0.3, u);
    }

    const pre = this.inPre();
    for (const t of Object.values(this.threads)) {
      const target = this.revealFor(t, pre, cam.pos);
      t.reveal += (target - t.reveal) * Math.min(1, dt * 12);
      if (Math.abs(target - t.reveal) < 1e-4) t.reveal = target;
      t.uniforms.uReveal.value = t.reveal;
      t.mesh.visible = t.reveal > 0.0005;
    }
    const g = this.threads.gold;
    for (const f of this.fibres || []) {
      const r = g ? Math.min(1, Math.max(0, (g.reveal - 0.985) / 0.015)) : 0;
      f.uniforms.uReveal.value = r;
      f.mesh.visible = r > 0.001;
    }
    this.updateFx(time, dt);
    this.updateWeapons(time);
  }
}
