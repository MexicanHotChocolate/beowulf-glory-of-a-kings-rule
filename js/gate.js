import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { emberVert, emberFrag, NOISE } from "./shaders.js";
import { Wyrm } from "./wyrm.js";
import { Q } from "./quality.js";

/* ==========================================================================
   The way in. While the exhibit loads, a gold wyrm flies laps round a sword
   planted point-down, beating its wings on the climbs, gliding on the dives
   and breathing fire every few seconds. The sword turns and leans toward the
   mouse. "Enter" appears when everything has loaded; on click the page times
   this computer's frames, picks a quality level and says what it chose, then
   the wyrm turns its fire on you and the gate burns away to the opening.
   ========================================================================== */

THREE.ColorManagement.enabled = false;

// The night sky behind it all: the same photograph of the Milky Way the exhibit ends under,
// tipped so the arch of the galaxy stands behind the sword, with firelight from below.
const skyFrag = /* glsl */ `
  uniform sampler2D uNight;
  uniform float uTime, uHas, uTanHalf;
  uniform vec2 uRes, uLook;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 ndc = vUv * 2.0 - 1.0;
    vec3 d = normalize(vec3(ndc.x * uTanHalf * uRes.x / uRes.y, ndc.y * uTanHalf, -1.0));
    float cp = cos(0.62 + uLook.y), sp = sin(0.62 + uLook.y);        // looking up into the arch
    d = vec3(d.x, d.y * cp + d.z * -sp, d.y * sp + d.z * cp);
    float lon = atan(d.x, -d.z) + uLook.x + uTime * 0.004;
    vec2 uv = vec2(fract(lon / 6.2831853 + 0.66), 1.0 - acos(clamp(d.y, -1.0, 1.0)) / 3.14159265);
    vec3 c = uHas > 0.5 ? textureLod(uNight, uv, 0.0).rgb * 0.8 : vec3(0.01, 0.015, 0.04);
    vec2 p = vUv - vec2(0.5, 0.42);
    p.x *= uRes.x / uRes.y;
    c += vec3(1.0, 0.45, 0.12) * exp(-length(p * vec2(0.9, 3.2) + vec2(0.0, 0.3)) * 4.0) * 0.16;   // firelight from below
    c *= 1.0 - dot(vUv - 0.5, vUv - 0.5) * 0.9;
    gl_FragColor = vec4(c, 1.0);
  }
`;

// The way out: the wyrm turns its breath on you, the screen catches where the fire lands, and
// the picture burns away like a page, browning ahead of a ragged glowing edge, to the exhibit
// underneath. uR is how far the burn has spread from uO (both in screen heights).
const burnHead = /* glsl */ `
  uniform float uTime, uR, uAspect;
  uniform vec2 uO;
  varying vec2 vUv;
  ${NOISE}
  float burnS() {
    vec2 q = vec2(vUv.x * uAspect, vUv.y);
    vec2 w = vec2(fbm(q * 2.2 + uTime * 0.05), fbm(q * 2.2 + vec2(7.3, 1.9) - uTime * 0.05)) - 0.5;
    float d = length(q - uO + w * 0.34);
    float n = fbm(q * 7.5 + w * 3.0 - vec2(0.0, uTime * 0.35)) - 0.5;
    return uR - d + n * 0.11;
  }
`;
// Pass one scorches and removes the picture (it multiplies what is already drawn).
const burnMaskFrag = burnHead + /* glsl */ `
  void main() {
    float s = burnS();
    float gone = smoothstep(-0.004, 0.004, s);
    float scorch = smoothstep(-0.12, -0.004, s);
    vec3 keep = mix(vec3(1.0), vec3(0.4, 0.22, 0.1), scorch);
    gl_FragColor = vec4(max(vec3(gone), 1.0 - keep), gone);
  }
`;
// Pass two lays the burning edge over the top: white-hot at the front, orange, then dull red,
// a thin line of soot, and firelight thrown on the paper just ahead of it.
const burnEdgeFrag = burnHead + /* glsl */ `
  void main() {
    float s = burnS();
    if (s < -0.05 || s > 0.1) discard;
    float flick = fbm(vec2(vUv.x * uAspect * 11.0, vUv.y * 6.0 + uTime * 2.4));
    float x = s / (0.045 * (0.55 + flick));
    vec3 col = mix(vec3(1.0, 0.86, 0.56), vec3(1.0, 0.42, 0.07), smoothstep(0.0, 0.3, x));
    col = mix(col, vec3(0.38, 0.05, 0.02), smoothstep(0.3, 1.0, x));
    float a = smoothstep(-0.006, 0.0, s) * (1.0 - smoothstep(0.7, 1.15, x));
    float soot = smoothstep(0.8, 1.1, x) * (1.0 - smoothstep(1.1, 1.5, x)) * 0.7;
    vec3 glow = vec3(1.0, 0.38, 0.08) * 0.45 * smoothstep(-0.05, 0.0, s) * (1.0 - step(0.0, s));
    gl_FragColor = vec4(col * a + glow, a + soot * (1.0 - a));
  }
`;

