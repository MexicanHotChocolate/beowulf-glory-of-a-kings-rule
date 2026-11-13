/* ==========================================================================
   How much this computer can take. The Enter screen measures it (graphics
   card, memory, frame rate) and picks one of three settings; everything that
   costs a lot reads from Q: pixel density, anti-aliasing, how fine the
   painting meshes are, how many particles, the club's glow. While you scroll,
   the stage keeps timing its frames and lowers the pixel density if they get
   slow (and raises it again when there is room).
   ========================================================================== */

export const PRESETS = {
  high: { tier: "high", label: "High", dpr: 1.75, msaa: 4, grid: 1, fx: 1, bloom: true, plates: "xl" },
  medium: { tier: "medium", label: "Balanced", dpr: 1.3, msaa: 2, grid: 0.72, fx: 0.7, bloom: true, plates: "xl" },
  low: { tier: "low", label: "Light", dpr: 1, msaa: 0, grid: 0.45, fx: 0.45, bloom: false, plates: "std" },
};

export const Q = { ...PRESETS.high };

export function setTier(tier) {
  Object.assign(Q, PRESETS[tier] || PRESETS.medium);
  window.__quality = Q;
  return Q;
}

/* Quick checks that need no rendering, so the stage can size itself before it is built. */
export function deviceProfile() {
  const p = { webgl2: false, gpu: "unknown", cores: navigator.hardwareConcurrency || 0, memory: navigator.deviceMemory || 0,
    screen: `${window.screen.width} × ${window.screen.height}`, ratio: window.devicePixelRatio || 1, maxTexture: 0 };
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (gl) {
      p.webgl2 = true;
      p.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        // "ANGLE (Vendor, Card (0x1234) Direct3D11 vs_5_0 ps_5_0, D3D11)" -> "Card"
        const raw = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).replace(/^ANGLE \(|\)$/g, "");
        const parts = raw.split(",").map((t) => t.trim());
        p.gpu = (parts[1] || parts[0]).replace(/\(0x[0-9a-f]+\)/i, "").replace(/(Direct3D|OpenGL|Vulkan|Metal).*$/i, "").replace(/\((R|TM)\)/g, "").trim() || raw;
      }
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {}
  const soft = /swiftshader|llvmpipe|software|basic render/i.test(p.gpu);
  // built-in laptop and phone graphics (Intel Arc cards are separate cards, so they count as fast)
  const builtIn = /(hd graphics|uhd|iris|mali|adreno|powervr|apple gpu|radeon graphics|vega \d+ graphics)/i.test(p.gpu)
    || (/intel/i.test(p.gpu) && !/arc/i.test(p.gpu));
  if (!p.webgl2 || soft || (p.memory && p.memory <= 2) || (p.cores && p.cores <= 2)) p.tier = "low";
  else if (builtIn || (p.memory && p.memory <= 4) || (p.cores && p.cores <= 4)) p.tier = "medium";
  else p.tier = "high";
  return p;
}

/* The frame rate decides the rest: a card that looks fast but runs slow drops a level. */
export function tierFor(profile, fps) {
  let t = profile.tier;
  if (fps < 50 && t === "high") t = "medium";
  if (fps < 34) t = "low";
  return t;
}
