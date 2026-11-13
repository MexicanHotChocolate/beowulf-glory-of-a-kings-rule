// GLSL for the stage. Everything works in plain sRGB values (color management is off).

export const NOISE = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
               mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return s;
  }
`;

/* ------------------------------------------------------------------ curtain
   The hall hanging from Heorot ("gold thread shone in the wall-hangings").
   uv.x = 0 is the free leading edge, 1 is the wall edge. uv.y = 0 bottom.     */
export const curtainVert = /* glsl */ `
  uniform float uTime, uOpen, uRelease, uBillow, uDive;
  uniform vec2 uView;     // viewport W, H (px)
  uniform vec4 uRect;     // right edge x, top y, bottom y, full width at the rod
  uniform vec2 uMouse;
  uniform float uZ;       // how far behind the helmet the hanging sits
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying float vFold;

  float gFold;

  float widthAt(float v, float pinch) {
    float t = 0.40;
    float wT = mix(1.0, 0.30, pinch);
    float wB = mix(1.0, 0.58, pinch);
    if (v >= t) {
      float s = (v - t) / (1.0 - t);
      return mix(wT, 1.0, pow(s, 0.8));
    }
    return mix(wB, wT, smoothstep(0.0, 1.0, v / t));
  }

  vec3 restPos(vec2 uv) {
    float u = uv.x, v = uv.y;
    float pinch = uOpen * (1.0 - uRelease);
    float w = widthAt(v, pinch);
    float x = uRect.x - (1.0 - u) * uRect.w * w;
    float y = mix(uRect.z, uRect.y, v);
    float gathered = 1.0 - w;
    float ph = u * 7.0 * 6.28318 + v * 0.8 + sin(v * 3.0) * 0.6;
    float amp = (9.0 + 50.0 * gathered) * (0.65 + 0.35 * sin(u * 3.1 + 1.3));
    float c = 0.5 + 0.5 * cos(ph);
    gFold = c;
    float z = amp * c;
    z += 20.0 * (1.0 - smoothstep(0.0, 0.07, u)) * gathered;
    float sway = sin(uTime * 0.8 + v * 2.6) * 4.0 * (1.0 - v) + uMouse.x * 12.0 * (1.0 - v);
    x += sway * (1.0 - u * 0.7);
    z += sin(uTime * 0.6 + u * 8.0 + v * 3.0) * 2.5;
    return vec3(x, y, z + uZ);
  }

  vec3 P(vec2 uv) {
    vec3 rest = restPos(uv);
    float W = uView.x, H = uView.y;
    float u = uv.x, v = uv.y;
    vec3 cover = vec3(mix(-0.74 * W, 0.74 * W, u), mix(-0.72 * H, 0.72 * H, v), H * 0.16);
    float fb = sin(uBillow * 3.14159);
    cover.z += sin(u * 9.0 + v * 1.6 - uTime * 1.1) * (24.0 + 70.0 * fb) + sin(u * 17.0 - v * 3.0 + uTime * 0.8) * (8.0 + 18.0 * fb);
    float b = smoothstep(0.0, 1.0, uBillow);
    vec3 p = mix(rest, cover, b);
    p.z += sin(b * 3.14159) * H * 0.30 * sin(v * 3.14159) * (0.35 + 0.65 * sin(u * 3.14159));
    // dive: zoom toward the braided band near the leading edge
    float bandX = mix(-0.74 * W, 0.74 * W, 0.118);
    float d = smoothstep(0.0, 1.0, uDive);
    float zoom = 1.0 + d * 8.0;
    p.x = (p.x - bandX) * zoom + bandX * (1.0 - d);
    p.y = p.y * zoom - H * 0.08 * d;
    return p;
  }

  void main() {
    vUv = uv;
    float e = 0.0025;
    vec3 px = P(uv + vec2(e, 0.0));
    vec3 py = P(uv + vec2(0.0, e));
    vec3 p = P(uv);
    vFold = gFold;
    vec3 n = normalize(cross(px - p, py - p));
    vNormal = normalize(normalMatrix * n);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

export const curtainFrag = /* glsl */ `
  uniform vec3 uBlue;
  uniform float uTime, uLit;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying float vFold;
  ${NOISE}

  const vec3 GOLD = vec3(206.0, 158.0, 74.0) / 255.0;
  const vec3 WOAD = vec3(84.0, 118.0, 196.0) / 255.0;

  // Woven wool with a madder-red border band carrying two twisted strands:
  // gold (the Warrior) and blue (the Leader).
  vec3 fabric(vec2 uv, out float metal) {
    vec2 t = uv * vec2(1024.0, 2048.0);
    vec2 fw = fwidth(t);
    float fine = clamp(1.0 - max(fw.x, fw.y) * 0.9, 0.0, 1.0);   // fade detail that would alias
    float twill = 0.5 + 0.5 * sin((t.x + t.y) * 1.15);
    float weft = 0.5 + 0.5 * sin(t.y * 2.4);
    float slub = fbm(t * vec2(0.010, 0.005));
    float grain = hash12(floor(t));
    float lum = 0.80 + (0.10 * twill + 0.05 * weft + 0.06 * (grain - 0.5)) * fine + 0.24 * (slub - 0.5);
    vec3 col = vec3(38.0, 40.0, 52.0) / 255.0 * lum;

    vec2 l = t / 64.0;
    float loz = abs(fract(l.x) - 0.5) + abs(fract(l.y) - 0.5);
    float lw = 0.035 + fwidth(loz) * 0.8;
    col += clamp(1.0 - abs(loz - 0.42) / lw, 0.0, 1.0) * 0.20 * fine * vec3(120.0, 104.0, 70.0) / 255.0;

    metal = 0.0;
    float bx0 = 46.0, bw = 150.0;
    if (t.x > bx0 && t.x < bx0 + bw) {
      float rib = 0.85 + 0.15 * sin(t.y * 3.1) * fine;
      col = vec3(112.0, 28.0, 26.0) / 255.0 * rib * (0.92 + 0.16 * (slub - 0.5));
      if ((t.x > bx0 + 6.0 && t.x < bx0 + 10.0) || (t.x > bx0 + bw - 10.0 && t.x < bx0 + bw - 6.0)) {
        col = GOLD * (0.78 + 0.22 * rib);
        metal = 0.6;
      }
      float px = t.x - (bx0 + 14.0);
      float cx = (bw - 28.0) * 0.5;
      float period = 168.0, radius = 27.0, amp = 30.0;
      float th = 6.28318 * t.y / period;
      float slope = amp * 6.28318 / period * abs(cos(th));
      float bestZ = -10.0;
      for (int k = 0; k < 2; k++) {
        float s = k == 0 ? 1.0 : -1.0;
        vec3 sc = k == 0 ? GOLD : WOAD;
        float xs = cx + s * amp * sin(th);
        float zs = s * cos(th);
        float d = abs(px - xs) / sqrt(1.0 + slope * slope);
        float n = d / radius;
        if (n < 1.0 && zs > bestZ) {
          float tube = sqrt(max(1.0 - n * n, 0.0));
          float across = (px - xs) * s;
          float fib = sin((t.y * 0.64 + across * 0.77) * 2.6);
          float fibre = 0.9 + 0.1 * fib * clamp(1.0 - max(fw.x, fw.y) * 1.6, 0.0, 1.0);
          float shade = (0.62 + 0.42 * tube) * fibre * (0.84 + 0.16 * zs);
          vec3 c = sc * shade;
          float edge = smoothstep(0.84, 1.0, n);
          col = c * (1.0 - edge * 0.8);
          bestZ = zs;
          metal = k == 0 ? 1.0 : 0.45;
        }
      }
    }
    float gx0 = bx0 + bw + 70.0;
    if (t.x > gx0 && t.x < gx0 + 14.0) {
      col = GOLD * 0.8 * (0.7 + 0.3 * sin(t.y * 2.0) * fine);
      metal = 0.5;
    }
    return col;
  }

  void main() {
    float metal;
    vec3 albedo = fabric(vUv, metal);
    vec3 N = normalize(vNormal);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(-vViewPos);
    vec3 L = normalize(vec3(-0.55, 0.5, 0.68));
    float wrap = max((dot(N, L) + 0.3) / 1.3, 0.0);
    vec3 lit = albedo * (0.2 + 1.0 * wrap);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    lit += albedo * fres * 0.55 + uBlue * fres * 0.30;
    vec3 Hh = normalize(L + V);
    lit += metal * pow(max(dot(N, Hh), 0.0), 36.0) * vec3(1.0, 0.86, 0.58) * 0.75;
    lit *= mix(0.62, 1.0, vFold);
    lit *= 0.12 + 0.88 * uLit;
    gl_FragColor = vec4(lit, 1.0);
  }
`;

/* ------------------------------------------------------------------ helmet
   The cut-out is pushed into a real 3D shape by a height map (built from its
   silhouette and shading), then relit from a light that follows the mouse.  */
export const helmetVert = /* glsl */ `
  uniform sampler2D uDepthMap;
  uniform float uDepth;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z += texture2D(uDepthMap, uv).r * uDepth;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

export const flatVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export const helmetFrag = /* glsl */ `
  uniform sampler2D uMap, uDepthMap;
  uniform float uOut, uGlint, uDpr, uRelief, uLit;
  uniform vec2 uLight, uTexel;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec4 tex = texture2D(uMap, vUv);
    if (tex.a < 0.02) discard;
    vec3 c = tex.rgb;
    float lumi = dot(c, vec3(0.299, 0.587, 0.114));
    float goldish = smoothstep(0.04, 0.22, c.r - c.b) * smoothstep(0.28, 0.62, lumi);
    // relight from the height map
    float hL = texture2D(uDepthMap, vUv - vec2(uTexel.x, 0.0)).r;
    float hR = texture2D(uDepthMap, vUv + vec2(uTexel.x, 0.0)).r;
    float hD = texture2D(uDepthMap, vUv - vec2(0.0, uTexel.y)).r;
    float hU = texture2D(uDepthMap, vUv + vec2(0.0, uTexel.y)).r;
    vec3 n = normalize(vec3((hL - hR) * uRelief, (hD - hU) * uRelief, 1.0));
    vec3 L = normalize(vec3(uLight, 0.8));
    float diff = dot(n, L);
    c *= 0.74 + 0.46 * diff;
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 16.0);
    c += spec * (0.12 + goldish * 0.55) * vec3(1.0, 0.86, 0.6);
    float band = exp(-pow((vUv.x * 0.85 + vUv.y * 0.55 - uGlint) / 0.06, 2.0));
    c += goldish * band * vec3(1.0, 0.84, 0.52) * 0.6 * uLit;
    // At the start the helmet is in the dark; the firelight finds it from the left.
    float reach = smoothstep(uLit * 1.6 - 0.45, uLit * 1.6 - 0.05, vUv.x * 0.8 + (1.0 - vUv.y) * 0.25);
    c *= mix(1.0, 0.03, reach) * (0.06 + 0.94 * smoothstep(0.0, 0.5, uLit));
    if (uOut > 0.0) {
      float cell = 7.0 * uDpr;
      vec2 g = gl_FragCoord.xy / cell;
      vec2 f = fract(g) - 0.5;
      float n = hash12(floor(g));
      float t = uOut * 1.8 - n * 0.55 - (1.0 - vUv.y) * 0.25;
      float r = 0.76 * (1.0 - clamp(t, 0.0, 1.0));
      if (length(f) > r) discard;
    }
    gl_FragColor = vec4(c, tex.a);
  }
