document.documentElement.classList.add("js");
const panes = document.querySelectorAll("[data-pane]");
document.querySelectorAll("[data-show]").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll("[data-show]").forEach(x => x.setAttribute("aria-pressed", x === b));
  panes.forEach(p => p.toggleAttribute("hidden", p.dataset.pane !== b.dataset.show));
}));

// the promise travels: steps light up one after another the first time the story scrolls into view
const demo = document.getElementById("demo"), receipt = document.querySelector(".receipt"), replay = document.getElementById("replay");
if (demo) {
  const steps = [...demo.children], still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, still ? 0 : ms));
  const play = () => {
    timers.forEach(clearTimeout); timers = [];
    demo.classList.remove("play"); receipt.classList.remove("show"); replay.hidden = true;
    steps.forEach(s => s.classList.remove("on", "done"));
    at(200, () => steps[0].classList.add("on"));
    at(900, () => demo.classList.add("play"));
    at(1500, () => steps[1].classList.add("on"));
    at(2400, () => { steps[2].classList.add("on"); });
    at(2800, () => steps[2].classList.add("done"));
    at(3100, () => { receipt.classList.add("show"); replay.hidden = false; });
  };
  replay.addEventListener("click", play);
  if ("IntersectionObserver" in window) {
    const seen = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { seen.disconnect(); play(); } }, { threshold: 0.4 });
    seen.observe(demo);
  } else play();
}

// themes: the swatches restyle this page and swap every app shot for the same screen in that theme
const shots = () => document.querySelectorAll("img[data-shot]"), theme = () => document.documentElement.dataset.theme;
const reshoot = () => shots().forEach(i => { i.src = `img/app/${theme()}/${i.dataset.shot}.webp`; });
document.querySelectorAll("[data-set-theme]").forEach(b => b.addEventListener("click", () => {
  document.documentElement.dataset.theme = b.dataset.setTheme;
  document.querySelectorAll("[data-set-theme]").forEach(x => x.setAttribute("aria-checked", x === b));
  reshoot(); dispatchEvent(new Event("wake-theme"));
}));

// the tour: a tab picks the screen; arrow keys move between tabs
const tabs = [...document.querySelectorAll(".tour-list [role=tab]")], tourImg = document.getElementById("tour-img"), cap = document.createElement("figcaption");
document.getElementById("tour-shot").append(cap);
const pickTab = (t, focus) => {
  tabs.forEach(x => { x.setAttribute("aria-selected", x === t); x.tabIndex = x === t ? 0 : -1; });
  tourImg.dataset.shot = t.dataset.shot; tourImg.alt = t.dataset.alt; tourImg.src = `img/app/${theme()}/${t.dataset.shot}.webp`;
  cap.textContent = t.querySelector("span").textContent;
  if (focus) t.focus();
};
tabs.forEach((t, i) => {
  t.addEventListener("click", () => pickTab(t));
  t.addEventListener("keydown", e => { const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]; if (d) { e.preventDefault(); pickTab(tabs[(i + d + tabs.length) % tabs.length], true); } });
});
if (tabs.length) cap.textContent = tabs[0].querySelector("span").textContent;
