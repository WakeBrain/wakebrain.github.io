(() => {
  let ledger = null, loading = null, primed = false;
  const API_IN = 0.10, API_OUT = 0.50;
  // where a to-do was born: the project of the session or note that opened it, for rows whose text carries no [[project]]
  const homes = new Map(), bare = t => String(t).replace(/\[\[[^\]]*\]\]/g, "").replace(/\s*\{[^}]*\}\s*$/, "").replace(/\s+/g, " ").trim().toLowerCase();
  window.loopHome = key => homes.get(bare(key)) || "";
  const load = () => loading ||= api("/api/ledger").then(d => {
    ledger = d; homes.clear();
    d.sessions.forEach(s => s.loops.forEach(t => { if (s.project) homes.set(bare(t), s.project); }));
    d.notes.forEach(x => { if (x.kind === "open" && x.project) homes.set(bare(x.text), x.project); });
    counts();
    if (!primed && view === "today" && !busy && !document.querySelector(".closer")) renderToday();   // once: Today's rows can now light their home project
    primed = true;
    return d;
  }).finally(() => { loading = null; });
  const ago = (date, n) => daysBetween(date, localDay()) < n;
  const decisions = () => [
    ...ledger.sessions.flatMap(s => s.decisions.map(text => ({ text, date: s.date, time: s.time, project: s.project, from: s, kind: "session", lane: s.lane, src: s.src }))),
    ...ledger.meetings.flatMap(m => m.decisions.map(text => ({ text, date: m.date, time: m.time, project: m.project, from: m, kind: "meeting", lane: m.lane, src: m.src }))),
    ...ledger.notes.filter(n => n.kind !== "open").map(n => ({ text: n.text, date: n.date, time: n.time, project: n.project, from: n, kind: n.kind, lane: n.lane, src: n.src })),
  ].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const source = d => d.kind === "session" ? `${d.from.agent} session, ${d.from.title}` : d.kind === "meeting" ? `meeting, ${d.from.title}` : `written by you`;

  function meter(days) {
    const s = ledger.sessions.filter(x => x.tokens && ago(x.date, days));
    const tin = s.reduce((n, x) => n + x.tokens[0], 0), tout = s.reduce((n, x) => n + x.tokens[1], 0);
    const box = el("div", "lg-meter");
    for (const [v, l] of [[String(s.length), `sessions digested in ${days} days`], [(tin + tout).toLocaleString(), "Haiku tokens, in and out"],
      [`$${((tin * API_IN + tout * API_OUT) / 1e6).toFixed(4)}`, "at API rates; nothing extra on a Claude or Codex plan"]]) {
      const d = el("div"); d.append(el("b", null, v), el("span", null, l)); box.append(d);
    }
    return box;
  }

  function receipt(item, kind, back) {
    const a = el("article", "reader lg-receipt");
    const top = el("div", "reader-top");
    const b = el("button", "back", "Back to " + back.label); b.type = "button"; b.onclick = () => go(back.view);
    top.append(b);
    if (item.file && typeof openNote === "function") { const o = el("button", "btn", "Open the note"); o.type = "button"; o.onclick = () => openNote("f:" + item.file); top.append(o); }
    const h = el("h1", "as-is", item.title || "Written by you");
    const dl = el("dl");
    const row = (k, v) => { if (v) dl.append(el("dt", null, k), el("dd", null, v)); };
    row("From", kind === "session" ? `A ${item.agent} session` : kind === "meeting" ? "A meeting" : kind === "inbox" ? "Your work inbox" : "A note you wrote");
    row("When", `${fmtDay(item.date)}${item.time ? ", " + item.time : ""}`);
    row("Project", item.project);
    if (item.tokens) row("Digest", `${item.tokens[0].toLocaleString()} tokens in, ${item.tokens[1].toLocaleString()} out`);
    a.append(top, h, dl);
    if (item.summary) a.append(md(item.summary));
    for (const [t, xs] of [["Decided", item.decisions], ["Left open", item.loops]]) {
      if (!xs?.length) continue;
      const ul = el("ul", "lg-list");
      xs.forEach(x => { const li = el("li"); li.append(inline(x)); ul.append(li); });
      a.append(el("h2", null, t), ul);
    }
    if (item.session) a.append(el("p", "readout", `session ${item.session}, ${item.file}`));
    return a;
  }

  window.openReceipt = async loop => {
    try {
      const r = await api("/api/receipt?id=" + encodeURIComponent(loop.id));
      const a = receipt(r, r.kind, { label: "today", view: "today" });
      if (PHONE) a.querySelector("h1").before(el("p", "reader-q", plain(loop.text)));
      screen(a);
    } catch (err) { toast(err.message); }
  };

  async function view() {
    if (!ledger || PHONE) { render(working("Reading your decisions…")); try { await load(); } catch (err) { return render(working("Couldn't read the decision log.", err.message, true)); } }   // a phone may have gained a brain since
    const all = decisions();
    const params = new URLSearchParams(location.search);
    const box = el("div");
    const head = listHead("Decisions", "Every decision your agents, meetings and notes recorded, newest first.");
    const tools = el("div", "lg-tools");
    const q = el("input", "filter"); q.type = "search"; q.placeholder = "Search decisions"; q.setAttribute("aria-label", "Search decisions"); q.value = params.get("q") || "";
    const pick = el("select"); pick.setAttribute("aria-label", "Project");
    pick.append(new Option("All projects", ""), ...[...new Set(all.map(d => d.project).filter(Boolean))].sort().map(p => new Option(p, p)));
    pick.value = params.get("project") || "";
    tools.append(q, pick); head.append(tools, ...(PHONE ? [] : [meter(7)]));
    const fill = () => {
      const f = q.value.trim().toLowerCase(), p = pick.value;
      const u = new URLSearchParams(); if (f) u.set("q", f); if (p) u.set("project", p);
      history.replaceState(null, "", (u.size ? "?" + u : location.pathname) + "#decisions");
      const shown = all.filter(d => (!p || d.project === p) && (!f || d.text.toLowerCase().includes(f)));
      if (!shown.length) return box.replaceChildren(el("p", "nothing", all.length ? "No decision matches. Clear the search or pick all projects." : "No decisions yet. They appear here after your next agent session or meeting."));
      const nodes = []; let day = "", ul = null;
      shown.forEach(d => {
        if (d.date !== day) { day = d.date; nodes.push(el("h2", "lg-day", fmtDay(d.date))); ul = el("ul", "lg-list"); nodes.push(ul); }
        const li = el("li"), t = el("div", "lt"); t.append(inline(d.text));
        const m = el("div", "lm");
        if (d.project) m.append(el("span", "tag", d.project));
        if (d.lane) m.append(el("span", "tag lane", d.lane));
        if (d.src) li.dataset.src = d.src;
        const r = el("button", "rc", source(d)); r.type = "button";
        r.onclick = () => screen(receipt(d.from, d.kind, { label: "decisions", view: "decisions" }));
        m.append(r); li.append(t, m); ul.append(li);
        if (PHONE) li.onclick = e => { if (!e.target.closest("button, a")) r.click(); };
      });
      box.replaceChildren(...nodes);
    };
    q.oninput = pick.onchange = fill;
    fill();
    render(head, box, ...(PHONE ? [meter(7)] : []));
  }

  EXT.today.push(() => {
    const host = el("section", "now lg-card"); host.hidden = true;
    load().then(() => {
      if (!host.isConnected || !ledger.sessions.some(s => s.tokens && ago(s.date, 7))) return;
      host.append(el("h2", null, "What your agents wrote down"), meter(7));
      const acts = el("div", "acts"); const b = el("button", "btn", "See decisions"); b.type = "button"; b.onclick = () => go("decisions"); acts.append(b);
      host.append(acts); host.hidden = false;
    }).catch(() => {});
    return host;
  });

  registerView("decisions", { render: view, count: () => ledger ? decisions().length : "", nav: "decisions" });
  load().catch(() => {});
})();
