// The map as light. Three canvases behind the page: a half-resolution one for the broad light, a sharp one for
// filaments and notes, and one on top for labels and the thread that ties a loop to its note.
// The map lives wherever the page's .mapbox element is, so CSS decides its place at every screen size.
// WakeMap({ draw(S) })
(function () {
  const G = window.WAKE_GRAPH;
  const query = new URLSearchParams(location.search);
  const frozen = query.has("freeze") ? +query.get("freeze") : null;
  const still = query.has("still") || (matchMedia("(prefers-reduced-motion: reduce)").matches && frozen == null);
  const css = getComputedStyle(document.documentElement);
  const layer = (name) => document.querySelector("canvas." + name);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  window.WakeMap = function (opt) {
    const glow = layer("glow"), sharp = layer("sharp"), top = layer("thread"), home = document.querySelector(".mapbox"), bar = document.querySelector(".top");
    const nodes = G.nodes.map((n, i) => ({ ...n, i, seed: ((i * 2654435761) >>> 0) / 4294967296, px: 0, py: 0, lit: 0, flare: 0, hold: 0 }));
    const links = G.links.map(([a, b, w]) => ({ a: nodes[a], b: nodes[b], w }));
    const near = nodes.map(() => []);
    links.forEach((l) => { near[l.a.i].push(l.b); near[l.b.i].push(l.a); });
    nodes.forEach((n) => (n.today = near[n.i].filter((m) => m.heat >= 0.8).length));

    // hops from the nearest hot note: the light comes on outward from today's work
    const queue = nodes.filter((n) => n.heat >= 0.8);
    nodes.forEach((n) => (n.hops = n.heat >= 0.8 ? 0 : Infinity));
    for (const a of queue) for (const b of near[a.i]) if (b.hops > a.hops + 1) { b.hops = a.hops + 1; queue.push(b); }
    const far = Math.max(...nodes.map((n) => (isFinite(n.hops) ? n.hops : 0)));
    nodes.forEach((n) => { if (!isFinite(n.hops)) n.hops = far + 1 + n.seed; });

    const boxes = [];
    const S = {
      glow: glow.getContext("2d"), ctx: sharp.getContext("2d"), over: top.getContext("2d"),
      nodes, links, near, t: 0, wake: 0, w: 0, h: 0, zoom: 1, still, narrow: false, hover: null, lights: null, tethers: [], pointer: null,
      token: (name) => css.getPropertyValue(name).trim(),
      alpha: (color, a) => color.replace(/\)\s*$/, ` / ${clamp(a, 0, 1).toFixed(3)})`),
      ease: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3)),
      byLabel: Object.fromEntries(nodes.map((n) => [n.label, n])),
      byHeat: [...nodes].sort((a, b) => (b.kind === "projects") - (a.kind === "projects") || b.heat - a.heat),
      // labels claim their box, hottest first, so two never print on top of each other
      claim: (x, y, w, h) => { if (boxes.some((b) => x < b[0] + b[2] && b[0] < x + w && y < b[1] + b[3] && b[1] < y + h)) return false; boxes.push([x, y, w, h]); return true; },
      reserve: (x, y, w, h) => boxes.push([x, y, w, h]),
    };
    S.selected = S.byLabel[document.body.dataset.selected] || null;

    function size() {
      const dpr = Math.min(devicePixelRatio || 1, 2), r = sharp.getBoundingClientRect();
      S.w = r.width; S.h = r.height;
      for (const [c, k] of [[glow, 0.5], [sharp, dpr], [top, dpr]]) { c.width = Math.round(r.width * k); c.height = Math.round(r.height * k); c.getContext("2d").setTransform(k, 0, 0, k, 0, 0); }
    }
    let rowTether = null, closing = null;
    function place() {
      const box = sharp.getBoundingClientRect(), m = home.getBoundingClientRect();
      S.narrow = getComputedStyle(home).position === "relative";
      S.box = { left: m.left - box.left, top: m.top - box.top, right: m.right - box.left, bottom: m.bottom - box.top, w: m.width, h: m.height };
      S.barBottom = bar ? bar.getBoundingClientRect().bottom - box.top : 0;
      const cx = S.box.left + m.width / 2, cy = S.box.top + m.height / 2, sx = m.width * 0.44, sy = m.height * 0.42;
      S.zoom = clamp(Math.min(sx / 440, sy / 290), 0.45, 1.15); boxes.length = 0;
      // text on the page claims its space first, so no map label is ever drawn under it
      for (const el of document.querySelectorAll("[data-quiet]")) { const q = el.getBoundingClientRect(); if (q.bottom > 0 && q.top < S.h) boxes.push([q.left - box.left - 10, q.top - box.top - 10, q.width + 20, q.height + 20]); }
      for (const n of nodes) {
        const a = (5 + n.seed * 5) * Math.min(1, S.zoom + 0.2), p = n.seed * 40;
        n.px = cx + n.x * sx + a * Math.sin(S.t / (9 + n.seed * 8) + p);
        n.py = cy + n.y * sy + a * Math.cos(S.t / (11 + n.seed * 7) + p * 1.7);
        const want = S.lights ? (S.lights.has(n.label) ? 1 : 0) : S.hover === n ? 1 : 0;
        n.lit += (want - n.lit) * (still ? 1 : 0.16);
        if (S.t > n.hold) n.flare *= still ? 0 : 0.955;
      }
      const tie = (el, fixed) => {
        const r = el.getBoundingClientRect(), node = S.byLabel[(el.dataset.tether || el.dataset.lit || "").split("|")[0]];
        if (!node || !r.width) return null;
        const y = clamp(r.top + r.height * (fixed ? 0.72 : 0.5), r.top + 14, r.bottom - 14) - box.top;
        // a thread fades out as its card leaves under the bar, and is gone before its start is hidden
        const k = fixed ? clamp((r.bottom - box.top - S.barBottom - 40) / 160, 0, 1) : 1;
        return y < S.barBottom + 8 || y > S.h || k <= 0 ? null : { node, x: r.right - box.left, y, fixed, k, spark: null };
      };
      S.tethers = S.narrow ? [] : [...document.querySelectorAll("[data-tether]")].map((el) => tie(el, true)).filter(Boolean);
      if (!S.narrow) for (const el of new Set([rowTether, closing && closing.row])) { if (!el) continue; const t = tie(el, false); if (t) { if (closing && closing.row === el) t.spark = clamp((S.t - closing.start) / 0.45, 0, 1); S.tethers.push(t); } }
      // the note the spark lands on flares fully; the loop's other notes only answer it
      if (closing && S.t - closing.start >= 0.45 && !closing.landed) { closing.landed = true; closing.nodes.forEach((n, i) => { n.flare = i ? 0.35 : 1; n.hold = S.t + 0.6; }); }
      if (closing && S.t - closing.start >= 1.3) { closing.row.classList.add("settled"); closing = null; }
    }
    // detail fades out where the page's text is, instead of being painted over
    function fade() {
      const b = S.box, g = S.glow, c = S.ctx;
      for (const [ctx, low, lead, tail] of [[g, 0.4, 0, 200], [c, 0, 0, 150]]) {
        let grad;
        if (S.narrow) { grad = ctx.createLinearGradient(0, b.bottom - (ctx === c ? 24 : 0), 0, b.bottom + (ctx === c ? 40 : 180)); grad.addColorStop(0, "rgb(0 0 0 / 1)"); grad.addColorStop(1, `rgb(0 0 0 / ${ctx === c ? 0 : 0.25})`); }
        else if (home.dataset.fade === "left") { grad = ctx.createLinearGradient(b.left - lead, 0, b.left + tail, 0); grad.addColorStop(0, `rgb(0 0 0 / ${low})`); grad.addColorStop(1, "rgb(0 0 0 / 1)"); }
        else continue;
        ctx.globalCompositeOperation = "destination-in"; ctx.fillStyle = grad; ctx.fillRect(0, 0, S.w, S.h); ctx.globalCompositeOperation = "source-over";
      }
    }

    const start = performance.now();
    let seek = frozen;
    function frame(now) {
      const sec = seek != null ? seek : (now - start) / 1000;
      S.t = still ? 0 : sec; S.wake = still ? 1e3 : sec;
      place();
      for (const c of [S.glow, S.ctx, S.over]) c.clearRect(0, 0, S.w, S.h);
      opt.draw(S);
      fade();
      if (!still && seek == null) requestAnimationFrame(tick);
    }
    const tick = (now) => (document.hidden || scrollY > innerHeight ? requestAnimationFrame(tick) : frame(now));
    const redraw = () => { if (still || seek != null) frame(performance.now()); };

    addEventListener("resize", () => { size(); redraw(); });
    addEventListener("wake-theme", redraw);
    addEventListener("scroll", redraw, { passive: true });
    // for stills, clips and the contrast check: jump to a moment after load and hold it
    window.wakeSeek = (sec) => { seek = sec; frame(0); };
    addEventListener("pointermove", (e) => {
      const r = sharp.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, quiet = e.target.closest("[data-quiet]");
      let best = null, bd = 20;
      for (const n of nodes) { const d = Math.hypot(n.px - x, n.py - y); if (d < bd) { bd = d; best = n; } }
      S.hover = quiet ? null : best; S.pointer = quiet || e.pointerType === "touch" ? null : [x, y];
      redraw();
    });
    document.documentElement.addEventListener("pointerleave", () => { S.pointer = null; S.hover = null; redraw(); });

    for (const el of document.querySelectorAll("[data-lit]")) {
      const on = () => { S.lights = new Set(el.dataset.lit.split("|")); if (el.matches(".rows li")) rowTether = el; redraw(); };
      const off = () => { S.lights = null; if (rowTether === el) rowTether = null; redraw(); };
      el.addEventListener("pointerenter", on); el.addEventListener("pointerleave", off);
      el.addEventListener("focusin", on); el.addEventListener("focusout", off);
    }
    // closing a loop: a spark runs down the thread to its note, the note flares, the row settles, the count drops
    const count = document.querySelector("[data-count]"), cheer = document.querySelector(".cheer");
    let closedToday = 0;
    for (const check of document.querySelectorAll(".rows .check")) check.addEventListener("click", () => {
      const row = check.closest("li"), closed = row.classList.toggle("closed");
      check.setAttribute("aria-pressed", closed);
      row.classList.remove("settled");
      const left = document.querySelectorAll(".rows li:not(.closed)").length;
      if (count) { count.textContent = left; count.classList.remove("tick"); void count.offsetWidth; count.classList.add("tick"); }
      if (cheer) cheer.textContent = !closed ? "Back on the list." : !left ? "That was the last one." : closedToday++ ? `Closed. ${left} to go.` : `First one down. ${left} to go.`;
      const lit = row.dataset.lit.split("|").map((l) => S.byLabel[l]).filter(Boolean);
      if (closed && !still && !S.narrow) closing = { row, nodes: lit, start: S.t, landed: false };
      else if (closed) { lit.forEach((n, i) => { n.flare = i ? 0.35 : 1; n.hold = S.t + 0.6; }); row.classList.add("settled"); }
      redraw();
    });
    size();
    document.fonts.ready.then(() => requestAnimationFrame(frame));
    return S;
  };
})();
