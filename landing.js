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
