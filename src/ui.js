import { profile, education, projects, experience, skills, sections } from "./content.js";

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

/* ---------------- content rendering ---------------- */

export function renderContent() {
  $("#heroBlurb").textContent =
    "Currently building ML systems and shipping production software — most recently payment " +
    "infrastructure at BTG Pactual and data tooling for 130+ partner companies at Reach Capital.";

  $("#aboutBody").textContent = profile.blurb;
  $("#year").textContent = new Date().getFullYear();

  $("#eduCard").innerHTML = `
    <div class="k">Education</div>
    <h3>${esc(education.school)}</h3>
    <div class="sub">${esc(education.degree)}</div>
    <div class="dates">${esc(education.dates)}</div>
    <div class="detail">${esc(education.detail)}</div>
  `;

  $("#projects").innerHTML = projects
    .map((p, i) => {
      const links = [
        p.href ? `<a href="${esc(p.href)}" target="_blank" rel="noopener">Live demo <span>→</span></a>` : "",
        p.repo ? `<a href="${esc(p.repo)}" target="_blank" rel="noopener">Source <span>→</span></a>` : "",
      ].join("");

      const hasCase = !!p.caseStudy;
      return `
      <article class="project reveal${hasCase ? " has-case" : ""}" data-delay="${i % 4}"
        data-id="${esc(p.id)}" tabindex="0"
        ${hasCase ? 'role="button" aria-label="Open case study: ' + esc(p.title) + '"' : ""}>
        <div class="project-top">
          <div class="num">${String(i + 1).padStart(2, "0")}</div>
          <div>
            <h3>${esc(p.title)}</h3>
            <span class="kicker">${esc(p.kicker)}</span>
          </div>
          <div class="project-meta">
            <span class="year">${esc(p.year)}</span>
            ${hasCase ? '<span class="cs-hint">Case study <b>→</b></span>' : ""}
          </div>
        </div>
        <div class="project-body"><div>
          <div class="project-inner">
            <div>
              <p>${esc(p.summary)}</p>
              <div class="stack">${p.stack.map((s) => `<span>${esc(s)}</span>`).join("")}</div>
              <div class="project-links">${links}</div>
            </div>
            <div class="metrics">
              ${p.metrics
                .map(
                  (m) =>
                    `<div class="metric"><strong>${esc(m.value)}</strong><span>${esc(m.label)}</span></div>`
                )
                .join("")}
            </div>
          </div>
        </div></div>
      </article>`;
    })
    .join("");

  $("#timeline").innerHTML = experience
    .map(
      (j, i) => `
      <div class="job reveal" data-delay="${i % 3}">
        <div class="job-when">
          ${esc(j.dates)}
          <span class="place">${esc(j.place)}</span>
        </div>
        <div>
          <h3>${esc(j.company)}</h3>
          <div class="role">${esc(j.role)}</div>
          <div class="tech">${esc(j.stack)}</div>
          <ul>${j.points.map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul>
        </div>
      </div>`
    )
    .join("");

  $("#skillsList").innerHTML = skills
    .map(
      (s, i) => `
      <div class="skill-group reveal" data-delay="${i % 4}">
        <h3>${esc(s.group)}</h3>
        <div class="skill-items">${s.items.map((it) => `<span>${esc(it)}</span>`).join("")}</div>
      </div>`
    )
    .join("");

  $("#contactLinks").innerHTML = profile.links
    .map(
      (l) => `
      <a href="${esc(l.href)}" ${l.href.startsWith("mailto") ? "" : 'target="_blank" rel="noopener"'}>
        <span class="k">${esc(l.label)}</span>
        <span>${esc(l.handle)}</span>
        <span class="arrow">→</span>
      </a>`
    )
    .join("");

  $("#rail").innerHTML = sections
    .map((s) => `<button data-target="${s.id}"><i></i>${esc(s.label)}</button>`)
    .join("");
}

/* ---------------- scroll-driven behaviour ---------------- */

const SHAPE_LABELS = {
  attention: "Self-attention",
  transformer: "Transformer",
  globe: "Globe",
};

// Camera constants, mirrored from scene/particles.js.
const CAM_Z = 26;
const FOV_RAD = (46 * Math.PI) / 180;

/**
 * Centre the particle field in the column CSS reserves on the right
 * (`section { padding-right: clamp(320px, 32vw, 540px) }`), converted from
 * screen pixels into world units. Below that breakpoint there is no spare
 * column, so the field stays centred and the scrim handles legibility.
 */
