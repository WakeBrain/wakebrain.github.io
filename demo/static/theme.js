// Appearance: the theme picker in Settings. Each card is drawn with that theme's own tokens.
(() => {
  const THEMES = [["system", "Match system", "Light or dark, following macOS"], ["dusk", "Dusk", "Plum and gold"], ["light", "Light", "Bright, with a violet accent"],
    ["graphite", "Graphite", "Neutral dark grey"], ["paper", "Paper", "Warm paper, pen-blue ink"], ["tide", "Tide", "Deep sea, lighthouse light"]];
  const root = document.documentElement;
  const mock = theme => {
    const m = el("span", "th-mock"); m.dataset.theme = theme;
    m.append(el("i", "th-bar"), el("i", "th-title"), el("i", "th-card"), el("i", "th-row"), el("i", "th-row"), el("i", "th-light"));
    return m;
  };
  addEventListener("wake-theme", () => { if (typeof ember !== "undefined") ember.redraw(); });

  window.themeSection = () => {
    const host = el("section", "group th"), grid = el("div", "th-grid");
    grid.setAttribute("role", "radiogroup"); grid.setAttribute("aria-label", "Theme");
    const paint = () => grid.querySelectorAll("button").forEach(b => { const on = b.dataset.t === root.dataset.pref; b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1; });
    async function choose(t, b) {
      const was = root.dataset.pref;
      if (t === was) return;
      wakeTheme(t); paint(); b.focus();
      try { await api("/api/theme", { method: "POST", body: JSON.stringify({ theme: t }) }); }
      catch (err) { wakeTheme(was); paint(); toast(err.message); }
    }
    THEMES.forEach(([t, name, line]) => {
      const b = el("button", "th-opt"), pre = el("span", "th-pre"), txt = el("span", "th-txt");
      b.type = "button"; b.dataset.t = t; b.setAttribute("role", "radio");
      pre.append(...(t === "system" ? [mock("light"), mock("dusk")] : [mock(t)]));
      txt.append(el("b", null, name), el("span", null, line));
      b.append(pre, txt);
      b.onclick = () => choose(t, b);
      b.onkeydown = e => {
        const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!d) return;
        e.preventDefault();
        const all = [...grid.children], next = all[(all.indexOf(b) + d + all.length) % all.length];
        choose(next.dataset.t, next);
      };
      grid.append(b);
    });
    paint();
    host.append(el("h3", null, "Appearance"), el("p", "nothing", "Pick a theme. It is saved in your vault's brain.json, so it follows the vault."), grid);
    return host;
  };
})();
