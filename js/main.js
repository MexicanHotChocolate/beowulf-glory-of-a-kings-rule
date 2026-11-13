import * as THREE from "three";
import { Gate } from "./gate.js";
import { deviceProfile, setTier, tierFor, Q } from "./quality.js";
import { Ending } from "./rave.js";
import { Stage, webglAvailable } from "./stage.js";
import { STOPS, UNITS, UNIT_VH, APPROACH, arriveU, leaveU } from "./flight.js";
import { split, revealHeading, revealWords, revealImage, cursor, magnetic } from "./motion.js";
import { BraidMap } from "./map.js";
import { MapUI, readMapData } from "./map-ui.js";
import { sfx } from "./sfx.js";

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
// Nothing in the exhibit can be copied, cut, pasted, dragged out or right-clicked.
for (const ev of ["copy", "cut", "paste", "contextmenu", "dragstart", "selectstart"]) {
  document.addEventListener(ev, (e) => e.preventDefault());
}
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduceMotion) document.documentElement.classList.add("reduce-motion");
const isMobile = () => window.innerWidth < 700;

/* ------------------------------------------------------------ the way in
   The quick device checks run first, so the 3D stage sizes itself for this
   computer. The gate (wyrm round the sword) shows loading progress, waits for a
   click on Enter, reads out the checks, then burns away to the opening.      */
const profile = deviceProfile();
setTier(profile.tier);                 // a first guess from the hardware; the frame rate settles it at Enter
const gateEl = document.getElementById("gate");
const skipGate = /nogate/.test(location.search);
let gate = null;
if (gateEl && !skipGate) {
  root.classList.add("is-gated");
  history.scrollRestoration = "manual";
  window.scrollTo(0, 0);
  gate = new Gate(gateEl);
  if (/debug/.test(location.search)) window.__gate = gate;
  const pct = gateEl.querySelector(".gate__pct");
  THREE.DefaultLoadingManager.onProgress = (url, loaded, total) => {
    if (pct) pct.textContent = `${Math.round((loaded / Math.max(1, total)) * 100)}%`;
  };
} else if (gateEl) {
  gateEl.remove();
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function openGate() {
  if (!gate) return;
  const btn = gateEl.querySelector(".gate__enter");
  const status = gateEl.querySelector(".gate__status");
  const list = gateEl.querySelector(".gate__checks");
  status.textContent = "Ready";
  btn.disabled = false;
  btn.focus({ preventScroll: true });
  await new Promise((r) => btn.addEventListener("click", r, { once: true }));
  btn.disabled = true;
  status.textContent = "Checking this computer";
  // A second of frames with the wyrm and its fire on screen says how fast this machine really is.
  gate.frames.length = 0;
  await wait(1100);
  const fps = gate.fps();
  setTier(tierFor(profile, fps));
  stage?.applyQuality();
  const dpr = stage ? stage.dpr : 1;
  const mem = profile.memory ? (profile.memory >= 8 ? "8 GB or more" : `${profile.memory} GB`) : "not reported";
  const lines = [
    `Graphics card <b>${profile.webgl2 ? profile.gpu : "no WebGL 2, pictures only"}</b>`,
    `Cores <b>${profile.cores || "not reported"}</b> &middot; Memory <b>${mem}</b>`,
    `Frame rate <b>${fps} fps</b>`,
    `Setting <b>${Q.label}</b>: ${+dpr.toFixed(2)}x pixels, ${Q.msaa ? `${Q.msaa}x smoothing` : "no smoothing"}, ${Math.round(Q.fx * 100)}% particles`,
    `Frame rate watched while you scroll; detail drops if it dips`,
  ];
  status.textContent = `Set to ${Q.label}`;
  for (const html of lines) {
    const li = document.createElement("li");
    li.innerHTML = html;
    list.appendChild(li);
    await wait(30);
    li.classList.add("is-on");
    await wait(260);
  }
  await wait(350);
  // The wyrm turns its fire on the screen, which catches and burns away; the opening starts
  // underneath as soon as the burn does.
  gateEl.classList.add("is-leaving");
  await gate.exit();
  sfx.fire();
  root.classList.remove("is-gated");
  lenis?.start();
  gate.burnt.then(() => {
    gateEl.classList.add("is-gone");
    setTimeout(() => { gate.dispose(); gateEl.remove(); }, 400);
  });
}

/* ------------------------------------------------------------ smooth scroll
   Lenis drives the scroll and GSAP's ticker drives Lenis, so ScrollTrigger and
   the WebGL frame always read the same scroll position.                     */
let lenis = null;
if (!reduceMotion && window.Lenis) {
  lenis = new window.Lenis({
    duration: 1.25,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  if (gate) lenis.stop();
}

const scrollToY = (y, duration = 2.2) => lenis ? lenis.scrollTo(y, { duration }) : window.scrollTo({ top: y, behavior: "smooth" });

/* Jump to stop k (0 to 5) of the flight. */
function goToStop(k) {
  if (!flightTrigger) return;
  const p = (arriveU(k) + 0.12 + APPROACH) / (UNITS + APPROACH);
  scrollToY(flightTrigger.start + p * (flightTrigger.end - flightTrigger.start), 2.6);
}
/* Jump to the built map, optionally picking a connection. */
function goToMap(connId) {
  if (!mapTrigger) return;
  scrollToY(mapTrigger.start + 0.52 * (mapTrigger.end - mapTrigger.start), 2.4);
  if (connId && mapUI) mapUI.select({ kind: "conn", id: connId });
}

document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const target = document.querySelector(a.getAttribute("href"));
    if (!target) return;
    e.preventDefault();
    if (a.getAttribute("href") === "#flight" && flightTrigger) { goToStop(Number(a.dataset.stop || 0)); return; }
    if (a.getAttribute("href") === "#map" && mapTrigger) { goToMap(a.dataset.conn); return; }
    if (a.getAttribute("href") === "#guide" && heroTrigger) {
      const end = heroTrigger.end + window.innerHeight * 0.05;
      lenis ? lenis.scrollTo(end, { duration: 2.4 }) : window.scrollTo({ top: end, behavior: "smooth" });
      return;
    }
    const offset = -(document.querySelector(".nav").offsetHeight + 12);
    lenis ? lenis.scrollTo(target, { duration: 1.8, offset }) : window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY + offset, behavior: "smooth" });
  });
});