// Mirrors `section { padding-right: clamp(360px, 38vw, 620px) }`.
function reservedColumn() {
  const w = window.innerWidth;
  if (w < 1100) return null;
  return Math.min(620, Math.max(360, w * 0.38));
}

export function fieldOffsetX() {
  const reserved = reservedColumn();
  if (reserved === null) return 0;

  const w = window.innerWidth;
  const h = window.innerHeight;
  const centreFraction = (w - reserved / 2) / w - 0.5;
  const worldWidth = 2 * CAM_Z * Math.tan(FOV_RAD / 2) * (w / h);
  return centreFraction * worldWidth;
}

/**
 * The screen-space band over which particles fade in: fully transparent by
 * the time they reach the text, fully lit once past the content edge.
 */
export function fieldFadeZone() {
  const reserved = reservedColumn();
  if (reserved === null) return [0, 0]; // disabled

  // Particles are essentially transparent at the content edge and reach full
  // brightness a little way into the reserved column, so the ramp happens in
  // empty space rather than over body copy.
  const w = window.innerWidth;
  const contentEdgeNdc = (2 * (w - reserved)) / w - 1;
  return [contentEdgeNdc - 0.02, contentEdgeNdc + 0.2];
}

export function wireScroll(field, { lockProgress = false } = {}) {
  const railButtons = [...document.querySelectorAll(".rail button")];
  const sectionEls = sections.map((s) => document.getElementById(s.id));
  const bar = $("#progressBar");
  const topbar = $("#topbar");
  const hud = $("#hud");
  const hudShape = $("#hudShape");

  let lastScroll = window.scrollY;
  let ticking = false;

  function update() {
    ticking = false;
    const y = window.scrollY;
    const max = Math.max(1, document.body.scrollHeight - window.innerHeight);
    const f = Math.min(1, Math.max(0, y / max));

    bar.style.transform = `scaleX(${f})`;
    topbar.classList.toggle("stuck", y > 40);

    // Map page scroll onto the 0→2 morph, with a little hold at each end
    // so the attention grid and the globe get a moment to be themselves.
    const progress = Math.min(2, Math.max(0, f * 2.35 - 0.16));
    if (!lockProgress) field.setProgress(progress);

    // Pull the camera back slightly through the middle of the page, where
    // the transformer web is widest.
    field.setZoom(26 + Math.sin(f * Math.PI) * 6);

    field.setOffsetX(fieldOffsetX());
    field.setFadeZone(...fieldFadeZone());

    // Scroll momentum spins the field.
    field.addScrollImpulse(y - lastScroll);
    lastScroll = y;

    const shape =
      progress < 0.62 ? "attention" : progress < 1.5 ? "transformer" : "globe";
    if (hud.dataset.shape !== shape) {
      hud.dataset.shape = shape;
      hudShape.textContent = SHAPE_LABELS[shape];
    }

    // Active rail item = the section occupying the middle of the viewport.
    const mid = y + window.innerHeight * 0.4;
    let activeIndex = 0;
    sectionEls.forEach((el, i) => {
      if (el && el.offsetTop <= mid) activeIndex = i;
    });
    railButtons.forEach((b, i) => b.classList.toggle("active", i === activeIndex));
  }

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true }
  );
  window.addEventListener("resize", update);
  update();

  railButtons.forEach((b) =>
    b.addEventListener("click", () => {
      document.getElementById(b.dataset.target)?.scrollIntoView({ behavior: "smooth" });
    })
  );

  $("#hudCount").textContent = `${field.particleCount.toLocaleString()} particles`;
}

/* ---------------- reveal on scroll ---------------- */

export function wireReveals() {
  const els = [...document.querySelectorAll(".reveal")];
  const show = (el) => el.classList.add("in");

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          show(e.target);
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
  );

  els.forEach((el) => {
    // Reveal anything already on screen at load immediately, so the first
    // paint is never a blank section waiting on a scroll event.
    if (el.getBoundingClientRect().top < window.innerHeight) show(el);
    else io.observe(el);
  });

  // Failsafe: IntersectionObserver can silently not fire in a backgrounded or
  // occluded tab. Never let content stay stuck invisible — reveal everything
  // still hidden a few seconds in, regardless.
  setTimeout(() => els.forEach(show), 2500);
}

/* ---------------- cursor ---------------- */