`;

/* The opening screen's background: the dusk sky over the sea (a real photograph), soft,
   with firelight from below behind the helmet. It comes up as the page opens. */
export const heroBgFrag = /* glsl */ `
  uniform sampler2D uSky;
  uniform vec2 uRes, uMouse, uGlowAt;
  uniform float uTime, uLit, uImgAspect;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    float ar = uRes.x / uRes.y;
    vec2 s = ar > uImgAspect ? vec2(1.0, uImgAspect / ar) : vec2(ar / uImgAspect, 1.0);
    vec2 uv = (vUv - 0.5) * s * 0.9 + 0.5 + uMouse * vec2(-0.012, 0.008) + vec2(sin(uTime * 0.05) * 0.006, 0.0);
    vec3 c = texture2D(uSky, uv).rgb;
    vec2 g = (vUv - uGlowAt) * vec2(ar, 1.0);
    float flick = 0.85 + 0.15 * vnoise(vec2(uTime * 1.7, 3.1));
    c += vec3(1.0, 0.42, 0.1) * exp(-dot(g, g) * 4.0) * 0.32 * uLit * flick;
    c *= 0.18 + 0.82 * uLit;
    vec2 q = vUv - 0.5;
    c *= 1.0 - dot(q, q) * 1.1;
    c += (hash12(gl_FragCoord.xy + fract(uTime * 7.0) * 113.0) - 0.5) * (1.5 / 255.0);
    gl_FragColor = vec4(c, 1.0);
  }
`;

export const shadowFrag = /* glsl */ `
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float a = 1.0 - smoothstep(0.0, 1.0, length(p));
    gl_FragColor = vec4(vec3(0.03, 0.05, 0.14), a * a * uAlpha);
  }
