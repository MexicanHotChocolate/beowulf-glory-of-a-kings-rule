import * as THREE from "three";

/* ==========================================================================
   The wyrm on the Enter screen: a long gold serpent-dragon like the ones on
   Anglo-Saxon gold work, flying laps round the sword. Everything is built in
   code so all of it can move: the body ripples like a swimming snake as it
   follows its own flight path, it banks into the turn, the wings beat on the
   climbs and spread to glide on the dives, the jaw drops when it breathes
   fire. The scales are a generated normal map, so the gold catches the light
   scale by scale.
   ========================================================================== */

const S = 0.74;                         // overall size
const LEN = 4.6 * S;                    // snout to tail tip
const RINGS = 210, SEG = 36;            // body mesh: rings along, segments around
const SHOULDER = 0.86 * S;              // where the wings join
const HEAD = 0.3 * S;                   // back of the skull (origin of the head's own frame)
const ORBIT = 1.95;

// body radius along its length (distance from the snout, radius), in unscaled units
const RAD = [[0, 0.006], [0.03, 0.034], [0.09, 0.055], [0.16, 0.08], [0.23, 0.09], [0.3, 0.078], [0.38, 0.064], [0.5, 0.07],
  [0.75, 0.108], [1.0, 0.13], [1.35, 0.14], [1.75, 0.128], [2.4, 0.094], [3.2, 0.054], [4.0, 0.022], [4.6, 0.004]].map(([d, r]) => [d * S, r * S]);

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const catmull = (p0, p1, p2, p3, t) => {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};
function radiusAt(d) {
  const K = RAD;
  for (let i = 0; i < K.length - 1; i++) {
    if (d <= K[i + 1][0]) {
      const t = Math.max(0, (d - K[i][0]) / (K[i + 1][0] - K[i][0]));
      const r = catmull(K[Math.max(0, i - 1)][1], K[i][1], K[i + 1][1], K[Math.min(K.length - 1, i + 2)][1], t);
      return Math.max(0.003 * S, r);
    }
  }
  return K[K.length - 1][1];
}

/* The flight path of the head: a tilted, wavy loop round the sword. */
const TILT = -0.2;
function path(th, out) {
  const R = ORBIT + 0.22 * Math.sin(2 * th + 0.5);
  const y = 0.12 + 0.34 * Math.sin(th + 0.9) + 0.12 * Math.sin(3 * th + 0.3);
  const x = R * Math.cos(th), z = R * Math.sin(th) * 0.86;
  return out.set(x, y * Math.cos(TILT) - z * Math.sin(TILT), y * Math.sin(TILT) + z * Math.cos(TILT));
}

/* Gold scales: a tile of overlapping scales (each one's free edge pointing to the tail),
   turned into a normal map, plus a map that is rough and dark in the gaps between them. */
function scaleMaps(size = 256) {
  const NX = 4, NY = 4;
  const h = new Float32Array(size * size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = ((px + 0.5) / size) * NX, y = ((py + 0.5) / size) * NY;
      let best = 0, bestX = Infinity;
      const ix = Math.floor(x);
      for (let ci = ix - 1; ci <= ix + 1; ci++) {
        const off = (((ci % 2) + 2) % 2) * 0.5;
        const iy = Math.floor(y - off);
        for (let cj = iy - 1; cj <= iy + 1; cj++) {
          const cx = ci + 0.5, cy = cj + 0.5 + off;
          const lx = x - cx, ly = y - cy;
          const e = Math.hypot(lx / 0.8, ly / 0.6);
          if (e >= 1 || lx < -0.78) continue;
          if (cx < bestX) { bestX = cx; best = (0.3 + 0.7 * (lx + 0.78) / 1.58) * Math.sqrt(1 - e ** 4); }
        }
      }
      h[py * size + px] = best;
    }
  }
  const nrm = new Uint8Array(size * size * 4), orm = new Uint8Array(size * size * 4);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      const k = 2.2;
      let nx = -dx * k, ny = -dy * k, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * size + x) * 4;
      nrm[i] = (nx * 0.5 + 0.5) * 255; nrm[i + 1] = (ny * 0.5 + 0.5) * 255; nrm[i + 2] = (nz * 0.5 + 0.5) * 255; nrm[i + 3] = 255;
      const v = at(x, y);
      orm[i] = (0.25 + 0.75 * smooth(0.0, 0.32, v)) * 255;        // light reaching into the gaps
      orm[i + 1] = (0.16 + 0.5 * (1 - smooth(0.05, 0.6, v))) * 255; // smooth on the scale, rough in the gap
      orm[i + 2] = 0; orm[i + 3] = 255;
    }
  }
  const tex = (data) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };
  return { normal: tex(nrm), orm: tex(orm) };
}

