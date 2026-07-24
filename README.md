# Lara Chieppe — portfolio

A single-page portfolio built around one live WebGL particle field that morphs
as you scroll: an **α-helix** for the bioengineering work, a **neural lattice**
for the ML work, and a **globe** to close. 34,000 points, one draw call, custom
GLSL.

Dark editorial layout — Instrument Serif display type over JetBrains Mono
metadata — with the content driven from a single data file.

## Run it

```bash
npm install && npm run dev
```

Then open <http://localhost:5178>.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on :5178, served from `/` |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built site on :5179, at the real base path |

## How the 3D works

Everything lives in `src/scene/`.

- **`shapes.js`** generates three position sets — `helix`, `lattice`, `globe` —
  each a `Float32Array` of `count * 3`, in the *same particle order*. Because
  the ordering matches, the shader can linearly interpolate any shape into any
  other. A seeded PRNG keeps the layout identical across reloads.
- **`particles.js`** uploads all three as vertex attributes and blends between
  them entirely on the GPU. A `uProgress` uniform runs 0 → 1 → 2 across the
  page. Each particle eases on a slightly different delay, so the field morphs
  as a wave rather than snapping; gradient-noise curl displacement peaks
  mid-transition, so shapes scatter and re-form instead of sliding.

Interaction: the pointer is raycast onto the z=0 plane and pushes nearby points
away; scroll momentum spins the field; the camera drifts with the cursor.

### Two details worth knowing

**The field never covers text.** On screens wider than 1100px, CSS reserves a
right-hand column (`section { padding-right: clamp(360px, 38vw, 620px) }`) and
the field is centred in it. That alone isn't enough — mid-morph turbulence
throws particles well outside the shape's resting bounds — so the vertex shader
also fades any particle by its **screen-space x position**, reaching ~2% alpha
at the content edge. `fieldOffsetX()` and `fieldFadeZone()` in `src/ui.js`
derive both numbers from the same reserved width, so the CSS and the WebGL can't
drift apart.

**Motion is frame-rate independent.** All easing uses
`1 - exp(-rate * dt)` rather than a fixed per-frame fraction, so the morph takes
the same wall-clock time on a 60Hz and a 120Hz display.

## Graceful degradation

- **No WebGL** → the canvas is removed and the layout falls back to a static
  gradient. Every word on the page is still readable.
- **`prefers-reduced-motion`** → no pointer repulsion, minimal spin, animations
  reduced to near-zero duration.
- **Phones** → particle budget drops to 14,000, bloom post-processing is
  skipped, the field re-centres, and project cards render expanded rather than
  on hover.

## Editing the content

All copy lives in [`src/content.js`](src/content.js) — profile, education,
projects, experience, skills, and the section registry. The DOM is generated
from it in `src/ui.js`; there is no content in `index.html` beyond the section
shells.

## Deploying

The build defaults to a GitHub Pages **project** base path of `/portfolio/`:

```bash
npm run build          # → dist/, expects to be served at /portfolio/
BASE=/ npm run build   # → root deploy (Netlify, Vercel, custom domain)
```

For GitHub Pages, push `dist/` to the `gh-pages` branch (or point a Pages
action at it) and the site will be live at
`https://larachieppe.github.io/portfolio/`.

## Dev aid

In dev only, `?shape=helix|lattice|globe` renders a given morph state on load
and freezes it there, so you can check composition without scrolling. It is
compiled out of production builds.