`;

/* ------------------------------------------------------------------ composite
   Draws the 3D scene, then dissolves it through a halftone dot screen into
   the next scene: flat blue with stippled clouds (the Pear grid scene).      */
export const compositeVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const compositeFrag = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tFlight, tMap, tNight;
  uniform float uFlight, uMapOn, uCream, uGalaxy, uSea, uNightYaw, uNightExp, uTanHalf;
  uniform mat3 uEndBasis;      // how the camera is turned where the flight ends (the map's sky)
  uniform vec2 uRes;
  uniform float uTime, uDissolve, uClouds, uDpr, uScroll;
  uniform vec2 uClear;   // horizontal band (uv.x from..to) kept free of clouds for text
  uniform vec3 uBlue;
  varying vec2 vUv;
  ${NOISE}

  float cloudDensity(vec2 uv) {
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2(uv.x * aspect, uv.y) * 3.1 + vec2(uTime * 0.018, uScroll * 2.2);
    vec2 w = vec2(fbm(p * 0.6 + 3.1), fbm(p * 0.6 + 8.7));
    float n = fbm(p + w * 0.9);
    float body = smoothstep(0.665, 0.71, n);
    float puff = 0.55 + 0.45 * fbm(p * 3.0 + 1.7);
    float d = body * puff * smoothstep(0.64, 0.80, n + 0.04);
    d *= smoothstep(0.02, 0.2, uv.y) * smoothstep(0.93, 0.82, uv.y);
    float inBand = smoothstep(uClear.x - 0.06, uClear.x, uv.x) * smoothstep(uClear.y + 0.06, uClear.y, uv.x);
    d *= 1.0 - inBand;
    return clamp(d * 1.3, 0.0, 1.0);
  }

  // The map hangs in the real night sky: the Milky Way where the flight's camera ends up looking.
  vec3 galaxy(vec2 frag) {
    vec2 ndc = frag / uRes * 2.0 - 1.0;
    vec3 rd = normalize(vec3(ndc.x * uTanHalf * uRes.x / uRes.y, ndc.y * uTanHalf, -1.0));
    vec3 d = normalize(uEndBasis * rd);
    float lon = atan(d.x, -d.z) + uScroll * 0.35;
    vec2 uv = vec2(fract(lon / 6.2831853 + 0.5 + uNightYaw), 1.0 - acos(clamp(d.y, -1.0, 1.0)) / 3.14159265);
    return textureLod(tNight, uv, 0.0).rgb * uNightExp;
  }

  vec3 nextScene(vec2 frag) {
    vec2 uv = frag / uRes;
    return mix(vec3(0.02, 0.035, 0.09), vec3(0.05, 0.08, 0.17), uv.y);
  }

  void main() {
    vec2 frag = gl_FragCoord.xy;
    float grain = (hash12(frag + fract(uTime) * 91.7) - 0.5) * 0.022;
    // Fast path: in the flight a painting usually covers the pixel completely and nothing is
    // laid over it, so the sky behind (the most expensive part of this shader) is skipped.
    if (uFlight > 0.5 && uDissolve >= 1.0 && uSea <= 0.0 && uMapOn < 0.5 && uCream <= 0.0) {
      vec4 fq = texture2D(tFlight, vUv);
      if (fq.a > 0.996) { gl_FragColor = vec4(fq.rgb + grain, 1.0); return; }
    }
    vec3 next = uDissolve > 0.0 ? nextScene(frag) : vec3(0.0);
    vec3 col;
    float reveal = 1.0;                      // how much of the next scene (and the flight) shows
    if (uDissolve >= 1.0) {
      col = next;
    } else {
      vec3 scene = texture2D(tScene, vUv).rgb;
      float cell = 11.0 * uDpr;
      vec2 g = frag / cell;
      vec2 f = fract(g) - 0.5;
      float n = hash12(floor(g));
      float sweep = (1.0 - vUv.x) * 0.25 + vUv.y * 0.2;
      float t = uDissolve * 1.75 - n * 0.4 - sweep;
      float r = clamp(t, 0.0, 1.0) * 0.76;
      float aa = 0.9 / cell;
      float m = r > 0.0 ? 1.0 - smoothstep(r - aa, r + aa, length(f)) : 0.0;
      col = mix(scene, next, m);
      reveal = m;
    }
    if (uGalaxy > 0.0) {                     // the sky dots over into the galaxy (behind the flight)
      float mg = 1.0;
      if (uGalaxy < 1.0) {
        float cell = 10.0 * uDpr;
        vec2 g = frag / cell;
        vec2 f = fract(g) - 0.5;
        float n = hash12(floor(g) + 3.0);
        float t = uGalaxy * 1.75 - n * 0.4 - (1.0 - vUv.y) * 0.35;
        float r = clamp(t, 0.0, 1.0) * 0.76;
        float aa = 0.9 / cell;
        mg = r > 0.0 ? 1.0 - smoothstep(r - aa, r + aa, length(f)) : 0.0;
      }
      col = mix(col, galaxy(frag), mg);
    }
    vec3 bg = col;
    if (uFlight > 0.5) {                     // flight layer is premultiplied; it comes through the same dots
      vec4 f = texture2D(tFlight, vUv) * reveal;
      col = col * (1.0 - f.a) + f.rgb;
    }
    // Crossing the sea: the water rises over the camera, you go under (rippling light,
    // shafts from above, bubbles), then break the surface into the next scene.
    if (uSea > 0.0 && uSea < 1.0) {
      float rise = smoothstep(0.0, 0.3, uSea), fall = smoothstep(0.52, 0.94, uSea);
      float level = mix(mix(-0.2, 1.25, rise), -0.25, fall)
                  + sin(vUv.x * 17.0 + uTime * 2.3) * 0.014 + sin(vUv.x * 43.0 - uTime * 3.4) * 0.006;
      float under = smoothstep(level + 0.004, level - 0.004, vUv.y);
      if (under > 0.0) {
        vec2 wob = vec2(sin(vUv.y * 32.0 + uTime * 2.1), cos(vUv.x * 27.0 + uTime * 1.8)) * 0.007;
        vec4 fw = uFlight > 0.5 ? texture2D(tFlight, vUv + wob) * reveal : vec4(0.0);
        vec3 seen = vec3(0.01, 0.07, 0.11) * (1.0 - fw.a) + fw.rgb;     // open water where no picture is
        // the water tints what you see through it (paintings ahead stay visible), deeper is darker
        vec3 uw = mix(seen, mix(vec3(0.01, 0.06, 0.12), vec3(0.04, 0.22, 0.32), vUv.y), 0.42 + 0.22 * (1.0 - vUv.y));
        vec2 cp = vUv * vec2(uRes.x / uRes.y, 1.0) * 5.0;
        float c1 = abs(sin(cp.x * 1.3 + fbm(cp * 0.5 + uTime * 0.22) * 6.0));
        float c2 = abs(sin(cp.y * 1.7 + fbm(cp * 0.6 - uTime * 0.18) * 6.0));
        float caustic = pow(1.0 - min(c1, c2), 10.0) * smoothstep(0.3, 0.7, fbm(cp * 0.3 + uTime * 0.1));
        uw += vec3(0.45, 0.8, 0.85) * caustic * 0.14 * vUv.y;
        // the surface overhead, bright and moving, seen from below
        uw += vec3(0.55, 0.85, 0.9) * smoothstep(0.72, 1.0, vUv.y) * (0.16 + 0.3 * caustic);
        // slanted shafts of light from the surface, fading with depth
        float sx = vUv.x + (1.0 - vUv.y) * 0.32;
        float shaft = pow(max(0.0, sin(sx * 9.0 + fbm(vec2(sx * 2.0, uTime * 0.15)) * 5.0)), 6.0);
        uw += vec3(0.4, 0.75, 0.8) * shaft * smoothstep(0.1, 1.0, vUv.y) * 0.3;
        // bubbles: each column rises at its own speed and each bubble sits anywhere in its cell,
        // so they never line up into a grid
        float ax = vUv.x * uRes.x / uRes.y * 11.0, colId = floor(ax);
        float sp = 1.3 + 1.9 * hash12(vec2(colId, 3.1));
        vec2 bp = vec2(ax, vUv.y * 11.0 - uTime * sp - uSea * 9.0 + hash12(vec2(colId, 7.7)) * 10.0);
        vec2 id = floor(bp);
        float h = hash12(id + 0.37);
        if (h > 0.78) {
          vec2 c = vec2(hash12(id + 1.3), hash12(id + 5.1)) * 0.56 - 0.28;
          c.x += sin(uTime * 2.4 + h * 30.0) * 0.07;
          float r = 0.04 + 0.12 * fract(h * 17.0);
          vec2 q = fract(bp) - 0.5 - c;
          float dd = length(q);
          float ring = smoothstep(r, r - 0.022, dd) - smoothstep(r - 0.03, r - 0.07, dd);
          float glint = smoothstep(r * 0.45, 0.0, length(q - vec2(-r * 0.35, r * 0.35)));
          uw += vec3(0.8, 0.95, 1.0) * (ring * 0.5 + glint * 0.45);
        }
        col = mix(col, uw, under);
      }
      col += vec3(0.9, 0.97, 1.0) * smoothstep(0.013, 0.0, abs(vUv.y - level)) * 0.85;    // foam on the surface
    }
    if (uMapOn > 0.5) {                      // braided map layer, also premultiplied
      vec4 m = texture2D(tMap, vUv);
      col = col * (1.0 - m.a) + m.rgb;
    }
    if (uCream > 0.0) {                      // Block 5: halftone dissolve into museum cream
      vec3 cream = vec3(0.953, 0.925, 0.871) * (0.988 + 0.024 * vnoise(frag * 0.25));
      float mc = 1.0;
      if (uCream < 1.0) {
        float cell = 12.0 * uDpr;
        vec2 g = frag / cell;
        vec2 f = fract(g) - 0.5;
        float n = hash12(floor(g));
        float t = uCream * 1.75 - n * 0.4 - vUv.y * 0.35;
        float r = clamp(t, 0.0, 1.0) * 0.76;
        float aa = 0.9 / cell;
        mc = r > 0.0 ? 1.0 - smoothstep(r - aa, r + aa, length(f)) : 0.0;
      }
      col = mix(col, cream, mc);
    }
    gl_FragColor = vec4(col + grain, 1.0);
  }
`;