// Fire as real particles: white-hot at the jaws, cooling to orange and red, rising and spreading.
// Flames thrown at the lens thin out before they reach it, and none grows past a set size.
const flameVert = /* glsl */ `
  attribute float aAge, aSeed;
  uniform float uScale, uMaxPx;
  varying float vAge, vSeed, vNear;
  void main() {
    vAge = aAge; vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float z = max(0.1, -mv.z);
    float size = mix(0.05, 0.42, pow(aAge, 0.65)) * (0.7 + 0.6 * aSeed);
    vNear = smoothstep(0.9, 2.8, z);
    gl_PointSize = aAge >= 1.0 ? 0.0 : min(size * uScale / z, uMaxPx);
  }
`;
const flameFrag = /* glsl */ `
  varying float vAge, vSeed, vNear;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float soft = smoothstep(1.0, 0.0, d);
    soft *= soft;
    vec3 hot = vec3(1.0, 0.93, 0.7), mid = vec3(1.0, 0.5, 0.1), cool = vec3(0.55, 0.08, 0.03);
    vec3 col = vAge < 0.28 ? mix(hot, mid, vAge / 0.28) : mix(mid, cool, (vAge - 0.28) / 0.72);
    float a = soft * pow(1.0 - vAge, 1.3) * (0.5 + 0.5 * vSeed) * 0.9 * vNear;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * a, 1.0);
  }
`;

const IGNITE = 0.38, BURN = 1.5;       // seconds after Enter's checks: the screen catches, then burns away

const smooth01 = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

// A spring that settles on its target like something with weight.
const spring = (s, target, dt, k = 26, damp = 7.5) => {
  s.v += (target - s.x) * k * dt - s.v * damp * dt;
  s.x += s.v * dt;
  return s.x;
};

export class Gate {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector(".gate__canvas");
    this.frames = [];
    this.alive = true;
    try {
      // alpha, so the burn on the way out can open holes onto the exhibit underneath
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    } catch {
      this.renderer = null;
      return;
    }
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    this.mouse = new THREE.Vector2();
    this.mouseT = new THREE.Vector2();
    this.onMove = (e) => this.mouseT.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    window.addEventListener("pointermove", this.onMove);
    this.sp = { yaw: { x: 0, v: 0 }, pitch: { x: 0, v: 0 }, roll: { x: 0, v: 0 }, x: { x: 0, v: 0 }, y: { x: 0, v: 0 } };

