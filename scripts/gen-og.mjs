// Generates public/og.png — the 1200x630 social share card — from an SVG,
// rendered to PNG in pure Node via resvg. Run: `npm run og`.
// Everything is code + local font files, so it's repeatable and needs no
// browser or network.

import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const W = 1200;
const H = 630;

// Deterministic PRNG so the card is identical on every regeneration.
function seedRnd(s) {
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

// Attention-matrix dot motif (causal triangle + diagonal), right side.
function dots() {
  const rnd = seedRnd(7);
  const gx = 26;
  const gy = 26;
  const ox = 760;
  const oy = 150;
  const cell = 15;
  let out = "";
  for (let i = 0; i < gx; i++) {
    for (let j = 0; j < gy; j++) {
      const causal = j <= i + 1 ? 1 : 0.05;
      const diag = Math.exp(-Math.pow((i - j) / 2.4, 2));
      const sink = Math.exp(-Math.pow(j / 1.6, 2)) * 0.9;
      const w = causal * Math.min(1, diag + sink * 0.8);
      if (rnd() > w * 0.9 + 0.04) continue;
      const px = (ox + i * cell + (rnd() - 0.5) * 5).toFixed(1);
      const py = (oy + j * cell + (rnd() - 0.5) * 5).toFixed(1);
      const a = (0.15 + w * 0.7).toFixed(2);
      const r = (1.7 + w * 1.6).toFixed(1);
      const fill = w > 0.45 ? "rgb(120,240,200)" : "rgb(150,170,200)";
      out += `<circle cx="${px}" cy="${py}" r="${r}" fill="${fill}" opacity="${a}"/>`;
    }
  }
  return out;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="78%" cy="32%" r="52%">
      <stop offset="0%" stop-color="rgb(75,240,192)" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="rgb(5,7,10)" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#4bf0c0"/>
      <stop offset="100%" stop-color="#4bf0c0" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#05070a"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${dots()}
  <text x="80" y="150" font-family="JetBrains Mono" font-size="22" letter-spacing="5" fill="#4bf0c0">SOFTWARE &amp; ML ENGINEER  ·  BERKELEY</text>
  <text x="76" y="300" font-family="Instrument Serif" font-size="112" fill="#eaf0ee">Lara</text>
  <text x="76" y="410" font-family="Instrument Serif" font-size="112" fill="#eaf0ee">Chieppe</text>
  <rect x="80" y="451" width="440" height="2" fill="url(#rule)"/>
  <text x="80" y="512" font-family="JetBrains Mono" font-size="24" fill="#8593a0">Multi-agent systems · Protein language models · Payment infra</text>
  <circle cx="86" cy="566" r="5" fill="#4bf0c0"/>
  <text x="102" y="573" font-family="JetBrains Mono" font-size="20" letter-spacing="2" fill="#6b7684">larachieppe.github.io/portfolio</text>
</svg>`;

const resvg = new Resvg(svg, {
  background: "#05070a",
  fitTo: { mode: "width", value: W },
  font: {
    fontFiles: [
      join(here, "fonts", "InstrumentSerif-Regular.ttf"),
      join(here, "fonts", "JetBrainsMono.ttf"),
    ],
    loadSystemFonts: false,
  },
});

const png = resvg.render().asPng();
const out = join(here, "..", "public", "og.png");
writeFileSync(out, png);
console.log(`Wrote ${out} (${(png.length / 1024).toFixed(0)} KB)`);