/* ------------------------------------------------------------------ flight: plates
   The paintings are alive. Each one hangs at its own angle in the night and is a
   dense mesh lifted toward the reader by its depth map (figures in front, sky
   behind), so when the camera moves the picture opens up in layers. Parts of each
   painting move: weather in the far sky, ripples and glints on water, heat and
   flicker over fire, firelight in the hall, glints on gold. The edges are soft, so
   a painting reads as a picture hanging in the sky, never as a rectangle. Story
   transitions: the fight tears apart down the middle ("sinews split"), the warning
   turns to ash, the dragon burns away from its own fire.                        */
export const plateVert = /* glsl */ `
  uniform sampler2D uDepth;
  uniform float uDepthAmt, uLift;
  uniform vec2 uImgA, uImgB;          // plate uv -> painting uv (the plate is the painting plus a soft margin)
  uniform vec3 uEye;                  // the reading spot, in the world
  uniform mat4 uLocal, uGroup;        // the plate in its scene's frame, and that frame in the world
  varying vec2 vImg;
  varying float vDepth, vViewZ;
#ifdef TEAR
  attribute vec2 aTear;    // which half (-1 left, +1 right), distance from the rip (plate widths)
  uniform float uOpen;
  varying float vRip;
#endif
  void main() {
    vec2 img = uv * uImgA + uImgB;
    vImg = img;
    float w = smoothstep(0.0, 0.03, img.x) * (1.0 - smoothstep(0.97, 1.0, img.x))
            * smoothstep(0.0, 0.03, img.y) * (1.0 - smoothstep(0.97, 1.0, img.y));
    float d = texture2D(uDepth, clamp(img, 0.002, 0.998)).r;
    vDepth = d;
    vec4 gp = uLocal * vec4(position, 1.0);          // in the scene's own frame, where the painting is flat in x and y
#ifdef TEAR
    vRip = aTear.y;
    float e = uOpen * uOpen * (3.0 - 2.0 * uOpen);
    if (uOpen > 0.0) {
      // The two halves swing open away from you on hinges at their outer edges, like doors.
      vec3 hinge = (uLocal * vec4(aTear.x * 0.5, position.y, 0.0, 1.0)).xyz;
      vec3 r = gp.xyz - hinge;
      float a = -aTear.x * e * 1.35;
      gp.xyz = hinge + vec3(r.x * cos(a) + r.z * sin(a), r.y, -r.x * sin(a) + r.z * cos(a));
      gp.x += aTear.x * e * 0.16 * length(uLocal[0].xyz);
    }
#endif
    vec4 wp = uGroup * gp;
    // Lift along the line of sight from the reading spot: from there the painting
    // looks untouched, and as soon as the camera moves it separates into layers.
    vec3 lift = (uEye - wp.xyz) * d * w * uDepthAmt * uLift;
#ifdef TEAR
    lift *= 1.0 - e;
#endif
    wp.xyz += lift;
    vec4 mv = viewMatrix * wp;
    vViewZ = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

export const plateFrag = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uVis, uDpr, uTime, uD, uNear, uAspect, uFeather, uFogAmt;
  uniform vec3 uLife;      // sky drift, fire, glints on gold
  uniform vec3 uWater;     // water line (from the bottom), right-hand limit, strength
  uniform vec2 uHall;      // firelight flicker, image aspect
  uniform float uBurn, uRip, uBlur, uAsh;
  uniform vec2 uBurnFrom, uSweep;
  uniform vec3 uFlare;     // firelight thrown on the painting: where (image), how bright
  uniform vec3 uFog;       // the colour of the air far away
  varying vec2 vImg;
  varying float vDepth, vViewZ;
#ifdef TEAR
  varying float vRip;
#endif
  ${NOISE}

  // Star-shaped twinkles on a grid; returns the star and the cell centre to test.
  float twinkle(vec2 img, float cells, float rate, out vec2 centre) {
    vec2 g = img * vec2(uHall.y, 1.0) * cells;
    vec2 id = floor(g), f = fract(g) - 0.5;
    float h = hash12(id);
    centre = (id + 0.5) / cells / vec2(uHall.y, 1.0);
    float on = pow(max(0.0, sin(uTime * rate * (0.6 + h) + h * 40.0)), 18.0) * step(0.68, h);
    float star = max(0.0, 1.0 - length(f) * 4.0)
               + max(0.0, 1.0 - abs(f.x) * 16.0) * max(0.0, 1.0 - abs(f.y) * 2.2) * 0.7
               + max(0.0, 1.0 - abs(f.y) * 16.0) * max(0.0, 1.0 - abs(f.x) * 2.2) * 0.7;
    return on * star;
  }

  void main() {
    vec2 img = vImg;
    float t = uTime, d = vDepth;
    // The edge melts into the sky over a narrow margin.
    vec2 o = max(vec2(0.0), max(-img, img - 1.0));
    float a = 1.0 - smoothstep(0.0, uFeather * 0.3, max(o.x, o.y));   // a clean soft edge, not a smudge
    if (a < 0.004) discard;
    vec2 ic = clamp(img, 0.0, 1.0);
    float inPic = step(max(o.x, o.y), 0.0);

    // ---- the painting moves
    vec2 off = vec2(0.0);
    float far = 1.0 - smoothstep(0.05, 0.3, d);
    if (uLife.x > 0.0)
      off += (vec2(fbm(ic * 2.6 + vec2(t * 0.045, 0.0)), fbm(ic * 2.6 + vec2(4.7, t * 0.035))) - 0.5) * 0.014 * uLife.x * far;
    float water = smoothstep(uWater.x, uWater.x - 0.05, ic.y) * smoothstep(uWater.y, uWater.y - 0.08, ic.x) * uWater.z;
    if (water > 0.0) off.x += sin(ic.y * 260.0 - t * 1.7 + vnoise(ic * 14.0) * 5.0) * 0.0011 * water;
    float heat = 0.0;
    if (uLife.y > 0.0) {
      vec3 blur = texture2D(uMap, ic, 3.5).rgb;
      heat = smoothstep(0.2, 0.48, blur.r - 0.5 * (blur.g + blur.b)) * smoothstep(0.42, 0.78, blur.r) * uLife.y;
      off += (vec2(vnoise(ic * 46.0 + vec2(0.0, -t * 2.2)), vnoise(ic * 46.0 + vec2(3.1, -t * 2.2))) - 0.5) * 0.006 * heat;
    }
    off *= inPic;
    // "It fades quickly": the painting turns to ash from the windward side and the wind takes it.
    float ashEdge = -1.0;
    if (uAsh > 0.0) {
      ashEdge = mix(-0.6, 2.5, uAsh) - (ic.x + (fbm(ic * vec2(5.0, 3.0) + 7.0) - 0.5) * 0.55 + (ic.y - 0.5) * 0.18);
      if (ashEdge > 0.0) discard;
    }

    // uBlur: a far painting is out of focus and sharpens as you arrive.
    vec3 c = texture2D(uMap, clamp(ic + off, 0.0, 1.0), uBlur + (1.0 - inPic) * 1.0).rgb;
    c *= mix(0.86, 1.0, smoothstep(0.0, 0.02, min(min(ic.x, 1.0 - ic.x), min(ic.y, 1.0 - ic.y))));   // a soft shadow at the edge
    if (uAsh > 0.0) {
      float g = dot(c, vec3(0.3, 0.59, 0.11));
      c = mix(c, vec3(g * 0.8 + 0.14), smoothstep(-0.32, -0.03, ashEdge));
      c += vec3(1.0, 0.55, 0.2) * smoothstep(-0.03, 0.0, ashEdge) * 0.9;
    }

    if (heat > 0.0) {                                   // flames breathe and lick upward
      float fl = fbm(ic * vec2(7.0, 3.5) + vec2(0.0, -t * 1.3));
      c *= 1.0 + heat * (fl - 0.42) * 1.3 * inPic;
      c += vec3(1.0, 0.42, 0.1) * heat * pow(fl, 3.0) * 0.6 * inPic;
    }
    if (uHall.x > 0.0)                                  // firelight in the hall
      c *= 1.0 + uHall.x * (vnoise(vec2(t * 2.1, 1.3)) + 0.5 * vnoise(vec2(t * 5.3, 7.1)) - 0.75) * 0.12;
    if (uLife.z + uWater.z > 0.0) {                     // glints on gold and on water
      vec2 cc;
      float tw = twinkle(ic, 70.0, 2.2, cc);
      if (tw > 0.0) {
        vec3 m = texture2D(uMap, cc, 1.0).rgb;
        float lum = dot(m, vec3(0.3, 0.59, 0.11));
        float gold = smoothstep(0.5, 0.74, lum) * smoothstep(0.04, 0.2, m.r - m.b) * uLife.z;
        float wet = smoothstep(0.32, 0.58, lum) * smoothstep(uWater.x, uWater.x - 0.05, cc.y)
                  * smoothstep(uWater.y, uWater.y - 0.08, cc.x) * uWater.z;
        c += vec3(1.0, 0.94, 0.8) * tw * (gold + wet) * inPic;
      }
    }
    if (uFlare.z > 0.0) {
      float fd = length((ic - uFlare.xy) * vec2(uHall.y, 1.0));
      c += vec3(1.0, 0.5, 0.15) * (exp(-fd * 6.0) * 0.55 + exp(-fd * 18.0) * 0.6) * uFlare.z
         * (0.75 + 0.25 * vnoise(vec2(uTime * 11.0, 2.0))) * inPic;
    }

#ifdef TEAR
    if (uRip > 0.0) {
      // The rip runs from the top down: a dark split with torn, fibrous paper edges.
      float run = smoothstep(1.0 - uRip * 1.15, 1.06 - uRip * 1.15, ic.y);
      float fib = vnoise(vec2(ic.y * 420.0, 3.0)) * 0.6 + vnoise(vec2(ic.y * 90.0, 8.0)) * 0.4;
      float edge = vRip / (0.0016 + 0.0042 * fib);
      c = mix(c, vec3(0.97, 0.94, 0.86), (1.0 - smoothstep(0.6, 1.0, edge)) * run);
      c *= 1.0 - 0.55 * (1.0 - smoothstep(1.0, 3.2, edge)) * smoothstep(0.6, 1.0, edge) * run;
    }
#endif
    if (uBurn > 0.0) {
      // The dragon's fire takes the painting, starting from the flames.
      vec2 P = vec2(ic.x * uAspect, ic.y), B = vec2(uBurnFrom.x * uAspect, uBurnFrom.y);
      float n = length(P - B) / (uAspect * 1.15) + (fbm(ic * 6.0 + 2.0) - 0.5) * 0.38;
      float edge = uBurn * 1.35 - n;
      if (edge > 0.0) discard;
      c = mix(c, c * 0.12, smoothstep(-0.18, -0.02, edge) * 0.9);
      c += vec3(1.0, 0.5, 0.12) * smoothstep(-0.06, 0.0, edge) * 2.0
         + vec3(1.0, 0.9, 0.55) * smoothstep(-0.014, 0.0, edge) * 1.6;
    }

    // Far away the air softens it into the sky.
    c = mix(c, uFog, smoothstep(1.6 * uD, 6.5 * uD, vViewZ) * uFogAmt);

    // Breaks into halftone dots right in front of the camera, as it passes through.
    float vis = uVis * mix(1.0, smoothstep(0.1 * uD, 0.36 * uD, vViewZ), uNear);
    if (vis < 1.0) {
      float cell = 7.0 * uDpr;
      vec2 g = gl_FragCoord.xy / cell;
      vec2 f = fract(g) - 0.5;
      float n = hash12(floor(g));
      float tt = (1.0 - vis) * 1.8 - n * 0.55 - (0.5 - dot(ic - 0.5, uSweep)) * 0.25;
      float r = 0.76 * (1.0 - clamp(tt, 0.0, 1.0));
      if (length(f) > r) discard;
    }
    gl_FragColor = vec4(c * a, a);
  }
`;

