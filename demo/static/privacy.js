// Privacy: the full list of what leaves this Mac, the agent switches, the never-send list and what digests cost
(() => {
  let data = null, showPrompt = false, showOff = false, refocus = null, saving = false, asked = 0;
  const host = el("section", "pv");
  host.setAttribute("aria-label", "What leaves this Mac");
  const money = usd => "$" + usd.toFixed(usd < 0.01 ? 4 : 2);
  const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  // the map reads this: a never-send project carries no light
  const dim = () => { window.wakeNeverSend = new Set(data.never_send); if (typeof draw === "function") draw(); };
  const fold = (cls, title, ...body) => { const d = el("details", cls); d.append(el("summary", null, title), ...body); return d; };

  // one save at a time: a second change waits for the first answer, so it is built from what was really saved
  async function save(body, focus) {
    if (saving) return;
    saving = true; asked++; refocus = focus; host.setAttribute("aria-busy", "true");
    try { data = await api("/api/privacy", { method: "POST", body: JSON.stringify(body) }); }
    catch (err) { toast(err.message); }
    saving = false; host.removeAttribute("aria-busy");
    dim(); paint();
  }

  function row(s) {
    const li = el("li", "pv-item" + (s.on ? "" : " off")), dot = el("i", "pv-dot"), body = el("div"), t = el("div", "lt"), m = el("div", "lm");
    dot.setAttribute("aria-hidden", "true");
    t.append(el("b", null, s.what));
    if (!s.on && s.note !== "Off") t.append(el("span", "pv-state", s.note));
    for (const [k, v] of [["When", s.when], ["Goes to", s.to]]) m.append(el("b", null, k), el("span", null, v));
    body.append(t, el("p", "pv-sent", s.sent), m);
    if (s.id === "digest" && data.prompt) {
      const b = el("button", "rc", showPrompt ? "Hide the prompt" : "Show the exact prompt"); b.type = "button";
      b.setAttribute("aria-expanded", String(showPrompt)); b.dataset.k = "prompt";
      b.onclick = () => { showPrompt = !showPrompt; refocus = "prompt"; paint(); };
      body.append(b);
      if (showPrompt) {
        const pre = el("pre", "wl-text", data.prompt), copy = el("button", "btn", "Copy the prompt"); copy.type = "button";
        pre.tabIndex = 0; pre.setAttribute("aria-label", "The text sent with every session digest");
        copy.onclick = () => navigator.clipboard.writeText(data.prompt).then(() => toast("Copied."), () => toast("Wake couldn't reach the clipboard. Select the text and copy it."));
        body.append(el("p", "pv-sent", "It asks for a title, a summary, decisions, open to-dos, which to-dos the session finished, a status line and names to link, as JSON. Your session follows the last line."), pre, copy);
      }
    }
    li.append(dot, body);
    return li;
  }

  function paint() {
    const list = rows => { const ul = el("ul", "lg-list pv-list"); rows.forEach(s => ul.append(row(s))); return ul; };
    const auto = data.sends.filter(s => s.on && !s.asked), ask = data.sends.filter(s => s.on && s.asked), off = data.sends.filter(s => !s.on);
    const count = el("h2", "pv-count");
    count.append(el("b", null, String(data.leaving)), el("span", null, (data.leaving === 1 ? "thing leaves" : "things leave") + " this Mac on " + (data.leaving === 1 ? "its" : "their") + " own"));
    const lead = el("p", "pv-lead", (data.asking ? `${data.asking} more only when you ask. ` : "") + "This is the full list, read from your settings. Everything else stays in plain files in your vault.");
    const nodes = [count, lead];
    if (auto.length) nodes.push(list(auto));
    if (ask.length) nodes.push(el("h3", "pv-sub", "Only when you ask"), list(ask));
    if (off.length) {
      const d = fold("pv-fold", `Off in your setup (${off.length})`, list(off)); d.open = showOff;
      d.ontoggle = () => { showOff = d.open; };
      nodes.push(d);
    }
    nodes.push(el("p", "pv-lead", "Wake sends no usage statistics and does not check for updates."),
      el("p", "pv-foot", "With your own API key, the first Ask downloads Anthropic's Python library."));

    const agents = el("section", "group");
    agents.append(el("h3", null, "Your agents"), el("p", "nothing", "Turn an agent off and Wake stops reading its sessions and stops calling it. Ask and Web research ignore these switches."));
    const opts = el("div", "wl-opts");
    for (const [key, name] of [["claude", "Claude Code"], ["codex", "Codex"]]) {
      const l = el("label", "wl-opt"), box = el("input"); box.type = "checkbox"; box.checked = data.agents[key]; box.dataset.k = "agent:" + key;
      box.onchange = () => save({ agents: { [key]: box.checked } }, box.dataset.k);
      l.append(box, name); opts.append(l);
    }
    agents.append(opts);

    const never = el("section", "group");
    never.append(el("h3", null, "Never send"), el("p", "nothing", "Sessions in these projects are not sent to a model from now on. Older notes stay in your vault and still go out with Ask and with your to-do titles."));
    const chips = el("div", "pv-chips");
    data.never_send.forEach(p => {
      const b = el("button", "pv-chip", p); b.type = "button";
      if (data.unseen.includes(p)) b.append(el("i", null, "no sessions seen yet"));
      b.append(el("span", null, "×"));
      b.setAttribute("aria-label", `Send ${p} again`); b.title = "Send this project again";
      b.onclick = () => save({ never_send: data.never_send.filter(x => x !== p) }, "never");
      lights(b, [p]);
      chips.append(b);
    });
    const form = el("form", "key pv-add"), input = el("input"), add = el("button", "btn", "Add"), opt = el("datalist");
    opt.id = "pv-projects"; data.projects.filter(p => !data.never_send.includes(p)).forEach(p => opt.append(new Option(p)));
    input.setAttribute("list", opt.id); input.placeholder = "Project name"; input.setAttribute("aria-label", "Project never to send"); input.autocomplete = "off"; input.dataset.k = "never";
    add.type = "submit";
    form.onsubmit = e => { e.preventDefault(); const p = slug(input.value); if (p) save({ never_send: [...new Set([...data.never_send, p])] }, "never"); };
    form.append(input, opt, add);
    never.append(...(data.never_send.length ? [chips] : []), form,
      fold("pv-fold", "How project names work", el("p", "nothing", "A project is its folder's name under ~/Code or ~/Documents/Code. For a folder that is not a git repository, the first two folder names are joined, like clients-billing. Folders anywhere else count as one project called misc.")));

    const cost = el("section", "group"), [week, month] = data.cost, meter = el("div", "lg-meter");
    for (const [v, l] of [[String(week.sessions), "sessions digested in 7 days"], [(week.tokens_in + week.tokens_out).toLocaleString(), "tokens, in and out"],
      [money(week.usd), "at API rates; nothing extra on a Claude or Codex plan"]]) {
      const d = el("div"); d.append(el("b", null, v), el("span", null, l)); meter.append(d);
    }
    cost.append(el("h3", null, "What digests cost"), meter,
      el("p", "nothing", `In 30 days: ${plural(month.sessions, "session")}, ${(month.tokens_in + month.tokens_out).toLocaleString()} tokens, ${money(month.usd)}.`));

    host.replaceChildren(...nodes, agents, never, cost);
    if (refocus) { host.querySelector(`[data-k="${CSS.escape(refocus)}"]`)?.focus(); refocus = null; }
  }

  window.privacySection = () => {
    if (data) paint(); else host.replaceChildren(el("p", "lm", "Reading your settings…"));
    const mine = ++asked;   // an answer that a save or a newer request has overtaken is dropped
    api("/api/privacy").then(d => { if (mine === asked && !saving) { data = d; dim(); paint(); } }).catch(err => {
      if (data || mine !== asked) return;
      const again = el("button", "btn", "Try again"); again.type = "button"; again.onclick = () => privacySection();
      host.replaceChildren(el("p", "pv-lead", err.message), again);
    });
    return host;
  };
  if (!PHONE) api("/api/privacy").then(d => { if (!data) { data = d; dim(); } }).catch(() => {});
})();