/* Browsers only allow sound after a click or key press. The first one anywhere
   unlocks audio for the ending (Block 9), so no sound button is needed.     */
const unlockAudio = () => {
  try {
    window.__audioCtx = window.__audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    window.__audioCtx.resume();
  } catch {}
};
window.addEventListener("pointerdown", unlockAudio, { once: true });
window.addEventListener("keydown", unlockAudio, { once: true });

/* ------------------------------------------------------------ boot */
let stage = null;
let heroTrigger = null;
let flightTrigger = null;
let mapTrigger = null;
let mapUI = null;
let ending = null;

/* Stop scrolling for two seconds anywhere (except the very end, where the alarm takes
   over) and a big "Keep scrolling" sign rises at the bottom of the screen. */
function nudge() {
  const el = document.querySelector(".nudge");
  if (!el || reduceMotion) return;
  let timer = 0, shown = false;
  const endEl = document.getElementById("ending");
  const show = () => {
    if (root.classList.contains("is-gated")) return arm();
    if (ending && ending.state !== "idle") return;
    if (endEl && endEl.getBoundingClientRect().top < window.innerHeight * 0.85) return arm();
    shown = true;
    el.classList.add("is-on");
  };
  const arm = () => { clearTimeout(timer); timer = setTimeout(show, 2000); };
  const moved = () => {
    if (shown) { shown = false; el.classList.remove("is-on"); }
    arm();
  };
  for (const ev of ["wheel", "touchmove", "keydown", "pointerdown"]) window.addEventListener(ev, moved, { passive: true });
  if (lenis) lenis.on("scroll", (l) => { if (Math.abs(l.velocity) > 0.3) moved(); });
  else window.addEventListener("scroll", moved, { passive: true });
  arm();
}