export function wireCursor() {
  if (window.matchMedia("(hover: none)").matches) return;

  const ring = $("#cursor");
  const dot = $("#cursorDot");
  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  let rx = x;
  let ry = y;

  window.addEventListener(
    "pointermove",
    (e) => {
      x = e.clientX;
      y = e.clientY;
      dot.style.transform = `translate(${x}px, ${y}px)`;
    },
    { passive: true }
  );

  (function loop() {
    // The ring lags the dot slightly — reads as weight.
    rx += (x - rx) * 0.16;
    ry += (y - ry) * 0.16;
    ring.style.transform = `translate(${rx}px, ${ry}px)`;
    requestAnimationFrame(loop);
  })();

  const hotSelector = "a, button, .project, .skill-items span";
  document.addEventListener("pointerover", (e) => {
    if (e.target.closest(hotSelector)) ring.classList.add("hot");
  });
  document.addEventListener("pointerout", (e) => {
    if (e.target.closest(hotSelector)) ring.classList.remove("hot");
  });
}

/* ---------------- case-study overlay ---------------- */

const esc2 = esc; // alias for readability in template strings below

function flowHTML(flow) {
  if (!flow || !flow.length) return "";
  return (
    '<div class="cs-flow">' +
    flow
      .map(
        (s, i) =>
          `<div class="cs-stage"><span class="cs-stage-n">${String(i + 1).padStart(
            2,
            "0"
          )}</span><b>${esc2(s.label)}</b><span>${esc2(s.sub)}</span></div>` +
          (i < flow.length - 1 ? '<div class="cs-arrow" aria-hidden="true">→</div>' : "")
      )
      .join("") +
    "</div>"
  );
}

/**
 * Builds one reusable overlay and wires every project row to open its case
 * study. Hover still previews inline; a click dives into the full write-up.
 */
export function wireCaseStudies() {
  const byId = Object.fromEntries(projects.map((p) => [p.id, p]));

  const overlay = document.createElement("div");
  overlay.className = "cs-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="cs-backdrop"></div>
    <div class="cs-panel" role="document" tabindex="-1">
      <button class="cs-close" aria-label="Close case study">Close <span aria-hidden="true">✕</span></button>
      <div class="cs-body"></div>
    </div>`;
  document.body.appendChild(overlay);

  const panel = overlay.querySelector(".cs-panel");
  const body = overlay.querySelector(".cs-body");
  const closeBtn = overlay.querySelector(".cs-close");
  let lastFocus = null;

  function open(id) {
    const p = byId[id];
    if (!p || !p.caseStudy) return;
    const cs = p.caseStudy;

    body.innerHTML = `
      <header class="cs-head">
        <div class="cs-kicker">${esc2(p.kicker)} · ${esc2(p.year)}</div>
        <h2>${esc2(p.title)}</h2>
        <div class="stack">${p.stack.map((s) => `<span>${esc2(s)}</span>`).join("")}</div>
      </header>
      <div class="cs-metrics">${p.metrics
        .map(
          (m) =>
            `<div class="metric"><strong>${esc2(m.value)}</strong><span>${esc2(
              m.label
            )}</span></div>`
        )
        .join("")}</div>
      <div class="cs-sec"><h3>The problem</h3><p>${esc2(cs.problem)}</p></div>
      ${cs.flow ? `<div class="cs-sec"><h3>How it works</h3>${flowHTML(cs.flow)}</div>` : ""}
      <div class="cs-sec"><h3>Key decision</h3>
        <h4>${esc2(cs.decision.title)}</h4><p>${esc2(cs.decision.body)}</p></div>
      <div class="cs-sec"><h3>Result</h3><p>${esc2(cs.result)}</p></div>
      <div class="cs-links">
        ${
          p.href
            ? `<a href="${esc2(p.href)}" target="_blank" rel="noopener">Live demo <span>→</span></a>`
            : ""
        }
        ${
          p.repo
            ? `<a href="${esc2(p.repo)}" target="_blank" rel="noopener">Source <span>→</span></a>`
            : ""
        }
      </div>`;

    lastFocus = document.activeElement;
    overlay.hidden = false;
    document.body.classList.add("cs-locked");
    panel.scrollTop = 0;
    requestAnimationFrame(() => overlay.classList.add("show"));
    closeBtn.focus();
  }

  function close() {
    overlay.classList.remove("show");
    document.body.classList.remove("cs-locked");
    setTimeout(() => {
      overlay.hidden = true;
    }, 380);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  closeBtn.addEventListener("click", close);
  overlay.querySelector(".cs-backdrop").addEventListener("click", close);

  // Keep Tab within the overlay while it's open (simple focus trap).
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") return close();
    if (e.key !== "Tab") return;
    const focusables = overlay.querySelectorAll("button, a[href]");
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  document.querySelectorAll(".project.has-case").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("a")) return; // let demo/source links through
      open(card.dataset.id);
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open(card.dataset.id);
      }
    });
  });
}
