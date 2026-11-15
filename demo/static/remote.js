// Super Brain. On the Mac: the Settings card (connect a phone, invite people, revoke). On a phone: pairing, the device token, and several brains in one view.
(() => {
  const KEY = "wake.brains", LAST = "wake.last.";
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const brains = () => read(KEY, []);
  const sameHost = (url, origin) => { try { return new URL(url).host === new URL(origin).host; } catch { return false; } };
  // another address a Mac names for itself is kept only when it is a home-network address (the relay domain is shared by every Mac)
  const trusted = url => { try {
    const u = new URL(url);
    return u.protocol === "https:" && /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname);
  } catch { return false; } };
  const forget = b => { write(KEY, brains().map(x => x.id === b.id ? { ...x, token: "" } : x)); try { Object.keys(localStorage).filter(k => k.startsWith(LAST + b.id)).forEach(k => localStorage.removeItem(k)); } catch {} };
  const deviceName = () => /iPhone|iPad/.test(navigator.userAgent) ? "iPhone" : /Android/.test(navigator.userAgent) ? "Android phone" : "a browser";
  const timeOf = t => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  /* ---------- the phone ---------- */
  if (PHONE) {
    let own = brains().find(b => b.origin === location.origin) || null;
    if (own) H.Authorization = "Bearer " + own.token;
    const say = toast;
    toast = text => { if (text !== "Not on the phone.") say(text); };   // feature scripts' count fetches are refused locally; nothing to tell
    let lane = "all", pick = own;   // lane: "all" or a brain id; pick: the brain a tapped row belongs to
    const asleep = new Map();       // brain id -> time of the copy shown

    // claim a code at a Mac; origin is this page's Mac, or another Mac whose link was pasted into Add a brain
    async function claim(code, origin = location.origin) {
      const r = await fetch(origin + "/api/remote/claim", { method: "POST", headers: { "Content-Type": "application/json", "X-Brain-UI": "1" },
        body: JSON.stringify({ code, name: deviceName() }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Pairing failed.");
      const clash = brains().find(x => x.id === j.id && x.origin && x.origin !== origin && x.token);
      if (clash) throw new Error(`${clash.name} already uses that id from another address. Disconnect that Mac in its Settings first.`);
      const b = { id: j.id, origin, name: String(j.name || "a Mac").slice(0, 40), token: j.token, urls: [origin, ...Object.values(j.urls || {}).filter(trusted)].filter((u, i, a) => a.indexOf(u) === i),
        owner: !!j.owner, who: String(j.who || ""), roles: j.roles || {} };
      write(KEY, [...brains().filter(x => x.origin !== origin && x.id !== j.id), b]);
      if (origin === location.origin) { own = b; history.replaceState(null, "", "#today"); }
      toast(b.owner ? `Connected to ${b.name}.` : `Connected to ${b.name} as ${b.who}.`);
      return b;
    }

    // a pasted link from another Mac's Settings: https://<that mac>/phone#pair=<code>
    async function addBrain(link) {
      let u;
      try { u = new URL(link.trim()); } catch { throw new Error("That isn't a Wake link. Copy it from the other Mac's Settings, under Super Brain."); }
      const m = u.hash.match(/^#pair=([\w-]+)$/);
      if (!m || u.protocol !== "https:") throw new Error("That link has no pairing code in it.");
      await claim(m[1], u.origin);
      lane = "all"; pick = own; drawLanes(); brain = null; loadAll();
    }

    // one request to one brain, at home first (its own address), then through the relay
    async function reach(b, path, opt = {}) {
      let err = new Error("No address");
      const urls = (b.urls || []).filter(u => !sameHost(u, location.origin));
      if (sameHost(location.origin, (b.urls || [])[0]) || b === own) urls.unshift(location.origin);
      for (const u of urls) {
        const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000);
        try {
          const r = await fetch(u + path, { ...opt, signal: ctl.signal, headers: { ...H, ...(opt.headers || {}), Authorization: "Bearer " + b.token } });
          clearTimeout(t);
          return r;
        } catch (e) { clearTimeout(t); err = e; }
      }
      throw err;
    }

    const json = r => r.json().catch(() => ({}));
    const srcName = b => b.owner ? b.name : `${Object.keys(b.roles || {}).join(", ")}, from ${b.name}`;
    const tag = (items, b) => items.map(x => ({ ...x, lane: brains().length > 1 ? b.name : "", src: b.id }));

    async function merged(path) {
      const list = lane === "all" ? brains() : brains().filter(b => b.id === lane);
      const parts = await Promise.all(list.map(async b => {
        if (!b.token) return { b, gone: true };
        let r;
        try { r = await reach(b, path); }
        catch {
          const last = read(LAST + b.id + path, null);   // the Mac is asleep or away: its last copy
          if (last) asleep.set(b.id, last.at);
          return { b, data: last?.data, gone: !last };
        }
        asleep.delete(b.id);
        if (r.status === 401) { if (/connected/.test((await json(r)).error || "")) forget(b); return { b, gone: true }; }   // only the Mac's own answer forgets the key
        if (!r.ok) return { b, gone: true };
        const data = await json(r);
        write(LAST + b.id + path, { at: Date.now(), data });
        return { b, data };
      }));
      const ok = parts.filter(p => p.data);
      if (!ok.length) throw new Error(parts.some(p => p.gone) ? "This phone isn't connected to that Mac any more. Scan a new code in Wake's Settings." : "No brain could be reached.");
      if (path === "/api/brain") {
        const by = (a, b) => (b.date || "").localeCompare(a.date || "");
        return {
          rebuilt: ok.map(p => p.data.rebuilt).sort().pop() || "",
          loops: ok.flatMap(p => tag(p.data.loops || [], p.b)),
          decisions: ok.flatMap(p => tag(p.data.decisions || [], p.b)).sort(by),
          projects: ok.flatMap(p => tag(p.data.projects || [], p.b)),
          closed: ok.flatMap(p => tag(p.data.closed || [], p.b)).sort(by),
        };
      }
      return { sessions: ok.flatMap(p => tag(p.data.sessions || [], p.b)), meetings: ok.flatMap(p => tag(p.data.meetings || [], p.b)), notes: ok.flatMap(p => tag(p.data.notes || [], p.b)) };
    }

    const target = () => brains().find(x => x.id === (lane === "all" ? pick?.id : lane)) || own;
    window.phoneBrain = target;   // the brain a single-brain view (note, receipt, work log) asks

    // every fetch the page makes goes through here: merged reads for the two list views, everything else to the brain a row came from
    const ON_PHONE = /^\/api\/(brain|ledger|note|receipt|worklog|done|graph)$/;
    window.apiFetch = async (path, opt = {}) => {
      if (!own) throw new Error("This phone isn't connected to a Mac yet. Open Wake on your Mac, go to Settings, and scan the code under Connect your phone.");
      const route = path.split("?")[0];
      if (!ON_PHONE.test(route)) return new Response('{"error": "Not on the phone."}', { status: 403, headers: { "Content-Type": "application/json" } });   // feature scripts' counts never leave the phone
      if ((route === "/api/brain" || route === "/api/ledger") && (opt.method || "GET") === "GET") {
        const data = await merged(route);
        drawLanes();
        return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      const b = target();
      if (!b.token) throw new Error("This phone isn't connected to that Mac any more. Scan a new code in Wake's Settings.");
      const r = await reach(b, path, opt);
      if (r.status === 401) { if (/connected/.test((await json(r.clone())).error || "")) forget(b); throw new Error("This phone isn't connected to that Mac any more. Scan a new code in Wake's Settings."); }
      return r;
    };
    window.phoneGone = () => {
      const s = el("section", "working"); s.setAttribute("role", "status");
      s.append(el("p", "t", "This phone was disconnected"), el("p", "s", `${own.name} no longer accepts this phone. To connect again, open Wake on that Mac: Settings, Super Brain, Connect your phone, and scan the new code here.`));
      document.body.classList.add("gone");
      const chip = $("ro"); if (chip) { chip.textContent = "Disconnected"; chip.classList.add("off"); }
      return s;
    };

    // a tick shows on rows from a Mac where this phone is the owner or an editor; the Mac still checks every close
    window.phoneCanTick = l => { const b = brains().find(x => x.id === (l.src || own?.id)); return !!b && (b.owner || Object.values(b.roles || {}).includes("editor")); };

    document.addEventListener("click", e => {
      const row = e.target.closest("[data-src]");
      if (row) pick = brains().find(b => b.id === row.dataset.src) || own;
      else if (e.target.closest("nav")) pick = own;
    }, true);

    function addForm(bar) {
      const f = el("form", "lane-add"), inp = el("input"), ok = el("button", "btn primary", "Add"), no = el("button", "btn", "Cancel");
      inp.placeholder = "Paste the link"; inp.setAttribute("aria-label", "Pairing link from another Mac"); inp.required = true; inp.autocomplete = "off";
      ok.type = "submit"; no.type = "button"; no.onclick = () => drawLanes();
      f.onsubmit = async e => { e.preventDefault(); ok.disabled = true; try { await addBrain(inp.value); } catch (err) { toast(err.message); ok.disabled = false; } };
      f.append(inp, ok, no);
      bar.replaceChildren(f, el("p", "lane-note", "Another Mac of yours, or a project someone shared with you. On that Mac: Settings, Super Brain, Connect your phone, Copy link."));
      inp.focus();
    }

    function drawLanes() {
      const list = brains();
      if (!own) return;
      let bar = document.getElementById("lanes");
      if (!bar) { bar = el("div", "lanes"); bar.id = "lanes"; bar.setAttribute("role", "group"); bar.setAttribute("aria-label", "Which brains to show"); document.querySelector(".top").after(bar); document.body.classList.add("lanes"); }
      const row = el("div", "lane-row");
      (list.length > 1 ? [{ id: "all", name: "All brains" }, ...list] : list).forEach(b => {
        const c = el("button", "lane" + (lane === b.id ? " on" : ""), b.id === "all" ? b.name : srcName(b)); c.type = "button";
        c.setAttribute("aria-pressed", String(lane === b.id));
        if (asleep.has(b.id)) { c.classList.add("zz"); c.title = `${b.name} is asleep; showing its last copy`; }
        c.onclick = () => { lane = b.id; pick = b.id === "all" ? own : b; drawLanes(); brain = null; loadAll(); };
        row.append(c);
      });
      const add = el("button", "lane add", "+ Add a brain"); add.type = "button"; add.onclick = () => addForm(bar); row.append(add);
      const notes = [...asleep].map(([id, at]) => { const b = list.find(x => x.id === id); return b ? `${b.name} is asleep: showing its last copy from ${timeOf(at)}.` : ""; }).filter(Boolean);
      bar.replaceChildren(row, ...(notes.length ? [el("p", "lane-note", notes.join(" "))] : []));
    }

    // before the page loads anything: finish pairing if the address carries a code, then say who we are
    window.phoneReady = async () => {
      const m = location.hash.match(/^#pair=([\w-]+)$/);
      if (m) { try { await claim(m[1]); } catch (err) { toast(err.message); history.replaceState(null, "", "#today"); } }
      if (own) {
        H.Authorization = "Bearer " + own.token;
        window.phoneRole = own.owner ? "owner" : Object.values(own.roles).includes("editor") ? "editor" : "viewer";
        if (!own.owner) {
          const c = el("span", "ro"); c.id = "who"; c.textContent = `${own.who}, ${window.phoneRole}`; $("askpill").before(c);
          document.body.classList.add("nomap");   // the whole-vault map is never shared
        }
        drawLanes();
      }
    };
    return;
  }

  /* ---------- the Mac: the Settings card ---------- */
  let data = null;
  const link = (text, href) => { const a = el("a", "rc", text); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; return a; };
  const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body) });

  function locked(host) {
    const why = el("div", "why"); why.append(el("span", "lead", "Super Brain"), el("span", null, "not unlocked"));
    const f = el("form", "key"), key = el("input"), ok = el("button", "btn primary", "Unlock"), msg = el("p", "msg");
    key.placeholder = "Super Brain key"; key.setAttribute("aria-label", "Super Brain key"); key.autocomplete = "off"; key.required = true; ok.type = "submit"; msg.setAttribute("role", "status");
    f.onsubmit = async e => {
      e.preventDefault(); ok.disabled = true; msg.textContent = "";
      try { await post("/api/licence/key", { key: key.value }); location.reload(); } catch (err) { msg.textContent = err.message; ok.disabled = false; }
    };
    f.append(key, ok);
    const links = el("p", "lm"); links.append(link(`Buy Super Brain, ${data.price}`, data.super_url || "#"));
    host.append(why, el("h2", "as-is", "Your Brain on your phone, shared with the people you choose"),
      el("p", "st-line", "Read today's to-dos, decisions and the work log on your phone. Give a teammate one project as viewer or editor. Several Macs, one view. Paste a Super Brain key to turn it on."),
      f, msg, links);
  }

  function code(box, got, title) {
    box.replaceChildren();
    const fig = el("figure", "sb-qr");
    const pic = el("div", "sb-code"); pic.innerHTML = got.qr;
    const cap = el("figcaption");
    cap.append(el("b", null, title), el("span", null, `Point the phone's camera at it. The code works once and for ${got.minutes} minutes.`));
    const url = el("code", "sb-url", got.url); url.tabIndex = 0; url.setAttribute("aria-label", "The same link, to copy");
    const copy = el("button", "btn", "Copy link"); copy.type = "button";
    copy.onclick = () => navigator.clipboard?.writeText(got.url).then(() => toast("Copied."), () => toast("Select the link and copy it."));
    const row = el("div", "sb-row"); row.append(url, copy);
    cap.append(row, el("span", "sb-fine", "On the phone, add Wake to the home screen from the share menu. It then opens like an app."));
    fig.append(pic, cap); box.append(fig);
  }

  function unlocked(host) {
    const why = el("div", "why"); why.append(el("span", "lead", "Super Brain"), el("span", null, data.devices.length ? `${plural(data.devices.length, "device")} connected` : "on"));
    host.append(why, el("h2", "as-is", "Your Brain on your phone"));
    host.append(el("p", "st-line", "Your notes stay on your own devices. Your phone reads straight from this Mac, encrypted the whole way. No one in between can read your notes. Your own phones see the whole vault, an invited person sees one project. Each phone has its own key. Disconnect it here and it is out on its next request."));

    const name = el("form", "sb-name"), nm = el("input"), save = el("button", "btn", "Rename"); nm.value = data.name; nm.setAttribute("aria-label", "What this Mac is called on the phone"); nm.maxLength = 40; save.type = "submit";
    name.onsubmit = async e => { e.preventDefault(); try { data = await post("/api/remote/name", { name: nm.value }); toast(`This Mac is now “${data.name}” on your phone.`); } catch (err) { toast(err.message); } };
    const lbl = el("label", null, "On the phone this Mac is called "); lbl.append(nm); name.append(lbl, save);
    host.append(name);

    const qrBox = el("div", "sb-qrbox");
    const acts = el("div", "acts");
    const connect = el("button", "btn primary", "Connect your phone"); connect.type = "button";
    connect.onclick = async () => { connect.disabled = true; try { code(qrBox, await post("/api/remote/pair", {}), "Scan to connect your phone"); } catch (err) { toast(err.message); } connect.disabled = false; };
    acts.append(connect);
    host.append(acts, qrBox);

    const dev = el("section", "sb-list"); dev.append(el("h3", null, "Connected devices"));
    if (!data.devices.length) dev.append(el("p", "nothing", "No phone yet. Press Connect your phone and scan the code."));
    else {
      const ul = el("ul");
      data.devices.forEach(d => {
        const li = el("li"), body = el("div"), t = el("div", "lt", d.name), m = el("div", "lm");
        m.append(el("span", null, d.who ? `${d.who}'s` : "yours"), el("span", null, d.seen ? `seen ${d.seen}` : `added ${fmtDay(d.added)}`));
        body.append(t, m);
        const x = el("button", "ghost", "Disconnect"); x.type = "button";
        x.onclick = async () => { try { data = await post("/api/remote/revoke", { device: d.id }); redraw(host); toast(`${d.name} can't read this Mac any more.`); } catch (err) { toast(err.message); } };
        li.append(body, x); ul.append(li);
      });
      dev.append(ul);
    }
    host.append(dev);

    const ppl = el("section", "sb-list"); ppl.append(el("h3", null, "People"));
    ppl.append(el("p", "nothing", "A person sees only the projects you give them: that project's notes, decisions and to-dos, and the work log for it. Never your inbox, briefs, other projects, the map or NOW.md. An editor can also close a to-do there, and Wake records who did."));
    if (data.people.length) {
      const ul = el("ul");
      data.people.forEach(p => {
        const li = el("li"), body = el("div"), t = el("div", "lt", p.name), m = el("div", "lm");
        Object.entries(p.roles).forEach(([proj, role]) => {
          const sel = el("select"); sel.setAttribute("aria-label", `${p.name} on ${proj}`);
          sel.append(new Option(`${proj}: viewer`, "viewer"), new Option(`${proj}: editor`, "editor"), new Option(`${proj}: remove`, ""));
          sel.value = role;
          sel.onchange = async () => { try { data = await post("/api/remote/person", { id: p.id, project: proj, role: sel.value }); redraw(host); } catch (err) { toast(err.message); } };
          m.append(sel);
        });
        m.append(el("span", null, plural(p.devices, "device")));
        body.append(t, m);
        const x = el("button", "ghost", "Remove"); x.type = "button";
        x.onclick = async () => { try { data = await post("/api/remote/forget", { id: p.id }); redraw(host); toast(`${p.name} can't read this Mac any more.`); } catch (err) { toast(err.message); } };
        li.append(body, x); ul.append(li);
      });
      ppl.append(ul);
    }
    const inv = el("form", "sb-invite"), who = el("input"), proj = el("select"), role = el("select"), go = el("button", "btn", "Make an invite link");
    const existing = el("select"); existing.setAttribute("aria-label", "Who");
    existing.append(new Option("someone new", ""), ...data.people.map(p => new Option(p.name, p.id)));
    existing.onchange = () => { who.hidden = !!existing.value; who.required = !existing.value; };
    who.placeholder = "Their name"; who.setAttribute("aria-label", "Their name"); who.required = true; who.maxLength = 60;
    proj.setAttribute("aria-label", "Project"); proj.append(...data.projects.map(p => new Option(p, p)));
    role.setAttribute("aria-label", "Role"); role.append(new Option("viewer", "viewer"), new Option("editor", "editor")); go.type = "submit";
    const invBox = el("div", "sb-qrbox");
    inv.onsubmit = async e => {
      e.preventDefault(); go.disabled = true;
      try { const got = await post("/api/remote/invite", { name: who.value.trim(), person: existing.value, project: proj.value, role: role.value }); data = got; code(invBox, got, `Invite for ${existing.value ? existing.selectedOptions[0].textContent : who.value.trim()}: ${role.value} of ${proj.value}`); }
      catch (err) { toast(err.message); }
      go.disabled = false;
    };
    inv.append(...(data.people.length ? [existing] : []), who, proj, role, go);
    ppl.append(inv, invBox);
    if (data.invites.length) {
      const ul = el("ul");
      data.invites.forEach(i => {
        const li = el("li"), body = el("div"), x = el("button", "ghost", "Cancel"); x.type = "button";
        body.append(el("div", "lt", i.label), el("div", "lm", `Open link, ${i.minutes} min left`));
        x.onclick = async () => { try { data = await post("/api/remote/cancel", { id: i.id }); redraw(host); toast("That link no longer works."); } catch (err) { toast(err.message); } };
        li.append(body, x); ul.append(li);
      });
      ppl.append(ul);
    }
    host.append(ppl);

    const r = data.relay || {};
    const net = el("details", "sb-net"), sum = el("summary", null, `Relay ${r.state === "connected" ? "connected" : r.state || "off"}. Details`);
    const lines = el("p", "lm");
    lines.append(el("span", null, `At home: ${data.urls.home || "off"}`), el("span", null, data.urls.away ? `Away: ${data.urls.away}` : "Away: no relay set"));
    if (r.detail) lines.append(el("span", null, r.detail));
    if (data.mock) lines.append(el("span", null, "This relay is a mock on this Mac. To use a real one, change config/relay.json."));
    net.append(sum, lines); host.append(net);
  }

  function redraw(host) { host.replaceChildren(); (data.tier === "super" ? unlocked : locked)(host); }

  window.superSection = () => {
    const host = el("section", "now sb"); host.setAttribute("aria-label", "Super Brain");
    host.append(working("Loading Super Brain…"));
    api("/api/remote").then(d => { data = d; redraw(host); }).catch(err => host.replaceChildren(working("Super Brain didn't load", err.message, true)));
    return host;
  };
})();
