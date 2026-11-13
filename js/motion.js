/* ==========================================================================
   Motion: the layer that keeps the words and the pointer alive.
   - split(): breaks text into masked words (and letters) without losing <em>,
     <mark> or <br>, so lines can rise out of their own baseline.
   - reveal presets for headings, paragraphs and quotes, played on scroll.
   - a cursor (gold ring that trails a dot) and buttons that lean toward it.
   ========================================================================== */

const gsap = window.gsap;

export function split(el, { chars = false } = {}) {
  if (!el) return { words: [], chars: [] };
  if (el._split) return el._split;
  const words = [], letters = [];
  const walk = (node) => {
    for (const n of [...node.childNodes]) {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const part of n.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); continue; }
          const w = document.createElement("span");
          w.className = "tx-w";
          const wi = document.createElement("span");
          wi.className = "tx-wi";
          if (chars) {
            for (const ch of part) {
              const c = document.createElement("span");
              c.className = "tx-c";
              c.textContent = ch;
              wi.appendChild(c);
              letters.push(c);
            }
          } else wi.textContent = part;
          w.appendChild(wi);
          frag.appendChild(w);
          words.push(wi);
        }
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.tagName !== "BR") walk(n);
    }
  };
  // Letters as separate boxes can be read out one by one, so those elements get a label.
  if (chars && !el.getAttribute("aria-label")) el.setAttribute("aria-label", el.textContent.replace(/\s+/g, " ").trim());
  walk(el);
  if (chars) for (const s of el.querySelectorAll(".tx-w")) s.setAttribute("aria-hidden", "true");
  el._split = { words, chars: letters };
  return el._split;
}

const onScroll = (el, start = "top 86%") => ({ trigger: el, start, toggleActions: "play none none reverse" });

/* Big headings: letters rise out of the line, tipping forward in 3D. */
export function revealHeading(el, { scroll = true, delay = 0, start } = {}) {
  const { chars } = split(el, { chars: true });
  if (!chars.length) return null;
  return gsap.from(chars, {
    yPercent: 118, rotateX: -75, opacity: 0, transformOrigin: "50% 100% -20px",
    duration: 1.25, ease: "expo.out", stagger: { each: 0.022, from: "start" }, delay,
    scrollTrigger: scroll ? onScroll(el, start) : undefined,
  });
}

/* Paragraphs: words rise out of their lines in a quick wave. */
export function revealWords(el, { scroll = true, delay = 0, start, each = 0.01 } = {}) {
  const { words } = split(el);
  if (!words.length) return null;
  return gsap.from(words, {
    yPercent: 108, opacity: 0, duration: 1.05, ease: "expo.out", stagger: each, delay,
    scrollTrigger: scroll ? onScroll(el, start) : undefined,
  });
}

/* Pictures: open from the bottom edge like a shutter, settling from a slight zoom. */
export function revealImage(frame, img) {
  return gsap.timeline({ scrollTrigger: onScroll(frame, "top 82%") })
    .fromTo(frame, { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.4, ease: "expo.inOut" })
    .fromTo(img, { scale: 1.35 }, { scale: 1.06, duration: 1.8, ease: "expo.out" }, 0.1);
}

/* The cursor: a dot that sticks to the pointer and a gold ring that trails it. */
export function cursor() {
  if (window.matchMedia("(pointer: coarse)").matches) return;
  const dot = document.createElement("div"), ring = document.createElement("div");
  dot.className = "cur-dot";
  ring.className = "cur-ring";
  document.body.append(ring, dot);
  document.documentElement.classList.add("has-cursor");
  const xd = gsap.quickTo(dot, "x", { duration: 0.06 }), yd = gsap.quickTo(dot, "y", { duration: 0.06 });
  const xr = gsap.quickTo(ring, "x", { duration: 0.5, ease: "power3" }), yr = gsap.quickTo(ring, "y", { duration: 0.5, ease: "power3" });
  window.addEventListener("pointermove", (e) => { xd(e.clientX); yd(e.clientY); xr(e.clientX); yr(e.clientY); }, { passive: true });
  const clickable = "a, button, [data-node], [data-conn], .map__chip, label";
  document.addEventListener("pointerover", (e) => ring.classList.toggle("is-hover", !!e.target.closest?.(clickable)));
  window.addEventListener("pointerdown", () => ring.classList.add("is-down"));
  window.addEventListener("pointerup", () => ring.classList.remove("is-down"));
  document.documentElement.addEventListener("pointerleave", () => gsap.to([dot, ring], { opacity: 0, duration: 0.3 }));
  document.documentElement.addEventListener("pointerenter", () => gsap.to([dot, ring], { opacity: 1, duration: 0.3 }));
}

/* Buttons lean toward the pointer and spring back when it leaves. */
export function magnetic(selector, strength = 0.32) {
  if (window.matchMedia("(pointer: coarse)").matches) return;
  const bind = (el) => {
    if (el._mag) return;
    el._mag = true;
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      gsap.to(el, { x: (e.clientX - r.left - r.width / 2) * strength, y: (e.clientY - r.top - r.height / 2) * strength, duration: 0.45, ease: "power3.out" });
    });
    el.addEventListener("pointerleave", () => gsap.to(el, { x: 0, y: 0, duration: 0.9, ease: "elastic.out(1, 0.35)" }));
  };
  document.querySelectorAll(selector).forEach(bind);
}