async function boot() {
  if (webglAvailable()) {
    try {
      stage = new Stage(document.getElementById("stage"));
      await stage.load();
    } catch (err) {
      console.error("WebGL stage failed, using the static fallback.", err);
      stage = null;
    }
  }
  if (!stage) root.classList.add("no-webgl");
  if (location.search.includes("debug")) window.__exhibit = { stage, ScrollTrigger, lenis };

  await document.fonts?.ready;
  root.classList.add("is-ready");

  // Block 4: the braided map reads its words from the page.
  const mapRoot = document.getElementById("map");
  if (stage) {
    const data = readMapData(mapRoot);
    stage.map = new BraidMap(stage, data);
    mapUI = new MapUI(mapRoot, data, stage.map);
  }

  if (stage) {
    gsap.ticker.add(() => { stage.update(); updateFlightDom(); mapUI?.update(); });
    window.addEventListener("resize", () => stage.resize());
    window.addEventListener("pointermove", (e) => {
      stage.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    });
  }

  scrollScenes();
  flightScenes();
  braidScenes();
  mapScenes();
  evidenceScenes();
  if (stage) await stage.loadFlight();
  ScrollTrigger.refresh();
  await openGate();
  cursor();
  magnetic(".pill, .club__btn, .map__chip");
  intro();
  const endEl = document.getElementById("ending"), alarmEl = document.getElementById("alarm"), clubEl = document.getElementById("club");
  if (endEl && alarmEl && clubEl) {
    ending = new Ending({ endEl, alarmEl, clubEl, lenis, onUnlock: () => { lenis?.resize(); ScrollTrigger.refresh(); } });
    if (window.__exhibit) window.__exhibit.ending = ending;
  }
  const q = new URLSearchParams(location.search);
  if (!q.has("nonudge")) nudge();
  // Testing only (?debug&goto=u): jump straight to a point in the flight.
  if (window.__exhibit && q.has("goto") && flightTrigger) {
    ScrollTrigger.refresh();
    const u = parseFloat(q.get("goto")), p = (u + APPROACH) / (UNITS + APPROACH);
    lenis?.scrollTo(flightTrigger.start + p * (flightTrigger.end - flightTrigger.start), { immediate: true, force: true });
    ScrollTrigger.update();
    for (let i = 0; i < 8; i++) { gsap.ticker.tick(); stage?.update(); }
  }
}

/* ------------------------------------------------------------ Block 3
   The flight section is a tall block with a sticky viewport. Its scroll
   progress drives the WebGL camera; the text cards and figure captions are
   faded from the same numbers, so words and pictures never drift apart.    */
function flightScenes() {
  // the section is as tall as the flight: one unit of scroll per UNIT_VH, plus the slide-in
  document.getElementById("flight").style.height = `calc(${UNITS} * ${UNIT_VH}vh + 100vh)`;
  flightTrigger = ScrollTrigger.create({
    trigger: "#flight",
    start: "top bottom",
    end: "bottom bottom",
    onUpdate: (self) => stage?.flight?.setProgress(self.progress),
    onRefresh: (self) => stage?.flight?.setProgress(self.progress),
  });
  window.addEventListener("scroll", () => {
    if (stage) stage.state.scroll = window.scrollY / window.innerHeight * 0.06;
  }, { passive: true });
}

/* From the moment the opening dissolves to the start of the flight, the camera
   follows the braid down (the reading guide scrolls past beside it). */
function braidScenes() {
  if (!heroTrigger || !flightTrigger) return;
  ScrollTrigger.create({
    start: () => heroTrigger.start + 0.76 * (heroTrigger.end - heroTrigger.start),
    end: () => flightTrigger.start,
    onUpdate: (self) => stage?.flight?.setPre(self.progress),
    onRefresh: (self) => stage?.flight?.setPre(self.progress),
  });
}

/* ------------------------------------------------------------ Block 4 */
function mapScenes() {
  mapTrigger = ScrollTrigger.create({
    trigger: "#map",
    start: "top bottom",
    end: "bottom bottom",
    onUpdate: (self) => stage?.map?.setProgress(self.progress),
    onRefresh: (self) => stage?.map?.setProgress(self.progress),
  });
  if (reduceMotion) return;
  revealHeading(document.querySelector(".map__title"), { start: "top 80%" });
  revealWords(document.querySelector(".map__how"), { start: "top 85%", delay: 0.2 });
  revealHeading(document.querySelector(".design-test__title"), { start: "top 80%" });
  revealWords(document.querySelector(".design-test__body"), { start: "top 85%", delay: 0.15, each: 0.006 });
}

/* ------------------------------------------------------------ Block 5
   The sky dissolves through a halftone screen into museum cream while the
   evidence labels are on screen, then back to blue after them.            */