    const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }",
      fragmentShader: skyFrag, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uNight: { value: null }, uHas: { value: 0 },
        uTanHalf: { value: Math.tan(THREE.MathUtils.degToRad(15)) }, uLook: { value: new THREE.Vector2() } },
    }));
    new THREE.TextureLoader().load("assets/web/sky/sky-night-4k.webp", (t) => {
      t.colorSpace = THREE.NoColorSpace;
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
      t.wrapS = THREE.RepeatWrapping;
      sky.material.uniforms.uNight.value = t;
      sky.material.uniforms.uHas.value = 1;
    });
    // The burn: two full-screen passes drawn after everything else (see the shaders above).
    const quad = new THREE.PlaneGeometry(2, 2);
    const quadVert = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
    this.burnU = { uTime: { value: 0 }, uR: { value: -1 }, uAspect: { value: 1 }, uO: { value: new THREE.Vector2(0.8, 0.6) } };
    const burnPass = (frag, src, dst, order) => {
      const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({
        vertexShader: quadVert, fragmentShader: frag, uniforms: this.burnU,
        transparent: true, depthTest: false, depthWrite: false,
        blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
        blendSrc: src, blendDst: dst, blendSrcAlpha: src, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      }));
      m.frustumCulled = false;
      m.renderOrder = order;
      m.visible = false;
      return m;
    };
    this.burnMask = burnPass(burnMaskFrag, THREE.ZeroFactor, THREE.OneMinusSrcColorFactor, 50);
    this.burnEdge = burnPass(burnEdgeFrag, THREE.OneFactor, THREE.OneMinusSrcAlphaFactor, 51);
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    this.sky = sky;
    this.scene.add(sky, this.burnMask, this.burnEdge);
    this.exitT = -1;
    this.lit = false;

    // Light: the sunset sky in every reflection, a warm key from the fire side, a cold rim behind.
    const key = new THREE.DirectionalLight(0xffc488, 2.0);
    key.position.set(-3, 2.5, 4);
    const rim = new THREE.DirectionalLight(0x8fb0ff, 2.8);
    rim.position.set(3, 3, -4);
    const fill = new THREE.HemisphereLight(0x5a6cff, 0x3a1804, 0.5);
    this.fireLight = new THREE.PointLight(0xff6a1a, 0, 5, 1.6);
    this.scene.add(key, rim, fill, this.fireLight);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    new RGBELoader().load("assets/web/env/venice-sunset-1k.hdr", (hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.environment = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();
    });

    new GLTFLoader().load("assets/web/models/sword-estoc.glb", (g) => {
      const sword = g.scene;
      sword.traverse((o) => { if (o.isMesh) o.material.envMapIntensity = 1.6; });
      sword.scale.setScalar(1.55);
      const holder = new THREE.Group();
      holder.position.set(0, 0.62, 0);
      holder.add(sword);
      this.sword = holder;
      this.scene.add(holder);
    });

    this.wyrm = new Wyrm();
    this.scene.add(this.wyrm.group);

    // Its breath, and embers drifting up out of the dark.
    const FN = (this.flameN = Math.round(560 * Math.max(0.55, Q.fx)));
    this.fl = { p: new Float32Array(FN * 3), v: new Float32Array(FN * 3), age: new Float32Array(FN).fill(1), life: new Float32Array(FN).fill(1), next: 0, carry: 0 };
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.BufferAttribute(this.fl.p, 3));
    fg.setAttribute("aAge", new THREE.BufferAttribute(this.fl.age, 1));
    fg.setAttribute("aSeed", new THREE.BufferAttribute(Float32Array.from({ length: FN }, Math.random), 1));
    this.flame = new THREE.Points(fg, new THREE.ShaderMaterial({ vertexShader: flameVert, fragmentShader: flameFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uScale: { value: 1000 }, uMaxPx: { value: 120 } } }));
    this.flame.frustumCulled = false;
    this.scene.add(this.flame);
    const EN = 380, seeds = new Float32Array(EN * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    const eg = new THREE.BufferGeometry();
    eg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(EN * 3), 3));
    eg.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
    this.embers = new THREE.Points(eg, new THREE.ShaderMaterial({ vertexShader: emberVert, fragmentShader: emberFrag, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uBox: { value: new THREE.Vector3(7, 4.5, 4) }, uTime: { value: 0 }, uRise: { value: 0 }, uDpr: { value: 1.5 }, uD: { value: 12 }, uAmount: { value: 0.8 } } }));
    this.embers.position.set(0, 0.2, -0.5);
    this.embers.frustumCulled = false;
    this.scene.add(this.embers);

    this.resize = this.resize.bind(this);
    window.addEventListener("resize", this.resize);
    this.resize();
    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  resize() {
    if (!this.renderer) return;
    const W = window.innerWidth, H = window.innerHeight;
    this.renderer.setSize(W, H, false);
    this.camera.aspect = W / H;
    // narrow windows: pull back so the whole loop stays in frame
    this.camDist = 8.6 * Math.max(1, 1.45 / this.camera.aspect);
    this.camera.updateProjectionMatrix();
    this.sky.material.uniforms.uRes.value.set(W, H);
    this.burnU.uAspect.value = W / H;
    // pixels covered by one unit at distance one, for sizing the flame particles
    this.flame.material.uniforms.uScale.value = (H * this.renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    this.flame.material.uniforms.uMaxPx.value = 0.16 * H * this.renderer.getPixelRatio();
  }

  loop() {
    if (!this.alive || !this.renderer) return;
    requestAnimationFrame(this.loop);
    const dtRaw = this.clock.getDelta();
    const dt = Math.min(dtRaw, 0.05);
    const t = this.clock.elapsedTime;
    if (dtRaw > 0 && dtRaw < 0.5) this.frames.push(dtRaw);
    if (this.frames.length > 90) this.frames.shift();
    this.mouse.lerp(this.mouseT, 1 - Math.pow(0.02, dt));
    const m = this.mouse;
    this.sky.material.uniforms.uTime.value = t;
    this.sky.material.uniforms.uLook.value.set(m.x * 0.06, -m.y * 0.04);
    // Leaving (ex = seconds since): the camera pushes in, the wyrm turns its fire on you, the
    // screen catches where the fire lands and burns away.
    const ex = this.exitT >= 0 ? t - this.exitT : -1;
    this.embers.material.uniforms.uTime.value = t;
    this.embers.material.uniforms.uRise.value = t * 0.06;
    this.burnU.uTime.value = t;
    if (ex >= IGNITE && !this.lit) this.ignite();
    if (this.lit) {
      const b = Math.min(1, (ex - IGNITE) / BURN);
      this.burnU.uR.value = this.burnMax * (0.035 + 0.965 * Math.pow(b, 1.6));
      if (b >= 1) this.finish?.();
    }

    // A slow drifting camera that leans with the mouse.
    const push = ex > 0 ? smooth01(ex / (IGNITE + BURN)) : 0;
    this.camera.position.set(Math.sin(t * 0.15) * 0.8 + m.x * 0.7, 0.45 + Math.sin(t * 0.21) * 0.12 - m.y * 0.4 + push * 0.25, this.camDist - push * 3.2);
    this.camera.lookAt(m.x * 0.15, 0.15, 0);

    // The sword turns to face the mouse, leans into it and lifts a little, on springs.
    if (this.sword) {
      const sp = this.sp;
      this.sword.rotation.set(spring(sp.pitch, m.y * 0.32, dt), spring(sp.yaw, m.x * 1.25 + Math.sin(t * 0.3) * 0.15, dt), spring(sp.roll, -m.x * 0.22, dt));
      this.sword.position.set(spring(sp.x, m.x * 0.28, dt, 18, 6), 0.62 + spring(sp.y, -m.y * 0.12, dt, 18, 6) + Math.sin(t * 1.1) * 0.035, 0);
    }

    // The wyrm: fire every few seconds (the jaw drops, then the flames come).
    const cyc = (t / 5.2) % 1;
    const breath = ex >= 0 ? 1 : cyc > 0.62 && cyc < 0.93 ? 1 : 0;
    const amt = ex >= 0 ? Math.min(1, 0.55 + ex * 1.6) : cyc > 0.66 && cyc < 0.92 ? Math.sin(((cyc - 0.66) / 0.26) * Math.PI) : 0;
    this.wyrm.update(t, breath);
    const fl = this.fl, mouth = this.wyrm.mouth;
    // when leaving, the flames swing round onto the camera
    const ahead = ex >= 0 ? this.wyrm.forward.clone().lerp(this.camera.position.clone().sub(mouth).normalize(), Math.min(1, ex / IGNITE)).normalize() : this.wyrm.forward;
    fl.carry += dt * 620 * amt;
    const side = new THREE.Vector3().crossVectors(ahead, new THREE.Vector3(0, 1, 0)).normalize();
    const lift = new THREE.Vector3().crossVectors(side, ahead).normalize();
    while (fl.carry >= 1) {
      fl.carry -= 1;
      const i = fl.next;
      fl.next = (fl.next + 1) % this.flameN;
      const sp = 3.0 + Math.random() * 1.6, a1 = (Math.random() - 0.5) * 0.5, a2 = (Math.random() - 0.5) * 0.4;
      const v = ahead.clone().multiplyScalar(sp).addScaledVector(side, a1 * sp).addScaledVector(lift, a2 * sp);
      fl.p.set([mouth.x, mouth.y, mouth.z], i * 3);
      fl.v.set([v.x, v.y, v.z], i * 3);
      fl.age[i] = 0;
      fl.life[i] = 0.45 + Math.random() * 0.35;
    }
    this.fireLight.position.copy(mouth).addScaledVector(ahead, 0.5);
    const drag = Math.pow(0.12, dt);
    for (let i = 0; i < this.flameN; i++) {
      if (fl.age[i] >= 1) continue;
      fl.age[i] = Math.min(1, fl.age[i] + dt / fl.life[i]);
      fl.v[i * 3] *= drag; fl.v[i * 3 + 1] = fl.v[i * 3 + 1] * drag + 1.6 * dt; fl.v[i * 3 + 2] *= drag;
      fl.p[i * 3] += fl.v[i * 3] * dt; fl.p[i * 3 + 1] += fl.v[i * 3 + 1] * dt; fl.p[i * 3 + 2] += fl.v[i * 3 + 2] * dt;
    }
    this.flame.geometry.attributes.position.needsUpdate = true;
    this.flame.geometry.attributes.aAge.needsUpdate = true;
    this.fireLight.intensity = amt * 18;
    this.wyrm.membrane.emissiveIntensity = 1 + amt * 2.5;
    this.renderer.render(this.scene, this.camera);
  }

  /* The screen catches fire where the wyrm's breath lands (kept off the very edges), and the burn
     is sized to reach every corner. */
  ignite() {
    this.lit = true;
    const v = this.wyrm.mouth.clone().project(this.camera), a = this.camera.aspect;
    const ox = THREE.MathUtils.clamp(v.x * 0.5 + 0.5, 0.25, 0.75) * a, oy = THREE.MathUtils.clamp(v.y * 0.5 + 0.5, 0.32, 0.75);
    this.burnU.uO.value.set(ox, oy);
    this.burnMax = Math.max(Math.hypot(ox, oy), Math.hypot(a - ox, oy), Math.hypot(ox, 1 - oy), Math.hypot(a - ox, 1 - oy)) + 0.3;
    this.burnMask.visible = this.burnEdge.visible = true;
    this.onLit?.();
  }

  /* The way out. Resolves when the screen catches fire, so the opening can start behind the burn;
     this.burnt resolves once the gate has burned away completely. */
  exit() {
    if (!this.renderer) {
      this.burnt = Promise.resolve();
      return Promise.resolve();
    }
    this.exitT = this.clock.elapsedTime;
    this.burnt = new Promise((r) => {
      this.finish = r;
      setTimeout(r, (IGNITE + BURN) * 1000 + 1500);     // never left hanging if frames stop (a hidden tab)
    });
    return new Promise((r) => {
      this.onLit = r;
      setTimeout(r, IGNITE * 1000 + 800);
    });
  }

  /* Average frame rate over the last second and a half. */
  fps() {
    if (this.frames.length < 10) return 60;
    const sorted = [...this.frames].sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length * 0.6)];      // ignores the odd hitch while things load
    return Math.round(1 / mid);
  }

  dispose() {
    this.alive = false;
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("pointermove", this.onMove);
    this.renderer?.dispose();
    this.renderer?.forceContextLoss?.();
  }
}