/* ------------------------------------------------------------------ flight: the sky
   Two photographed skies (Poly Haven): dusk over a calm sea for the voyage, and the
   Milky Way over dark hills for everything after "years later". The dome sits
   round the camera, so when the camera turns, the sky turns with the world.     */
export const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_Position.z = gl_Position.w * 0.99999;      // always at the very back
  }
`;
export const skyFrag = /* glsl */ `
  uniform sampler2D uDusk, uNight;
  uniform float uMix, uYawD, uYawN, uExpD, uExpN, uTime;
  varying vec3 vDir;
  ${NOISE}
  vec2 equi(vec3 d, float yaw) {
    float lon = atan(d.x, -d.z);
    return vec2(fract(lon / 6.2831853 + 0.5 + yaw), 1.0 - acos(clamp(d.y, -1.0, 1.0)) / 3.14159265);
  }
  void main() {
    vec3 d = normalize(vDir);
    vec3 c = vec3(0.0);
    float wd = 1.0 - smoothstep(0.0, 0.58, uMix), wn = smoothstep(0.42, 1.0, uMix);
    if (wd > 0.001) c += textureLod(uDusk, equi(d, uYawD), 0.0).rgb * uExpD * wd;
    if (wn > 0.001) c += textureLod(uNight, equi(d, uYawN), 0.0).rgb * uExpN * wn * mix(0.4, 1.0, smoothstep(-0.06, 0.04, d.y));   // the land at night stays dark
    c += (hash12(gl_FragCoord.xy + fract(uTime * 7.0) * 113.0) - 0.5) * (1.5 / 255.0);   // no banding in the dusk
    gl_FragColor = vec4(c, 1.0);
  }
`;

/* ------------------------------------------------------------------ flight: dust in the air
   Faint motes fixed in the world (the box of them wraps round the camera), so every
   move of the camera, turn, rise or dive, shows real depth.                       */
export const moteVert = /* glsl */ `
  attribute vec4 aSeed;
  uniform vec3 uCam;
  uniform float uBox, uTime, uDpr, uD, uAmt;
  varying float vA, vWarm;
  void main() {
    vec3 p = aSeed.xyz * uBox;
    p += vec3(sin(uTime * 0.07 + aSeed.w * 20.0), cos(uTime * 0.05 + aSeed.x * 17.0), sin(uTime * 0.06 + aSeed.y * 13.0)) * uBox * 0.012;
    vec3 rel = mod(p - uCam + 0.5 * uBox, uBox) - 0.5 * uBox;
    vec4 mv = viewMatrix * vec4(uCam + rel, 1.0);
    gl_Position = projectionMatrix * mv;
    float z = -mv.z;
    gl_PointSize = clamp((1.2 + 2.4 * aSeed.w) * uDpr * uD * 0.55 / max(z, 1.0), 0.0, 7.0 * uDpr);
    float edge = 1.0 - smoothstep(0.32, 0.5, length(rel) / uBox);
    vA = uAmt * edge * smoothstep(0.06 * uD, 0.3 * uD, z) * (0.3 + 0.7 * aSeed.w);
    vWarm = aSeed.x;
  }
