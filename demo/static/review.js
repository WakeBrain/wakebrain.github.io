(() => {
  const storage = {
    get(key) { try { return localStorage.getItem("review-" + key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem("review-" + key, value); } catch {} }
  };
  const day = () => new Intl.DateTimeFormat("en-CA", {year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date());
  const button = (text, action, primary = false) => {
    const node = el("button", primary ? "btn primary" : "btn", text);
    node.type = "button";
    node.onclick = async () => {
      if (node.disabled) return;
      const buttons = [...(node.closest(".acts")?.querySelectorAll("button") || [node])];
      const disabled = buttons.map(item => item.disabled);
      buttons.forEach(item => { item.disabled = true; });
      try { await action(node); } catch (error) { toast(error.message); }
      finally { buttons.forEach((item, index) => { item.disabled = disabled[index]; }); }
    };
    return node;
  };
  const post = (path, body) => api(path, {method: "POST", body: JSON.stringify(body)});
  let session = null;

  function steps(queue) {
    return [
      ...queue.loops.map(item => ({kind: "loop", item})),
      ...queue.projects.map(item => ({kind: "project", item})),
      ...queue.ideas.map(item => ({kind: "idea", item}))
    ];
  }

  async function reset() {
    const host = el("section", "rv-reset");
    host.append(el("p", "working", "Loading your reset…")); render(host);
    try {
      const queue = await api("/api/review/queue");
      if (!host.isConnected) return;
      if (!session) session = {steps: steps(queue), wins: queue.wins, hidden: queue.hidden, at: 0, cleared: 0};
      if (session.pending) {
        if (!queue.ideas.some(item => item.id === session.pending)) { session.at++; session.cleared++; }
        session.pending = null;
      }
      paint(host);
    } catch (error) {
      if (host.isConnected) host.replaceChildren(el("p", "nothing", error.message), button("Try again", reset));
    }
  }

  function paint(host) {
    const current = session;
    const total = current.steps.length + (current.wins.length ? 1 : 0);
    const finish = () => {
      storage.set("completed", day());
      const cleared = current.cleared;
      session = null;
      host.replaceChildren(el("h1", null, `Done. You cleared ${plural(cleared, "thing")}.`),
        ...(current.hidden ? [el("p", "lm", `${plural(current.hidden, "older to-do")} not shown here or in NOW.md. See them in a terminal: brain todos --all`)] : []),
        button("Back to Today", () => go("today"), true));
    };
    if (current.at >= total) { finish(); return; }
    const label = el("p", "lm", `${current.at + 1} of ${total}`);
    const progress = el("progress"); progress.max = total; progress.value = current.at;
    progress.setAttribute("aria-label", "Weekly reset progress");
    const actions = el("div", "acts");
    host.replaceChildren(label, progress);
    const advance = (cleared = false) => {
      current.at++;
      if (cleared) current.cleared++;
      paint(host);
    };
    if (current.at === current.steps.length) {
      host.append(el("h1", null, `${plural(current.wins.length, "to-do")} closed this week`));
      const list = el("ul", "rv-wins");
      current.wins.slice(0, 5).forEach(win => {
        const row = el("li"), {what, receipt} = doneParts(win);
        row.append(inline(what));
        if (receipt) row.append(el("span", "lm", receipt));
        list.append(row);
      });
      if (current.wins.length > 5) host.append(el("p", "lm", "Your five latest wins"));
      host.append(list);
      actions.append(button("Finish reset", finish, true));
    } else {
      const {kind, item} = current.steps[current.at];
      const title = el("h1", "as-is"); title.tabIndex = -1;
      title.append(inline(kind === "project" ? item.slug : item.text));
      host.append(el("p", "lm", kind === "loop" ? "Still worth doing?" : kind === "project" ? `No activity for ${item.idle_days} days` : "An idea waiting in your Inbox"), title);
      if (kind === "loop") {
        const close = button("Close", trigger => {
          actions.remove();
          const formHost = el("div"); host.append(formHost);
          closeForm(formHost, item, state => {
            brain = state;
            advance(true);
            refreshBrain().catch(error => toast(error.message));
          }, trigger);
          const cancel = formHost.querySelector('button[type="button"]');
          cancel.onclick = () => { formHost.remove(); host.append(actions); trigger.focus(); };
        }, true);
        close.disabled = !item.key;
        if (!item.key) host.append(el("p", "lm", "This to-do needs a unique key before it can close."));
        actions.append(close, button("Keep", () => advance()), button("Ask about it", () => askAbout(item.text)));
      } else if (kind === "project") {
        host.append(inline(item.text));
        actions.append(button("Archive", async () => {
          await post("/api/projects/archive", {slug: item.slug, archived: true}); advance(true);
        }, true), button("Keep", () => advance()));
      } else {
        actions.append(button("Triage in Inbox", () => {
          current.pending = item.id;
          go("inbox"); toast("After triage, return to Today and choose Continue reset.");
        }, true), button("Delete", async () => {
          await post("/api/inbox/delete", {id: item.id}); advance(true);
        }));
      }
      title.focus();
    }
    host.append(actions);
  }

  EXT.today.push(() => {
    const today = day(), last = storage.get("completed");
    if (storage.get("snoozed") === today || (last && /^\d{4}-\d{2}-\d{2}$/.test(last) &&
        (Date.parse(today) - Date.parse(last)) / 86400000 < 6)) return null;
    const host = el("section", "now rv-card"); host.hidden = true;
    api("/api/review/queue").then(queue => {
      if (!host.isConnected) return;
      const count = steps(queue).length;
      if (!count) return;
      const counts = [[queue.loops.length, "old to-do"], [queue.projects.length, "idle project"], [queue.ideas.length, "idea"]]
        .filter(([n]) => n > 0).map(([n, label]) => plural(n, label));
      const waiting = counts.length > 1 ? counts.slice(0, -1).join(", ") + " and " + counts.at(-1) : counts[0];
      host.hidden = false;
      host.append(el("h2", null, "Weekly reset, about 5 minutes"),
        el("p", null, `${waiting} ${count === 1 ? "is" : "are"} waiting.`));
      const actions = el("div", "acts");
      actions.append(button(session ? "Continue reset" : "Start", () => go("reset"), true), button("Not now", () => {
        storage.set("snoozed", today); host.remove();
      }));
      host.append(actions);
    }).catch(error => {
      if (host.isConnected) { host.hidden = false; host.append(el("p", "nothing", error.message), button("Open reset", () => go("reset"))); }
    });
    return host;
  });

  EXT.today.push(() => {
    const host = el("section", "now rv-card"); host.hidden = true;
    api(`/api/review/past?n=5&day=${day()}`).then(data => {
      if (!host.isConnected || !data.items.length) return;
      let at = 0;
      const show = () => {
        const item = data.items[at];
        const text = el("p"); text.append(inline(item.text));
        const date = new Date(item.date + "T12:00:00").toLocaleDateString("en-IN", {day: "numeric", month: "short"});
        host.replaceChildren(el("h2", null, "From your past"), el("div", "lm", "From " + date), text, el("span", "rv-chip", item.link));
        const actions = el("div", "acts");
        if (typeof openNote === "function") actions.append(button("Open", () => openNote(item.id), true));
        actions.append(button("Ask about it", () => askAbout(item.text)));
        if (data.items.length > 1) actions.append(button("Show another", () => { at = (at + 1) % data.items.length; show(); }));
        host.append(actions); host.hidden = false;
      };
      show();
    }).catch(() => {});
    return host;
  });
  registerView("reset", {render: reset, nav: "today"});
})();
