import "./style.css";
import { createField } from "./scene/particles.js";
import {
  renderContent,
  wireScroll,
  wireReveals,
  wireCursor,
  wireCaseStudies,
  wireAttentionLab,
  fieldOffsetX,
  fieldFadeZone,
} from "./ui.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

renderContent();
wireReveals();
wireCursor();
wireCaseStudies();
wireAttentionLab();

let field;
try {
  // `?shape=attention|transformer|globe` renders a given morph state on load — a dev aid
  // for checking composition without having to scroll there.
  const debugShape = import.meta.env.DEV
    ? ["transformer", "network", "globe"].indexOf(
        new URLSearchParams(location.search).get("shape")
      )
    : -1;

  field = createField(document.getElementById("field"), {
    reducedMotion,
    offsetX: fieldOffsetX(),
    fadeZone: fieldFadeZone(),
    initialProgress: debugShape >= 0 ? debugShape : 0,
  });
  wireScroll(field, { lockProgress: debugShape >= 0 });
  if (import.meta.env.DEV) window.__field = field;
} catch (err) {
  // No WebGL (or it failed) — the page is fully readable without it.
  console.warn("WebGL field unavailable, falling back to the flat layout.", err);
  document.getElementById("field")?.remove();
  document.getElementById("hud")?.remove();
  document.body.style.background =
    "radial-gradient(120% 90% at 50% 0%, #0d1520 0%, #05070a 60%)";
}

// Drop the veil once we've painted a frame — but never depend on rAF alone,
// which is throttled to zero in a background tab and would strand the veil.
const dropVeil = () => document.getElementById("veil")?.classList.add("gone");
requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(dropVeil, 420)));
setTimeout(dropVeil, 1600);

// Pause the render loop when the tab is hidden — no reason to burn a GPU
// on a page nobody is looking at.
document.addEventListener("visibilitychange", () => {
  field?.setOpacity(document.hidden ? 0 : 1);
});
