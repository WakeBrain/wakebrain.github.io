// Licence: the key screen when Wake is locked, one quiet line while Polar can't be reached, and the Settings view
(() => {
  let lic = null;
  document.body.classList.add("licence-wait");
  const load = () => PHONE ? Promise.resolve(lic = { gate: false, active: true }) : api("/api/licence").then(d => (lic = d));   // a phone never sees the key screen
  const link = (cls, text, href) => { const a = el("a", cls, text); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; return a; };

  const help = text => { const p = el("p", "lm"); p.append(text, link("rc", lic.support_email, "mailto:" + lic.support_email)); return p; };
  const portal = () => link("rc", lic.limit ? "Open your Polar purchases page" : "Find your key or download Wake again", lic.portal_url);
  const said = (msg, text) => { msg.textContent = text; if (text === lic.limit_text && lic.portal_url) msg.append(" ", link("rc", "Open your Polar purchases page", lic.portal_url)); };

  function keyForm(label, primary, done = () => location.reload()) {
    const f = el("form", "key"), key = el("input"), ok = el("button", primary ? "btn primary" : "btn", label), msg = el("p", "msg");
    key.placeholder = "Licence key"; key.setAttribute("aria-label", "Licence key"); key.autocomplete = "off"; key.required = true;
    ok.type = "submit"; msg.setAttribute("role", "status");
    f.onsubmit = async e => {
      e.preventDefault(); ok.disabled = true; msg.textContent = "";
      try { await api("/api/licence/key", { method: "POST", body: JSON.stringify({ key: key.value }) }); done(); }
      catch (err) { said(msg, err.message); ok.disabled = false; }
    };
    f.append(key, ok);
    return { f, msg, key };
  }

  // [status, title, detail] for the Settings card
  function words() {
    if (!lic.gate) return ["demo", "This is the demo", "No key is needed here. Nothing you do in the demo is saved."];
    if (lic.grandfathered) return ["unlocked", "Unlocked", "This vault was here before Wake had licences, so it stays unlocked on this Mac."];
    if (lic.limit) return ["in use on other Macs", "This key is in use on other Macs", lic.limit_text];
    if (!lic.licensed) return ["needs a key", "No licence key yet", "Paste the key from your receipt email."];
    if (lic.grace_until) return ["check overdue", "Licensed", `Your key ends in ${lic.key_hint}. Wake couldn't reach Polar to check it, and keeps working until ${fmtDay(lic.grace_until)}.`];
    return [`checked ${fmtDay(lic.checked)}`, "Licensed", `Your key ends in ${lic.key_hint}. Wake checks it with Polar about once a week.`];
  }

  function deactivate() {
    const b = el("button", "btn", "Deactivate this Mac"), msg = el("p", "msg");
    b.type = "button"; msg.setAttribute("role", "status");
    b.onclick = async () => {
      if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Yes, deactivate"; msg.textContent = "Wake will lock on this Mac until you enter a key again."; return; }
      b.disabled = true; msg.textContent = "";
      try { await api("/api/licence/deactivate", { method: "POST", body: "{}" }); location.reload(); }
      catch (err) { msg.textContent = err.message; b.disabled = false; }
    };
    return [b, msg];
  }

  function settings() {
    if (!lic) {
      render(working("Loading settings…"));
      load().then(() => { if (view === "settings") settings(); }).catch(err => { if (view === "settings") render(working("Settings didn't load", err.message, true, settings)); });
      return;
    }
    const head = el("section", "head"); head.append(el("h1", null, "Settings"));
    const [status, title, detail] = words();
    const card = el("section", "now"); card.setAttribute("aria-label", "Licence");
    const why = el("div", "why"); why.append(el("span", "lead", "Licence"), el("span", null, status));
    card.append(why, el("h2", "as-is", title), el("p", "st-line", detail));
    if (lic.gate && !lic.grandfathered) {
      const { f, msg } = keyForm(lic.licensed ? "Use another key" : "Unlock", !lic.licensed);
      card.append(f, msg);
      const links = el("p", "lm");
      if (!lic.licensed) links.append(link("rc", "Buy Wake for $59, one payment", lic.buy_url));
      if (lic.portal_url) links.append(portal());
      if (links.children.length) card.append(links);
      if (lic.licensed) card.append(...deactivate());
    }
    card.append(help("Help: "));
    render(head, card, ...(window.themeSection ? [themeSection()] : []), ...(window.superSection ? [superSection()] : []), ...(window.privacySection ? [privacySection()] : []));
  }
  registerView("settings", { render: settings, nav: "settings" });

  function locked() {
    const s = el("main", "ended"), offline = lic.licensed;
    const { f, msg, key } = keyForm("Unlock", true, () => { s.classList.add("unlocked"); setTimeout(() => location.reload(), 1100); });
    const card = el("section", "now keycard");
    card.append(f, msg, el("p", "lm", "Wake checks the key with Polar. Only the key, the activation ID Polar gives this Mac and the date of the last check are saved on this Mac."));
    s.append(document.querySelector(".brand").cloneNode(true), el("h1", null, offline ? "Check your connection" : lic.limit ? "This key is in use on other Macs" : "Enter your licence key"));
    if (!lic.fresh) s.append(el("p", null, `Your notes are safe. They're plain Markdown files in ${lic.vault}, and you can open them any time. Until you enter a key, Wake won't record new sessions or send your morning brief.`));
    s.append(el("p", null, offline ? "Wake hasn't been able to check your key with Polar for two weeks. Connect to the internet and open Wake again."
        : lic.limit ? lic.limit_text
        : lic.refused ? "Polar didn't accept the key saved on this Mac. Check it against your receipt email and enter it again."
        : "Paste the key from your receipt email (it comes from Polar). Wake remembers it on this Mac, so you only enter it once."),
      card);
    const more = el("p", "lm");
    if (!offline) more.append("Don't have a key? ", link("rc", "Buy Wake for $59, one payment", lic.buy_url));
    if (lic.portal_url) more.append(portal());
    if (more.childNodes.length) s.append(more);
    s.append(help("Lost your key, or something not working? Email "));
    if (lic.fresh) {
      const fig = el("p", "first-light");
      fig.append(el("b", null, "Your map starts with your first session"), el("span", null, "Wake saves a note when a session ends."));
      s.append(fig);
    }
    document.body.classList.remove("map");
    document.body.classList.add("ended");
    document.body.append(s);
    dispatchEvent(new Event("resize"));
    key.focus();
  }

  load().then(() => {
    if (lic.gate && !lic.active) locked();
    else if (lic.grace_until) {
      const a = el(PHONE ? "span" : "a", "licence-note", `Licence check due by ${fmtDay(lic.grace_until)}`);
      if (!PHONE) a.href = "#settings";
      $("askpill").before(a);
    }
    if (view === "settings") settings();
  }).catch(() => {}).finally(() => document.body.classList.remove("licence-wait"));
})();
