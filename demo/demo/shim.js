// Wake demo: answers the app from a snapshot, refuses every write, and keeps the clock on the day the snapshot was taken.
(() => {
  const D = window.WAKE_DEMO, SITE = "https://wakebrain.github.io/", LINE = "Demo with invented data. Nothing you do here is saved.";
  const THEMES = ["system", "dusk", "light", "graphite", "paper", "tide"], KEY = "wake-demo-theme", root = document.documentElement;

  // the vault is dated around the build day, so "today" stays that day in every time zone, months later too
  const Real = Date, t0 = Real.now(), [y, m, d] = D.day.split("-").map(Number), pin = new Real(y, m - 1, d, D.hour, D.minute).getTime();
  const now = () => pin + (Real.now() - t0);
  window.Date = new Proxy(Real, {
    construct: (T, a, N) => Reflect.construct(T, a.length ? a : [now()], N),
    apply: () => new Real(now()).toString(),
    get: (T, k) => k === "now" ? now : Reflect.get(T, k),
  });

  try { const t = sessionStorage.getItem(KEY); if (THEMES.includes(t)) root.dataset.pref = t; } catch {}

  let bar, msg, timer;
  const notice = () => {
    D.refused = (D.refused || 0) + 1;
    if (!bar) return;
    bar.classList.add("said"); msg.textContent = D.say;
    clearTimeout(timer); timer = setTimeout(() => { bar.classList.remove("said"); msg.textContent = LINE; }, 6000);
  };
  const reply = (status, body) => Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  const refuse = () => { notice(); return reply(403, { error: D.say }); };
  const keyOf = path => {
    const u = new URL(path, location.origin), q = [...u.searchParams].map(([k, v]) => k + "=" + v).join("&");
    return decodeURIComponent(u.pathname) + (q ? "?" + q : "");
  };

  window.apiFetch = async (path, opt = {}) => {
    const k = keyOf(path), method = (opt.method || "GET").toUpperCase();
    if (k === "/api/theme") {
      if (method === "GET") return reply(200, { theme: root.dataset.pref || "dusk", themes: THEMES });
      let t; try { t = JSON.parse(opt.body).theme; } catch {}
      if (!THEMES.includes(t)) return reply(400, { error: "Wake doesn't have that theme. Reload and pick again." });
      try { sessionStorage.setItem(KEY, t); } catch {}
      return reply(200, { theme: t });
    }
    // a board keeps its edits until you leave it; refusing the autosave would trap you in the editor
    if (method === "POST" && k === "/api/boards/save") { notice(); return reply(200, { saved: true }); }
    if (method !== "GET" || (k.startsWith("/api/worklog?") && /[?&]skip=/.test(k))) return refuse();
    const a = D.answers[k];
    return a ? reply(a[0], a[1]) : reply(404, { error: "This part of Wake isn't in the demo." });
  };
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => typeof input === "string" && input.startsWith("/api/") ? window.apiFetch(input, init) : realFetch(input, init);

  // Ask and web research: stop the question before the app swaps the screen for a spinner
  addEventListener("submit", e => {
    if (e.target.id !== "form") return;
    e.preventDefault(); e.stopImmediatePropagation();
    document.getElementById("pal")?.close();
    notice();
  }, true);

  const CSS = `
.demo-bar { position: fixed; z-index: 450; left: 0; right: 0; bottom: 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 4px 18px;
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom, 0px)); font: 500 var(--text-sm, 13px)/1.4 var(--font-body, system-ui, sans-serif);
  color: var(--color-ink-2); background: var(--color-surface); box-shadow: inset 0 1px 0 var(--color-rule); text-align: center; }
.demo-bar a { color: var(--color-accent); font-weight: 600; text-underline-offset: 3px; white-space: nowrap; }
.demo-bar a + a { color: var(--color-ink-2); font-weight: 500; }
.demo-bar.said { background: var(--color-accent); color: var(--color-accent-ink); }
.demo-bar.said a { color: var(--color-accent-ink); }
body { padding-bottom: var(--demo-h, 40px); }
.toast { bottom: calc(24px + var(--demo-h, 40px)) !important; }
body.map .mapstats { bottom: calc(20px + var(--demo-h, 40px)); }
body.map .panel:not([hidden]) { max-height: calc(100dvh - var(--bar) - 120px - var(--demo-h, 40px)); }
body[data-view="boards"] .bd-editor:not([hidden]) { bottom: calc(var(--space-sm) + var(--demo-h, 40px)); }
`;
  addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style"); style.textContent = CSS; document.head.append(style);
    bar = document.createElement("div"); bar.className = "demo-bar"; bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "About this demo");
    msg = document.createElement("span"); msg.setAttribute("role", "status"); msg.textContent = LINE;
    const link = (text, href) => { const a = document.createElement("a"); a.textContent = text; a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; return a; };
    bar.append(msg, link("Get Wake, $59", D.buy), link("About Wake", SITE));
    document.body.append(bar);
    const fit = () => root.style.setProperty("--demo-h", bar.offsetHeight + "px");
    new ResizeObserver(fit).observe(bar); fit();
  });
})();
