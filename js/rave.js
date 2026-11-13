import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { NOISE } from "./shaders.js";
import { Q } from "./quality.js";

/* ==========================================================================
   Blocks 13 and 14: the alarm and the Wojak club (our easter egg).
   Stay on the last screen for 1.5 seconds without scrolling: a hit, the page
   shakes and glitches, red lights sweep, the alarm sounds and a blinking red
   countdown starts. Scroll down (or wait for zero) to drop into the club under
   the credits. The Wojaks dance on a
   mirror-glossy floor (keyed out of their green screens live), lasers cut
   through the haze, a mirror ball turns, confetti cannons fire on the beat and
   the sign says what we want. Sound works because the Enter click unlocked it.
   ========================================================================== */

THREE.ColorManagement.enabled = false;
const IDLE_MS = 1500;
const COUNTDOWN = 5;                // seconds on the red timer before it drops you in by itself
// Where the figures actually are in each green-screen frame (u, v from the bottom, width, height).
const CROWD_RECT = [0.0, 0.175, 0.97, 0.6];
const SINGER_RECT = [0.03, 0.33, 0.9, 0.285];
const NEON = [0x00f0ff, 0xff2bd6, 0x7dff3a];

const vert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN, vView, vPos;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    vPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vN = normalMatrix * normal;                // normalised per pixel (some bevel normals are zero)
    gl_Position = projectionMatrix * mv;
  }
`;

// Green screen out, green fringe pulled back to neutral, lit by the club.
const keyFrag = /* glsl */ `
  uniform sampler2D uVideo;
  uniform vec4 uRect;
  uniform vec3 uTint;
  uniform float uBeat, uFlip, uOn;
  varying vec2 vUv;
  void main() {
    vec2 uv = vec2(uFlip > 0.5 ? 1.0 - vUv.x : vUv.x, vUv.y);
    vec4 c = texture2D(uVideo, uRect.xy + uv * uRect.zw);
    float g = c.g - max(c.r, c.b);
    float a = 1.0 - smoothstep(0.04, 0.17, g);
    if (a < 0.03) discard;
    c.g = min(c.g, max(c.r, c.b) * 1.03);
    // Kept under the glow threshold so the figures stay crisp instead of blooming into white.
    vec3 col = c.rgb * uTint * (0.62 + 0.16 * uOn) * (0.94 + uBeat * 0.06);
    gl_FragColor = vec4(min(col, vec3(0.84)), a);
  }