function evidenceScenes() {
  const cream = { in: 0, out: 0 };
  const apply = () => {
    const c = cream.in * (1 - cream.out);
    if (stage) stage.state.cream = c;
    root.classList.toggle("is-cream", c > 0.5);
  };
  ScrollTrigger.create({ trigger: "#evidence", start: "top 90%", end: "top 25%", scrub: true,
    onUpdate: (self) => { cream.in = self.progress; apply(); }, onRefresh: (self) => { cream.in = self.progress; apply(); } });
  // The page stays cream after the labels for now; Blocks 6 to 8 (Leyerle, counter-reading,
  // statement) read like the rest of a museum's reading room. cream.out stays 0.

  if (reduceMotion) return;
  gsap.utils.toArray(".ev").forEach((ev) => {
    const img = ev.querySelector(".ev__frame img");
    const frame = ev.querySelector(".ev__frame");
    // The picture drifts inside its frame as you scroll past the label.
    gsap.fromTo(img, { yPercent: -4 }, { yPercent: 4, ease: "none", scrollTrigger: { trigger: ev, start: "top bottom", end: "bottom top", scrub: true } });
    // ...and tilts toward the mouse like a plate in a museum case.
    const fig = ev.querySelector(".ev__fig");
    fig.addEventListener("pointermove", (e) => {
      const r = fig.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      frame.style.transform = `rotateY(${(x * 8).toFixed(2)}deg) rotateX(${(-y * 6).toFixed(2)}deg)`;
    });
    fig.addEventListener("pointerleave", () => { frame.style.transform = ""; });
    // Each label: the picture opens like a shutter, the title rises, the quote and notes follow.
    revealImage(frame, img);
    revealHeading(ev.querySelector(".ev__title"), { start: "top 80%" });
    ev.querySelectorAll(".ev__quote p").forEach((p) => {
      revealWords(p, { start: "top 85%", each: 0.008 });
      // then the key words get highlighted, swept on like a highlighter pen
      gsap.to(p.querySelectorAll("mark"), { backgroundSize: "100% 100%", duration: 0.7, ease: "power2.inOut", stagger: 0.18, delay: 0.7,
        scrollTrigger: { trigger: p, start: "top 85%", toggleActions: "play none none reverse" } });
    });
    ev.querySelectorAll(".ev__notes p, .ev__leyerle p").forEach((p) => revealWords(p, { start: "top 90%", each: 0.003 }));
    gsap.from(ev.querySelectorAll(".ev__cite"), { opacity: 0, x: -16, duration: 0.9, ease: "expo.out", scrollTrigger: { trigger: ev, start: "top 70%", toggleActions: "play none none reverse" } });
  });
  revealHeading(document.querySelector(".evidence__title"), { start: "top 80%" });
  revealWords(document.querySelector(".evidence__intro"), { start: "top 85%", delay: 0.2 });
  gsap.utils.toArray(".ev__claim").forEach((p) => gsap.from(p, { y: 20, opacity: 0, duration: 1, ease: "expo.out",
    scrollTrigger: { trigger: p, start: "top 88%", toggleActions: "play none none reverse" } }));
  // Critical source, counter-reading and the curatorial statement.
  document.querySelectorAll(".sec__title").forEach((h) => revealHeading(h, { start: "top 82%" }));
  gsap.utils.toArray(".sec__eyebrow, .crit__src").forEach((p) => gsap.from(p, { x: -16, opacity: 0, duration: 0.9, ease: "expo.out",
    scrollTrigger: { trigger: p, start: "top 88%", toggleActions: "play none none reverse" } }));
  gsap.utils.toArray(".crit__body > *, .crit__stance, .cur__body p, .ctr__side").forEach((p) => gsap.from(p, { y: 28, opacity: 0, duration: 1.1, ease: "expo.out",
    scrollTrigger: { trigger: p, start: "top 90%", toggleActions: "play none none reverse" } }));
  // Works Cited and the closing card.
  revealHeading(document.querySelector(".cited__title"), { start: "top 82%" });
  gsap.from(".cited__list li, .cited__sub", { y: 24, opacity: 0, duration: 1, ease: "expo.out", stagger: 0.05,
    scrollTrigger: { trigger: ".cited__col", start: "top 75%", toggleActions: "play none none reverse" } });
  revealHeading(document.querySelector(".ending__line"), { start: "top 70%" });
  revealWords(document.querySelector(".ending__names"), { start: "top 75%", delay: 0.4, each: 0.05 });
}

/* Each scene's words build as the camera arrives (the strand tag slides in, letters rise,
   the quote follows word by word, then the notes) and lift away as it leaves, scrubbed
   exactly with the flight. The whole block also rides on its painting: it slides off
   sideways with a pan, drops away on a descent, rushes past on a dive. */
