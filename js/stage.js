import * as THREE from "three";
import { Flight, APPROACH, UNITS as UNITS_END } from "./flight.js";
import { Q } from "./quality.js";
import {
  curtainVert, curtainFrag, helmetVert, helmetFrag, flatVert, shadowFrag, heroBgFrag,
  compositeVert, compositeFrag,
} from "./shaders.js";

// Turn color management off before any THREE.Color is created, so hex values
// reach the screen unchanged (the site is styled in plain sRGB, like the CSS).
THREE.ColorManagement.enabled = false;
const BLUE = new THREE.Color(0.1, 0.17, 0.42);        // the blue of the rim light on the cloth
const NIGHT = new THREE.Color(0.02, 0.035, 0.09);
const FOV = 30;

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * One fixed full-screen WebGL canvas. 1 world unit = 1 CSS pixel on the z = 0
 * plane, so the 3D objects line up with the HTML layout.
 */
export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = { intro: 0, helmetIn: 0, p: 0, scroll: 0, cream: 0 };
    this.mouse = new THREE.Vector2();
    this.mouseTarget = new THREE.Vector2();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(NIGHT, 1);
    // Pixel density and anti-aliasing come from the device check (quality.js).
    this.maxDpr = Math.min(window.devicePixelRatio || 1, Q.dpr);
    this.dpr = this.maxDpr;
    this.renderer.setPixelRatio(this.dpr);
    this.frameMs = 16.7;
    this.slowFor = 0;
    this.fastFor = 0;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 10, 20000);

    this.rt = new THREE.WebGLRenderTarget(4, 4, { samples: Q.msaa, depthBuffer: true });
    this.flightRT = new THREE.WebGLRenderTarget(4, 4, { samples: Q.msaa, depthBuffer: true });
    this.mapRT = new THREE.WebGLRenderTarget(4, 4, { samples: Q.msaa, depthBuffer: true });
    this.map = null;   // Block 4, attached by main.js

    this.post = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.composite = new THREE.ShaderMaterial({
      vertexShader: compositeVert,
      fragmentShader: compositeFrag,
      uniforms: {
        tScene: { value: this.rt.texture },
        tFlight: { value: this.flightRT.texture },
        uFlight: { value: 0 }, uGalaxy: { value: 0 }, uSea: { value: 0 },
        tMap: { value: this.mapRT.texture },
        uMapOn: { value: 0 },
        uCream: { value: 0 },
        uRes: { value: new THREE.Vector2() },
        uTime: { value: 0 },
        uDissolve: { value: 0 },
        uClouds: { value: 1 },
        uDpr: { value: this.dpr },
        uScroll: { value: 0 },
        uClear: { value: new THREE.Vector2(0.47, 0.93) },
        uBlue: { value: BLUE },
        tNight: { value: null }, uNightYaw: { value: 0 }, uNightExp: { value: 0.95 },
        uTanHalf: { value: Math.tan(THREE.MathUtils.degToRad(FOV / 2)) }, uEndBasis: { value: new THREE.Matrix3() },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.post.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.composite));

    this.clock = new THREE.Clock();
  }

  async load() {
    const loader = new THREE.TextureLoader();
    const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));
    const small = window.innerWidth < 700;
    const [helmetTex, stoneTex, depthTex, skyTex] = await Promise.all([
      load(small ? "assets/web/hero/helmet-800.webp" : "assets/web/hero/helmet.webp"),
      load("assets/web/hero/stone.webp"),
      load("assets/web/hero/helmet-depth.png"),
      load("assets/web/sky/hero-sky.webp"),
    ]);
    skyTex.colorSpace = THREE.NoColorSpace;
    this.skyTex = skyTex;
    depthTex.colorSpace = THREE.NoColorSpace;
    this.depthTex = depthTex;
    for (const t of [helmetTex, stoneTex]) {
      t.colorSpace = THREE.NoColorSpace;
      t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    }
    helmetTex.generateMipmaps = true;
    stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping;
    this.helmetAspect = helmetTex.image.width / helmetTex.image.height;
    this.build(helmetTex, stoneTex);
    this.flight = new Flight(this);
    this.resize();
  }

  /* Block 3 pictures load after the hero is already on screen. */
  loadFlight() {
    return this.flight.load().then(() => this.resize()).catch((err) => console.error("Flight assets failed to load", err));
  }

  build(helmetTex, stoneTex) {
    // Behind everything: the dusk sky, soft, with firelight rising behind the helmet.
    this.bgUniforms = {
      uSky: { value: this.skyTex }, uRes: { value: new THREE.Vector2(1, 1) }, uMouse: { value: this.mouse },
      uGlowAt: { value: new THREE.Vector2(0.62, 0.3) }, uTime: { value: 0 }, uLit: { value: 0 },
      uImgAspect: { value: this.skyTex.image.width / this.skyTex.image.height },
    };
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }",
      fragmentShader: heroBgFrag, uniforms: this.bgUniforms, depthWrite: false,
    }));
    bg.frustumCulled = false;
    bg.renderOrder = -10;
    this.scene.add(bg);
    // Firelight for the stone ledge and the cord: warm from the lower left, cool from behind.
    this.ambient = new THREE.AmbientLight(0x8a96c8, 0.45);
    this.scene.add(this.ambient);
    this.key = new THREE.DirectionalLight(0xffb878, 0.8);
    this.key.position.set(-0.7, 0.35, 0.9);
    this.scene.add(this.key);
    const bounce = new THREE.DirectionalLight(0x5b78d8, 0.3);
    bounce.position.set(0.6, -0.2, 0.6);
    this.scene.add(bounce);

    // Curtain
    this.curtainUniforms = {
      uTime: { value: 0 },
      uOpen: { value: 0 },
      uRelease: { value: 0 },
      uBillow: { value: 0 },
      uDive: { value: 0 },
      uView: { value: new THREE.Vector2() },
      uRect: { value: new THREE.Vector4() },
      uMouse: { value: this.mouse },
      uZ: { value: -110 },
      uBlue: { value: BLUE },
      uLit: { value: 0 },
    };
    this.curtain = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1, 140, 220),
      new THREE.ShaderMaterial({
        vertexShader: curtainVert,
        fragmentShader: curtainFrag,
        uniforms: this.curtainUniforms,
        side: THREE.DoubleSide,
      })
    );
    this.curtain.frustumCulled = false;
    this.curtain.renderOrder = 3;
    this.scene.add(this.curtain);

    // Stone ledge
    stoneTex.repeat.set(2, 1);
    const face = (tone) => new THREE.MeshBasicMaterial({ map: stoneTex, color: new THREE.Color(tone * 0.34, tone * 0.31, tone * 0.3), transparent: true });
    // BoxGeometry face order: +x, -x, +y (top), -y, +z (front), -z
    this.ledgeMats = [face(0.78), face(0.78), face(1.0), face(0.5), face(0.86), face(0.7)];
    this.ledge = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.ledgeMats);
    this.ledge.renderOrder = 1;
    this.scene.add(this.ledge);

    // Contact shadow + helmet
    this.shadowMat = new THREE.ShaderMaterial({
      vertexShader: flatVert,
      fragmentShader: shadowFrag,
      uniforms: { uAlpha: { value: 0.55 } },
      transparent: true,
      depthWrite: false,
    });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.shadowMat);
    this.shadow.renderOrder = 2;
    this.scene.add(this.shadow);

    this.helmetUniforms = {
      uMap: { value: helmetTex },
      uDepthMap: { value: this.depthTex },
      uDepth: { value: 0 },
      uRelief: { value: 7 },
      uLight: { value: new THREE.Vector2(-0.45, 0.55) },
      uTexel: { value: new THREE.Vector2(2 / 560, 2 / 800) },
      uOut: { value: 0 },
      uGlint: { value: -1 },
      uDpr: { value: this.dpr },
      uLit: { value: 0 },
    };
    this.helmet = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1, 140, 200),
      new THREE.ShaderMaterial({
        vertexShader: helmetVert,
        fragmentShader: helmetFrag,
        uniforms: this.helmetUniforms,
        transparent: true,
        depthWrite: true,
      })
    );
    this.helmet.renderOrder = 4;
    this.helmetPivot = new THREE.Group();
    this.helmetPivot.add(this.helmet);
    this.scene.add(this.helmetPivot);

    // Tie-back cord: a gold strand and a blue strand twisted together.
    this.cord = new THREE.Group();
    this.cordMats = [
      new THREE.MeshStandardMaterial({ color: 0xd8a44c, roughness: 0.38, metalness: 0.35, transparent: true }),
      new THREE.MeshStandardMaterial({ color: 0x5b7fd0, roughness: 0.55, metalness: 0.1, transparent: true }),
    ];
    this.cord.renderOrder = 5;
    this.cord.position.z = -110;
    this.scene.add(this.cord);
  }

  /* Where everything sits, in pixels, for the current viewport. */
  layout() {
    const W = this.W, H = this.H;
    const mobile = W < 700;
    const portrait = !mobile && H > W * 1.15;   // tablets held upright
    const L = {};
    L.ledgeTop = -H / 2 + H * (mobile ? 0.09 : portrait ? 0.42 : 0.12);
    L.ledgeH = mobile ? 16 : 24;
    L.ledgeDepth = mobile ? 110 : 160;
    L.ledgeLeft = mobile ? -W * 0.42 : W * 0.06;
    L.ledgeRight = W / 2 + 60;
    L.ledgeZ = 30;

    L.helmetH = mobile ? Math.min(H * 0.40, W * 0.95)
      : portrait ? Math.min(H * 0.36, W * 0.40 / this.helmetAspect)
      : Math.min(H * 0.66, W * 0.29 / this.helmetAspect);
    L.helmetW = L.helmetH * this.helmetAspect;
    L.helmetX = mobile ? -W * 0.06 : portrait ? W * 0.13 : W * 0.17;
    L.helmetZ = -30;
    L.helmetY = L.ledgeTop + L.helmetH / 2 - L.helmetH * 0.012;

    L.curtainRight = W / 2 + 6;
    L.curtainTop = H / 2 + 60;
    L.curtainBottom = L.ledgeTop - 2;
    L.curtainWidth = mobile ? W * 0.40 : Math.min(W * 0.30, 560);
    return L;
  }

  resize() {
    const W = (this.W = window.innerWidth);
    const H = (this.H = window.innerHeight);
    this.renderer.setSize(W, H, false);
    this.rt.setSize(Math.floor(W * this.dpr), Math.floor(H * this.dpr));
    this.flightRT.setSize(Math.floor(W * this.dpr), Math.floor(H * this.dpr));
    this.mapRT.setSize(Math.floor(W * this.dpr), Math.floor(H * this.dpr));
    this.flight?.resize();
    this.map?.resize();
    this.camera.aspect = W / H;
    this.camera.position.set(0, 0, H / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    this.camera.updateProjectionMatrix();
    this.composite.uniforms.uRes.value.set(W * this.dpr, H * this.dpr);
    if (this.flight?.ready && this.flight.L) {
      const ev = this.flight.endView();
      this.composite.uniforms.uEndBasis.value.copy(ev.basis);
      this.composite.uniforms.uNightYaw.value = ev.yaw;
      this.composite.uniforms.tNight.value = this.flight.nightTex;
    }
    if (!this.helmet) return;
    this.bgUniforms.uRes.value.set(W, H);

    const L = (this.L = this.layout());
    this.curtainUniforms.uView.value.set(W, H);
    this.curtainUniforms.uRect.value.set(L.curtainRight, L.curtainTop, L.curtainBottom, L.curtainWidth);

    this.ledge.scale.set(L.ledgeRight - L.ledgeLeft, L.ledgeH, L.ledgeDepth);
    this.ledge.position.set((L.ledgeLeft + L.ledgeRight) / 2, L.ledgeTop - L.ledgeH / 2, L.ledgeZ - L.ledgeDepth / 2);
    this.ledgeY = this.ledge.position.y;

    this.helmet.scale.set(L.helmetW, L.helmetH, 1);
    this.helmetUniforms.uDepth.value = L.helmetW * 0.36 / 1;   // depth in px (scale.z stays 1)
    this.helmetPivot.position.set(L.helmetX, L.helmetY, L.helmetZ);
    this.shadow.scale.set(L.helmetW * 1.1, L.ledgeDepth * 0.7, 1);
    this.shadow.position.set(L.helmetX + L.helmetW * 0.04, L.ledgeTop + 0.5, L.helmetZ);
    this.shadow.rotation.x = -Math.PI / 2;

    this.buildCord(L);
  }

  /* Builds the tie-back around the curtain's narrowest point (v = 0.40). */
  buildCord(L) {
    for (const m of [...this.cord.children]) { m.geometry.dispose(); this.cord.remove(m); }
    const vT = 0.4;
    const y = L.curtainBottom + (L.curtainTop - L.curtainBottom) * vT;
    const xR = L.curtainRight + 4;
    const xL = L.curtainRight - L.curtainWidth * 0.30 - 10;
    const base = new THREE.CatmullRomCurve3([
      new THREE.Vector3(xR, y + 6, 10),
      new THREE.Vector3((xR * 0.6 + xL * 0.4), y - 4, 78),
      new THREE.Vector3((xR * 0.25 + xL * 0.75), y - 10, 82),
      new THREE.Vector3(xL, y - 16, 46),
      new THREE.Vector3(xL - 8, y - 40, 40),
      new THREE.Vector3(xL - 4, y - 78, 46),
    ]);
    const len = base.getLength();
    const N = 260, twist = len / 26, r = 4.2;
    for (let s = 0; s < 2; s++) {
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const p = base.getPointAt(t);
        const tan = base.getTangentAt(t);
        const side = new THREE.Vector3(0, 0, 1).cross(tan).normalize();
        const up = tan.clone().cross(side).normalize();
        const a = t * twist * Math.PI * 2 + s * Math.PI;
        pts.push(p.clone().addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r));
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N * 2, 3.6, 10, false), this.cordMats[s]);
      tube.renderOrder = 5;
      this.cord.add(tube);
    }
  }

  setPointer(x, y) { this.mouseTarget.set(x, y); }

  /* Fewer pixels for a slower computer. Only the buffers change; nothing is rebuilt. */
  setPixelRatio(dpr) {
    if (Math.abs(dpr - this.dpr) < 0.01) return;
    this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    const W = this.W, H = this.H;
    this.renderer.setSize(W, H, false);
    for (const rt of [this.rt, this.flightRT, this.mapRT]) rt.setSize(Math.floor(W * dpr), Math.floor(H * dpr));
    this.composite.uniforms.uRes.value.set(W * dpr, H * dpr);
    this.composite.uniforms.uDpr.value = dpr;
    this.helmetUniforms.uDpr.value = dpr;
    this.flight?.setDpr(dpr);
  }

  /* After the device check: the chosen pixel density and anti-aliasing. */
  applyQuality() {
    this.maxDpr = Math.min(window.devicePixelRatio || 1, Q.dpr);
    for (const rt of [this.rt, this.flightRT, this.mapRT]) {
      if (rt.samples !== Q.msaa) { rt.samples = Q.msaa; rt.dispose(); }
    }
    this.setPixelRatio(this.maxDpr);
  }

  /* Keeps the frame rate up while you scroll: if frames are slow for a couple of seconds the
     pixel density steps down, and steps back up after a long run of fast frames. */
  govern(dt) {
    if (!(dt > 0) || dt > 0.25) return;
    this.frameMs += (dt * 1000 - this.frameMs) * 0.05;
    if (this.frameMs > 25) { this.slowFor += dt; this.fastFor = 0; }
    else if (this.frameMs < 14.5) { this.fastFor += dt; this.slowFor = 0; }
    else { this.slowFor = 0; this.fastFor = 0; }
    if (this.slowFor > 1.6 && this.dpr > 0.76) {
      this.setPixelRatio(Math.max(0.75, this.dpr - 0.25));
      this.slowFor = 0;
      this.frameMs = 18;
    } else if (this.fastFor > 7 && this.dpr < this.maxDpr - 0.01) {
      this.setPixelRatio(Math.min(this.maxDpr, this.dpr + 0.25));
      this.fastFor = 0;
    }
  }

  update() {
    if (!this.helmet) return;
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    const time = this.clock.elapsedTime;
    if (!document.hidden) this.govern(rawDt);
    const { intro, helmetIn, p } = this.state;
    this.mouse.lerp(this.mouseTarget, 1 - Math.pow(0.0025, dt));

    const release = smooth(0.08, 0.34, p);
    const billow = smooth(0.08, 0.52, p);
    const dive = smooth(0.46, 0.84, p);
    const dissolve = smooth(0.78, 0.99, p);
    const helmetOut = smooth(0.03, 0.24, p);

    const cu = this.curtainUniforms;
    cu.uTime.value = time;
    cu.uOpen.value = intro;
    cu.uRelease.value = release;
    cu.uBillow.value = billow;
    cu.uDive.value = dive;

    this.helmetUniforms.uOut.value = helmetOut;
    // The opening: the firelight comes up and finds the helmet; the cloth and the ledge with it.
    const lit = helmetIn;
    this.helmetUniforms.uLit.value = lit;
    this.curtainUniforms.uLit.value = Math.max(lit, 0.0);
    this.bgUniforms.uLit.value = Math.max(0.35 * intro, lit);
    this.bgUniforms.uTime.value = time;
    this.ambient.intensity = 0.45 * (0.2 + 0.8 * lit);
    this.key.intensity = 0.8 * lit;
    this.helmetUniforms.uGlint.value = -0.4 + ((time * 0.16) % 1) * 2.4;
    // The helmet turns toward the mouse and the light follows, so it reads as a solid object.
    this.helmetPivot.rotation.y = this.mouse.x * 0.34 + Math.sin(time * 0.35) * 0.06;
    this.helmetPivot.rotation.x = -this.mouse.y * 0.14;
    this.helmetUniforms.uLight.value.set(-0.45 + this.mouse.x * 0.75, 0.55 - this.mouse.y * 0.5);
    this.helmetPivot.position.x = this.L.helmetX + this.mouse.x * 8;
    this.helmetPivot.position.y = this.L.helmetY + Math.sin(time * 0.9) * 2 + p * this.H * 0.05;
    this.helmet.visible = helmetOut < 1;
    this.shadowMat.uniforms.uAlpha.value = 0.55 * (1 - helmetOut) * lit;

    const ledgeAway = smooth(0.10, 0.40, p);
    this.ledge.position.y = this.ledgeY - ledgeAway * this.H * 0.35;
    for (const m of this.ledgeMats) m.opacity = 1 - ledgeAway;
    this.ledge.visible = ledgeAway < 1;

    const cordAway = Math.max(1 - smooth(0.35, 0.85, intro), release);
    for (const m of this.cordMats) m.opacity = 1 - cordAway;
    this.cord.position.y = -cordAway * 30;
    this.cord.visible = cordAway < 1;

    const cu2 = this.composite.uniforms;
    cu2.uCream.value = this.state.cream;
    cu2.uTime.value = time;
    cu2.uDissolve.value = dissolve;
    cu2.uScroll.value = this.state.scroll;

    if (dissolve < 1) {
      this.renderer.setClearColor(NIGHT, 1);
      this.renderer.setRenderTarget(this.rt);
      this.renderer.render(this.scene, this.camera);
    }

    // Block 3: the braid flight, drawn with a transparent background over the sky.
    const f = this.flight;
    const flightOn = f && f.isActive();
    cu2.uFlight.value = flightOn ? 1 : 0;
    if (f && f.ready) {
      // Keep the clouds out of whichever column holds the text.
      const toFlight = smooth(-APPROACH * 0.4, 0.4, f.u);
      const stacked = f.L && f.L.stacked;
      const fx = stacked ? -1 : 0.03, fy = stacked ? -1 : 0.47;
      cu2.uClear.value.set(0.47 + (fx - 0.47) * toFlight, 0.93 + (fy - 0.93) * toFlight);
    }
    if (flightOn) {
      f.update(time);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setRenderTarget(this.flightRT);
      this.renderer.render(f.scene, f.camera);
      this.renderer.setClearColor(NIGHT, 1);
    }

    // Block 4: the braided map.
    const mp = this.map;
    const mapOn = !!mp && mp.isActive();
    cu2.uMapOn.value = mapOn ? 1 : 0;
    // The night sky comes in as you rise off the funeral at the end of the flight, and
    // stays for the map, going when the map is done.
    const mapEnd = mp ? 1 - smooth(0.9, 1.0, mp.p) : 1;
    // after the flight the camera is looking up into the Milky Way: the map's sky is the same view
    const fromFlight = f && f.ready && f.u >= UNITS_END - 0.05 ? 1 : 0;
    cu2.uGalaxy.value = Math.max(mp ? smooth(0.0, 0.16, mp.p) : 0, fromFlight) * mapEnd;
    cu2.uSea.value = f && f.ready && flightOn ? f.sea() : 0;
    cu2.uClouds.value = mp ? 1 - 0.7 * Math.min(1, mp.p * 3) * (mp.p < 0.999 ? 1 : 0) : 1;
    if (mapOn) {
      mp.update(time);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setRenderTarget(this.mapRT);
      this.renderer.render(mp.scene, mp.camera);
      this.renderer.setClearColor(NIGHT, 1);
    }
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.post, this.postCam);
  }
}

export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch {
    return false;
  }
}