`;

// Laser: a hot core and a soft glow sleeve that is brightest seen side-on.
const beamFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uI, uCore;
  varying vec2 vUv;
  varying vec3 vN, vView;
  void main() {
    float side = abs(dot(normalize(vN), normalize(vView)));
    float a = uCore > 0.5 ? 1.0 : pow(side, 3.0) * 0.75;
    a *= (1.0 - vUv.y * 0.55) * uI;
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;

// Spotlight cone through haze: bright at the lamp, soft at the edges.
const coneVert = /* glsl */ `
  uniform float uH;
  varying float vFall;
  varying vec3 vN, vView;
  void main() {
    vFall = clamp(-position.y / uH, 0.0, 1.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;
const coneFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uI;
  varying float vFall;
  varying vec3 vN, vView;
  void main() {
    float edge = pow(abs(dot(normalize(vN), normalize(vView))), 1.6);
    float a = edge * pow(1.0 - vFall, 1.4) * 0.075 * uI;
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;

// A pool of light on the floor under each spot.
const poolFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uI;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.2, d) * 0.15 * uI;
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;

// Glossy black tiles over the mirror, with LED seams that chase on the beat.
const floorFrag = /* glsl */ `
  uniform float uTime, uBeat, uOn;
  varying vec2 vUv;
  varying vec3 vPos;
  ${NOISE}
  void main() {
    vec2 p = vPos.xz * 0.9;
    vec2 cell = floor(p), f = fract(p);
    float seam = 1.0 - smoothstep(0.0, 0.035, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    float h = hash12(cell);
    float wave = sin(uTime * 3.0 - length(cell) * 0.9 + h * 2.0) * 0.5 + 0.5;
    vec3 led = mix(vec3(0.0, 0.94, 1.0), vec3(1.0, 0.17, 0.84), step(0.5, h));
    vec3 col = vec3(0.01, 0.008, 0.03) + led * seam * (0.15 + 0.85 * wave * uBeat) * uOn * 0.9;
    float lit = step(0.86, h) * wave * uBeat * uOn;
    col += led * lit * 0.12;
    float fadeOut = smoothstep(14.0, 6.0, length(vPos.xz));
    gl_FragColor = vec4(col, (0.62 + 0.2 * seam) * fadeOut + (1.0 - fadeOut));
  }
`;

// The back wall: dark mead-hall planks, a woven gold and blue band, coloured light washing over it.
const wallFrag = /* glsl */ `
  uniform float uTime, uBeat, uOn;
  uniform vec3 uWash[3];
  varying vec2 vUv;
  varying vec3 vPos;
  ${NOISE}
  void main() {
    float plank = fract(vPos.x * 1.4);
    float grain = fbm(vec2(vPos.x * 1.4, vPos.y * 0.25));
    vec3 col = vec3(0.07, 0.035, 0.02) * (0.6 + 0.6 * grain) * (0.75 + 0.25 * smoothstep(0.0, 0.06, plank) * smoothstep(1.0, 0.94, plank));
    float y = vPos.y - 5.6;
    float s1 = sin(vPos.x * 3.0) * 0.18, s2 = -s1;
    float gold = 1.0 - smoothstep(0.03, 0.07, abs(y - s1));
    float blue = 1.0 - smoothstep(0.03, 0.07, abs(y - s2));
    float over = step(0.0, sin(vPos.x * 3.0 + 1.5708));
    col = mix(col, vec3(0.9, 0.66, 0.28), gold * (over > 0.5 ? 1.0 : 0.6));
    col = mix(col, vec3(0.45, 0.6, 1.0), blue * (over > 0.5 ? 0.6 : 1.0));
    for (int i = 0; i < 3; i++) {
      vec2 c = vec2(sin(uTime * (0.4 + float(i) * 0.17) + float(i) * 2.0) * 7.0, 2.5 + sin(uTime * 0.5 + float(i)) * 1.5);
      float d = length(vPos.xy - c);
      col += uWash[i] * exp(-d * d * 0.12) * (0.25 + 0.6 * uBeat) * uOn;
    }
    gl_FragColor = vec4(col * (0.35 + 0.65 * uOn), 1.0);
  }
`;

// Mirror ball: flat facets that flash as they turn.
const ballFrag = /* glsl */ `
  uniform float uTime, uBeat;
  varying vec3 vView, vPos;
  ${NOISE}
  void main() {
    vec3 fn = cross(dFdx(vPos), dFdy(vPos));
    vec3 n = dot(fn, fn) > 1e-12 ? normalize(fn) : vec3(0.0, 1.0, 0.0);
    vec3 v = normalize(vView);
    float h = hash12(floor(n.xy * 9.0 + n.z * 5.0));
    float flash = pow(max(0.0, sin(uTime * 3.0 + h * 40.0)), 30.0);
    vec3 col = vec3(0.35, 0.37, 0.45) * (0.35 + 0.65 * abs(n.y)) + vec3(1.0) * flash * (0.6 + uBeat);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// The LED wall behind the stage: real pixels, an equalizer from the song, a ring on the kick.
const ledFrag = /* glsl */ `
  uniform float uTime, uBeat, uOn;
  uniform float uBands[16];
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 grid = vec2(176.0, 66.0);
    vec2 g = vUv * grid, id = floor(g), f = fract(g) - 0.5;
    float led = smoothstep(0.46, 0.2, length(f));
    vec2 p = (id + 0.5) / grid;
    int bi = int(clamp(floor(abs(p.x - 0.5) * 2.0 * 16.0), 0.0, 15.0));
    float level = uBands[bi];
    float bar = step(abs(p.y - 0.5) * 2.0, level) * step(0.12, fract(abs(p.x - 0.5) * 32.0));
    vec3 col = mix(vec3(0.0, 0.94, 1.0), vec3(1.0, 0.17, 0.84), abs(p.y - 0.5) * 2.0) * bar;
    vec2 q = (p - 0.5) * vec2(2.67, 1.0);
    float ring = smoothstep(0.035, 0.0, abs(length(q) - 0.18 - uBeat * 0.22));
    col += vec3(1.0, 0.82, 0.3) * ring * 1.4;
    col += vec3(0.32, 0.12, 0.7) * (sin(p.x * 14.0 - uTime * 2.4) * 0.5 + 0.5) * 0.22;
    col += vec3(0.04, 0.02, 0.08);
    gl_FragColor = vec4(min(col, vec3(1.3)) * led * (0.12 + 0.3 * uOn), 1.0);
  }
`;

// Chrome: a dark club reflected in polished metal, neon bands sliding over it.
const chromeFrag = /* glsl */ `
  uniform float uTime, uBeat;
  varying vec3 vN, vView;
  void main() {
    vec3 n = dot(vN, vN) > 1e-8 ? normalize(vN) : vec3(0.0, 0.0, 1.0);
    vec3 v = normalize(vView);
    vec3 r = reflect(-v, n);
    vec3 env = mix(vec3(0.16, 0.14, 0.24), vec3(0.78, 0.8, 0.95), smoothstep(-0.4, 0.8, r.y));
    env += vec3(0.0, 0.94, 1.0) * smoothstep(0.07, 0.0, abs(r.y - 0.1 - 0.25 * sin(uTime * 0.9))) * 1.2;
    env += vec3(1.0, 0.17, 0.84) * smoothstep(0.09, 0.0, abs(r.x + 0.35 * cos(uTime * 0.7))) * 1.0;
    env += vec3(1.0) * pow(max(0.0, dot(r, normalize(vec3(0.3, 0.8, 0.5)))), 40.0) * 2.0;
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 col = env * (0.8 + 0.35 * uBeat) + fres * vec3(0.55, 0.65, 1.0) * 0.6;
    gl_FragColor = vec4(min(col, vec3(3.0)), 1.0);
  }
`;

// Confetti: foil that flashes when it turns to face you.
const foilVert = /* glsl */ `
  varying vec3 vC;
  varying float vFace;
  void main() {
    vC = instanceColor;
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vec3 n = normalize(mat3(modelMatrix * instanceMatrix) * vec3(0.0, 0.0, 1.0));
    vFace = abs(dot(n, normalize(cameraPosition - wp.xyz)));
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const foilFrag = /* glsl */ `
  varying vec3 vC;
  varying float vFace;
  void main() {
    gl_FragColor = vec4(vC * (0.3 + 0.7 * vFace) + vec3(1.0) * pow(vFace, 18.0) * 1.4, 1.0);
  }
`;

// Haze drifting through the lights.
const hazeFrag = /* glsl */ `
  uniform float uTime, uI;
  uniform vec3 uColor;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 p = vUv * 3.0 + vec2(uTime * 0.05, 0.0);
    float n = fbm(p + fbm(p * 1.3 - uTime * 0.03));
    float edge = smoothstep(0.5, 0.1, length(vUv - 0.5));
    gl_FragColor = vec4(uColor * n * n * edge * 0.07 * uI, 1.0);
  }
`;

const speckVert = /* glsl */ `
  attribute vec3 aDir;
  uniform float uTime, uDpr;
  varying float vA;
  varying vec3 vC;
  void main() {
    float t = uTime * 0.35;
    vec3 d = vec3(aDir.x * cos(t) - aDir.z * sin(t), aDir.y, aDir.x * sin(t) + aDir.z * cos(t));
    vec4 mv = modelViewMatrix * vec4(d * 9.0, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = 3.5 * uDpr * 8.0 / max(1.0, -mv.z);
    vA = 0.5 + 0.5 * sin(uTime * 4.0 + aDir.x * 30.0);
    vC = mix(vec3(1.0), mix(vec3(0.0, 0.94, 1.0), vec3(1.0, 0.17, 0.84), step(0.0, aDir.z)), step(0.4, fract(aDir.y * 7.0)));
  }
`;
const speckFrag = /* glsl */ `
  uniform float uOn;
  varying float vA;
  varying vec3 vC;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(vC * smoothstep(0.5, 0.0, d) * vA * uOn, 1.0);
  }
`;

const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Ending {
  constructor({ endEl, alarmEl, clubEl, lenis, onUnlock }) {
    Object.assign(this, { endEl, alarmEl, clubEl, lenis, onUnlock });
    this.state = "idle";              // idle -> alarm -> club
    this.inEnd = false;
    this.timer = 0;
    this.muted = false;
    this.siren = new Audio("assets/audio/alarm-danger.mp3");     // the danger alarm our group picked
    this.siren.loop = true;
    this.music = new Audio("assets/audio/dont-stop-the-party.mp3");   // Pitbull ft. TJR, from 0:15.3
    this.music.loop = true;
    this.videos = ["assets/video/wojak-crowd-greenscreen.mp4", "assets/video/wojak-singing-greenscreen.mp4"].map((src) => {
      const v = document.createElement("video");
      Object.assign(v, { src, muted: true, loop: true, playsInline: true, preload: "auto" });
      return v;
    });

    // The clock starts the moment the last screen is in view and only real input resets it:
    // a wheel turn, a swipe or a key. Moving the mouse, or the smooth scroll still easing to a
    // stop, does not count, so the alarm comes 1.5 seconds after you stop.
    const poke = (e) => { if (e.type !== "wheel" || Math.abs(e.deltaY) > 4) this.resetIdle(); };
    for (const ev of ["wheel", "keydown", "touchmove"]) window.addEventListener(ev, poke, { passive: true });
    new IntersectionObserver(([e]) => {
      const was = this.inEnd;
      this.inEnd = e.intersectionRatio > 0.55;
      if (this.inEnd !== was) this.resetIdle();
    }, { threshold: [0, 0.55, 1] }).observe(endEl);
    new IntersectionObserver(([e]) => this.clubSeen(e.intersectionRatio), { threshold: [0, 0.15, 0.5, 0.92, 1] }).observe(clubEl);

    clubEl.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => this.act(b.dataset.act, b)));
  }

  /* ------------------------------------------------ the alarm */
  resetIdle() {
    clearTimeout(this.timer);
    if (this.state !== "idle" || !this.inEnd) return;
    this.timer = setTimeout(() => this.alarm(), IDLE_MS);
  }

  alarm() {
    if (this.state !== "idle") return;
    this.state = "alarm";
    const gsap = window.gsap, el = this.alarmEl, q = (s) => el.querySelector(s);
    el.hidden = false;
    el.style.opacity = "1";
    this.clubEl.hidden = false;           // there is now something below the credits
    this.build();
    this.onUnlock?.();
    this.siren.currentTime = 0;
    this.siren.volume = 1;
    this.siren.play().catch(() => {});
    this.boom();
    const title = this.endEl.querySelector(".ending__line"), names = this.endEl.querySelector(".ending__names");
    this.endEl.classList.add("is-glitch");
    const tl = (this.alarmTl = gsap.timeline());
    tl.fromTo(q(".alarm__flash"), { opacity: 1 }, { opacity: 0, duration: 0.7, ease: "power2.out" }, 0)
      .fromTo(q(".alarm__red"), { opacity: 0 }, { opacity: 1, duration: 0.12 }, 0)
      .fromTo(q(".alarm__beams"), { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.6, ease: "expo.out" }, 0.05)
      .add(this.shake([title, names, q(".alarm__panel")], 1.1, 22), 0)
      .add(() => this.endEl.classList.remove("is-glitch"), 1.0)
      .fromTo(q(".alarm__panel"), { clipPath: "inset(49% 0% 49% 0%)", scaleX: 1.25, filter: "blur(8px) brightness(3)" },
        { clipPath: "inset(0% 0% 0% 0%)", scaleX: 1, filter: "blur(0px) brightness(1)", duration: 0.7, ease: "expo.out" }, 0.25)
      .fromTo(q(".alarm__head"), { letterSpacing: "1.4em", opacity: 0 }, { letterSpacing: "0.42em", opacity: 1, duration: 0.8, ease: "expo.out" }, 0.4)
      .add(() => this.typeIn(), 0.55)
      .fromTo(q(".alarm__timer"), { scale: 2.2, opacity: 0, filter: "blur(10px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.6, ease: "back.out(2.2)" }, 0.8)
      .add(() => this.countdown(), 0.8)
      .fromTo(q(".alarm__go"), { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "expo.out" }, 1.2);
  }

  /* A violent shake that dies away. */
  shake(targets, dur, amp) {
    const gsap = window.gsap, tl = gsap.timeline(), steps = Math.round(dur / 0.045);
    for (let i = 0; i < steps; i++) {
      const k = amp * Math.pow(1 - i / steps, 1.6);
      tl.to(targets, { x: (Math.random() - 0.5) * 2 * k, y: (Math.random() - 0.5) * 2 * k, rotation: (Math.random() - 0.5) * k * 0.06, duration: 0.045, ease: "none" });
    }
    tl.to(targets, { x: 0, y: 0, rotation: 0, duration: 0.2, ease: "power2.out" });
    return tl;
  }

  /* The warning writes itself out, one character at a time. */
  typeIn() {
    const lines = [...this.alarmEl.querySelectorAll(".alarm__type")];
    let li = 0, ci = 0;
    for (const l of lines) l.textContent = "";
    const step = () => {
      if (li >= lines.length || this.state !== "alarm") return;
      const full = lines[li].dataset.text;
      lines[li].textContent = full.slice(0, ++ci);
      if (ci >= full.length) { li++; ci = 0; setTimeout(step, 160); } else setTimeout(step, 24);
    };
    step();
  }

  /* The red timer: counts down in hundredths, blinks, beeps each second, hurries at the end. */
  countdown() {
    const t0 = performance.now(), el = this.alarmEl.querySelector(".alarm__t"), box = this.alarmEl.querySelector(".alarm__timer");
    let lastSec = COUNTDOWN + 1;
    const tick = () => {
      if (this.state !== "alarm") return;
      const left = Math.max(0, COUNTDOWN - (performance.now() - t0) / 1000);
      const s = Math.floor(left), cs = Math.floor((left - s) * 100);
      el.textContent = `00:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
      if (s !== lastSec) {
        lastSec = s;
        this.beep(s <= 3 ? 1480 : 1180);
        window.gsap.fromTo(box, { scale: 1.12 }, { scale: 1, duration: 0.35, ease: "power3.out" });
        box.classList.toggle("is-hurry", s < 3);
      }
      if (left <= 0) {
        el.textContent = "00:00.00";
        this.alarmEl.querySelector(".alarm__go").textContent = "Too late";
        const go = () => this.lenis ? this.lenis.scrollTo(this.clubEl, { duration: 1.6, easing: (x) => 1 - Math.pow(1 - x, 4) }) : this.clubEl.scrollIntoView({ behavior: "smooth" });
        setTimeout(go, 350);
        return;
      }
      this.countRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  /* Sound made on the spot: a low hit when the alarm starts, and timer beeps. */
  boom() {
    const ctx = window.__audioCtx;
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = "sine";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.55);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.75);
  }

  beep(freq) {
    const ctx = window.__audioCtx;
    if (!ctx || this.muted) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = "square";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.1);
  }

  clubSeen(ratio) {
    if (this.state === "idle") return;
    this.visible = ratio > 0.01;
    document.documentElement.classList.toggle("in-club", ratio > 0.5);
    if (this.visible && !this.raf) this.loop();
    // Fully in: the siren stops, the lights slam on, the cannons fire.
    if (ratio > 0.9 && this.state === "alarm") this.drop();
    if (this.state === "club") {
      if (ratio > 0.5) this.playAll();
      else this.pauseAll();
    }
    // As the club comes up the screen the warning slides away with it.
    if (this.state === "alarm") this.alarmEl.style.opacity = String(Math.max(0, 1 - ratio * 1.4));
  }

  drop() {
    this.state = "club";
    cancelAnimationFrame(this.countRaf);
    this.alarmTl?.kill();
    const gsap = window.gsap, el = this.alarmEl;
    gsap.to(this.siren, { volume: 0, duration: 0.4, onComplete: () => this.siren.pause() });
    // The warning switches off like an old screen: squashed to a line, then a dot.
    gsap.timeline({ onComplete: () => { el.hidden = true; } })
      .to(el.querySelector(".alarm__panel"), { scaleY: 0.012, filter: "brightness(4)", duration: 0.16, ease: "power3.in" })
      .to(el.querySelector(".alarm__panel"), { scaleX: 0, duration: 0.14, ease: "power3.in" })
      .to(el, { opacity: 0, duration: 0.3 }, 0.1);
    this.on = 0;
    this.dropAt = performance.now();
    this.playAll();
    this.listen();
    this.fire(700);
    this.credits();
  }

  /* Who did what, one at a time: the name builds letter by letter, the job under it. */
  credits() {
    const gsap = window.gsap;
    // Sonny made this club: that card comes in first and stays, with Sonny's statement.
    const lead = this.clubEl.querySelector(".club__lead");
    if (lead && !this.leadTl) {
      const name = lead.querySelector(".club__lead-name");
      const chars = [...name.textContent].map((ch) => {
        const sp = document.createElement("span");
        sp.textContent = ch === " " ? " " : ch;
        sp.style.display = "inline-block";
        return sp;
      });
      name.textContent = "";
      name.append(...chars);
      this.leadTl = gsap.timeline({ delay: 0.35 })
        .fromTo(lead, { autoAlpha: 0, y: 36, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: 1.0, ease: "expo.out" })
        .fromTo(chars, { yPercent: 110, opacity: 0, rotateX: -80 }, { yPercent: 0, opacity: 1, rotateX: 0, duration: 0.9, ease: "expo.out", stagger: 0.035 }, 0.15)
        .fromTo(lead.querySelectorAll(".club__lead-k, .club__lead-role, .club__lead-statement"), { y: 14, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.8, ease: "expo.out", stagger: 0.12 }, 0.45);
    }
    const items = [...this.clubEl.querySelectorAll(".club__credit")];
    if (!items.length || this.creditsTl) return;
    const tl = (this.creditsTl = gsap.timeline({ repeat: -1, delay: 2.2 }));
    for (const it of items) {
      const name = it.querySelector(".club__name"), role = it.querySelector(".club__role");
      if (!name._chars) {
        name._chars = [...name.textContent].map((ch) => {
          const sp = document.createElement("span");
          sp.textContent = ch === " " ? "\u00a0" : ch;
          sp.style.display = "inline-block";
          return sp;
        });
        name.textContent = "";
        name.append(...name._chars);
      }
      tl.set(it, { autoAlpha: 1 })
        .fromTo(name._chars, { yPercent: 110, opacity: 0, rotateX: -80 }, { yPercent: 0, opacity: 1, rotateX: 0, duration: 0.8, ease: "expo.out", stagger: 0.03 })
        .fromTo(role, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "expo.out" }, "-=0.5")
        .to({}, { duration: 2.2 })
        .to([name._chars, role], { yPercent: -110, opacity: 0, duration: 0.45, ease: "power3.in", stagger: 0.01 })
        .set(it, { autoAlpha: 0 });
    }
  }

  playAll() {
    for (const v of this.videos) v.play().catch(() => {});
    if (this.music.paused) this.music.play().catch(() => {});
  }

  pauseAll() {
    for (const v of this.videos) v.pause();
    this.music.pause();
  }

  act(what, btn) {
    if (what === "mute") {
      this.muted = !this.muted;
      this.music.muted = this.muted;
      btn.textContent = this.muted ? "Unmute" : "Mute";
    } else if (what === "confetti") {
      this.fire(220);
    } else if (what === "top") {
      this.pauseAll();
      this.lenis ? this.lenis.scrollTo(0, { duration: 3.2 }) : window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  /* The song drives the lights: bass energy from an analyser, or a steady 128 bpm. */
  listen() {
    if (this.analyser || !window.__audioCtx) return;
    try {
      const ctx = window.__audioCtx;
      const src = ctx.createMediaElementSource(this.music);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      src.connect(this.analyser);
      this.analyser.connect(ctx.destination);
      this.bins = new Uint8Array(this.analyser.frequencyBinCount);
    } catch {}
  }

  beat(t) {
    const steady = Math.pow(Math.max(0, Math.cos(t * Math.PI * (128 / 60))), 8);
    if (!this.analyser || this.music.paused) return steady;
    this.analyser.getByteFrequencyData(this.bins);
    let s = 0;
    for (let i = 1; i < 8; i++) s += this.bins[i];
    const b = s / (7 * 255);
    this.avg = (this.avg ?? b) * 0.94 + b * 0.06;
    return Math.min(1, Math.max(0, (b - this.avg * 0.8) * 3.5 + b * 0.35));
  }

  /* ------------------------------------------------ the club */
  build() {
    if (this.renderer) return;
    const canvas = this.clubEl.querySelector(".club__canvas");
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.dpr = Math.min(window.devicePixelRatio || 1, Q.dpr, 1.5);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setClearColor(0x030108, 1);
    const scene = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(44, 1, 0.1, 80);
    this.clock = new THREE.Clock();
    this.u = { uTime: { value: 0 }, uBeat: { value: 0 }, uOn: { value: 0 } };

    // Mirror floor, with glossy black tiles over it.
    this.mirror = new Reflector(new THREE.PlaneGeometry(40, 30), { clipBias: 0.003, textureWidth: 512, textureHeight: 512, color: 0x8a8a96 });
    this.mirror.rotation.x = -Math.PI / 2;
    scene.add(this.mirror);
    const tiles = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: floorFrag, transparent: true, depthWrite: false, uniforms: this.u }));
    tiles.rotation.x = -Math.PI / 2;
    tiles.position.y = 0.002;
    tiles.renderOrder = 1;
    scene.add(tiles);

    // A black room, a huge LED wall behind the stage, and a chrome 100 turning over the singers.
    const room = new THREE.Mesh(new THREE.PlaneGeometry(60, 20), new THREE.MeshBasicMaterial({ color: 0x050309 }));
    room.position.set(0, 8, -7.2);
    scene.add(room);
    this.bands = new Array(16).fill(0);
    this.ledU = { ...this.u, uBands: { value: this.bands } };
    const led = new THREE.Mesh(new THREE.PlaneGeometry(17.6, 6.6), new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: ledFrag, uniforms: this.ledU }));
    led.position.set(0, 3.9, -7);
    scene.add(led);
    this.chromeU = { uTime: this.u.uTime, uBeat: this.u.uBeat };
    new FontLoader().load("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json", (font) => {
      const geo = new TextGeometry("100", { font, size: 1.45, height: 0.45, depth: 0.45, curveSegments: 10,
        bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.05, bevelSegments: 5 });
      geo.center();
      geo.computeVertexNormals();
      this.hundred = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: chromeFrag, uniforms: this.chromeU }));
      this.hundred.position.set(0, 3.75, -2.2);
      scene.add(this.hundred);
    });

    // The crowd at the back (one clip, cropped to its figures, some copies mirrored) and the singers out front.
    const tex = this.videos.map((v) => {
      const t = new THREE.VideoTexture(v);
      t.colorSpace = THREE.NoColorSpace;
      t.minFilter = THREE.LinearFilter;
      return t;
    });
    const person = (t, rect, h, x, z, flip, tint) => {
      const w = h * ((rect[2] * 576) / (rect[3] * 1024));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.ShaderMaterial({
        vertexShader: vert, fragmentShader: keyFrag, transparent: true,
        uniforms: { uVideo: { value: t }, uRect: { value: new THREE.Vector4(...rect) }, uTint: { value: new THREE.Color(tint) },
          uFlip: { value: flip ? 1 : 0 }, uBeat: this.u.uBeat, uOn: this.u.uOn },
      }));
      m.position.set(x, h / 2, z);
      m.rotation.y = -x * 0.04;
      scene.add(m);
      return m;
    };
    this.people = [
      person(tex[0], CROWD_RECT, 2.7, -6.2, -4.6, true, 0xc9b8ff), person(tex[0], CROWD_RECT, 2.7, -3.0, -5.0, false, 0xffc9ee),
      person(tex[0], CROWD_RECT, 2.7, 3.0, -5.0, true, 0xbff6ff), person(tex[0], CROWD_RECT, 2.7, 6.2, -4.6, false, 0xffe6b0),
      person(tex[0], CROWD_RECT, 2.4, -4.4, -2.6, false, 0xffffff), person(tex[0], CROWD_RECT, 2.4, 4.4, -2.6, true, 0xffffff),
    ];
    // A low stage for the singers, edged with light.
    const stage = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.22, 1.5), new THREE.MeshBasicMaterial({ color: 0x0b0716 }));
    stage.position.set(0, 0.11, 0.7);
    scene.add(stage);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(4.82, 0.035, 0.035), new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: beamFrag, ...additive,
      uniforms: { uColor: { value: new THREE.Color(NEON[1]) }, uI: { value: 1 }, uCore: { value: 1 } } }));
    edge.position.set(0, 0.22, 1.46);
    this.edge = edge;
    scene.add(edge);
    this.singers = person(tex[1], SINGER_RECT, 2.5, 0, 0.75, false, 0xffffff);
    this.singers.position.y += 0.22;

    // Lasers from the back corners and the stage.
    this.lasers = [];
    const origins = [[-7, 6.5, -6.5], [7, 6.5, -6.5], [-2.6, 0.4, -0.8], [2.6, 0.4, -0.8], [0, 7.5, -6.5], [-7, 1, -6.5], [7, 1, -6.5]];
    origins.forEach((o, i) => {
      const color = new THREE.Color(NEON[i % 3]);
      const g = new THREE.Group();
      for (const [r, core] of [[0.012, 1], [0.1, 0]]) {
        const geo = new THREE.CylinderGeometry(r, r, 1, core ? 6 : 14, 1, true);
        geo.translate(0, 0.5, 0);
        g.add(new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: beamFrag, ...additive,
          uniforms: { uColor: { value: color }, uI: { value: 0 }, uCore: { value: core } } })));
      }
      g.position.set(...o);
      g.scale.set(1, 26, 1);
      scene.add(g);
      this.lasers.push({ g, i, mats: g.children.map((c) => c.material) });
    });

    // Spotlights through haze, with pools of light on the floor.
    this.spots = [];
    const SH = 9;
    [[-4.5, 0xffc860], [-1.5, 0x5f7dff], [1.5, 0x9fd8ff], [4.5, 0xff5fd0]].forEach(([x, c], i) => {
      const geo = new THREE.ConeGeometry(1.5, SH, 40, 1, true);
      geo.translate(0, -SH / 2, 0);
      const cone = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: coneVert, fragmentShader: coneFrag, ...additive, side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color(c) }, uI: { value: 0 }, uH: { value: SH } } }));
      cone.position.set(x, 8.2, -1.5);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: poolFrag, ...additive,
        uniforms: { uColor: { value: new THREE.Color(c) }, uI: { value: 0 } } }));
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = 0.01;
      pool.renderOrder = 2;
      scene.add(cone, pool);
      this.spots.push({ cone, pool, i, x });
    });

    // Mirror ball and the specks of light it throws.
    this.ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 3), new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: ballFrag, uniforms: this.u }));
    this.ball.position.set(4.9, 4.6, -1.2);
    scene.add(this.ball);
    const N = 420, dirs = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 1.4 - 1, Math.random() * 2 - 1).normalize();
      dirs.set([v.x, v.y, v.z], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    sg.setAttribute("aDir", new THREE.BufferAttribute(dirs, 3));
    this.specks = new THREE.Points(sg, new THREE.ShaderMaterial({ vertexShader: speckVert, fragmentShader: speckFrag, ...additive,
      uniforms: { uTime: this.u.uTime, uOn: this.u.uOn, uDpr: { value: this.dpr } } }));
    this.specks.position.copy(this.ball.position);
    this.specks.frustumCulled = false;
    scene.add(this.specks);

    // Haze.
    this.haze = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: hazeFrag, ...additive,
        uniforms: { uTime: this.u.uTime, uI: { value: 0 }, uColor: { value: new THREE.Color(NEON[i % 3]).lerp(new THREE.Color(0xffffff), 0.4) } } }));
      m.position.set((i - 2.5) * 3.2, 1.2 + (i % 3) * 1.4, -3 + (i % 2) * 2);
      scene.add(m);
      this.haze.push(m);
    }

    // Confetti.
    this.confettiN = Math.round(2400 * Math.max(0.5, Q.fx));
    this.confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.075, 0.13),
      new THREE.ShaderMaterial({ vertexShader: foilVert, fragmentShader: foilFrag, side: THREE.DoubleSide }), this.confettiN);
    this.confetti.frustumCulled = false;
    const palette = [0x00f0ff, 0xff2bd6, 0x7dff3a, 0xffd23f, 0xe8e8ff, 0x8f6bff, 0xffb347].map((c) => new THREE.Color(c));
    this.bits = [];
    for (let i = 0; i < this.confettiN; i++) {
      this.confetti.setColorAt(i, palette[i % palette.length]);
      this.bits.push({ p: new THREE.Vector3(0, -50, 0), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), alive: false });
    }
    scene.add(this.confetti);
    this.next = 0;
    this.dummy = new THREE.Object3D();

    // Glow: everything bright (neon, lasers, foil, the LED wall) blooms like real light in haze.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(scene, this.camera));
    // One bad pixel (a zero-length normal far away) would be smeared over the whole frame by the
    // glow, so anything not a number is dropped and very bright values are capped first.
    this.composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
        void main() { vec4 c = texture2D(tDiffuse, vUv);
          if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
          gl_FragColor = vec4(min(c.rgb, vec3(3.0)), 1.0); }`,
    }));
    if (Q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.42, 0.28, 0.9);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());

    this.resize = this.resize.bind(this);
    window.addEventListener("resize", this.resize);
    this.resize();
  }

  makeSign(text) {
    const c = document.createElement("canvas");
    c.width = 1024; c.height = 256;
    const x = c.getContext("2d");
    x.font = "300 150px Newsreader, Georgia, serif";
    x.textAlign = "center";
    x.textBaseline = "middle";
    for (const [blur, color] of [[40, "#ff2bd6"], [18, "#ff7ae6"], [0, "#ffe6fb"]]) {
      x.shadowBlur = blur; x.shadowColor = "#ff2bd6"; x.fillStyle = color;
      x.fillText(text, 512, 134);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    this.signMat = new THREE.MeshBasicMaterial({ map: t, ...additive, color: 0xffffff });
    return new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), this.signMat);
  }

  fire(n) {
    // Two cannons at the front corners, aimed up and in.
    for (let k = 0; k < n; k++) {
      const b = this.bits[this.next];
      this.next = (this.next + 1) % this.confettiN;
      const side = k % 2 ? 1 : -1;
      b.p.set(side * 5.2, 0.3, 2.2);
      b.v.set(-side * (1.2 + Math.random() * 2.6), 8 + Math.random() * 5, -1.5 - Math.random() * 3);
      b.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      b.w.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      b.alive = true;
    }
  }

  resize() {
    if (!this.renderer) return;
    const W = this.clubEl.clientWidth || window.innerWidth, H = window.innerHeight;
    this.renderer.setSize(W, H, false);
    this.camera.aspect = W / H;
    // Keep the whole stage in frame on narrow windows by pulling back.
    this.baseZ = 9.2 * Math.max(1, 1.6 / this.camera.aspect);
    this.camera.updateProjectionMatrix();
    this.mirror.getRenderTarget().setSize(Math.floor(W * this.dpr * 0.5), Math.floor(H * this.dpr * 0.5));
    this.composer?.setSize(W, H);
    this.composer?.setPixelRatio(this.dpr);
  }

  loop() {
    if (!this.visible) { this.raf = 0; return; }
    this.raf = requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    const b = this.state === "club" ? this.beat(t) : 0.15;
    // The lights come up hard when you drop in.
    const sinceDrop = this.dropAt ? (performance.now() - this.dropAt) / 1000 : -1;
    const on = this.state === "club" ? Math.min(1, Math.max(0, sinceDrop / 0.25)) : 0.12;
    this.u.uTime.value = t;
    this.u.uBeat.value = b;
    this.u.uOn.value = on;
    this.clubEl.style.setProperty("--beat", b.toFixed(3));
    this.clubEl.style.setProperty("--on", on.toFixed(3));

    const m = this.mouse || { x: 0, y: 0 };
    this.camera.position.set(Math.sin(t * 0.21) * 0.9, 2.2 + b * 0.05, this.baseZ + Math.sin(t * 0.13) * 0.4);
    this.camera.lookAt(0, 1.9, -1.5);

    for (const L of this.lasers) {
      const k = L.i;
      L.g.rotation.set(-1.15 + Math.sin(t * (0.6 + k * 0.13) + k) * 0.5, 0, Math.sin(t * (0.9 + k * 0.21) + k * 1.7) * 1.0 * (k < 2 ? 1 : 0.6));
      if (k === 2 || k === 3) L.g.rotation.x = -0.25 + Math.sin(t * 1.3 + k) * 0.35;
      const flick = (Math.sin(t * 7 + k * 3) > -0.3 ? 1 : 0.2) * on;
      for (const mat of L.mats) mat.uniforms.uI.value = flick * (0.4 + 0.35 * b);
    }
    for (const s of this.spots) {
      const a = Math.sin(t * (0.5 + s.i * 0.15) + s.i * 1.9) * 0.45;
      const c = Math.cos(t * (0.4 + s.i * 0.11) + s.i) * 0.25;
      s.cone.rotation.set(c, 0, a);
      const dir = new THREE.Vector3(0, -1, 0).applyEuler(s.cone.rotation);
      const hit = s.cone.position.clone().addScaledVector(dir, s.cone.position.y / Math.max(0.2, -dir.y));
      s.pool.position.set(hit.x, 0.01, hit.z);
      const r = 1.5 * (s.cone.position.y / 9) / Math.max(0.3, -dir.y) * 2.2;
      s.pool.scale.set(r, r, 1);
      const I = (0.55 + 0.6 * b) * on;
      s.cone.material.uniforms.uI.value = I;
      s.pool.material.uniforms.uI.value = I;
    }
    this.ball.rotation.y = t * 0.6;
    this.edge.material.uniforms.uI.value = 0.5 + 0.8 * b * on;
    // Equalizer bands for the LED wall: from the song, or a fake one before it plays.
    if (this.analyser && !this.music.paused) {
      const n = this.bins.length;
      for (let i = 0; i < 16; i++) {
        const lo = Math.floor(Math.pow(i / 16, 2) * n * 0.7), hi = Math.max(lo + 1, Math.floor(Math.pow((i + 1) / 16, 2) * n * 0.7));
        let sum = 0;
        for (let j = lo; j < hi; j++) sum += this.bins[j];
        const v = sum / ((hi - lo) * 255);
        this.bands[i] += (v - this.bands[i]) * 0.35;
      }
    } else {
      for (let i = 0; i < 16; i++) this.bands[i] = (0.25 + 0.5 * Math.abs(Math.sin(t * (1.3 + i * 0.37) + i))) * (0.4 + 0.6 * b);
    }
    if (this.hundred) {
      this.hundred.rotation.y = Math.sin(t * 0.8) * 0.55;
      this.hundred.rotation.x = Math.sin(t * 0.5) * 0.08;
      this.hundred.scale.setScalar(1 + b * 0.06);
      this.hundred.position.y = 3.75 + Math.sin(t * 1.1) * 0.08;
    }
    for (const h of this.haze) {
      h.lookAt(this.camera.position);
      h.material.uniforms.uI.value = 0.3 + 0.5 * on;
    }

    // Confetti: cannons on the big hits, and a drizzle from above.
    if (this.state === "club") {
      if (b > 0.8 && (this.lastShot ?? 0) + 0.4 < t) { this.fire(90); this.lastShot = t; }
      for (let d = 0; d < 3; d++) {
        const k = this.bits[this.next];
        this.next = (this.next + 1) % this.confettiN;
        k.p.set((Math.random() - 0.5) * 14, 8, (Math.random() - 0.5) * 6 - 1);
        k.v.set(0, -0.5, 0);
        k.alive = true;
      }
    }
    for (let i = 0; i < this.confettiN; i++) {
      const k = this.bits[i];
      if (k.alive) {
        k.v.y -= 6.5 * dt;
        k.v.multiplyScalar(Math.pow(0.35, dt));
        k.v.y = Math.max(k.v.y, -1.6);
        k.p.addScaledVector(k.v, dt);
        k.p.x += Math.sin(t * 3 + i) * dt * 0.4;
        k.r.x += k.w.x * dt; k.r.y += k.w.y * dt; k.r.z += k.w.z * dt;
        if (k.p.y < 0.02) { k.p.y = 0.02; k.v.set(0, 0, 0); k.w.multiplyScalar(0); k.r.x = -Math.PI / 2; }
      }
      this.dummy.position.copy(k.p);
      this.dummy.rotation.copy(k.r);
      this.dummy.updateMatrix();
      this.confetti.setMatrixAt(i, this.dummy.matrix);
    }
    this.confetti.instanceMatrix.needsUpdate = true;

    this.composer.render();
  }
}