const stopMotion = [...document.querySelectorAll(".stop-layer")].map((layer) => {
  const el = layer.querySelector(".stop");
  const title = split(el.querySelector(".stop__title"), { chars: true });
  const quote = split(el.querySelector(".stop__quote p"));
  const meta = el.querySelector(".stop__meta"), cite = el.querySelector(".stop__cite");
  const paras = [...el.querySelectorAll(".stop__para"), el.querySelector(".stop__label")];
  const rule = el.querySelector(".stop__body");
  const tin = gsap.timeline({ paused: true })
    .from(meta, { opacity: 0, x: -24, duration: 0.5, ease: "expo.out" }, 0)
    .from(title.chars, { yPercent: 120, rotateX: -80, opacity: 0, duration: 0.7, ease: "expo.out", stagger: 0.01 }, 0.04)
    .from(quote.words, { yPercent: 115, opacity: 0, duration: 0.6, ease: "expo.out", stagger: 0.007 }, 0.2)
    .from(cite, { opacity: 0, x: -14, duration: 0.5, ease: "expo.out" }, 0.34)
    .from(rule, { "--rule": 0, duration: 0.7, ease: "expo.inOut" }, 0.36)
    .from(paras, { opacity: 0, y: 22, clipPath: "inset(0% 0% 100% 0%)", duration: 0.7, ease: "expo.out", stagger: 0.09 }, 0.42);
  const tout = gsap.timeline({ paused: true })
    .to(title.words, { yPercent: -120, duration: 0.6, ease: "power3.in", stagger: 0.03 }, 0)
    .to([meta, el.querySelector(".stop__quote"), cite], { y: -30, opacity: 0, duration: 0.5, ease: "power3.in", stagger: 0.03 }, 0.04)
    .to([rule, el.querySelector(".stop__label")], { opacity: 0, y: -24, duration: 0.5, ease: "power3.in", stagger: 0.04 }, 0.1);
  return { layer, el, tin, tout, on: false };
});
const beats = [...document.querySelectorAll(".beat")].map((el) => {
  const w = split(el);
  const tin = gsap.timeline({ paused: true }).from(w.words, { yPercent: 110, opacity: 0, duration: 0.8, ease: "expo.out", stagger: 0.04 });
  return { el, tin, on: false };
});
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// Quiet sounds as the camera moves on, forward only: air between scenes, the plunge into the
// sea after passage 01, the rip through passage 02.
let sfxU = null;
function flightSounds(u) {
  const prev = sfxU;
  sfxU = u;
  if (prev === null || !(u > prev) || u - prev > 0.3) return;
  const crossed = (x) => prev < x && u >= x;
  for (let k = 0; k < STOPS.length - 1; k++) {
    const into = STOPS[k + 1].into;
    if (crossed(leaveU(k))) into === "rip" ? sfx.rip() : sfx.whoosh();
    if (into === "sea" && crossed(leaveU(k) + 0.12)) sfx.splash();
  }
}

function updateFlightDom() {
  const f = stage?.flight;
  if (!f?.ready) return;
  const u = f.u, n = STOPS.length;
  flightSounds(u);
  stopMotion.forEach((s, k) => {
    const pin = reduceMotion ? (f.activeStop() === k ? 1 : 0) : sm(arriveU(k) - 0.17, arriveU(k) + 0.05, u);
    const pout = reduceMotion ? 0 : sm(leaveU(k) - 0.05, leaveU(k) + 0.09, u);
    const o = reduceMotion ? { x: 0, y: 0, s: 1 } : f.textOffset(k);
    const on = pin > 0.001 && pout < 0.999 && !!o;
    if (on !== s.on) { s.on = on; s.layer.style.visibility = on ? "visible" : "hidden"; s.el.classList.toggle("is-on", on); }
    if (!on) return;
    s.tin.progress(pin);
    s.tout.progress(pout);
    s.layer.style.transform = `translate3d(${o.x.toFixed(1)}px, ${o.y.toFixed(1)}px, 0) scale(${Math.max(0.82, o.s).toFixed(4)})`;
  });
  // A line of story while the camera travels from one scene to the next.
  beats.forEach((b, k) => {
    const a = leaveU(k), e = k < n - 1 ? arriveU(k + 1) : UNITS;
    const bin = sm(a + 0.1, a + 0.21, u), bout = k < n - 1 ? sm(e - 0.25, e - 0.16, u) : sm(e - 0.14, e - 0.03, u);
    const on = !reduceMotion && bin > 0.001 && bout < 0.999;
    if (on !== b.on) { b.on = on; b.el.style.visibility = on ? "visible" : "hidden"; }
    if (!on) return;
    b.tin.progress(bin);
    b.el.style.opacity = String(1 - bout);
    b.el.style.filter = bout > 0.01 ? `blur(${(bout * 8).toFixed(1)}px)` : "";
    b.el.style.transform = `translate(-50%, calc(-50% - ${(bout * 30).toFixed(1)}px))`;
  });
}

