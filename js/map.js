import * as THREE from "three";
import { threadVert, threadFrag, archFrag, medalFrag, flatVert } from "./shaders.js";

/* ==========================================================================
   Block 4: the braided map.
   The poem is a ruler (line 1 to line 3182). The gold strand (warrior) and
   the blue strand (leader) twist along it and cross at the six passages.
   Each connection between two passages is an arch that rises out of the
   map in 3D. Above the ruler: warrior-side connections. Below: leader-side.
   The HTML labels and buttons on top of it live in js/map-ui.js.
   ========================================================================== */

export const POEM_LINES = 3182;
const FOV = 30;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class BraidMap {
  constructor(stage, data) {
    this.stage = stage;
    this.data = data;            // { nodes: [{id, line}], conns: [{id, from, to, side}] }
    this.mouse = stage.mouse;
    this.p = 0;                  // scroll progress through the map section
    this.selected = null;        // { kind: "conn" | "node", id }
    this.hovered = null;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 8, 20000);
    this.outer = new THREE.Group();   // tilt and mouse
    this.inner = new THREE.Group();   // turned upright on phones
    this.outer.add(this.inner);
    this.scene.add(this.outer);
    this.ready = true;
    this.resize();
  }

  layout() {
    const W = this.W, H = this.H;
    const stacked = W < 700 || H > W * 1.15;
    const L = { stacked, W, H };
    L.D = H / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    if (stacked) {
      L.A = H * 0.33;                 // axis length, runs top to bottom
      L.cx = 0; L.cy = H * 0.085;
      L.side = W * 0.38;              // how far arches may reach sideways
      L.amp = W * 0.03;
      L.r = 3.2;
    } else {
      L.A = W * 0.8;
      L.cx = W * 0.02; L.cy = -H * 0.07;
      L.side = H * 0.22;
      L.amp = H * 0.03;
      L.r = 4.2;
    }
    return L;
  }

  xOf(line) { return -this.L.A / 2 + this.L.A * (line / POEM_LINES); }

  resize() {
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.camera.aspect = this.W / this.H;
    const L = (this.L = this.layout());
    this.camera.position.set(0, 0, L.D);
    this.camera.updateProjectionMatrix();
    this.outer.position.set(L.cx, L.cy, 0);
    this.inner.rotation.z = L.stacked ? -Math.PI / 2 : 0;
    if (this.W < 50 || this.H < 50) return;        // a window with no size yet (it is rebuilt on the next resize)
    this.build();
  }

  clear() {
    for (const c of [...this.inner.children]) {
      c.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
      this.inner.remove(c);
    }
  }

  build() {
    this.clear();
    const L = this.L;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const nodes = this.data.nodes.map((n) => ({ ...n, x: this.xOf(n.line) }));
    this.nodes = nodes;

    // ---- ruler: the poem, line 1 to 3182
    const tick = [];
    for (let line = 0; line <= POEM_LINES; line += 100) {
      const x = this.xOf(line), big = line % 500 === 0;
      tick.push(x, big ? -12 : -5, 0, x, big ? 12 : 5, 0);
    }
    const axis = [this.xOf(0), 0, 0, this.xOf(POEM_LINES), 0, 0];
    const lines = new THREE.BufferGeometry();
    lines.setAttribute("position", new THREE.Float32BufferAttribute([...tick, ...axis], 3));
    this.ruler = new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
    this.inner.add(this.ruler);

    // ---- the two strands, twisting like a cord and crossing at each passage
    const xs = [this.xOf(0), ...nodes.map((n) => n.x), this.xOf(POEM_LINES)];
    const strand = (sign, endX) => {
      const pts = [];
      for (let seg = 0; seg < xs.length - 1; seg++) {
        const a = xs[seg], b = xs[seg + 1];
        const amp = Math.min(L.amp, (b - a) * 0.32);
        const steps = Math.max(6, Math.ceil((b - a) / 14));
        for (let i = seg === 0 ? 0 : 1; i <= steps; i++) {
          const t = i / steps, x = a + (b - a) * t;
          if (x > endX) break;
          const th = (seg + t) * Math.PI;
          pts.push(V(x, sign * amp * Math.sin(th), sign * amp * 1.4 * Math.cos(th)));
        }
      }
      return new THREE.CatmullRomCurve3(pts);
    };
    const goldEnd = nodes[5].x + (xs[7] - nodes[5].x) * 0.18;
    this.gold = this.makeStrand(strand(1, goldEnd), [0.86, 0.65, 0.29], [0.42, 0.26, 0.08], 1.0, true, -1);
    const blueCurve = strand(-1, Infinity);
    // The blue strand is faint until Hrothgar's warning (passage 03).
    const dimU = (nodes[2].x - xs[0]) / (xs[7] - xs[0]);
    this.blue = this.makeStrand(blueCurve, [0.72, 0.8, 1.0], [0.2, 0.3, 0.68], 0.25, false, dimU);

    // ---- medallions at the six passages
    this.medals = nodes.map((n) => {
      const uniforms = { uOn: { value: 0 }, uDim: { value: 0 } };
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
        vertexShader: flatVert, fragmentShader: medalFrag, uniforms, transparent: true, depthWrite: false,
      }));
      const size = L.stacked ? 18 : 24;
      m.scale.set(size, size, 1);
      m.position.set(n.x, 0, 30);
      m.renderOrder = 10;
      if (L.stacked) m.rotation.z = Math.PI / 2;
      this.inner.add(m);
      return { mesh: m, uniforms, id: n.id, base: size, scale: 0 };
    });

    // ---- arches: one per connection, rising out of the map
    this.arches = this.data.conns.map((c, i) => {
      const a = nodes.find((n) => n.id === c.from), b = nodes.find((n) => n.id === c.to);
      const span = Math.abs(b.x - a.x) / L.A;
      const h = L.side * (0.22 + 0.78 * Math.pow(span / 0.65, 0.75));
      const ctrl = V((a.x + b.x) / 2, c.side * h * 2, h * 1.1);
      const curve = new THREE.QuadraticBezierCurve3(V(a.x, 0, 8), ctrl, V(b.x, 0, 8));
      const uniforms = {
        uColor: { value: c.side > 0 ? new THREE.Vector3(1.0, 0.78, 0.38) : new THREE.Vector3(0.66, 0.78, 1.0) },
        uTime: { value: 0 }, uReveal: { value: 0 }, uLength: { value: curve.getLength() }, uEmph: { value: 1 },
      };
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, L.stacked ? 1.8 : 2.4, 8, false), new THREE.ShaderMaterial({
        vertexShader: flatVert, fragmentShader: archFrag, uniforms, transparent: true, depthWrite: false,
      }));
      mesh.renderOrder = 6 + i;
      this.inner.add(mesh);
      return { mesh, uniforms, curve, id: c.id, from: c.from, to: c.to, t: c.t, side: c.side, order: i };
    });
  }

  makeStrand(curve, color, shadow, metal, fray, dimU) {
    const length = curve.getLength();
    const uniforms = {
      uColor: { value: new THREE.Vector3(...color) }, uShadow: { value: new THREE.Vector3(...shadow) },
      uReveal: { value: 0 }, uLength: { value: length }, uFray: { value: fray ? 1 - 60 / length : 2 },
      uMetal: { value: metal }, uDimU: { value: dimU },
    };
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.ceil(length / 5), this.L.r, 10, false),
      new THREE.ShaderMaterial({ vertexShader: threadVert, fragmentShader: threadFrag, uniforms }));
    mesh.renderOrder = 4;
    this.inner.add(mesh);
    return { mesh, uniforms };
  }

  setProgress(p) { this.p = p; }
  isActive() { return this.p > 0.001 && this.p < 0.999; }
  /* How far the build-up animation has got (0 to 1). */
  get build01() { return smooth(0.16, 0.5, this.p); }

  /* Screen position (CSS px) of a point in map space. */
  project(x, y, z = 0) {
    const v = new THREE.Vector3(x, y, z);
    this.inner.localToWorld(v);
    v.project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.W, y: (-v.y * 0.5 + 0.5) * this.H, z: v.z };
  }
  archPoint(arch, t) { const p = arch.curve.getPoint(t); return this.project(p.x, p.y, p.z); }
  nodePoint(id) { const n = this.nodes.find((n) => n.id === id); return this.project(n.x, 0, 30); }
  tickPoint(line) { return this.project(this.xOf(line), 0, 0); }

  /* Which arches and medallions are lit, given the selection and hover. */
  focus() {
    const f = this.hovered || this.selected;
    if (!f) return { conns: null, nodes: null };
    if (f.kind === "conn") {
      const c = this.data.conns.find((c) => c.id === f.id);
      return { conns: new Set([c.id]), nodes: new Set([c.from, c.to]) };
    }
    const conns = new Set(this.data.conns.filter((c) => c.from === f.id || c.to === f.id).map((c) => c.id));
    const nodes = new Set([f.id]);
    this.data.conns.forEach((c) => { if (conns.has(c.id)) { nodes.add(c.from); nodes.add(c.to); } });
    return { conns, nodes };
  }

  update(time) {
    const L = this.L, b = this.build01, m = this.mouse;
    // The map rises from lying flat to leaning back toward you, and follows the mouse.
    const tilt = -1.2 + 0.88 * smooth(0, 1, b);
    this.outer.rotation.set(tilt + m.y * 0.07, m.x * 0.16, 0);
    this.ruler.material.opacity = 0.4 * smooth(0, 0.3, b);
    this.gold.uniforms.uReveal.value = smooth(0.1, 0.7, b);
    this.blue.uniforms.uReveal.value = smooth(0.1, 0.75, b);

    const { conns, nodes } = this.focus();
    this.medals.forEach((md, i) => {
      const on = nodes ? nodes.has(md.id) : false;
      const appear = smooth(0.15 + i * 0.08, 0.35 + i * 0.08, b);
      const target = appear * (on ? 1.35 : 1);
      md.scale += (target - md.scale) * 0.2;
      md.mesh.scale.set(md.base * md.scale, md.base * md.scale, 1);
      md.uniforms.uOn.value = on ? 1 : 0;
      md.uniforms.uDim.value = nodes && !on ? 1 : 0;
      md.mesh.visible = md.scale > 0.01;
    });
    this.arches.forEach((a) => {
      a.uniforms.uTime.value = time;
      a.uniforms.uReveal.value = smooth(0.45 + a.order * 0.07, 0.75 + a.order * 0.07, b);
      const target = !conns ? 1 : conns.has(a.id) ? 2 : 0;
      a.uniforms.uEmph.value += (target - a.uniforms.uEmph.value) * 0.18;
    });
  }
}
