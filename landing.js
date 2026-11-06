const panes = document.querySelectorAll("[data-pane]");
document.querySelectorAll("[data-show]").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll("[data-show]").forEach(x => x.setAttribute("aria-pressed", x === b));
  panes.forEach(p => p.toggleAttribute("hidden", p.dataset.pane !== b.dataset.show));
}));
