// Wake's own menus: every <select> and every input with a datalist gets a styled list instead of the OS one.
(() => {
  let menu = null, anchor = null, pickFn = null;
  const close = () => { if (!menu) return; menu.remove(); menu = null; anchor?.setAttribute("aria-expanded", "false"); anchor = null; };
  const items = () => [...menu.querySelectorAll("[role=option]")];
  const mark = i => { const all = items(); if (!all.length) return; i = (i + all.length) % all.length; all.forEach((o, n) => o.classList.toggle("on", n === i)); all[i].scrollIntoView({ block: "nearest" }); anchor.setAttribute("aria-activedescendant", all[i].id); };
  const at = () => items().findIndex(o => o.classList.contains("on"));

  function open(from, options, current, pick) {
    close();
    if (!options.length) return;
    anchor = from; pickFn = pick;
    menu = el("div", "menu"); menu.setAttribute("role", "listbox"); menu.id = "wake-menu";
    options.forEach(([value, label], i) => {
      const o = el("div", value === current ? "sel" : null, label); o.setAttribute("role", "option"); o.id = "wake-opt-" + i; o.dataset.value = value;
      o.setAttribute("aria-selected", String(value === current));
      o.onpointerdown = e => { e.preventDefault(); pick(value); close(); };
      o.onpointermove = () => mark(i);
      menu.append(o);
    });
    (from.closest("dialog") || document.body).append(menu);
    const r = from.getBoundingClientRect(), h = Math.min(menu.scrollHeight, 320), up = r.bottom + h + 12 > innerHeight && r.top > h + 12;
    Object.assign(menu.style, { left: Math.max(8, Math.min(r.left, innerWidth - Math.max(r.width, 180) - 8)) + "px", minWidth: r.width + "px", top: (up ? r.top - h - 6 : r.bottom + 6) + "px" });
    from.setAttribute("aria-expanded", "true"); from.setAttribute("aria-controls", menu.id);
    mark(Math.max(0, options.findIndex(([v]) => v === current)));
  }
  // true when the key was used by the open menu
  function keys(e) {
    if (!menu) return false;
    if (e.key === "ArrowDown") mark(at() + 1); else if (e.key === "ArrowUp") mark(at() - 1);
    else if (e.key === "Home") mark(0); else if (e.key === "End") mark(-1);
    else if (e.key === "Enter" || (e.key === " " && anchor.tagName === "BUTTON")) { const o = items()[at()]; if (o) pickFn(o.dataset.value); close(); }
    else if (e.key === "Escape" || e.key === "Tab") { close(); if (e.key === "Tab") return false; e.stopPropagation(); }
    else return false;
    if (e.key !== "Tab") e.preventDefault();
    return true;
  }
  addEventListener("pointerdown", e => { if (menu && !menu.contains(e.target) && !anchor.contains(e.target)) close(); }, true);
  addEventListener("resize", close);
  addEventListener("scroll", e => { if (menu && e.target !== menu) close(); }, true);

  function select(sel) {
    if (sel.wake) return;
    const b = el("button", "sel-btn " + sel.className), text = el("span");
    b.type = "button"; b.setAttribute("aria-haspopup", "listbox"); b.setAttribute("aria-expanded", "false");
    b.setAttribute("role", "combobox");
    if (sel.getAttribute("aria-label")) b.setAttribute("aria-label", sel.getAttribute("aria-label"));
    const sync = () => { text.textContent = sel.selectedOptions[0]?.textContent || ""; b.disabled = sel.disabled; };
    const opts = () => [...sel.options].map(o => [o.value, o.textContent]);
    const pick = v => { if (sel.value === v) return; sel.value = v; sync(); sel.dispatchEvent(new Event("change", { bubbles: true })); };
    b.append(text); sync();
    b.onclick = () => (menu && anchor === b ? close() : (sync(), open(b, opts(), sel.value, pick)));
    b.onkeydown = e => {
      if (keys(e)) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(b, opts(), sel.value, pick); }
      else if (e.key.length === 1 && /\S/.test(e.key)) { const hit = opts().find(([, l]) => l.toLowerCase().startsWith(e.key.toLowerCase())); if (hit) pick(hit[0]); }
    };
    b.onblur = () => { if (anchor === b) close(); };
    sel.addEventListener("change", sync);
    new MutationObserver(sync).observe(sel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["disabled"] });
    sel.wake = b; sel.hidden = true; sel.focus = () => b.focus();
    sel.after(b);
  }

  function suggest(input) {
    if (input.wake) return;
    const list = document.getElementById(input.getAttribute("list"));
    if (!list) return;
    input.wake = true; input.removeAttribute("list"); input.setAttribute("role", "combobox"); input.setAttribute("aria-autocomplete", "list"); input.setAttribute("aria-expanded", "false");
    const show = () => {
      const q = input.value.trim().toLowerCase(), all = [...list.options].map(o => o.value).filter(v => !q || v.toLowerCase().includes(q)).slice(0, 30);
      if (all.length === 1 && all[0].toLowerCase() === q) return close();
      open(input, all.map(v => [v, v]), null, v => { input.value = v; input.dispatchEvent(new Event("input", { bubbles: true })); });
      if (menu) { items().forEach(o => o.classList.remove("on")); input.removeAttribute("aria-activedescendant"); }
    };
    input.addEventListener("input", show); input.addEventListener("click", () => menu || show());
    input.addEventListener("blur", () => { if (anchor === input) close(); });
    input.addEventListener("keydown", e => { if (e.key === "Enter" && menu && at() < 0) return close(); if (!keys(e) && e.key === "ArrowDown" && !menu) show(); });
  }

  const scan = root => { root.querySelectorAll?.("select").forEach(select); root.querySelectorAll?.("input[list]").forEach(suggest); };
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType !== 1) return; if (n.matches("select")) select(n); else if (n.matches("input[list]")) suggest(n); else scan(n); })))
    .observe(document.body, { childList: true, subtree: true });
  scan(document);
})();
