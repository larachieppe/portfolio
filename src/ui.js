import { profile, education, projects, experience, skills, sections } from "./content.js";
import { fetchRepoMeta, relativeTime, topLanguages } from "./github.js";
import { tokenize, selfAttention, HEADS } from "./attention.js";

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

/* ---------------- content rendering ---------------- */

export function renderContent() {
  $("#heroBlurb").textContent =
    "I build production ML, data, and infrastructure systems. Recent work includes payment " +
    "infrastructure at BTG Pactual and data tooling supporting 130+ companies in Reach " +
    "Capital’s portfolio.";

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
  transformer: "Transformer",
  network: "Network",
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
      progress < 0.62 ? "transformer" : progress < 1.5 ? "network" : "globe";
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

/* ---------------- interactive self-attention lab ---------------- */

const SVGNS = "http://www.w3.org/2000/svg";

export function wireAttentionLab() {
  const input = $("#attnInput");
  const sentence = $("#attnSentence");
  const readout = $("#attnReadout");
  const heat = $("#attnHeat");
  const headsBox = $("#attnHeads");
  const causalBox = $("#attnCausal");
  if (!input || !sentence) return;

  const DEFAULT = "The animal didn't cross the road because it was too tired";
  input.value = DEFAULT;

  let head = 0;
  let causal = false;
  let focus = 0; // which word we're reading the attention *of*
  let data = null;

  // Head selector chips.
  for (let h = 0; h < HEADS; h++) {
    const b = document.createElement("button");
    b.className = "lab-head" + (h === 0 ? " on" : "");
    b.textContent = `Head ${h + 1}`;
    b.addEventListener("click", () => {
      head = h;
      [...headsBox.children].forEach((c, i) => c.classList.toggle("on", i === h));
      render();
    });
    headsBox.appendChild(b);
  }

  causalBox.addEventListener("change", () => {
    causal = causalBox.checked;
    render();
  });

  // setTimeout (not rAF) so it keeps working even under tab throttling.
  let debounce = 0;
  input.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(render, 70);
  });

  let rz = 0;
  window.addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(drawArcs, 80);
  });

  // The word each token attends to most strongly (excluding itself) — used to
  // pick an interesting default focus so the first thing you see is a real
  // connection, e.g. "it" → "animal".
  function strongestQuery(weights) {
    let best = -1;
    let bi = 0;
    for (let i = 0; i < weights.length; i++) {
      for (let j = 0; j < weights.length; j++) {
        if (j !== i && weights[i][j] > best) {
          best = weights[i][j];
          bi = i;
        }
      }
    }
    return bi;
  }

  function render() {
    const tokens = tokenize(input.value);
    if (!tokens.length) {
      sentence.innerHTML = '<span class="attn-empty">Type a sentence above…</span>';
      heat.innerHTML = "";
      readout.textContent = "";
      data = null;
      return;
    }
    const { weights } = selfAttention(tokens, { head, causal });
    data = { tokens, weights };

    sentence.innerHTML =
      tokens
        .map(
          (t, i) =>
            `<button class="attn-word" data-i="${i}" type="button">${esc(t)}</button>`
        )
        .join("") + `<svg class="attn-arcs" aria-hidden="true"></svg>`;

    sentence.querySelectorAll(".attn-word").forEach((el) => {
      const i = +el.dataset.i;
      const set = () => {
        focus = i;
        paint();
      };
      el.addEventListener("mouseenter", set);
      el.addEventListener("focus", set);
    });

    renderHeat(tokens, weights);
    focus = Math.min(focus, tokens.length - 1);
    if (focus === 0) focus = strongestQuery(weights);
    paint();
  }

  // Light up the sentence for the currently focused word.
  function paint() {
    if (!data) return;
    const { tokens, weights } = data;
    const row = weights[focus];
    const max = Math.max(...row);

    sentence.querySelectorAll(".attn-word").forEach((el) => {
      const j = +el.dataset.i;
      const rel = row[j] / (max || 1);
      // Gamma the glow so the few strongly-attended words pop and the diffuse
      // long tail of an untrained distribution stays quiet.
      el.style.setProperty("--w", Math.pow(rel, 1.7).toFixed(3));
      el.classList.toggle("is-query", j === focus);
      el.classList.toggle("attends", j !== focus && rel > 0.42);
    });

    drawArcs();

    let bj = -1;
    let bw = -1;
    row.forEach((w, j) => {
      if (j !== focus && w > bw) {
        bw = w;
        bj = j;
      }
    });
    readout.innerHTML =
      bj >= 0
        ? `<b>“${esc(tokens[focus])}”</b> attends most to <b>“${esc(
            tokens[bj]
          )}”</b> <span class="attn-pct">${(bw * 100).toFixed(0)}%</span>`
        : "";

    heat.querySelectorAll(".attn-cell").forEach((c) => {
      c.classList.toggle("row-on", +c.dataset.i === focus);
    });
  }

  // Arcs from the focused word up and over to the words it attends to.
  function drawArcs() {
    const svg = sentence.querySelector(".attn-arcs");
    if (!svg || !data) return;
    const r = sentence.getBoundingClientRect();
    svg.setAttribute("width", r.width);
    svg.setAttribute("height", r.height);
    svg.innerHTML = "";

    const words = [...sentence.querySelectorAll(".attn-word")];
    if (!words[focus]) return;
    const centreTop = (el) => {
      const b = el.getBoundingClientRect();
      return { x: b.left + b.width / 2 - r.left, y: b.top - r.top };
    };

    // Arcs read cleanly only on a single line; when the sentence wraps
    // (narrow screens) the word-glow carries it, so skip the arcs.
    const tops = words.map((w) => w.getBoundingClientRect().top);
    if (Math.max(...tops) - Math.min(...tops) > 12) return;

    const from = centreTop(words[focus]);
    const row = data.weights[focus];
    const max = Math.max(...row);

    row.forEach((w, j) => {
      if (j === focus) return;
      const rel = w / (max || 1);
      if (rel < 0.14) return;
      const to = centreTop(words[j]);
      const lift = Math.min(64, 22 + Math.abs(to.x - from.x) * 0.17);
      const my = Math.min(from.y, to.y) - lift;
      const p = document.createElementNS(SVGNS, "path");
      p.setAttribute("d", `M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${my} ${to.x} ${to.y}`);
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", rel > 0.6 ? "var(--mint)" : "var(--blue)");
      p.setAttribute("stroke-width", (0.6 + rel * 2.6).toFixed(2));
      p.setAttribute("stroke-linecap", "round");
      p.style.opacity = (0.25 + rel * 0.6).toFixed(2);
      svg.appendChild(p);
    });
  }

  // Secondary "full matrix" view — now with a token label per row so it reads
  // as word→word attention, not an unlabelled grid.
  function renderHeat(tokens, weights) {
    const n = tokens.length;
    let html = "";
    for (let i = 0; i < n; i++) {
      const max = Math.max(...weights[i]);
      let cells = "";
      for (let j = 0; j < n; j++) {
        const a = (weights[i][j] / (max || 1)).toFixed(2);
        cells += `<div class="attn-cell" data-i="${i}" data-j="${j}" title="“${esc(
          tokens[i]
        )}” → “${esc(tokens[j])}”: ${(weights[i][j] * 100).toFixed(
          0
        )}%" style="background:rgba(75,240,192,${a})"></div>`;
      }
      html +=
        `<div class="attn-heat-row" data-i="${i}">` +
        `<span class="attn-rlabel">${esc(tokens[i])}</span>` +
        `<div class="attn-heat-cells" style="grid-template-columns:repeat(${n},1fr)">${cells}</div>` +
        `</div>`;
    }
    heat.innerHTML = html;
  }

  render();
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
      ${
        p.repo
          ? '<div class="cs-sec cs-repo" hidden><h3>Repository</h3><div class="cs-repo-inner"></div></div>'
          : ""
      }
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

    if (p.repo) populateRepo(p.repo);
  }

  // Fill the Repository section with live GitHub data. Fails soft: on any
  // error the section simply stays hidden. The section node is captured
  // synchronously, so a fast re-open to another project can't cross-fill.
  async function populateRepo(repoUrl) {
    const sec = body.querySelector(".cs-repo");
    if (!sec) return;
    const meta = await fetchRepoMeta(repoUrl);
    if (!meta || !sec.isConnected) return;

    const langs = topLanguages(meta.languages, 4);
    const colors = ["var(--mint)", "var(--blue)", "var(--violet)", "var(--hot)", "#586074"];
    const bar = langs
      .map(
        (l, i) =>
          `<span class="cs-langseg" style="width:${l.pct.toFixed(1)}%;background:${
            colors[i % colors.length]
          }"></span>`
      )
      .join("");
    const legend = langs
      .map(
        (l, i) =>
          `<span class="cs-lang"><i style="background:${colors[i % colors.length]}"></i>${esc2(
            l.name
          )} ${Math.round(l.pct)}%</span>`
      )
      .join("");
    const stars =
      meta.stars > 0
        ? `<div class="cs-repo-stat"><strong>★ ${meta.stars}</strong><span>stars</span></div>`
        : "";

    sec.querySelector(".cs-repo-inner").innerHTML = `
      <div class="cs-repo-top">
        <span class="cs-repo-name">${esc2(meta.fullName)}</span>
        <span class="cs-repo-updated"><i class="cs-live"></i>Updated ${esc2(
          relativeTime(meta.pushedAt)
        )}</span>
      </div>
      ${stars ? `<div class="cs-repo-stats">${stars}</div>` : ""}
      ${
        bar
          ? `<div class="cs-langbar">${bar}</div><div class="cs-langlegend">${legend}</div>`
          : ""
      }`;
    sec.hidden = false;
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
