/* Small sound effects, made in the browser from filtered noise (no sound files).
   They play quietly, only after the visitor has clicked (browsers require that). */

let noiseBuf = null;
const ctx = () => {
  const c = window.__audioCtx;
  return c && c.state === "running" ? c : null;
};
function noise(c) {
  if (noiseBuf) return noiseBuf;
  noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
// One shaped burst of filtered noise.
function burst({ type = "bandpass", f0, f1, q = 1, dur, peak, attack = 0.08, delay = 0, rate = 1 }) {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noise(c);
  src.playbackRate.value = rate;
  const filt = c.createBiquadFilter();
  filt.type = type;
  filt.Q.value = q;
  filt.frequency.setValueAtTime(f0, t);
  filt.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt).connect(g).connect(c.destination);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

export const sfx = {
  // air rushing past as the camera moves to the next scene
  whoosh() { burst({ f0: 380, f1: 1500, q: 0.8, dur: 1.1, peak: 0.07, attack: 0.45 }); },
  // into the water: a low plunge, then a few bubbles
  splash() {
    burst({ type: "lowpass", f0: 2600, f1: 260, dur: 0.9, peak: 0.16, attack: 0.02 });
    const c = ctx();
    if (!c) return;
    for (let i = 0; i < 6; i++) {
      const t = c.currentTime + 0.25 + i * 0.11 + Math.random() * 0.06;
      const o = c.createOscillator(), g = c.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(300 + Math.random() * 400, t);
      o.frequency.exponentialRampToValueAtTime(900 + Math.random() * 700, t + 0.07);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.025, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + 0.1);
    }
  },
  // the painting tears from top to bottom
  rip() {
    burst({ type: "highpass", f0: 1800, f1: 700, q: 0.7, dur: 0.55, peak: 0.12, attack: 0.03, rate: 0.6 });
    burst({ f0: 900, f1: 300, q: 2, dur: 0.4, peak: 0.06, attack: 0.02, delay: 0.08, rate: 0.5 });
  },
  // the Enter screen catching fire
  fire() {
    burst({ type: "lowpass", f0: 400, f1: 1800, dur: 1.8, peak: 0.12, attack: 0.5 });
    for (let i = 0; i < 9; i++) burst({ type: "highpass", f0: 2500, f1: 2000, dur: 0.05, peak: 0.05, attack: 0.005, delay: 0.1 + Math.random() * 1.5 });
  },
};
