// Ember: the vault as light. Notes touched today cast warm pools; the links between them are bright filaments.
// Everything else is a cool, quiet lattice in the base colour. The light comes on outward from today's work.
window.WAKE_DRAW = (function () {
  const RING = new Set(["memories", "meetings", "inbox"]);
  let gold, coral, ember, core, cool, ink, ink2, deep, display;
  const pool = (c, S, x, y, R, stops) => {
    const g = c.createRadialGradient(x, y, 0, x, y, R);
    for (const [at, color, a] of stops) g.addColorStop(at, S.alpha(color, a));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, R, 0, 7); c.fill();
  };
  const bezier = (t, u) => { const v = 1 - u, mx = t.x + (t.node.px - t.x) * 0.55, ex = t.node.px - 14; return [v * v * v * t.x + 3 * v * v * u * mx + 3 * v * u * u * mx + u * u * u * ex, v * v * v * t.y + 3 * v * v * u * t.y + 3 * v * u * u * t.node.py + u * u * u * t.node.py]; };
  return function (S) {
    const { ctx, glow, over } = S, page = document.body.classList, z = S.zoom;
    if (!gold) { gold = S.token("--color-accent"); coral = S.token("--color-coral"); ember = S.token("--color-ember"); core = S.token("--color-core"); cool = S.token("--color-cool"); ink = S.token("--color-ink"); ink2 = S.token("--color-ink-2"); deep = S.token("--color-paper-lo"); display = S.token("--font-display"); }
    const on = (n) => S.ease((S.wake - 0.25 - n.hops * 0.3) / 1.1), breath = (n) => (S.still ? 1 : 1 + 0.05 * Math.sin(S.t * 0.7 + n.seed * 6.28));
    const warmth = (n) => Math.max(n.heat * on(n), n.lit * 0.9, n.flare);

    // 1. the broad light, on the soft canvas
    glow.globalCompositeOperation = "screen";
    let wx = 0, wy = 0, ws = 0;
    for (const n of S.nodes) if (n.heat >= 0.55) { const w = n.heat * on(n); wx += n.px * w; wy += n.py * w; ws += w; }
    if (ws > 0.01) { const day = Math.min(1, ws / 4); pool(glow, S, wx / ws, wy / ws, 500 * z, [[0, ember, 0.24 * day], [0.5, ember, 0.11 * day], [1, ember, 0]]); }
    for (const n of S.nodes) {
      const w = warmth(n);
      if (w < 0.25) continue;
      const R = (36 + w * 130 + Math.min(n.deg, 14) * 12) * z * breath(n), hot = w >= 0.8;
      pool(glow, S, n.px, n.py, R, [[0, hot ? core : gold, 0.8 * w], [0.06, gold, 0.66 * w], [0.16, coral, 0.4 * w], [0.5, ember, 0.19 * w], [1, ember, 0]]);
      if (n.flare > 0.03) pool(glow, S, n.px, n.py, 230 * z, [[0, core, 0.7 * n.flare], [0.15, gold, 0.5 * n.flare], [0.5, coral, 0.2 * n.flare], [1, coral, 0]]);
    }
    if (S.pointer) pool(glow, S, S.pointer[0], S.pointer[1], 190, [[0, cool, 0.13], [1, cool, 0]]);

    // 2. links: a cool lattice everywhere, bright filaments where it is warm
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const curve = (c, l, g = 1) => {
      const from = l.a.hops <= l.b.hops ? l.a : l.b, to = from === l.a ? l.b : l.a, dx = to.px - from.px, dy = to.py - from.py, len = Math.hypot(dx, dy) || 1, sag = (((l.a.seed + l.b.seed) % 1) - 0.5) * 0.34 * len;
      const cx = (from.px + to.px) / 2 - (dy / len) * sag, cy = (from.py + to.py) / 2 + (dx / len) * sag, u = 1 - g;
      c.beginPath(); c.moveTo(from.px, from.py);
      c.quadraticCurveTo(from.px + (cx - from.px) * g, from.py + (cy - from.py) * g, u * u * from.px + 2 * u * g * cx + g * g * to.px, u * u * from.py + 2 * u * g * cy + g * g * to.py);
      return [from, to, cx, cy];
    };
    ctx.globalCompositeOperation = "source-over";
    for (const l of S.links) { curve(ctx, l); ctx.strokeStyle = S.alpha(cool, 0.22); ctx.lineWidth = 1; ctx.stroke(); }
    ctx.globalCompositeOperation = "lighter";
    for (const l of S.links) {
      const w = Math.min(1, Math.min(warmth(l.a), warmth(l.b)) * 0.55 + Math.max(warmth(l.a), warmth(l.b)) * 0.55);
      if (w < 0.18) continue;
      const g = Math.max(S.ease((S.wake - 0.25 - Math.min(l.a.hops, l.b.hops) * 0.3) / 0.9), l.a.lit, l.b.lit, l.a.flare, l.b.flare);
      for (const [width, color, a] of [[10 * z, ember, 0.12], [4, coral, 0.24], [1.4, core, 0.85]]) { curve(ctx, l, g); ctx.strokeStyle = S.alpha(color, a * w); ctx.lineWidth = width; ctx.stroke(); }
      if (S.still || g < 1 || w < 0.5) continue;
      // a spark runs toward the hotter end
      const [from, to, cx, cy] = curve(ctx, l), rev = to.heat < from.heat, mix = (l.a.seed * 7 + l.b.seed * 3) % 1, u0 = (S.t / (3 + mix * 3) + mix) % 1, u = rev ? 1 - u0 : u0, v = 1 - u;
      const x = v * v * from.px + 2 * v * u * cx + u * u * to.px, y = v * v * from.py + 2 * v * u * cy + u * u * to.py, f = Math.sin(u0 * Math.PI);
      pool(ctx, S, x, y, 9, [[0, core, 0.95 * f], [0.4, gold, 0.4 * f], [1, gold, 0]]);
    }

    // 3. notes
    const radius = (n) => (n.kind === "projects" ? 5.5 + Math.min(n.deg, 18) * 0.3 : 2.5 + Math.sqrt(n.deg) * 1.05);
    for (const n of S.byHeat) {
      const w = warmth(n), lit = w > 0.3, r = radius(n);
      ctx.globalCompositeOperation = "lighter";
      if (lit) pool(ctx, S, n.px, n.py, r * 4.6 * breath(n), [[0, gold, 0.85 * w], [0.35, coral, 0.3 * w], [1, coral, 0]]);
      if (n.flare > 0.03) { ctx.strokeStyle = S.alpha(core, n.flare); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(n.px, n.py, r + (1 - n.flare) * 46, 0, 7); ctx.stroke(); }
      ctx.globalCompositeOperation = "source-over";
      ctx.beginPath(); ctx.arc(n.px, n.py, r, 0, 7);
      if (RING.has(n.kind)) { ctx.strokeStyle = S.alpha(lit ? core : cool, lit ? 1 : 0.85); ctx.lineWidth = 1.8; ctx.stroke(); }
      else if (lit) { const body = ctx.createRadialGradient(n.px, n.py, 0, n.px, n.py, r); body.addColorStop(0, core); body.addColorStop(0.55, core); body.addColorStop(1, gold); ctx.fillStyle = body; ctx.fill(); }
      else { ctx.fillStyle = S.alpha(cool, 0.85); ctx.fill(); }
      if (S.selected === n) { ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(n.px, n.py, r + 8, 0, 7); ctx.stroke(); }
    }

    // labels: project names claim their space first, then threads reserve their path, then the small labels fit around both
    over.lineJoin = "round";
    const label = (n) => {
      const big = n.kind === "projects", r = radius(n), text = n.label.length > 34 ? n.label.slice(0, 32) + "…" : n.label, note = big && n.heat >= 0.8 && n.today >= 2 && !page.contains("today") ? `${n.today} lit today` : "";
      over.font = big ? `400 21px ${display}` : "500 13px Geist, sans-serif"; over.textAlign = "center"; over.textBaseline = "top";
      const tw = Math.max(over.measureText(text).width, note ? 78 : 0), h = (big ? 24 : 17) + (note ? 16 : 0), fit = (x) => Math.max(tw / 2 + 12, Math.min(S.w - tw / 2 - 12, x));
      // below the note if there is room, else above it, else beside it
      const spots = [[fit(n.px), n.py + r + 7], [fit(n.px), n.py - r - 7 - h], [fit(n.px + r + 10 + tw / 2), n.py - h / 2], [fit(n.px - r - 10 - tw / 2), n.py - h / 2]];
      const spot = spots.find(([x, y]) => S.claim(x - tw / 2 - 4, y - 4, tw + 8, h + 8));
      if (!spot) return;
      const [x, y] = spot;
      over.strokeStyle = S.alpha(deep, 0.7); over.lineWidth = 3; over.strokeText(text, x, y);
      over.fillStyle = big ? ink : ink2; over.fillText(text, x, y);
      if (note) { over.font = "500 12px Geist, sans-serif"; over.lineWidth = 2.5; over.strokeText(note, x, y + 25); over.fillStyle = gold; over.fillText(note, x, y + 25); }
    };
    for (const n of S.byHeat) if (n.kind === "projects") label(n);
    for (const t of S.tethers) if (t.node.px > t.x + 50) for (let i = 1; i < 14; i++) { const [x, y] = bezier(t, i / 14); S.reserve(x - 9, y - 9, 18, 18); }
    for (const n of S.byHeat) {
      if (n.kind === "projects") continue;
      const tied = S.tethers.some((t) => t.node === n && t.fixed);
      if ((n.lit > 0.3 && !tied) || (page.contains("mapview") && n.heat >= 0.8 && n.label.length < 22)) label(n);
    }

    // 4. the thread from a loop to the note it is about
    over.lineCap = "round";
    for (const t of S.tethers) {
      const n = t.node, g = (t.fixed ? S.ease((S.wake - 1.5) / 0.9) : Math.max(n.lit, t.spark != null ? 1 : 0)) * t.k;
      if (g <= 0.02 || n.px < t.x + 50) continue;
      const mx = t.x + (n.px - t.x) * 0.55, path = () => { over.beginPath(); over.moveTo(t.x, t.y); over.bezierCurveTo(mx, t.y, mx, n.py, n.px - 14, n.py); };
      over.globalCompositeOperation = "lighter";
      for (const [width, color, a] of [[8, ember, 0.14], [3, coral, 0.34], [1.3, core, 0.9]]) { path(); over.strokeStyle = S.alpha(color, a * g * (t.fixed ? 1 : 0.75)); over.lineWidth = width; over.stroke(); }
      const u = t.spark != null ? t.spark : t.fixed && !S.still ? (S.t * 0.32) % 1 : null;
      if (u != null && u < 1) { const [bx, by] = bezier(t, u), big = t.spark != null ? 18 : 11; pool(over, S, bx, by, big, [[0, core, 0.95 * g], [0.4, gold, 0.45 * g], [1, gold, 0]]); }
      over.globalCompositeOperation = "source-over";
      if (!t.fixed) continue;
      over.strokeStyle = S.alpha(gold, g); over.lineWidth = 1.5; over.beginPath(); over.arc(n.px, n.py, 14, 0, 7); over.stroke();
      over.font = "500 13px Geist, sans-serif"; over.textAlign = "center"; over.textBaseline = "top";
      over.strokeStyle = S.alpha(deep, 0.7 * g); over.lineWidth = 3; over.strokeText(n.label, n.px, n.py + 22);
      over.fillStyle = S.alpha(gold, g); over.fillText(n.label, n.px, n.py + 22);
    }
  };
})();