/* A static tapered tube along a few points (horns, the jaw). */
function taperTube(points, radii, seg = 10, squash = 1) {
  const curve = new THREE.CatmullRomCurve3(points);
  const N = 20;
  const fr = curve.computeFrenetFrames(N, false);
  const pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, p = curve.getPointAt(t);
    const f = t * (radii.length - 1), k = Math.min(radii.length - 2, Math.floor(f));
    const r = radii[k] + (radii[k + 1] - radii[k]) * (f - k);
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const n = fr.normals[i], b = fr.binormals[i];
      pos.push(p.x + (n.x * Math.cos(a) + b.x * Math.sin(a) * squash) * r,
        p.y + (n.y * Math.cos(a) + b.y * Math.sin(a) * squash) * r,
        p.z + (n.z * Math.cos(a) + b.z * Math.sin(a) * squash) * r);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Wing layout in its own flat space: a = out along the span, b = back along the body.
const LEAD = [[0.04, 0.0], [0.46, -0.14], [0.9, 0.02], [1.34, 0.28], [1.78, 0.58]];
const WRIST = [0.9, 0.02];
const TIPS = [[1.78, 0.58], [1.5, 1.02], [1.05, 1.22], [0.56, 1.16], [0.08, 0.9]];
const NS = 30, NT = 12;

function polyAt(pts, s) {
  // centripetal-ish Catmull-Rom through 2D points, s in 0..1
  const n = pts.length - 1, f = Math.min(n - 1e-6, Math.max(0, s * n)), i = Math.floor(f), t = f - i;
  const P = (k) => pts[Math.min(n, Math.max(0, k))];
  return [catmull(P(i - 1)[0], P(i)[0], P(i + 1)[0], P(i + 2)[0], t), catmull(P(i - 1)[1], P(i)[1], P(i + 1)[1], P(i + 2)[1], t)];
}

export class Wyrm {
  constructor() {
    this.group = new THREE.Group();
    this.t = 0;
    this.theta0 = 0.35;
    this.amp = 0.6;
    this.open = 0;
    this.mouth = new THREE.Vector3();
    this.forward = new THREE.Vector3(1, 0, 0);
    this.buildPathTable();
    this.buildBody();
    this.buildHead();
    this.buildWings();
    this.buildSpikes();
  }

  /* Arc length along one lap, so the body keeps its length on every part of the loop. */
  buildPathTable() {
    const N = 2048, th = new Float32Array(N + 1), s = new Float32Array(N + 1);
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    path(0, a);
    for (let i = 1; i <= N; i++) {
      th[i] = (i / N) * Math.PI * 2;
      path(th[i], b);
      s[i] = s[i - 1] + a.distanceTo(b);
      a.copy(b);
    }
    this.lap = s[N];
    // inverse table: theta at evenly spaced arc lengths
    const M = 4096;
    this.inv = new Float32Array(M + 1);
    let j = 0;
    for (let k = 0; k <= M; k++) {
      const target = (k / M) * this.lap;
      while (j < N && s[j + 1] < target) j++;
      const f = (target - s[j]) / Math.max(1e-9, s[j + 1] - s[j]);
      this.inv[k] = th[j] + (th[j + 1] - th[j]) * Math.min(1, Math.max(0, f));
    }
    this.arcOf = (theta) => {
      const lapN = Math.floor(theta / (Math.PI * 2));
      const local = theta - lapN * Math.PI * 2;
      const f = (local / (Math.PI * 2)) * N, i = Math.min(N - 1, Math.floor(f));
      return lapN * this.lap + s[i] + (s[i + 1] - s[i]) * (f - i);
    };
  }

  thetaAt(arc) {
    const lapN = Math.floor(arc / this.lap);
    const local = arc - lapN * this.lap;
    const f = (local / this.lap) * 4096, i = Math.min(4095, Math.floor(f));
    return lapN * Math.PI * 2 + this.inv[i] + (this.inv[i + 1] - this.inv[i]) * (f - i);
  }

  buildBody() {
    const n = RINGS * (SEG + 1);
    this.spine = new Float32Array(RINGS * 3);
    this.base = new Float32Array(RINGS * 3);
    this.F = new Float32Array(RINGS * 3);
    this.Rv = new Float32Array(RINGS * 3);
    this.Uv = new Float32Array(RINGS * 3);
    this.radius = new Float32Array(RINGS);
    this.shape = new Float32Array(RINGS * 3);     // width factor, top height factor, bottom height factor
    const uv = new Float32Array(n * 2), col = new Float32Array(n * 3), idx = [];
    // texture u runs along the body so each scale stays about as long as it is wide
    let u = 0;
    const back = [0.5, 0.25, 0.05], belly = [0.95, 0.64, 0.26];
    for (let i = 0; i < RINGS; i++) {
      const d = (i / (RINGS - 1)) * LEN;
      const r = radiusAt(d);
      this.radius[i] = r;
      const head = 1 - smooth(0.3 * S, 0.44 * S, d);
      this.shape.set([1 + 0.2 * head, 1.05 - 0.17 * head, 1.0 - 0.42 * head], i * 3);
      if (i > 0) u += (LEN / (RINGS - 1)) / ((Math.PI * 2 * Math.max(r, 0.04 * S)) / 16) / 4;
      for (let j = 0; j <= SEG; j++) {
        const k = i * (SEG + 1) + j, phi = (j / SEG) * Math.PI * 2;
        uv[k * 2] = u; uv[k * 2 + 1] = (j / SEG) * 4;
        const bel = smooth(0.15, -0.75, Math.sin(phi));
        const dark = 0.82 + 0.18 * smooth(0, 0.5 * S, d);
        col[k * 3] = (back[0] + (belly[0] - back[0]) * bel) * dark;
        col[k * 3 + 1] = (back[1] + (belly[1] - back[1]) * bel) * dark;
        col[k * 3 + 2] = (back[2] + (belly[2] - back[2]) * bel) * dark;
      }
    }
    for (let i = 0; i < RINGS - 1; i++) {
      for (let j = 0; j < SEG; j++) {
        const a = i * (SEG + 1) + j, b = a + SEG + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    const maps = scaleMaps();
    this.gold = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, vertexColors: true, metalness: 1, roughness: 1, roughnessMap: maps.orm, aoMap: maps.orm, aoMapIntensity: 1,
      normalMap: maps.normal, normalScale: new THREE.Vector2(0.9, 0.9), clearcoat: 0.22, clearcoatRoughness: 0.3, envMapIntensity: 1.2,
    });
    this.body = new THREE.Mesh(g, this.gold);
    this.body.frustumCulled = false;
    this.group.add(this.body);
  }

  buildHead() {
    this.head = new THREE.Group();
    this.group.add(this.head);
    const horn = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.42, 0.26, 0.09), metalness: 1, roughness: 0.38, envMapIntensity: 1.3 });
    const s = S;
    for (const side of [-1, 1]) {
      // long horns swept back over the neck
      const g = taperTube([new THREE.Vector3(side * 0.045 * s, 0.06 * s, -0.05 * s), new THREE.Vector3(side * 0.07 * s, 0.1 * s, 0.07 * s),
        new THREE.Vector3(side * 0.088 * s, 0.13 * s, 0.2 * s), new THREE.Vector3(side * 0.095 * s, 0.135 * s, 0.33 * s)], [0.02 * s, 0.014 * s, 0.007 * s, 0.002 * s], 9);
      this.head.add(new THREE.Mesh(g, horn));
      // a short spur under it, at the back of the jaw
      const g2 = taperTube([new THREE.Vector3(side * 0.07 * s, -0.01 * s, -0.02 * s), new THREE.Vector3(side * 0.1 * s, -0.005 * s, 0.06 * s),
        new THREE.Vector3(side * 0.115 * s, 0.01 * s, 0.13 * s)], [0.012 * s, 0.006 * s, 0.0015 * s], 7);
      this.head.add(new THREE.Mesh(g2, horn));
      // eyes: embers in the skull
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0135 * s, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.9, 0.25), toneMapped: false }));
      eye.position.set(side * 0.077 * s, 0.032 * s, -0.115 * s);
      eye.scale.set(1, 0.7, 1.25);
      this.head.add(eye);
    }
    // teeth along the upper jaw (they show as the jaw drops)
    const tooth = new THREE.ConeGeometry(0.0065 * s, 0.026 * s, 5);
    tooth.rotateX(Math.PI);
    const ivory = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.95, 0.88, 0.7), roughness: 0.35, metalness: 0.1 });
    const teeth = new THREE.InstancedMesh(tooth, ivory, 14);
    const m = new THREE.Matrix4();
    let k = 0;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const z = (-0.27 + i * 0.033) * s, x = side * (0.022 + i * 0.006) * s;
        m.makeTranslation(x, -0.04 * s - (i === 1 ? 0.006 * s : 0), z);
        teeth.setMatrixAt(k++, m);
      }
    }
    this.head.add(teeth);
    // lower jaw on a hinge at the back of the head
    this.jaw = new THREE.Group();
    this.jaw.position.set(0, -0.04 * s, 0.0);
    const jg = taperTube([new THREE.Vector3(0, 0, 0.01 * s), new THREE.Vector3(0, -0.012 * s, -0.12 * s), new THREE.Vector3(0, -0.004 * s, -0.255 * s)],
      [0.058 * s, 0.045 * s, 0.014 * s], 14, 0.5);
    this.jaw.add(new THREE.Mesh(jg, this.gold));
    const low = new THREE.InstancedMesh(new THREE.ConeGeometry(0.005 * s, 0.02 * s, 5), ivory, 10);
    k = 0;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        m.makeTranslation(side * (0.018 + i * 0.007) * s, 0.012 * s, (-0.235 + i * 0.04) * s);
        low.setMatrixAt(k++, m);
      }
    }
    this.jaw.add(low);
    this.head.add(this.jaw);
    // the inside of the mouth glows when it breathes
    this.maw = new THREE.Mesh(new THREE.SphereGeometry(0.035 * s, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.7, 0.15), toneMapped: false, transparent: true, opacity: 0 }));
    this.maw.position.set(0, -0.045 * s, -0.17 * s);
    this.maw.scale.set(1, 0.5, 2.2);
    this.head.add(this.maw);
  }

  buildWings() {
    this.wings = [];
    const verts = (NS + 1) * (NT + 1);
    // Darker along the bones and the leading edge, thinner (lighter) in between.
    const fingers = TIPS.slice(0, 4).map((t) => [WRIST, t]);
    const segDist = (p, a, b) => {
      const vx = b[0] - a[0], vy = b[1] - a[1], wx = p[0] - a[0], wy = p[1] - a[1];
      const t = Math.min(1, Math.max(0, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
      return Math.hypot(wx - vx * t, wy - vy * t);
    };
    this.layout = [];
    const col = new Float32Array(verts * 3), uv = new Float32Array(verts * 2), idx = [];
    for (let i = 0; i <= NS; i++) {
      const s = i / NS;
      const L = polyAt(LEAD, s);
      const T = this.trailAt(s);
      for (let j = 0; j <= NT; j++) {
        const t = j / NT;
        const a = L[0] + (T[0] - L[0]) * t, b = L[1] + (T[1] - L[1]) * t;
        this.layout.push([a, b, s, t]);
        let dmin = 1;
        for (const [p, q] of fingers) dmin = Math.min(dmin, segDist([a, b], p, q));
        dmin = Math.min(dmin, t * 0.5 + (1 - s) * 0.02);
        const bone = Math.exp(-dmin / 0.035);
        const k = i * (NT + 1) + j;
        const thin = 0.8 + 0.45 * t * (0.6 + 0.4 * s);
        col[k * 3] = (0.27 * thin) * (1 - bone) + 0.16 * bone;
        col[k * 3 + 1] = (0.07 * thin) * (1 - bone) + 0.07 * bone;
        col[k * 3 + 2] = (0.03 * thin) * (1 - bone) + 0.03 * bone;
        uv[k * 2] = s; uv[k * 2 + 1] = t;
      }
    }
    for (let i = 0; i < NS; i++) {
      for (let j = 0; j < NT; j++) {
        const a = i * (NT + 1) + j, b = a + NT + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const membrane = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.5, side: THREE.DoubleSide,
      transparent: true, opacity: 0.92, emissive: new THREE.Color(0.1, 0.02, 0.0), envMapIntensity: 1.0 });
    this.membrane = membrane;
    const bone = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.5, 0.3, 0.1), metalness: 1, roughness: 0.34, envMapIntensity: 1.4 });
    for (const side of [-1, 1]) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      const mesh = new THREE.Mesh(g, membrane);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      // bones: the arm (two thick pieces) and four fingers of four pieces each
      const bones = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 0.8, 1, 7, 1, false), bone, 2 + 4 * 4);
      bones.frustumCulled = false;
      this.group.add(mesh, bones);
      this.wings.push({ side, mesh, bones });
    }
  }

  /* Trailing edge from the body out to the tip, scalloped between the finger tips. */
  trailAt(s) {
    const pts = [...TIPS].reverse();
    const n = pts.length - 1, f = Math.min(n - 1e-6, s * n), i = Math.floor(f), t = f - i;
    const a = pts[i], b = pts[i + 1];
    const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
    const sc = Math.sin(Math.PI * t) * 0.17;                       // pulled in toward the wrist between tips
    return [x + (WRIST[0] - x) * sc, y + (WRIST[1] - y) * sc];
  }

  buildSpikes() {
    const g = new THREE.ConeGeometry(0.016 * S, 0.07 * S, 6);
    g.translate(0, 0.035 * S, 0);
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.45, 0.27, 0.08), metalness: 1, roughness: 0.4, envMapIntensity: 1.3 });
    this.spikeAt = [];
    for (let d = 0.4 * S; d < LEN * 0.93; d += 0.085 * S) this.spikeAt.push(d);
    this.spikes = new THREE.InstancedMesh(g, mat, this.spikeAt.length);
    this.spikes.frustumCulled = false;
    this.group.add(this.spikes);
  }

  /* ------------------------------------------------------------ every frame */
  update(t, breath) {
    const dt = Math.min(0.05, Math.max(0, t - this.t));
    this.t = t;
    const v = new THREE.Vector3(), w = new THREE.Vector3();
    const headArc = this.arcOf(this.theta0) + t * 0.92;
    // the head's climb rate decides how hard the wings beat
    path(this.thetaAt(headArc), v);
    path(this.thetaAt(headArc + 0.05), w);
    const climb = (w.y - v.y) / 0.05;
    const target = climb > 0.08 ? 0.85 : climb < -0.12 ? 0.18 : 0.55;
    this.amp += (target - this.amp) * Math.min(1, dt * 1.6);

    const B = this.base, P = this.spine, F = this.F, Rv = this.Rv, Uv = this.Uv;
    for (let i = 0; i < RINGS; i++) {
      const d = (i / (RINGS - 1)) * LEN;
      path(this.thetaAt(headArc - d), v);
      B[i * 3] = v.x; B[i * 3 + 1] = v.y; B[i * 3 + 2] = v.z;
    }
    this.frames(B);
    // swim: a wave runs back along the body; the shoulders bob with the wing beat
    const flapPh = t * Math.PI * 2 * 1.1;
    for (let i = 0; i < RINGS; i++) {
      const d = (i / (RINGS - 1)) * LEN;
      const lat = 0.12 * S * smooth(0.25 * S, 1.3 * S, d) * Math.sin((Math.PI * 2 * d) / (1.75 * S) - 3.1 * t);
      const ver = 0.05 * S * smooth(0.5 * S, 1.6 * S, d) * Math.sin((Math.PI * 2 * d) / (1.3 * S) - 2.3 * t + 1);
      const bob = -0.035 * S * this.amp * Math.sin(flapPh) * Math.exp(-(((d - SHOULDER) / (0.7 * S)) ** 2));
      for (let c = 0; c < 3; c++) P[i * 3 + c] = B[i * 3 + c] + Rv[i * 3 + c] * lat + Uv[i * 3 + c] * (ver + bob);
    }
    this.frames(P);
    this.skin();
    this.placeHead(breath);
    this.placeWings(flapPh, dt);
    this.placeSpikes();
  }

  /* Forward, right and up at every ring. Up leans into the turn (the wyrm banks). */
  frames(P) {
    const F = this.F, Rv = this.Rv, Uv = this.Uv;
    for (let i = 0; i < RINGS; i++) {
      const a = Math.max(0, i - 1), b = Math.min(RINGS - 1, i + 1);
      let fx = P[a * 3] - P[b * 3], fy = P[a * 3 + 1] - P[b * 3 + 1], fz = P[a * 3 + 2] - P[b * 3 + 2];
      let l = Math.hypot(fx, fy, fz) || 1;
      fx /= l; fy /= l; fz /= l;
      // bank: up tips toward the middle of the loop
      let ix = -P[i * 3], iz = -P[i * 3 + 2];
      l = Math.hypot(ix, iz) || 1;
      const bank = 0.34;
      let ux = (ix / l) * Math.sin(bank), uy = Math.cos(bank), uz = (iz / l) * Math.sin(bank);
      // right = forward x up
      let rx = fy * uz - fz * uy, ry = fz * ux - fx * uz, rz = fx * uy - fy * ux;
      l = Math.hypot(rx, ry, rz) || 1;
      rx /= l; ry /= l; rz /= l;
      // up = right x forward
      ux = ry * fz - rz * fy; uy = rz * fx - rx * fz; uz = rx * fy - ry * fx;
      F[i * 3] = fx; F[i * 3 + 1] = fy; F[i * 3 + 2] = fz;
      Rv[i * 3] = rx; Rv[i * 3 + 1] = ry; Rv[i * 3 + 2] = rz;
      Uv[i * 3] = ux; Uv[i * 3 + 1] = uy; Uv[i * 3 + 2] = uz;
    }
  }

  skin() {
    const pos = this.body.geometry.attributes.position.array, nor = this.body.geometry.attributes.normal.array;
    const P = this.spine, Rv = this.Rv, Uv = this.Uv, F = this.F;
    const browAt = 0.19 * S, browW = 0.05 * S;
    for (let i = 0; i < RINGS; i++) {
      const d = (i / (RINGS - 1)) * LEN, r = this.radius[i];
      const wx = this.shape[i * 3], top = this.shape[i * 3 + 1], bot = this.shape[i * 3 + 2];
      const brow = d < 0.4 * S ? Math.exp(-(((d - browAt) / browW) ** 2)) * 0.024 * S : 0;
      const dr = (this.radius[Math.min(RINGS - 1, i + 1)] - this.radius[Math.max(0, i - 1)]) / (2 * LEN / (RINGS - 1));
      for (let j = 0; j <= SEG; j++) {
        const phi = (j / SEG) * Math.PI * 2, c = Math.cos(phi), s = Math.sin(phi);
        const a = r * wx, b = r * (s > 0 ? top : bot);
        let lx = c * a, ly = s * b;
        if (brow > 0 && s > 0) {
          const bump = Math.exp(-(((phi - 0.75) / 0.32) ** 2)) + Math.exp(-(((phi - (Math.PI - 0.75)) / 0.32) ** 2));
          lx += c * brow * bump; ly += s * brow * bump;
        }
        const k = (i * (SEG + 1) + j) * 3;
        for (let q = 0; q < 3; q++) pos[k + q] = P[i * 3 + q] + Rv[i * 3 + q] * lx + Uv[i * 3 + q] * ly;
        // normal of the ellipse, tipped forward where the body narrows toward the tail
        let nx = c / a, ny = s / b;
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl; ny /= nl;
        const nf = dr;
        let ox = Rv[i * 3] * nx + Uv[i * 3] * ny + F[i * 3] * nf;
        let oy = Rv[i * 3 + 1] * nx + Uv[i * 3 + 1] * ny + F[i * 3 + 1] * nf;
        let oz = Rv[i * 3 + 2] * nx + Uv[i * 3 + 2] * ny + F[i * 3 + 2] * nf;
        const ol = Math.hypot(ox, oy, oz) || 1;
        nor[k] = ox / ol; nor[k + 1] = oy / ol; nor[k + 2] = oz / ol;
      }
    }
    this.body.geometry.attributes.position.needsUpdate = true;
    this.body.geometry.attributes.normal.needsUpdate = true;
  }

  basisAt(i, m) {
    const Rv = this.Rv, Uv = this.Uv, F = this.F;
    m.makeBasis(new THREE.Vector3(Rv[i * 3], Rv[i * 3 + 1], Rv[i * 3 + 2]), new THREE.Vector3(Uv[i * 3], Uv[i * 3 + 1], Uv[i * 3 + 2]),
      new THREE.Vector3(-F[i * 3], -F[i * 3 + 1], -F[i * 3 + 2]));
    return m;
  }

  placeHead(breath) {
    const i = Math.round((HEAD / LEN) * (RINGS - 1));
    const m = this.basisAt(i, new THREE.Matrix4());
    this.head.quaternion.setFromRotationMatrix(m);
    this.head.position.set(this.spine[i * 3], this.spine[i * 3 + 1], this.spine[i * 3 + 2]);
    this.open += (breath - this.open) * 0.18;
    this.jaw.rotation.x = -this.open * 0.5;
    this.maw.material.opacity = this.open;
    this.head.updateMatrixWorld(true);
    this.mouth.set(0, -0.05 * S, -0.31 * S).applyMatrix4(this.head.matrixWorld);
    this.forward.set(this.F[i * 3], this.F[i * 3 + 1], this.F[i * 3 + 2]).normalize();
    this.forward.addScaledVector(new THREE.Vector3(this.Uv[i * 3], this.Uv[i * 3 + 1], this.Uv[i * 3 + 2]), -0.18).normalize();
  }

  placeWings(ph, dt) {
    const i = Math.round((SHOULDER / LEN) * (RINGS - 1));
    const P = this.spine, r = this.radius[i];
    const Fv = new THREE.Vector3(this.F[i * 3], this.F[i * 3 + 1], this.F[i * 3 + 2]);
    const Rv = new THREE.Vector3(this.Rv[i * 3], this.Rv[i * 3 + 1], this.Rv[i * 3 + 2]);
    const Uv = new THREE.Vector3(this.Uv[i * 3], this.Uv[i * 3 + 1], this.Uv[i * 3 + 2]);
    const A = this.amp;
    const skew = ph + 0.35 * Math.sin(ph);
    const flap = 0.14 + A * Math.sin(skew);
    const lag = -0.3 * A * Math.cos(skew);
    const rising = Math.cos(skew);                              // > 0 on the upstroke, < 0 on the downstroke
    const fold = Math.max(0, rising) * 0.2 * A;                 // the hand folds in a little on the way up
    const tmp = new THREE.Vector3();
    const toWorld = (side, a, b, sChord, tChord, out) => {
      const k = a / 1.78;
      const ang = flap * (0.55 + 0.45 * k) + lag * k * k;
      const a2 = a * (1 - fold * k);
      const billow = (sChord === undefined) ? 0 : -0.07 * rising * A * Math.sin(Math.PI * tChord) * Math.pow(Math.sin(Math.PI * Math.min(1, sChord * 1.05)), 0.7);
      out.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).addScaledVector(Uv, r * 0.55);
      out.addScaledVector(Rv, side * (r * 0.5 + a2 * Math.cos(ang) * S));
      out.addScaledVector(Uv, a2 * Math.sin(ang) * S + billow * S);
      out.addScaledVector(Fv, -(b + fold * 0.25 * k) * S);
      return out;
    };
    const m = new THREE.Matrix4(), up = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (const wg of this.wings) {
      const pos = wg.mesh.geometry.attributes.position.array;
      for (let k = 0; k < this.layout.length; k++) {
        const [a, b, s, t] = this.layout[k];
        toWorld(wg.side, a, b, s, t, tmp);
        pos[k * 3] = tmp.x; pos[k * 3 + 1] = tmp.y; pos[k * 3 + 2] = tmp.z;
      }
      wg.mesh.geometry.attributes.position.needsUpdate = true;
      wg.mesh.geometry.computeVertexNormals();
      // bones between consecutive points
      let n = 0;
      const seg = (p0, p1, rad) => {
        const A0 = toWorld(wg.side, p0[0], p0[1], undefined, 0, new THREE.Vector3());
        const A1 = toWorld(wg.side, p1[0], p1[1], undefined, 0, new THREE.Vector3());
        const len = A0.distanceTo(A1);
        up.subVectors(A1, A0).normalize();
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
        sc.set(rad * S, len, rad * S);
        m.compose(A0.add(A1).multiplyScalar(0.5), q, sc);
        wg.bones.setMatrixAt(n++, m);
      };
      seg([0.04, 0.0], [0.5, -0.15], 0.032);
      seg([0.5, -0.15], WRIST, 0.024);
      for (let f = 0; f < 4; f++) {
        const tip = TIPS[f];
        for (let h = 0; h < 4; h++) {
          const t0 = h / 4, t1 = (h + 1) / 4;
          const p0 = [WRIST[0] + (tip[0] - WRIST[0]) * t0, WRIST[1] + (tip[1] - WRIST[1]) * t0];
          const p1 = [WRIST[0] + (tip[0] - WRIST[0]) * t1, WRIST[1] + (tip[1] - WRIST[1]) * t1];
          seg(p0, p1, 0.013 * (1 - 0.7 * t0));
        }
      }
      wg.bones.instanceMatrix.needsUpdate = true;
    }
  }

  placeSpikes() {
    const m = new THREE.Matrix4(), x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3();
    this.spikeAt.forEach((d, n) => {
      const i = Math.round((d / LEN) * (RINGS - 1));
      const r = this.radius[i], top = this.shape[i * 3 + 1];
      x.set(this.Rv[i * 3], this.Rv[i * 3 + 1], this.Rv[i * 3 + 2]);
      const U = new THREE.Vector3(this.Uv[i * 3], this.Uv[i * 3 + 1], this.Uv[i * 3 + 2]);
      const Fw = new THREE.Vector3(this.F[i * 3], this.F[i * 3 + 1], this.F[i * 3 + 2]);
      y.copy(U).addScaledVector(Fw, -0.8).normalize();
      z.crossVectors(x, y).normalize();
      const k = Math.max(0.25, r / (0.14 * S)) * (0.7 + 0.3 * Math.sin(n * 2.3) ** 2);
      m.makeBasis(x, y, z).scale(new THREE.Vector3(k, k * 1.25, k));
      m.setPosition(this.spine[i * 3] + U.x * r * top * 0.9, this.spine[i * 3 + 1] + U.y * r * top * 0.9, this.spine[i * 3 + 2] + U.z * r * top * 0.9);
      this.spikes.setMatrixAt(n, m);
    });
    this.spikes.instanceMatrix.needsUpdate = true;
  }
}
