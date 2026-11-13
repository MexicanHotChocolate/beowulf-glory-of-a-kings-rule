/* ==========================================================================
   Block 4: everything you can read and click on the braided map.
   The words come from the plain-text lists inside #map in index.html, so
   the map still makes sense with no WebGL and to screen readers.
   ========================================================================== */

const pad = (n) => String(n).padStart(2, "0");

export function readMapData(root) {
  const nodes = [...root.querySelectorAll(".map__passages li")].map((li) => {
    const strong = li.querySelector("strong").textContent.trim();
    return {
      id: Number(li.dataset.node),
      line: Number(li.dataset.line),
      lines: li.dataset.lines,
      title: strong.replace(/^\d+\.\s*/, ""),
      label: li.textContent.replace(strong, "").trim(),
    };
  });
  const conns = [...root.querySelectorAll(".map__connections li")].map((li) => ({
    id: li.dataset.conn,
    from: Number(li.dataset.from),
    to: Number(li.dataset.to),
    type: li.dataset.type,
    side: Number(li.dataset.side),
    t: Number(li.dataset.t),
    title: li.querySelector("h3").textContent.trim(),
    text: li.querySelector("p").textContent.trim(),
  }));
  return { nodes, conns };
}

export class MapUI {
  constructor(root, data, map) {
    this.root = root;
    this.data = data;
    this.map = map;
    this.card = root.querySelector(".map__card");
    this.chipsEl = root.querySelector(".map__chips");
    this.nodesEl = root.querySelector(".map__nodes");
    this.ticksEl = root.querySelector(".map__ticks");
    this.shown = false;

    // Connection labels (the analytical function of each arch).
    this.chips = data.conns.map((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `map-chip mono map-chip--${c.side > 0 ? "up" : "down"}`;
      b.dataset.conn = c.id;
      b.setAttribute("aria-pressed", "false");
      b.innerHTML = `<span>${c.type}</span><small>${pad(c.from)} + ${pad(c.to)}</small>`;
      b.addEventListener("click", () => this.select({ kind: "conn", id: c.id }));
      b.addEventListener("pointerenter", () => this.hover({ kind: "conn", id: c.id }));
      b.addEventListener("pointerleave", () => this.hover(null));
      b.addEventListener("focus", () => this.hover({ kind: "conn", id: c.id }));
      b.addEventListener("blur", () => this.hover(null));
      this.chipsEl.appendChild(b);
      return { el: b, c };
    });

    // Passage medallion buttons.
    this.nodeEls = data.nodes.map((n) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "map-node mono";
      b.dataset.node = n.id;
      b.innerHTML = `<b>${pad(n.id)}</b><span>${n.lines.split(",")[0]}</span>`;
      b.setAttribute("aria-label", `Passage ${pad(n.id)}: ${n.title}`);
      b.addEventListener("click", () => this.select({ kind: "node", id: n.id }));
      b.addEventListener("pointerenter", () => this.hover({ kind: "node", id: n.id }));
      b.addEventListener("pointerleave", () => this.hover(null));
      this.nodesEl.appendChild(b);
      return { el: b, n };
    });
    // The overlay is decorative for assistive tech, but these buttons must stay reachable.
    root.querySelector(".map__overlay").removeAttribute("aria-hidden");
    this.ticksEl.setAttribute("aria-hidden", "true");

    // Ruler numbers.
    this.ticks = [0, 3182].map((line) => {
      const s = document.createElement("span");
      s.className = "map-tick mono";
      s.textContent = line === 0 ? "line 1" : "line 3182";
      this.ticksEl.appendChild(s);
      return { el: s, line };
    });

    this.select({ kind: "conn", id: "A" });
  }

  hover(f) {
    this.map.hovered = f;
    this.render(f || this.map.selected);
  }

  select(f) {
    this.map.selected = f;
    this.chips.forEach(({ el, c }) => el.setAttribute("aria-pressed", String(f.kind === "conn" && f.id === c.id)));
    this.nodeEls.forEach(({ el, n }) => el.classList.toggle("is-on", f.kind === "node" && f.id === n.id));
    this.render(f);
  }

  /* Fills the card for a connection or a passage. */
  render(f) {
    if (!f) return;
    const meta = this.card.querySelector(".map__card-meta");
    const title = this.card.querySelector(".map__card-title");
    const text = this.card.querySelector(".map__card-text");
    if (f.kind === "conn") {
      const c = this.data.conns.find((c) => c.id === f.id);
      this.card.dataset.side = c.side > 0 ? "up" : "down";
      meta.textContent = `${c.type} \u00b7 ${pad(c.from)} and ${pad(c.to)}`;
      title.textContent = c.title;
      text.textContent = c.text;
    } else {
      const n = this.data.nodes.find((n) => n.id === f.id);
      const links = this.data.conns.filter((c) => c.from === n.id || c.to === n.id)
        .map((c) => `${c.type} (${pad(c.from === n.id ? c.to : c.from)})`);
      this.card.dataset.side = "node";
      meta.textContent = `${pad(n.id)} \u00b7 lines ${n.lines}`;
      title.textContent = n.title;
      text.textContent = `${n.label} Connects to ${links.join(", ")}.`;
    }
  }

  /* Called every frame: pins the labels to the 3D map. */
  update() {
    const map = this.map;
    const on = map.isActive() || map.p >= 0.999;
    const ready = map.build01 > 0.62;
    if (ready !== this.shown) {
      this.shown = ready;
      this.root.classList.toggle("is-built", ready);
    }
    if (!on || map.p >= 0.999) return;
    const stacked = map.L.stacked;
    this.root.classList.toggle("is-stacked", stacked);

    this.nodeEls.forEach(({ el, n }) => {
      const p = map.nodePoint(n.id);
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    });
    this.ticks.forEach(({ el, line }) => {
      const p = map.tickPoint(line);
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    });
    if (!stacked) {
      this.chips.forEach(({ el, c }) => {
        const arch = map.arches.find((a) => a.id === c.id);
        const p = map.archPoint(arch, c.t);
        el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, ${c.side > 0 ? "-130%" : "30%"})`;
      });
    } else {
      this.chips.forEach(({ el }) => { el.style.transform = ""; });
    }
  }
}