/* The opening, straight out of the wyrm's fire: the firelight comes up and finds the
   helmet from the left, the hanging draws back, the title builds letter by letter, then
   the question, the button, the thesis, and last the map button drops in at the top. */
function intro() {
  const copy = document.querySelectorAll(".hero__copy > *");
  if (reduceMotion) {
    gsap.set([copy, ".hero__lower > *", ".nav"], { opacity: 1 });
    if (stage) Object.assign(stage.state, { intro: 1, helmetIn: 1 });
    return;
  }
  const tl = gsap.timeline({ delay: 0.05 });
  if (stage) {
    tl.to(stage.state, { helmetIn: 1, duration: 2.6, ease: "power2.inOut" }, 0);
    tl.to(stage.state, { intro: 1, duration: 2.8, ease: "power3.inOut" }, 0.35);
  }
  gsap.set(copy, { opacity: 1 });
  gsap.set(".hero__lower > *", { opacity: 1 });
  tl.fromTo(".hero__eyebrow", { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, ease: "expo.out" }, 0.4);
  tl.from(split(document.querySelector(".hero__title"), { chars: true }).chars,
    { yPercent: 125, rotateX: -85, opacity: 0, transformOrigin: "50% 100% -30px", duration: 1.7, ease: "expo.out", stagger: 0.04 }, 0.55);
  tl.from(split(document.querySelector(".hero__lede")).words, { yPercent: 115, opacity: 0, duration: 1.3, ease: "expo.out", stagger: 0.018 }, 1.05);
  tl.fromTo(".hero__sub", { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, ease: "expo.out" }, 1.3);
  tl.fromTo(".hero__cta", { y: 16, scale: 0.85, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 1.1, ease: "expo.out" }, 1.45);
  tl.fromTo(".hero__k", { x: -14, opacity: 0 }, { x: 0, opacity: 1, duration: 0.9, ease: "expo.out" }, 1.5);
  tl.from(split(document.querySelector(".claim__text")).words, { yPercent: 115, opacity: 0, duration: 1.1, ease: "expo.out", stagger: 0.006 }, 1.55);
  tl.fromTo(".nav", { y: -26, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, ease: "expo.out" }, 1.8);
}

/* Scroll story for Block 1: the hanging lets go, billows into the camera,
   the camera dives into the braided band, and the cloth dissolves through
   a halftone screen into the blue reading-guide scene.                      */
function scrollScenes() {
  const proxy = { p: 0 };
  const push = () => { if (stage) stage.state.p = proxy.p; };
  const mobile = isMobile();

  if (reduceMotion) {
    ScrollTrigger.create({
      trigger: "#guide", start: "top 80%",
      onEnter: () => stage && gsap.to(stage.state, { p: 1, duration: 0.01 }),
      onLeaveBack: () => stage && gsap.to(stage.state, { p: 0, duration: 0.01 }),
    });
    return;
  }

  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger: "#hero",
      start: "top top",
      end: mobile ? "bottom top" : "+=260%",
      pin: !mobile,
      scrub: true,
    },
  });
  heroTrigger = tl.scrollTrigger;

  tl.to(proxy, { p: 1, duration: 1, onUpdate: push }, 0);
  if (!mobile) {
    tl.to(".hero__copy", { y: -70, opacity: 0, duration: 0.2, ease: "power1.in" }, 0.03);
    tl.to(".hero__lower", { y: 50, opacity: 0, duration: 0.18, ease: "power1.in" }, 0.03);
  }

  // Reading guide: the heading builds, the paragraph rises in after it.
  revealHeading(document.querySelector(".guide__title"), { start: "top 85%" });
  document.querySelectorAll(".guide__body, .guide__strand p").forEach((p, i) => revealWords(p, { start: "top 92%", delay: 0.15 + i * 0.12, each: 0.008 }));
  gsap.from(".guide__rope", { scaleX: 0, transformOrigin: "0 50%", duration: 1.2, ease: "expo.out", stagger: 0.15,
    scrollTrigger: { trigger: ".guide__key", start: "top 88%", toggleActions: "play none none reverse" } });

  ScrollTrigger.addEventListener("refresh", () => stage && stage.resize());
}

boot();