`;
export const moteFrag = /* glsl */ `
  varying float vA, vWarm;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    float g = smoothstep(0.5, 0.0, r);
    vec3 col = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.86, 0.62), vWarm) * g * g * vA;
    if (max(col.r, col.b) < 0.003) discard;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* A shade behind the words on the left (or the bottom on tall screens), fixed to the camera. */
export const scrimFrag = /* glsl */ `
  uniform float uAmt, uDir;
  varying vec2 vUv;
  void main() {
    float s = uDir < 0.5 ? smoothstep(0.62, 0.0, vUv.x) : smoothstep(0.55, 0.0, vUv.y);
    float a = s * s * 0.86 * uAmt;
    gl_FragColor = vec4(vec3(0.012, 0.022, 0.07) * a, a);
  }
`;

/* ------------------------------------------------------------------ flight: ash
   Hrothgar's painting coming apart. One flake per few pixels of the painting, each
   carrying its own colour; the same front that eats the painting sets it loose, and
   the wind takes it on toward the next scene, greying and burning out.            */
export const ashVert = /* glsl */ `
  attribute vec2 aImg;
  attribute vec4 aRnd;
  uniform sampler2D uMap, uDepth;
  uniform float uAsh, uDpr, uD, uDepthAmt, uFlake, uTime;
  uniform vec2 uHalf, uCenter;
  uniform vec3 uEyeL, uWind;
  varying vec3 vCol;
  varying float vA, vHot;
  ${NOISE}
  void main() {
    vec2 img = aImg;
    float age = mix(-0.6, 2.5, uAsh) - (img.x + (fbm(img * vec2(5.0, 3.0) + 7.0) - 0.5) * 0.55 + (img.y - 0.5) * 0.18);
    vec3 p = vec3(uCenter + (img - 0.5) * 2.0 * uHalf, 0.0);
    float d = texture2D(uDepth, img).r;
    p += (uEyeL - p) * d * uDepthAmt;
    float t = max(age, 0.0) * 2.4;
    p += uWind * t * uHalf.x * (1.0 + aRnd.x * 1.8);
    p.y += t * t * uHalf.y * 0.18 * (aRnd.z - 0.25) + sin(t * 3.0 + aRnd.y * 6.28) * uHalf.y * 0.05 * t;
    p.z += sin(t * 2.0 + aRnd.w * 6.28) * uHalf.x * 0.22 * t + t * uHalf.x * 0.18 * aRnd.y;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float z = max(-mv.z, 1.0);
    vec3 col = textureLod(uMap, img, 1.0).rgb;
    float g = dot(col, vec3(0.3, 0.59, 0.11));
    vCol = mix(col, vec3(g * 0.55 + 0.16), smoothstep(0.03, 0.4, age));
    vHot = smoothstep(0.0, 0.05, age) * (1.0 - smoothstep(0.05, 0.35, age));
    vA = age > 0.0 ? 1.0 - smoothstep(0.35, 1.05, age) : 0.0;
    gl_PointSize = age > 0.0 ? (0.9 + 1.7 * aRnd.w) * (1.0 - 0.5 * smoothstep(0.0, 0.9, age)) * uFlake * uDpr * uD / z : 0.0;
  }
`;
export const ashFrag = /* glsl */ `
  varying vec3 vCol;
  varying float vA, vHot;
  void main() {
    if (vA < 0.01) discard;
    vec2 q = gl_PointCoord - 0.5;
    float r = length(q);
    if (r > 0.5) discard;
    vec3 c = vCol + vec3(1.0, 0.45, 0.12) * vHot * 1.4;
    float a = vA * smoothstep(0.5, 0.25, r);
    gl_FragColor = vec4(c * a, a);
  }
`;

/* ------------------------------------------------------------------ flight: threads
   Gold (Warrior) and blue (Leader) cords. vUv.x runs along the cord, vUv.y
   around it. uReveal draws the cord on as the reader scrolls.              */
export const threadVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

export const threadFrag = /* glsl */ `
  uniform vec3 uColor, uShadow, uFog;
  uniform float uReveal, uLength, uFray, uMetal, uDimU, uNearFade, uD;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  ${NOISE}
  // per-pixel dither (interleaved gradient noise): fades read as smooth, not as dots
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  void main() {
    float s = vUv.x;
    if (s > uReveal) discard;
    float zf = -vViewPos.z;
    // right in front of the lens a strand thins away instead of filling the screen
    if (uNearFade > 0.0 && ign(gl_FragCoord.xy) > smoothstep(uNearFade * 0.35, uNearFade, zf)) discard;
    float along = s * uLength;
    float fib = hash12(floor(vec2(along / 2.5, vUv.y * 18.0)));
    float tip = uReveal * uLength - along;          // fibres thin out at the drawing tip
    if (uReveal < 0.999 && tip < 18.0 && fib > tip / 18.0) discard;
    if (s > uFray) {                                 // the snapped, frayed end
      float k = (s - uFray) / max(1.0 - uFray, 1e-4);
      if (fib < k * 1.1) discard;
    }
    // A three-ply cord: each ply a rounded strand twisting along, a dark groove between plies,
    // fine fibres running with the twist. The pattern fades to its average where it would
    // be smaller than a pixel, so it never shimmers.
    float tw = vUv.y * 3.0 + along / 26.0;
    float aa = 1.0 - smoothstep(0.18, 0.5, fwidth(tw));
    float f = fract(tw);
    float bulge = sin(f * 3.14159265);
    float groove = mix(0.72, smoothstep(0.0, 0.42, bulge), aa);
    float fibre = mix(1.0, 0.86 + 0.28 * vnoise(vec2(tw * 9.0, along * 0.08 - vUv.y * 40.0)), aa);
    vec3 N = normalize(vNormal);
    vec3 V = normalize(-vViewPos);
    vec3 L = normalize(vec3(-0.45, 0.65, 0.6));
    float wrap = max((dot(N, L) + 0.4) / 1.4, 0.0);
    float sky = 0.5 + 0.5 * N.y;
    vec3 base = mix(uShadow, uColor, 0.35 + 0.65 * wrap);
    vec3 col = base * (0.42 + 0.78 * wrap) * groove * fibre + uColor * 0.12 * sky;
    // a highlight that rides the crest of each ply as it twists past the light
    vec3 Hh = normalize(L + V);
    float spec = pow(max(dot(N, Hh), 0.0), 18.0) * mix(0.55, bulge * bulge, aa);
    col += uMetal * spec * vec3(1.0, 0.88, 0.62) * 0.95 + (1.0 - uMetal) * spec * 0.25;
    col += uColor * pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.35;         // rim
    if (uD > 0.0) col = mix(col, uFog, smoothstep(0.9, 4.0, zf / uD) * 0.55);   // the air between
    if (s < uDimU) col = mix(vec3(0.16, 0.36, 0.84), col, 0.42);   // a strand that has not "arrived" yet
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ------------------------------------------------------------------ flight: clouds
   Billboards of stippled cloud hanging in the tunnels. The dots use the same
   45 degree screen as the sky, so near and far clouds read as one sky.      */
export const cloudFrag = /* glsl */ `
  uniform float uSeed, uDpr, uFade;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 p = (vUv - 0.5) * vec2(1.6, 1.0);
    float r = length(p);
    vec2 q = vUv * vec2(2.6, 1.6) + uSeed;
    float n = fbm(q + vec2(fbm(q * 0.8), fbm(q * 0.8 + 3.0)) * 0.9);
    float body = smoothstep(0.5, 0.56, n * 0.62 + smoothstep(0.52, 0.12, r) * 0.5);
    float d = body * (0.5 + 0.5 * fbm(q * 3.0 + 1.7)) * smoothstep(0.55, 0.3, r);
    d = clamp(d * 1.5, 0.0, 1.0);
    float cell = 4.0 * uDpr;
    mat2 R = mat2(0.7071, -0.7071, 0.7071, 0.7071);
    vec2 f = fract(R * gl_FragCoord.xy / cell) - 0.5;
    float rad = sqrt(d) * 0.62;
    float aa = 0.9 / cell;
    float a = (1.0 - smoothstep(rad - aa, rad + aa, length(f))) * step(0.001, rad) * uFade;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vec3(1.0), a);
  }
