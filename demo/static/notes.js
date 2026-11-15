const notesFeature = (() => {
  let noteCount = "", tab = "notes", folder = "", query = "";
  const wiki = /\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|([^\]\n]*))?\]\]/g;
  const readable = text => plain((text || "").replace(wiki, (_, name, alias) => alias || name));
  const button = (label, action, cls = "btn") => {
    const b = el("button", cls, label); b.type = "button"; b.onclick = action; return b;
  };
  const date = value => new Date(value).toLocaleDateString("en-IN", {day: "numeric", month: "short", year: "numeric"});

  function linked(node, resolve) {
    const targets = new Map(Object.entries(resolve));
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    for (const text of texts) {
      if (text.parentElement.closest("a,code,pre,script,style")) continue;
      const matches = [...text.textContent.matchAll(wiki)];
      if (!matches.length) continue;
      const fragment = document.createDocumentFragment();
      let at = 0;
      for (const match of matches) {
        const name = match[1].trim();
        fragment.append(text.textContent.slice(at, match.index));
        const a = el("a", "notes-wiki", match[2] || name);
        const id = targets.get(name.toLowerCase()) || "e:" + name.toLowerCase();
        a.href = "#" + encodeURIComponent(id);
        a.onclick = event => { event.preventDefault(); openNote(id); };
        fragment.append(a);
        at = match.index + match[0].length;
      }
      fragment.append(text.textContent.slice(at));
      text.replaceWith(fragment);
    }
    return node;
  }

  function kind(folderName) {
    const kind = el("div", "notes-kind");
    const dot = el("i", "notes-dot");
    const groups = ["projects", "areas", "ideas", "memories", "briefs", "log", "inbox", "ticket", "topic"];
    const group = groups.includes(folderName) ? folderName : ["root", "meetings"].includes(folderName) ? "briefs" : "topic";
    dot.style.background = `var(--c-${group})`;
    dot.setAttribute("aria-hidden", "true");
    kind.append(dot, folderName);
    return kind;
  }

  function mentions(title, items, resolve) {
    const section = el("section", "group"); section.append(el("h3", null, title));
    if (!items.length) {
      section.append(el("p", "nothing notes-empty", "None yet.")); return section;
    }
    const list = el("ul", "notes-mentions");
    for (const item of items) {
      const row = el("li", "notes-mention");
      row.append(button(item.title, () => openNote(item.id), "notes-title"));
      row.append(el("div", "lm", `${item.folder}, ${date(item.modified)}`));
      const snippet = el("div", "notes-snippet"); snippet.append(linked(inline(item.snippet), resolve));
      row.append(snippet); lights(row, [item.title]); list.append(row);
    }
    section.append(list); return section;
  }

  function chips(title, items) {
    const section = el("section", "group"); section.append(el("h3", null, title));
    const list = el("div", "acts");
    items.forEach(item => list.append(button(item.title, () => openNote(item.id))));
    section.append(items.length ? list : el("p", "nothing notes-empty", "None yet."));
    return section;
  }

  async function showNote(id) {
    const previousView = view, previousNodes = [...$("view").childNodes], scroll = window.scrollY;
    const page = el("article", "reader notes-page");
    const back = button("Back", () => {
      if (previousView === "reader") screen(...previousNodes); else go(previousView);
      requestAnimationFrame(() => window.scrollTo(0, scroll));
    }, "back");
    const top = el("div", "reader-top"); top.append(back);
    page.append(top, el("p", "working", "Opening note…")); screen(page);
    try {
      const entity = typeof id === "string" && id.startsWith("e:");
      const data = await api(`/api/notes/${entity ? "entity" : "page"}?id=${encodeURIComponent(id)}`);
      if (!page.isConnected) return;
      page.replaceChildren(top, kind(data.folder), el("h1", "as-is", data.title));
      const actions = el("div", "acts");
      actions.append(button("Ask Brain about it", () => askAbout(`What does my Brain say about ${data.title}?`), "btn primary"));
      actions.append(button("Show on map", () => {
        go("map");
        setTimeout(() => {
          if (view !== "map") return;
          const node = graph?.nodes.find(node => node.id === data.id);
          if (node) { selectNode(node); focusOn(node); } else toast("The map is still loading. Try again.");
        }, 800);
      }));
      if (!PHONE) page.append(actions);
      if (entity) {
        if (data.url) {
          const ticket = el("a", null, "Open " + data.title.toUpperCase() + " in Jira");
          ticket.href = data.url; ticket.target = "_blank"; ticket.rel = "noopener noreferrer"; page.append(ticket);
        }
        if (data.loops.length) {
          const section = el("section", "group"); section.append(el("h3", "as-is", "Open with " + data.title));
          const loops = el("ul", "loops");
          for (const loop of data.loops) {
            const row = el("li", "loop notes-readonly"), text = el("div", "lt");
            text.append(linked(inline(loop.text), data.resolve), el("div", "lm", [fmtDay(loop.date), loop.due ? "Due " + fmtDay(loop.due) : ""].filter(Boolean).join(", ")));
            row.append(text); loops.append(row);
          }
          section.append(loops); page.append(section);
        }
        page.append(el("p", "lm", `Mentioned in ${plural(data.count, "note")}`));
        page.append(mentions("Mentions", data.mentions, data.resolve));
      } else {
        const content = data.content.replace(/^(?:[ \t]*\r?\n)*# ([^\r\n]*)(?:\r?\n|$)/, (heading, title) =>
          title.trim().toLowerCase() === data.title.trim().toLowerCase() ? "" : heading);
        page.append(linked(md(content), data.resolve));
        page.append(mentions("Linked from", data.backlinks, data.resolve));
        page.append(chips("Links to", data.outlinks), chips("Related", data.related));
      }
      lit = litFor([graph?.nodes.find(node => node.id === data.id)?.label || data.title]);
      draw();
    } catch (error) {
      if (page.isConnected) page.replaceChildren(top, working("Couldn't open this note.", error.message, true, () => showNote(id)));
    }
  }

  async function library() {
    const page = el("section", "notes-page"), head = el("header", "head");
    head.append(el("h1", null, "Library"), el("p", null, "Open a note, person or topic."));
    const tabs = el("div", "notes-tabs"); tabs.setAttribute("role", "group"); tabs.setAttribute("aria-label", "Library sections");
    [["notes", "Notes"], ["entities", "People & topics"], ["research", "Research"], ["asks", "Asked"]].forEach(([id, label]) => {
      const b = button(label, () => {
        if (id === "research" || id === "asks") return go(id);
        tab = id; query = ""; library();
      });
      b.setAttribute("aria-pressed", String(id === tab)); tabs.append(b);
    });
    const filter = el("input", "filter"); filter.type = "search"; filter.placeholder = "Find a note, person or topic";
    filter.setAttribute("aria-label", "Filter library"); filter.value = query;
    head.append(filter);
    const folders = el("div", "notes-folders"), results = el("div");
    page.append(head, tabs, folders, results); render(page);
    results.append(el("p", "working", "Loading library…"));
    const activeTab = tab;
    try {
      const data = await api(activeTab === "notes" ? "/api/notes/list" : "/api/notes/entities");
      if (!page.isConnected) return;
      const items = activeTab === "notes" ? data.notes : data.entities;
      if (activeTab === "notes") updateCount(items.length);
      const fill = () => {
        query = filter.value;
        const needle = query.trim().toLowerCase();
        const matches = items.filter(item => (activeTab !== "notes" || !folder || item.folder === folder) && readable(`${item.title} ${item.folder} ${item.snippet || ""}`).toLowerCase().includes(needle));
        const list = el("ul", "rows");
        for (const item of matches) {
          const row = el("li"), b = button("", () => openNote(item.id), "");
          b.append(el("b", null, item.title), el("span", "when", activeTab === "notes" ? date(item.modified) : plural(item.count, "note")));
          b.append(el("span", "sub", activeTab === "notes" ? `${item.folder}: ${readable(item.snippet)}` : item.folder === "ticket" ? "Ticket" : "Person or topic"));
          row.append(b); lights(row, [item.title]); list.append(row);
        }
        results.replaceChildren(matches.length ? list : el("p", "nothing", items.length ? "No matches. Try another search." : "No notes here yet."));
      };
      if (activeTab === "notes") {
        const names = [...new Set(items.map(item => item.folder))].sort();
        if (!names.includes(folder)) folder = "";
        ["", ...names].forEach(name => {
          const b = button(name || "All folders", () => {
            folder = name;
            [...folders.children].forEach(chip => chip.setAttribute("aria-pressed", String(chip === b)));
            fill();
          });
          b.setAttribute("aria-pressed", String(name === folder)); folders.append(b);
        });
      }
      filter.oninput = fill; fill();
    } catch (error) {
      if (page.isConnected) results.replaceChildren(working("Couldn't load the library.", error.message, true, library));
    }
  }

  function updateCount(count) {
    noteCount = count;
    const badge = $("c-library"); if (badge) badge.textContent = String(count);
  }
  registerView("library", {render: library, count: () => noteCount, nav: "library"});
  addEventListener("DOMContentLoaded", () => {
    api("/api/notes/list").then(data => updateCount(data.notes.length)).catch(() => {});
  });
  return {openNote: showNote};
})();

function openNote(id) { return notesFeature.openNote(id); }
