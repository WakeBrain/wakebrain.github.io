// The map as light. Three canvases behind every view: a half-resolution one for the broad light, a sharp one for
// filaments and notes, and one on top for labels and the thread that ties a loop to its note.
// It draws wherever .mapbox is, so CSS decides its place per view and screen size. The app feeds it the graph.
(function () {
  const query = new URLSearchParams(location.search);
  const frozen = query.has("freeze") ? +query.get("freeze") : null;
  const still = query.has("still") || (matchMedia("(prefers-reduced-motion: reduce)").matches && frozen == null);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  window.WakeMap = function (opt) {
    const layer = (name) => document.querySelector("canvas." + name);
    const glow = layer("glow"), sharp = layer("sharp"), top = layer("thread"), home = document.querySelector(".mapbox"), bar = document.querySelector(".top");
    const css = getComputedStyle(document.documentElement);
    const boxes = [];
    const S = {
      glow: glow.getContext("2d"), ctx: sharp.getContext("2d"), over: top.getContext("2d"),
      all: [], nodes: [], links: [], allLinks: [], byHeat: [], t: 0, wake: 0, w: 0, h: 0, zoom: 1, still, narrow: false,
      hover: null, lights: null, level: 1, selected: null, tethers: [], pointer: null, view: { x: 0, y: 0, k: 1 }, visible: () => true,
      token: (name) => css.getPropertyValue(name).trim(),
      alpha: (color, a) => color.replace(/\)\s*$/, ` / ${clamp(a, 0, 1).toFixed(3)})`),
      ease: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3)),
      // labels claim their box, hottest first, so two never print on top of each other
      claim: (x, y, w, h) => { if (boxes.some((b) => x < b[0] + b[2] && b[0] < x + w && y < b[1] + b[3] && b[1] < y + h)) return false; boxes.push([x, y, w, h]); return true; },
      reserve: (x, y, w, h) => boxes.push([x, y, w, h]),
    };
    let start = performance.now(), seek = frozen, rowTether = null, closing = null, running = false;

    S.setGraph = (g) => {
      const nodes = g.nodes, links = g.links.map((l) => ({ a: l.source, b: l.target, w: l.w }));
      nodes.forEach((n, i) => Object.assign(n, { i, seed: ((i * 2654435761) >>> 0) / 4294967296, px: 0, py: 0, lit: 0, flare: 0, hold: 0, heat: n.heat ?? 0.06 }));
      // spread the layout over -1..1, ignoring the few strays a force layout flings far out
      for (const [k, nk] of [["x", "nx"], ["y", "ny"]]) {
        const v = nodes.map((n) => n[k]).sort((a, b) => a - b), lo = v[Math.floor(v.length * 0.03)] ?? 0, hi = v[Math.ceil(v.length * 0.97) - 1] ?? 1, mid = (lo + hi) / 2, half = (hi - lo) / 2 || 1;
        nodes.forEach((n) => (n[nk] = clamp((n[k] - mid) / half, -1.15, 1.15)));
      }
      const near = new Map(nodes.map((n) => [n, []]));
      links.forEach((l) => { near.get(l.a).push(l.b); near.get(l.b).push(l.a); });
      nodes.forEach((n) => (n.today = near.get(n).filter((m) => m.heat >= 0.8).length));
      // hops from the nearest hot note: the light comes on outward from today's work
      const queue = nodes.filter((n) => n.heat >= 0.8);
      nodes.forEach((n) => (n.hops = n.heat >= 0.8 ? 0 : Infinity));
      for (const a of queue) for (const b of near.get(a)) if (b.hops > a.hops + 1) { b.hops = a.hops + 1; queue.push(b); }
      const far = Math.max(0, ...nodes.map((n) => (isFinite(n.hops) ? n.hops : 0)));
      nodes.forEach((n) => { if (!isFinite(n.hops)) n.hops = far + 1 + n.seed; });
      S.all = nodes; S.allLinks = links; S.filter();
      start = performance.now();
      if (!running) { running = true; size(); document.fonts.ready.then(() => requestAnimationFrame(frame)); } else S.redraw();
    };
    S.filter = () => {
      S.nodes = S.all.filter(S.visible);
      S.links = S.allLinks.filter((l) => S.visible(l.a) && S.visible(l.b));
      S.byHeat = [...S.nodes].sort((a, b) => (b.kind === "projects") - (a.kind === "projects") || b.heat - a.heat);
      S.redraw();
    };

    function size() {
      const dpr = Math.min(devicePixelRatio || 1, 2), r = sharp.getBoundingClientRect();
      S.w = r.width; S.h = r.height;
      for (const [c, k] of [[glow, 0.5], [sharp, dpr], [top, dpr]]) { c.width = Math.round(r.width * k); c.height = Math.round(r.height * k); c.getContext("2d").setTransform(k, 0, 0, k, 0, 0); }
    }
    function place() {
      const box = sharp.getBoundingClientRect(), m = home.getBoundingClientRect(), V = S.view;
      S.narrow = getComputedStyle(home).position !== "fixed";
      S.box = { left: m.left - box.left, top: m.top - box.top, right: m.right - box.left, bottom: m.bottom - box.top, w: m.width, h: m.height };
      S.barBottom = bar ? bar.getBoundingClientRect().bottom - box.top : 0;
      const cx = S.box.left + m.width / 2, cy = S.box.top + m.height / 2, sx = m.width * 0.44, sy = m.height * 0.42;
      S.zoom = clamp(Math.min(sx / 440, sy / 290), 0.45, 1.15) * clamp(V.k, 0.5, 3); boxes.length = 0;
      // text on the page claims its space first, so no map label is ever drawn under it
      for (const el of document.querySelectorAll("[data-quiet]")) { const q = el.getBoundingClientRect(); if (q.width && q.bottom > 0 && q.top < S.h) boxes.push([q.left - box.left - 10, q.top - box.top - 10, q.width + 20, q.height + 20]); }
      for (const n of S.nodes) {
        const a = (5 + n.seed * 5) * Math.min(1, S.zoom + 0.2), p = n.seed * 40;
        n.px = V.x + V.k * (cx + n.nx * sx) + a * Math.sin(S.t / (9 + n.seed * 8) + p);
        n.py = V.y + V.k * (cy + n.ny * sy) + a * Math.cos(S.t / (11 + n.seed * 7) + p * 1.7);
        const want = S.hover === n || S.selected === n ? 1 : S.lights && S.lights.has(n) ? S.level : 0;
        n.lit += (want - n.lit) * (still ? 1 : 0.16);
        if (S.t > n.hold) n.flare *= still ? 0 : 0.955;
      }
      const tie = (el, fixed) => {
        const r = el.getBoundingClientRect(), node = el.wakeNode;
        if (!node || !r.width || !S.visible(node)) return null;
        const y = clamp(r.top + r.height * (fixed ? 0.72 : 0.5), r.top + 14, r.bottom - 14) - box.top;
        // a thread fades out as its card leaves under the bar, and is gone before its start is hidden
        const k = fixed ? clamp((r.bottom - box.top - S.barBottom - 40) / 160, 0, 1) : 1;
        return y < S.barBottom + 8 || y > S.h || k <= 0 ? null : { node, x: r.right - box.left, y, fixed, k, spark: null };
      };
      S.tethers = S.narrow ? [] : [...document.querySelectorAll("[data-tether]")].map((el) => tie(el, true)).filter(Boolean);
      if (!S.narrow) for (const el of new Set([rowTether, closing && closing.row])) { if (!el) continue; const t = tie(el, false); if (t) { if (closing && closing.row === el) t.spark = clamp((S.t - closing.start) / 0.45, 0, 1); S.tethers.push(t); } }
      // the note the spark lands on flares fully; the loop's other notes only answer it
      if (closing && S.t - closing.start >= 0.45 && !closing.landed) { closing.landed = true; flare(closing.nodes); }
      if (closing && S.t - closing.start >= 1.3) closing = null;
    }
    const flare = (nodes) => { nodes.forEach((n, i) => { n.flare = i ? 0.35 : 1; n.hold = S.t + 0.6; }); if (still) setTimeout(() => { nodes.forEach((n) => (n.flare = 0)); S.redraw(); }, 1300); };
    // detail fades out where the page's text is, instead of being painted over
    function fade() {
      const b = S.box, g = S.glow, c = S.ctx;
      for (const [ctx, low, tail] of [[g, 0.4, 200], [c, 0, 150]]) {
        let grad;
        if (S.narrow) { grad = ctx.createLinearGradient(0, b.bottom - (ctx === c ? 24 : 0), 0, b.bottom + (ctx === c ? 40 : 180)); grad.addColorStop(0, "rgb(0 0 0 / 1)"); grad.addColorStop(1, `rgb(0 0 0 / ${ctx === c ? 0 : 0.25})`); }
        else if (home.dataset.fade === "left") { grad = ctx.createLinearGradient(b.left, 0, b.left + tail, 0); grad.addColorStop(0, `rgb(0 0 0 / ${low})`); grad.addColorStop(1, "rgb(0 0 0 / 1)"); }
        else continue;
        ctx.globalCompositeOperation = "destination-in"; ctx.fillStyle = grad; ctx.fillRect(0, 0, S.w, S.h); ctx.globalCompositeOperation = "source-over";
      }
    }

    function frame(now) {
      const sec = seek != null ? seek : (now - start) / 1000;
      S.t = still ? 0 : sec; S.wake = still ? 1e3 : sec;
      place();
      for (const c of [S.glow, S.ctx, S.over]) c.clearRect(0, 0, S.w, S.h);
      opt.draw(S);
      fade();
      if (!still && seek == null) requestAnimationFrame(tick);
    }
    // rAF already stops in a hidden tab; this also skips the frame that fires as it hides
    let skip = false;
    const tick = (now) => { skip = !skip && !document.hasFocus(); return document.hidden || skip ? requestAnimationFrame(tick) : frame(now); };
    S.redraw = () => { if (running && (still || seek != null)) frame(performance.now()); };

    addEventListener("resize", () => { size(); S.redraw(); });
    addEventListener("scroll", S.redraw, { passive: true });
    // for stills, clips and the contrast check: jump to a moment after load and hold it
    window.wakeSeek = (sec) => { seek = sec; frame(0); };
    S.pick = (x, y, reach = 20) => {
      let best = null, bd = reach;
      for (const n of S.nodes) { const d = Math.hypot(n.px - x, n.py - y); if (d < bd) { bd = d; best = n; } }
      return best;
    };
    addEventListener("pointermove", (e) => {
      const r = sharp.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, quiet = e.target.closest?.("[data-quiet], dialog, .top");
      const hover = quiet ? null : S.pick(x, y);
      S.pointer = quiet || e.pointerType === "touch" ? null : [x, y];
      if (hover !== S.hover) { S.hover = hover; opt.onHover?.(hover); }
      S.redraw();
    });
    document.documentElement.addEventListener("pointerleave", () => { S.pointer = null; S.hover = null; S.redraw(); });

    // a row or card is hovered: light its notes, and from a list row draw a thread to the first one
    S.light = (nodes, el, level = 1) => {
      S.lights = nodes && nodes.size ? nodes : null; S.level = level;
      rowTether = S.lights && el ? el : null;
      if (el) el.wakeNode = S.lights ? [...S.lights][0] : null;
      S.redraw();
    };
    // closing a loop: a spark runs down the thread to its note and the note flares
    S.close = (el, nodes) => {
      const list = [...(nodes || [])];
      if (!list.length) return;
      if (el) el.wakeNode = list[0];
      if (!still && !S.narrow && el) closing = { row: el, nodes: list, start: S.t, landed: false };
      else flare(list);
      S.redraw();
    };
    return S;
  };
})();