`;

/* ------------------------------------------------------------------ map: arches
   A connection between two passages. Dashes flow from the earlier passage
   to the later one. uEmph: 0 = dimmed, 1 = normal, 2 = selected.            */
export const archFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime, uReveal, uLength, uEmph;
  varying vec2 vUv;
  void main() {
    if (vUv.x > uReveal) discard;
    float along = vUv.x * uLength;
    float e = uEmph;
    float sel = clamp(e - 1.0, 0.0, 1.0);
    float dash = step(0.42, fract(along / 22.0 - uTime * mix(0.6, 1.6, sel)));
    float base = e < 1.0 ? mix(0.16, 0.55, e) : mix(0.55, 1.0, sel);
    float a = base * mix(0.35, 1.0, dash);
    vec3 col = mix(vec3(1.0), uColor, mix(0.35, 0.8, sel));
    gl_FragColor = vec4(col, a);
  }
`;

/* ------------------------------------------------------------------ map: medallions */
export const medalFrag = /* glsl */ `
  uniform float uOn, uDim;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    float ring = smoothstep(0.78, 0.84, r) * (1.0 - smoothstep(0.92, 0.98, r));
    vec3 gold = mix(vec3(0.98, 0.84, 0.5), vec3(0.6, 0.4, 0.14), smoothstep(-0.6, 0.9, p.y * -0.7 + p.x * 0.4 + r * 0.5));
    vec3 col = mix(gold, vec3(1.0), ring * (0.6 + 0.4 * uOn));
    float edge = 1.0 - smoothstep(0.96, 1.0, r);
    gl_FragColor = vec4(col * mix(1.0, 0.45, uDim), edge);
  }
`;

/* ------------------------------------------------------------------ flight: snow
   Snow falling through the winter painting, between its layers ("fifty winters").
   The same flakes become the blizzard that carries you on to the dragon.       */
export const snowVert = /* glsl */ `
  attribute vec4 aSeed;            // position in the box (0..1) and size
  uniform vec3 uBox;               // box size; the object's position is its centre
  uniform float uTime, uFall, uWind, uRush, uDpr, uD, uSize, uFade, uNearCut;
  uniform vec2 uDrift;             // extra travel, accumulated on the CPU (the camera dropping, the wind turning)
  varying float vA;
  void main() {
    vec3 p = aSeed.xyz;
    float s = aSeed.w;
    p.y = fract(p.y - uTime * uFall * (0.55 + 0.9 * s) - uWind * 0.35 + uDrift.y * (0.6 + 0.8 * s));
    p.x = fract(p.x + sin(uTime * 0.6 + s * 31.0) * 0.006 - uWind * (0.6 + 0.8 * s) + uDrift.x * (0.6 + 0.8 * s));
    p.z = fract(p.z + uRush * (0.6 + 0.8 * s));
    vec4 mv = modelViewMatrix * vec4((p - 0.5) * uBox, 1.0);
    gl_Position = projectionMatrix * mv;
    float z = max(-mv.z, 1.0);
    gl_PointSize = min((1.6 + 4.2 * s) * uSize * uDpr * uD / z, 46.0 * uDpr);
    float edge = smoothstep(0.0, 0.06, p.y) * smoothstep(1.0, 0.94, p.y) * smoothstep(0.0, 0.05, p.x) * smoothstep(1.0, 0.95, p.x)
               * smoothstep(0.0, 0.1, p.z) * smoothstep(1.0, 0.9, p.z);
    vA = uFade * edge * smoothstep(uNearCut * uD, uNearCut * uD + 0.12 * uD, z) * (0.55 + 0.45 * s);
  }
`;

export const snowFrag = /* glsl */ `
  uniform vec3 uColor;
  varying float vA;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.12, r) * vA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

/* ------------------------------------------------------------------ flight: embers
   Sparks rising off the dragon's fire and the funeral pyre. Added as light.     */
export const emberVert = /* glsl */ `
  attribute vec4 aSeed;
  uniform vec3 uBox;
  uniform float uTime, uRise, uDpr, uD, uAmount;
  varying float vA;
  varying float vHot;
  void main() {
    vec3 p = aSeed.xyz;
    float s = aSeed.w;
    p.y = fract(p.y + uTime * uRise * (0.4 + 0.9 * s));
    p.x = fract(p.x + sin(uTime * (0.8 + s) + s * 40.0) * 0.02 + p.y * 0.08);
    vec4 mv = modelViewMatrix * vec4((p - 0.5) * uBox, 1.0);
    gl_Position = projectionMatrix * mv;
    float z = max(-mv.z, 1.0);
    gl_PointSize = min((1.4 + 3.4 * s) * uDpr * uD / z, 22.0 * uDpr);
    float flick = 0.55 + 0.45 * sin(uTime * (7.0 + 9.0 * s) + s * 70.0);
    vA = uAmount * flick * smoothstep(0.0, 0.12, p.y) * smoothstep(1.0, 0.55, p.y) * smoothstep(0.1 * uD, 0.25 * uD, z);
    vHot = s;
  }
`;

export const emberFrag = /* glsl */ `
  varying float vA;
  varying float vHot;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    float g = smoothstep(0.5, 0.0, r);
    vec3 col = mix(vec3(1.0, 0.38, 0.08), vec3(1.0, 0.82, 0.45), vHot) * (g * g * 1.6) * vA;
    if (max(col.r, col.g) < 0.004) discard;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* The inside of the barrow: dark earth in layers, roots and stones catching a little light,
   behind the camera's drop from the snow down to the dragon's hoard. */
