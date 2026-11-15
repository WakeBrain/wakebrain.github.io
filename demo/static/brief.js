(() => {

  EXT.today.push(() => {
    const host = el("section", "now bf-card");
    host.hidden = true;
    api("/api/brief").then(data => {
      if (!host.isConnected || !data.md?.trim()) return;
      const body = md(data.md);
      body.classList.add("bf-preview");
      body.id = "bf-morning-brief";
      const toggle = el("button", "btn bf-toggle", "Show all");
      toggle.type = "button";
      toggle.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-controls", body.id);
      toggle.onclick = () => {
        const open = body.classList.toggle("bf-open");
        toggle.textContent = open ? "Show less" : "Show all";
        toggle.setAttribute("aria-expanded", String(open));
      };
      host.append(el("h2", null, "Morning brief"), body, toggle);
      host.hidden = false;
      requestAnimationFrame(() => {
        if (host.isConnected) toggle.hidden = body.children.length <= 4;
      });
    }).catch(() => {});
    return host;
  });
})();
