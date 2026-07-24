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

      return `
      <article class="project reveal" data-delay="${i % 4}" tabindex="0">
        <div class="project-top">
          <div class="num">${String(i + 1).padStart(2, "0")}</div>
          <div>
            <h3>${esc(p.title)}</h3>
            <span class="kicker">${esc(p.kicker)}</span>
          </div>
          <div class="year">${esc(p.year)}</div>
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
      <div class="skill-row reveal" data-delay="${i % 4}">
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

const SHAPE_LABELS = { helix: "α-Helix", lattice: "Neural lattice", globe: "Globe" };

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
    // so the helix and the globe get a moment to be themselves.
    const progress = Math.min(2, Math.max(0, f * 2.35 - 0.16));
    if (!lockProgress) field.setProgress(progress);

    // Pull the camera back slightly through the middle of the page, where
    // the lattice is widest.
    field.setZoom(26 + Math.sin(f * Math.PI) * 6);

    field.setOffsetX(fieldOffsetX());
    field.setFadeZone(...fieldFadeZone());

    // Scroll momentum spins the field.
    field.addScrollImpulse(y - lastScroll);
    lastScroll = y;

    const shape = progress < 0.62 ? "helix" : progress < 1.5 ? "lattice" : "globe";
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
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
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

/* ---------------- touch: tap a project to expand ---------------- */

export function wireProjectTaps() {
  document.querySelectorAll(".project").forEach((card) => {
    card.addEventListener("click", (e) => {
      // Let real links through untouched.
      if (e.target.closest("a")) return;
      card.classList.toggle("open");
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        card.classList.toggle("open");
      }
    });
  });
}
