// Work log: one week of your agents' work for one project, as a note you can edit and send
(() => {
  let data = null, asked = 0, showText = false, refocus = null;
  // an invited person may ask only for their own projects, never all of them
  const shared = () => { const b = PHONE && window.phoneBrain?.(); return b && !b.owner ? Object.keys(b.roles || {}).sort() : null; };
  const want = { project: "all", week: "", agents: false, open: false, skip: new Set() };
  const url = () => `/api/worklog?project=${encodeURIComponent(want.project)}` + (want.week ? `&week=${want.week}` : "")
    + (want.agents ? "&agents=1" : "") + (want.open ? "&open=1" : "") + (want.skip.size ? `&skip=${[...want.skip].join(",")}` : "");

  async function refresh() {
    const mine = ++asked;
    try { const d = await api(url()); if (mine === asked) data = d; }
    catch (err) {
      if (mine !== asked) return;
      Object.assign(want, { project: data.project, week: data.week, agents: data.agents, open: data.open });
      want.skip = new Set([...data.days.flatMap(d => d.items), ...data.finished].filter(i => i.skipped).map(i => i.id));
      toast(err.message);
    }
    if (mine === asked && view === "worklog") draw();
  }

  async function enter() {
    Object.assign(want, { project: shared()?.[0] || "all", week: "", agents: false, open: false }); want.skip.clear(); showText = false; data = null;
    render(working("Reading the week…"));
    const mine = ++asked;
    try { const d = await api(url()); if (mine !== asked || view !== "worklog") return; data = d; draw(); }
    catch (err) { if (mine === asked && view === "worklog") render(working("Couldn't build the work log.", err.message, true, enter)); }
  }

  async function copyNote() {
    try {
      if (window.ClipboardItem && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([data.md], { type: "text/plain" }),
          "text/html": new Blob([md(data.md).innerHTML], { type: "text/html" }) })]);
      } else await navigator.clipboard.writeText(data.md);
      toast("Copied. It pastes as formatted text in email and as Markdown in an editor.");
    } catch { toast("Wake couldn't reach the clipboard. Press Show the text, then select and copy it."); }
  }

  function tick(id, skipped, label) {
    const b = el("button", "tick" + (skipped ? "" : " yes")); b.type = "button";
    b.setAttribute("aria-pressed", String(!skipped));
    b.setAttribute("aria-label", (skipped ? "Put back in the note: " : "Leave out of the note: ") + label);
    b.title = skipped ? "Put back in the note" : "Leave out of the note";
    b.dataset.k = "tick:" + id;
    b.onclick = () => { skipped ? want.skip.delete(id) : want.skip.add(id); refocus = b.dataset.k; refresh(); };
    return b;
  }

  function option(key, text) {
    const l = el("label", "wl-opt"), box = el("input"); box.type = "checkbox"; box.checked = want[key];
    box.dataset.k = "opt:" + key;
    box.onchange = () => { want[key] = box.checked; refocus = box.dataset.k; refresh(); };
    l.append(box, text);
    return l;
  }

  function draw() {
    const head = listHead("Work log", "One week of your agents' work, as a note you can edit and send.");
    const tools = el("div", "lg-tools");
    const proj = el("select"); proj.setAttribute("aria-label", "Project");
    proj.append(...(shared() ? [] : [new Option("All projects", "all")]), ...data.projects.map(p => new Option(p, p)));
    proj.value = data.project;
    const week = el("select"); week.setAttribute("aria-label", "Week");
    week.append(...data.weeks.map(w => new Option(w.label, w.start)));
    week.value = data.week;
    proj.dataset.k = "proj"; week.dataset.k = "week";
    proj.onchange = week.onchange = e => { want.project = proj.value; want.week = week.value; want.skip.clear(); refocus = e.target.dataset.k; refresh(); };
    const copy = el("button", "btn primary", "Copy note"); copy.type = "button"; copy.onclick = copyNote;
    const peek = el("button", "btn", showText ? "Hide the text" : "Show the text"); peek.type = "button";
    peek.setAttribute("aria-expanded", String(showText));
    peek.dataset.k = "peek";
    peek.onclick = () => { showText = !showText; refocus = "peek"; draw(); };
    tools.append(proj, week, copy, peek);
    const opts = el("div", "wl-opts"); opts.append(option("agents", "Name the agent"), option("open", "Include what is still open"));
    const c = data.counts, sum = el("p", "wl-sum");
    [[c.sessions, "session"], [c.meetings, "meeting"], [c.decisions, "decision"], [c.closed, "to-do closed"]].filter(([n]) => n).forEach(([n, word], i) => {
      if (i) sum.append(", ");
      sum.append(el("b", null, String(n)), " " + (word === "to-do closed" ? (n === 1 ? "to\u2011do closed" : "to\u2011dos closed") : word + (n === 1 ? "" : "s")));
    });
    if (sum.childNodes.length) sum.append(" in this note");
    head.append(tools, opts, ...(sum.childNodes.length ? [sum] : []));
    const hints = [], hint = text => { const p = el("p", "wl-hint", text); if (PHONE) hints.push(p); else head.append(p); };
    if (data.project === "all") hint("This note covers every project. Pick one before you send it to a client.");
    const risky = [...data.days.flatMap(d => d.items), ...data.finished].filter(i => i.internal && !i.skipped).length;
    if (risky) hint(`${risky} ${risky === 1 ? "entry in this note mentions" : "entries in this note mention"} keys, passwords or file names. Check ${risky === 1 ? "it" : "them"} before you send.`);
    if (showText) { const pre = el("pre", "wl-text", data.md); pre.tabIndex = 0; pre.setAttribute("aria-label", "The text that Copy note copies"); head.append(pre); }

    const note = el("article", "wl-note");
    const focus = date => note.querySelectorAll(".wl-day").forEach(s => s.classList.toggle("dim", !!date && s.dataset.date !== date));
    // the week as light: one dot for each session or meeting that day
    const strip = el("ol", "wl-week"); strip.setAttribute("aria-label", "Sessions on each day of the week");
    data.week_days.forEach(d => {
      const li = el("li"), cell = el(d.count ? "button" : "div", "wl-cell"), dots = el("span", "wl-dots");
      for (let i = 0; i < Math.min(d.count, 8); i++) dots.append(el("i"));
      if (!d.count) dots.append(el("i", "wl-dash"));
      cell.append(el("span", "wl-d", d.label), dots);
      if (d.count) {
        cell.type = "button";
        cell.setAttribute("aria-label", `${d.label}, ${d.count}, go to that day`);
        cell.onclick = () => document.getElementById("wl-" + d.date)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
        cell.onmouseenter = cell.onfocus = () => focus(d.date);
        cell.onmouseleave = cell.onblur = () => focus(null);
      }
      li.append(cell); strip.append(li);
    });

    if (!data.days.length && !data.finished.length) note.append(el("p", "nothing", `Nothing recorded for ${data.project === "all" ? "any project" : data.project} in this week.`));
    else if (PHONE) hints.splice(0, hints.length, el("p", "wl-hint", [...hints.map(h => h.textContent), "Tap a tick to leave an entry out of the note."].join(" ")));
    data.days.forEach(day => {
      const sec = el("section", "wl-day"), ul = el("ul", "lg-list"), h = el("h2", "lg-day", day.label);
      sec.dataset.date = day.date; h.id = "wl-" + day.date;
      day.items.forEach(i => {
        const li = el("li", "wl-item" + (i.skipped ? " out" : "")), body = el("div"), t = el("div", "lt"), m = el("div", "lm");
        if (i.title) t.append(el("b", null, i.title + " "));
        t.append(inline(i.summary));
        m.append(el("span", null, [i.time, i.who].filter(Boolean).join(", ")));
        if (i.project) m.append(el("span", "tag", i.project));
        if (i.skipped) m.append(el("span", null, "Left out of the note"));
        else if (i.internal) m.append(el("span", "wl-check", "Check before sending"));
        body.append(t, m);
        for (const [label, lines] of [["Decided", i.decided], ["Still open", data.open ? i.open : []]]) {
          lines.forEach(x => { const p = el("p", "wl-sub"); p.append(el("b", null, label + ": "), inline(x)); body.append(p); });
        }
        li.append(tick(i.id, i.skipped, i.title || i.summary), body);
        if (i.project) lights(li, [i.project]);
        ul.append(li);
      });
      sec.append(h, ul); note.append(sec);
    });
    if (data.finished.length) {
      const sec = el("section", "wl-day"), ul = el("ul", "lg-list");
      data.finished.forEach(f => {
        const li = el("li", "wl-item" + (f.skipped ? " out" : "")), body = el("div");
        body.append(el("div", "lt", f.text));
        if (f.skipped || f.internal) { const m = el("div", "lm"); m.append(el("span", f.skipped ? null : "wl-check", f.skipped ? "Left out of the note" : "Check before sending")); body.append(m); }
        li.append(tick(f.id, f.skipped, f.text), body); ul.append(li);
      });
      sec.append(el("h2", "lg-day", "Finished this week"), ul); note.append(sec);
    }
    render(head, strip, ...hints, note);
    if (refocus) { const k = refocus; refocus = null; queueMicrotask(() => document.querySelector(`[data-k="${CSS.escape(k)}"]`)?.focus()); }
  }
  registerView("worklog", { render: enter, nav: "worklog" });
})();