export const earthFrag = /* glsl */ `
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 p = vUv * vec2(7.0, 6.0);
    float n = vnoise(p) * 0.6 + vnoise(p * 2.7 + 3.1) * 0.3 + vnoise(p * 7.3) * 0.1;
    float strata = sin(vUv.y * 46.0 + n * 7.0) * 0.5 + 0.5;
    vec3 col = mix(vec3(0.03, 0.022, 0.018), vec3(0.12, 0.08, 0.05), n * 0.75 + strata * 0.18);
    col *= mix(0.45, 1.0, smoothstep(0.0, 0.9, vUv.y));
    float fleck = step(0.986, hash12(floor(vUv * vec2(260.0, 220.0))));
    col += vec3(0.55, 0.42, 0.2) * fleck * 0.22 * n;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* A veil just in front of the camera: blown snow, the dark inside the barrow, ash on the
   wind, funeral smoke. It streams across the screen the way the camera is moving. */
export const veilFrag = /* glsl */ `
  uniform float uTime, uAmt, uWind, uEdge;
  uniform vec2 uDir;
  uniform vec3 uColor, uColor2, uGlow;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 p = vUv * vec2(2.4, 3.0) - uDir * uWind * 3.0;
    float n = fbm(p + vec2(0.0, fbm(p * 0.7 + uTime * 0.15)));
    // uEdge >= 0: the veil rolls in from the side it streams from (0 = none of the screen, 1.3 = all)
    float side = 1.0;
    if (uEdge >= 0.0) {
      float q = dot(vUv - 0.5, normalize(uDir)) + 0.5;
      side = smoothstep(-0.22, 0.22, uEdge - q + (n - 0.5) * 0.5);
    }
    float a = clamp(uAmt * (0.45 + 0.65 * n) * side, 0.0, 0.95);
    if (a < 0.004) discard;
    vec3 col = mix(uColor, uColor2, smoothstep(0.25, 0.85, n));
    col += uGlow * pow(1.0 - vUv.y, 2.0) * (0.4 + n);           // firelight from below (smoke only)
    gl_FragColor = vec4(col, a);
  }
`;

/* ------------------------------------------------------------------ flight: Beowulf
   Beowulf cut out of Bacon's engraving and cast in gold, like the warrior panels on
   the Sutton Hoo helmet. The engraving's depth pushes him out into a relief; its
   lines become dark bronze and the paper bright gold. The light follows the mouse. */
export const figureVert = /* glsl */ `
  uniform sampler2D uDepthMap;
  uniform float uRelief;
  varying vec2 vUv;
  varying float vViewZ;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z += texture2D(uDepthMap, uv).r * uRelief;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vViewZ = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

export const figureFrag = /* glsl */ `
  uniform sampler2D uMap, uDepthMap;
  uniform float uVis, uDpr, uD, uBump, uGlint;
  uniform vec2 uLight, uTexel;
  varying vec2 vUv;
  varying float vViewZ;
  ${NOISE}
  void main() {
    vec4 tex = texture2D(uMap, vUv);
    if (tex.a < 0.04) discard;
    float g = tex.r;
    float hL = texture2D(uDepthMap, vUv - vec2(uTexel.x, 0.0)).r;
    float hR = texture2D(uDepthMap, vUv + vec2(uTexel.x, 0.0)).r;
    float hD = texture2D(uDepthMap, vUv - vec2(0.0, uTexel.y)).r;
    float hU = texture2D(uDepthMap, vUv + vec2(0.0, uTexel.y)).r;
    // the engraved lines read as chased grooves in the metal
    float gx = texture2D(uMap, vUv + vec2(uTexel.x * 0.25, 0.0)).r - texture2D(uMap, vUv - vec2(uTexel.x * 0.25, 0.0)).r;
    float gy = texture2D(uMap, vUv + vec2(0.0, uTexel.y * 0.25)).r - texture2D(uMap, vUv - vec2(0.0, uTexel.y * 0.25)).r;
    vec3 n = normalize(vec3((hL - hR) * uBump - gx * 0.6, (hD - hU) * uBump - gy * 0.6, 1.0));
    vec3 L = normalize(vec3(uLight, 0.75));
    float diff = max(dot(n, L), 0.0);
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 22.0);
    vec3 dark = vec3(0.13, 0.06, 0.015), mid = vec3(0.7, 0.47, 0.14), hi = vec3(1.0, 0.86, 0.5);
    vec3 base = g < 0.5 ? mix(dark, mid, g / 0.5) : mix(mid, hi, (g - 0.5) / 0.5);
    vec3 c = base * (0.38 + 0.8 * diff) + spec * vec3(1.0, 0.9, 0.62) * (0.25 + 0.75 * g);
    float band = exp(-pow((vUv.x * 0.8 + vUv.y * 0.6 - uGlint) / 0.06, 2.0));
    c += band * vec3(1.0, 0.84, 0.5) * 0.45 * g;
    float vis = uVis * smoothstep(0.1 * uD, 0.36 * uD, vViewZ);
    if (vis < 1.0) {
      float cell = 7.0 * uDpr;
      vec2 q = gl_FragCoord.xy / cell;
      vec2 f = fract(q) - 0.5;
      float h = hash12(floor(q));
      float t = (1.0 - vis) * 1.8 - h * 0.55 - (1.0 - vUv.y) * 0.25;
      if (length(f) > 0.76 * (1.0 - clamp(t, 0.0, 1.0))) discard;
    }
    gl_FragColor = vec4(c, tex.a);
  }
`;

/* ------------------------------------------------------------------ flight: dragon fire
   The dragon's breath: a jet of flame poured from off the top of the painting onto
   Beowulf's shield (added as light), with sparks carried along it and splashing off. */
export const breathFrag = /* glsl */ `
  uniform float uTime, uAmount;
  varying vec2 vUv;                      // x: 0 at the dragon's mouth, 1 at the shield
  ${NOISE}
  void main() {
    float s = vUv.x, t = vUv.y * 2.0 - 1.0;
    float width = mix(0.28, 1.0, pow(s, 0.8));
    float core = 1.0 - smoothstep(0.0, width, abs(t + (vnoise(vec2(s * 4.0 - uTime * 2.0, 1.0)) - 0.5) * 0.35 * s));
    vec2 p = vec2(s * 5.5 - uTime * 3.4, t * 2.4);
    float n = fbm(p + vec2(0.0, fbm(p * 1.6 - uTime * 1.3)));
    float d = core * (0.45 + n) * smoothstep(0.0, 0.06, s) * (1.0 - 0.55 * smoothstep(0.86, 1.0, s));
    d = clamp(d * d * 1.8, 0.0, 1.6);
    vec3 col = mix(vec3(0.85, 0.12, 0.05), vec3(1.0, 0.58, 0.12), smoothstep(0.15, 0.7, d));
    col = mix(col, vec3(1.0, 0.95, 0.78), smoothstep(0.9, 1.4, d));
    vec3 o = col * d * uAmount;
    if (max(o.r, o.g) < 0.003) discard;
    gl_FragColor = vec4(o, 1.0);
  }
`;

export const sparkVert = /* glsl */ `
  attribute vec4 aSeed;
  uniform vec3 uFrom, uTo;
  uniform float uTime, uDpr, uD, uAmount;
  varying float vA;
  varying float vHot;
  void main() {
    float s = aSeed.w;
    float ph = fract(aSeed.x + uTime * (0.8 + 0.7 * s));
    vec3 dir = uTo - uFrom;
    float len = length(dir.xy);
    vec3 side = vec3(normalize(vec2(-dir.y, dir.x)), 0.0);
    vec3 p;
    if (aSeed.y < 0.55) {                // carried along the jet
      p = uFrom + dir * ph + side * (aSeed.z - 0.5) * len * 0.2 * ph + vec3(0.0, 0.0, (aSeed.x - 0.5) * 60.0);
    } else {                              // splashed off the shield, then falling
      float ang = atan(-dir.y, -dir.x) + (aSeed.z - 0.5) * 3.6;
      vec2 v = vec2(cos(ang), sin(ang)) * len * (0.12 + 0.4 * s);
      p = uTo + vec3(v * ph, 40.0 * s) + vec3(0.0, -len * 0.5 * ph * ph, 0.0);
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float z = max(-mv.z, 1.0);
    gl_PointSize = min((1.6 + 4.4 * s) * uDpr * uD / z, 26.0 * uDpr);
    vA = uAmount * (1.0 - ph) * smoothstep(0.0, 0.04, ph) * 1.4;
    vHot = 1.0 - ph * 0.8;
  }
`;
