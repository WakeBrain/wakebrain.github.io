(() => {

  let ideas = [], projects = [], areas = [], topics = [], focused = null, phase = 0;
  let loading = null;
  const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body) });
  const pending = () => ideas.filter(i => i.status === "inbox");
  const active = () => projects.filter(p => !p.archived);

  function badge() {
    if ($("c-inbox")) $("c-inbox").textContent = pending().length || "";
    if ($("c-projects")) $("c-projects").textContent = active().length || "";
  }

  async function load() {
    if (!loading) {
      loading = Promise.all([api("/api/inbox/list"), api("/api/projects/list"), api("/api/areas/list")])
        .then(([inbox, allProjects, allAreas]) => {
          ideas = inbox.ideas; topics = inbox.topics;
          projects = allProjects.projects; areas = allAreas.areas;
          badge();
        }).finally(() => { loading = null; });
    }
    return loading;
  }

  function button(label, fn, primary = false) {
    const b = el("button", "btn" + (primary ? " primary" : ""), label);
    b.type = "button";
    b.onclick = async () => {
      b.disabled = true;
      try { await fn(); } catch (err) { toast(err.message); }
      finally { b.disabled = false; }
    };
    return b;
  }

  function group(title, child) {
    const section = el("section", "group");
    section.append(el("h3", null, title), child);
    return section;
  }

  function head(title, hint) {
    const h = el("header", "head");
    h.append(el("h1", null, title), el("p", null, hint));
    return h;
  }

  function input(label, limit) {
    const field = el("input", "filter");
    field.setAttribute("aria-label", label);
    field.placeholder = label;
    field.maxLength = limit;
    return field;
  }

  function ideaRows(items, select) {
    const list = el("ul", "rows");
    items.forEach(idea => {
      const li = el("li"), b = el("button");
      b.type = "button";
      b.append(el("b", null, plain(idea.text).slice(0, 140)), el("span", "when", fmtDay(idea.created.slice(0, 10))));
      if (idea.status === "filed") b.append(el("span", "sub", `${idea.para}: ${idea.to}`));
      b.onclick = () => select(idea);
      li.append(b); list.append(li);
    });
    return list;
  }

  function areaForm(onCreated) {
    const form = el("form", "ib-form");
    const name = input("Area name", 80), description = input("One-line description", 500);
    name.required = description.required = true;
    const nameLabel = el("label", null, "Area name"), descriptionLabel = el("label", null, "One-line description");
    nameLabel.append(name); descriptionLabel.append(description);
    const save = el("button", "btn primary", "Create area"); save.type = "submit";
    const actions = el("div", "acts");
    actions.append(save, button("Cancel", () => form.remove()));
    form.append(nameLabel, descriptionLabel, actions);
    form.onsubmit = async e => {
      e.preventDefault();
      if (save.disabled) return;
      save.disabled = true;
      try {
        const result = await post("/api/areas/create", { name: name.value, description: description.value });
        areas.push(result.area);
        await onCreated(result.area);
        form.remove();
      } catch (err) { toast(err.message); }
      finally { save.disabled = false; }
    };
    return form;
  }

  function newArea(host, onCreated) {
    const existing = host.querySelector(".ib-form");
    if (existing) return existing.querySelector("input").focus();
    const form = areaForm(onCreated);
    host.append(form);
    form.querySelector("input").focus();
  }

  async function file(idea, para, target, host) {
    const result = await post("/api/inbox/file", { id: idea.id, para, to: target });
    ideas = ideas.map(i => i.id === idea.id ? result.idea : i);
    focused = null; phase = 0; badge();
    toast(`Filed under ${target}.`);
    if (host.isConnected) paintInbox(host);
    try { await load(); } catch (err) { toast(err.message); }
  }

  function undoDelete(idea) {
    document.querySelector(".toast")?.remove();
    const notice = el("div", "toast ib-undo");
    notice.setAttribute("role", "status");
    const undo = button("Undo", async () => {
      const result = await post("/api/inbox/restore", idea);
      ideas.push(result.idea);
      ideas.sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
      focused = idea.id; phase = 0; badge();
      notice.remove(); toast("Restored to your Inbox.");
      if (document.body.dataset.view === "inbox") inboxView();
    });
    notice.append(el("span", null, "Idea deleted."), undo);
    document.body.append(notice);
    let timer = setTimeout(() => notice.remove(), 12000);
    notice.onfocusin = notice.onmouseenter = () => clearTimeout(timer);
    notice.onfocusout = notice.onmouseleave = () => { clearTimeout(timer); timer = setTimeout(() => notice.remove(), 12000); };
  }

  function triage(idea, host) {
    const card = el("section", "now ib-card");
    card.append(md(idea.text));
    const questions = ["What project is this useful for?", "Which area is it useful for?", "Which resource does it belong to?"];
    if (phase < 3) card.append(el("h3", null, questions[phase]));
    const choices = el("div", "ib-choices");
    if (phase === 0) {
      const filter = input("Filter projects", 120);
      const fill = () => {
        const matches = active().filter(p => (p.slug + " " + p.text).toLowerCase().includes(filter.value.toLowerCase()));
        choices.replaceChildren(...matches.map(p => button(p.slug, () => file(idea, "project", p.slug, host))));
        if (!matches.length) choices.append(el("p", "nothing", "No matching projects."));
      };
      filter.oninput = fill; fill(); card.append(filter, choices);
    } else if (phase === 1) {
      areas.forEach(a => choices.append(button(a.title, () => file(idea, "area", a.slug, host))));
      choices.append(button("New area", () => newArea(card, area => file(idea, "area", area.slug, host))));
      card.append(choices);
    } else if (phase === 2) {
      const form = el("form", "ib-form"), topic = input("Resource topic", 120);
      topic.required = true;
      const suggestions = el("datalist"); suggestions.id = "ib-topics";
      topics.forEach(value => { const option = el("option"); option.value = value; suggestions.append(option); });
      topic.setAttribute("list", suggestions.id);
      const save = el("button", "btn primary", "File resource"); save.type = "submit";
      form.append(topic, suggestions, save);
      form.onsubmit = async e => {
        e.preventDefault();
        if (save.disabled) return;
        save.disabled = true;
        try { await file(idea, "resource", topic.value, host); }
        catch (err) { toast(err.message); }
        finally { save.disabled = false; }
      };
      card.append(form);
    } else {
      card.append(el("p", "nothing", "No useful place for this idea?"));
    }
    const actions = el("div", "acts");
    if (phase < 3) actions.append(button("None of these", () => { phase++; paintInbox(host); }));
    else actions.append(button("Delete it", async () => {
      const result = await post("/api/inbox/delete", { id: idea.id });
      ideas = ideas.filter(i => i.id !== idea.id);
      focused = null; phase = 0; badge();
      if (host.isConnected) paintInbox(host);
      undoDelete(result.idea);
    }));
    actions.append(button("Ask about it", () => askAbout(idea.text)), button("Skip for now", () => {
      const items = pending(), index = items.findIndex(i => i.id === idea.id);
      focused = items[(index + 1) % items.length]?.id;
      phase = 0; paintInbox(host);
    }));
    card.append(actions);
    return card;
  }

  function paintInbox(host) {
    const header = head("Inbox", "Give one idea a useful place.");
    const actions = el("div", "acts"); actions.append(button("New idea", capture)); header.append(actions);
    const items = pending();
    const current = items.find(i => i.id === focused) || items[0];
    if (current && current.id !== focused) { focused = current.id; phase = 0; }
    host.replaceChildren(header);
    if (current) {
      host.append(triage(current, host));
      const rest = items.filter(i => i.id !== current.id);
      if (rest.length) host.append(group("Next ideas", ideaRows(rest, idea => {
        focused = idea.id; phase = 0; paintInbox(host);
      })));
    } else host.append(el("p", "nothing", "Your inbox is clear. Press n to capture a new idea."));
    const recent = ideas.filter(i => i.status === "filed").sort((a, b) => b.activity - a.activity).slice(0, 10);
    host.append(group("Filed recently", recent.length ? ideaRows(recent, idea => askAbout(idea.text)) : el("p", "nothing", "Filed ideas will appear here.")));
  }

  function viewHost(paint) {
    const host = el("div", "ib-stack");
    host.append(el("p", "nothing", "Loading your notes…")); render(host);
    load().then(() => { if (host.isConnected) paint(host); }).catch(err => {
      if (host.isConnected) host.replaceChildren(working("Couldn't load your inbox.", err.message, true, () => viewHost(paint)));
    });
  }

  function inboxView() { viewHost(paintInbox); }

  function openArea(area) {
    const host = el("div", "ib-stack");
    const paint = () => {
      const filed = ideas.filter(i => i.status === "filed" && i.para === "area" && i.to === area.slug);
      host.replaceChildren(button("Back to Projects", () => go("projects")), head(area.title, area.description),
        filed.length ? ideaRows(filed, idea => screen(reader(area.title, { label: "Projects", view: "projects" }, idea.text))) : el("p", "nothing", "No ideas filed here yet."));
    };
    paint(); screen(host);
  }

  function paintProjects(host) {
    const header = head("Projects", "Pick a project to find its next step.");
    const filter = input("Filter projects and areas", 120); filter.type = "search"; header.append(filter);
    const content = el("div", "ib-stack");
    const projectRows = items => {
      const list = el("ul", "rows");
      items.forEach(p => {
        const row = el("li", "ib-row"), main = el("button"); main.type = "button";
        main.append(el("b", null, p.slug), el("span", "when", p.idle_days > 14 ? `idle ${p.idle_days} days` : fmtDay(p.date)), el("span", "sub", p.text));
        main.onclick = () => askAbout(`Where does ${p.slug} stand, and what's the next step?`);
        lights(row, [p.slug]);
        row.append(main, button(p.archived ? "Restore" : "Archive", async () => {
          await post("/api/projects/archive", { slug: p.slug, archived: !p.archived });
          p.archived = !p.archived; badge(); fill();
          toast(p.archived ? "Project archived." : "Project restored.");
        }));
        list.append(row);
      });
      return list;
    };
    const fill = () => {
      const query = filter.value.toLowerCase();
      const matches = p => (p.slug + " " + p.text).toLowerCase().includes(query);
      const shown = active().filter(matches), archived = projects.filter(p => p.archived);
      const areaList = el("ul", "rows");
      areas.filter(a => (a.title + " " + a.description).toLowerCase().includes(query)).forEach(a => {
        const li = el("li"), b = el("button"); b.type = "button";
        const count = ideas.filter(i => i.status === "filed" && i.para === "area" && i.to === a.slug).length;
        b.append(el("b", null, a.title), el("span", "when", plural(count, "idea")), el("span", "sub", a.description));
        b.onclick = () => openArea(a); li.append(b); areaList.append(li);
      });
      const areaSection = group("Areas", areaList);
      const actions = el("div", "acts"); actions.append(button("New area", () => newArea(areaSection, () => { fill(); toast("Area created."); })));
      areaSection.append(actions);
      const details = el("details", "ib-archived");
      details.append(el("summary", null, `Archived (${archived.length})`), projectRows(archived.filter(matches)));
      content.replaceChildren(group("Projects", shown.length ? projectRows(shown) : el("p", "nothing", projects.length ? "No matching active projects." : "No projects yet. One appears after Wake reads a Claude Code or Codex session in a repo.")), areaSection, details);
    };
    filter.oninput = fill; fill(); host.replaceChildren(header, content);
  }

  let dialog, captureText, captureSave, captureCancel, saving = false;
  function capture() {
    if (!dialog) {
      dialog = el("dialog", "ib-capture"); dialog.setAttribute("aria-labelledby", "ib-capture-title");
      const form = el("form"), title = el("h2", null, "Capture an idea"); title.id = "ib-capture-title";
      captureText = el("textarea"); captureText.maxLength = 4000; captureText.required = true;
      captureText.setAttribute("aria-label", "Your idea"); captureText.placeholder = "What's on your mind?";
      captureSave = el("button", "btn primary", "Save idea"); captureSave.type = "submit";
      captureCancel = button("Cancel", () => dialog.close());
      const actions = el("div", "acts"); actions.append(captureSave, captureCancel);
      const hint = el("p", null, "Enter saves. Shift+Enter adds a line. Esc cancels."); hint.id = "ib-capture-hint";
      captureText.setAttribute("aria-describedby", hint.id);
      form.append(title, captureText, hint, actions);
      captureText.onkeydown = e => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
      };
      form.onsubmit = async e => {
        e.preventDefault();
        if (saving) return;
        saving = true; captureText.disabled = captureSave.disabled = captureCancel.disabled = true;
        try {
          const result = await post("/api/inbox/add", { text: captureText.value });
          ideas.push(result.idea); badge(); captureText.value = ""; dialog.close();
          toast("Saved to your Inbox.");
          if (document.body.dataset.view === "inbox") inboxView();
        } catch (err) { toast(err.message); }
        finally {
          saving = false; captureText.disabled = captureSave.disabled = captureCancel.disabled = false;
          if (dialog.open) captureText.focus();
        }
      };
      dialog.oncancel = e => { if (saving) e.preventDefault(); };
      dialog.append(form); document.body.append(dialog);
    }
    if (!dialog.open) dialog.showModal();
    captureText.focus();
  }

  document.addEventListener("keydown", e => {
    const target = e.target;
    if (PHONE || e.key !== "n" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.isComposing || e.repeat || e.defaultPrevented) return;
    if (target?.closest?.("input, textarea, select") || target?.isContentEditable || document.querySelector("dialog[open]")) return;
    e.preventDefault(); capture();
  });
  registerView("inbox", { render: inboxView, count: () => pending().length, nav: "inbox" });
  registerView("projects", { render: () => viewHost(paintProjects), count: () => active().length, nav: "projects" });
  addEventListener("DOMContentLoaded", () => { load().catch(err => toast(err.message)); });
})();
