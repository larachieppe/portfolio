// Target position sets for the particle field.
// Every generator returns a Float32Array of length count * 3, in the same
// particle order, so the shader can lerp any shape into any other.

const TAU = Math.PI * 2;

// Deterministic PRNG so the layout is identical on every load (and every
// particle keeps its personality across reloads).
function makeRandom(seed = 1337) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/**
 * Multi-head self-attention: a stack of attention-weight grids, one per head,
 * layered in depth and tilted for perspective. Bright, dense cells are the
 * high-attention weights — a causal-masked lower triangle, a strong diagonal
 * (tokens attending to themselves), and an "attention sink" on the first key.
 * The opening shape for the transformer half of the page.
 */
export function attention(count) {
  const out = new Float32Array(count * 3);
  const rnd = makeRandom(7);
  const H = 3; // attention heads → stacked planes
  const G = 24; // grid resolution per head
  const spanX = 6.8;
  const spanY = 8.8;
  const tilt = 0.42; // radians, around X for depth
  const zSpread = 2.2;

  // Attention weight in [0,1] for (head, query i, key j).
  const weight = (h, i, j) => {
    const fi = i / (G - 1);
    const fj = j / (G - 1);
    const causal = fj <= fi + 0.04 ? 1 : 0.05; // future keys masked out
    const diagW = 1.6 + h * 0.5; // each head focuses differently
    const diag = Math.exp(-Math.pow((i - j) / diagW, 2));
    const sink = Math.exp(-Math.pow(j / (1.2 + h * 0.3), 2)) * (0.9 - h * 0.1);
    const bandPos = G * (0.3 + h * 0.12);
    const band = Math.exp(-Math.pow((j - bandPos) / 1.3, 2)) * 0.5;
    return causal * Math.min(1, diag + sink * 0.8 + band);
  };

  for (let k = 0; k < count; k++) {
    const h = Math.floor(rnd() * H);

    // Bias particles hard toward high-weight cells so the grid reads as a
    // crisp heatmap: bright cells accept immediately and pack densely; near-
    // zero cells only take the rare particle that exhausts its tries.
    let gi = 0;
    let gj = 0;
    let w = 0;
    for (let tries = 0; tries < 8; tries++) {
      gi = Math.floor(rnd() * G);
      gj = Math.floor(rnd() * G);
      w = weight(h, gi, gj);
      if (rnd() < w) break;
    }

    const cx = (gi / (G - 1) - 0.5) * spanX;
    const cy = (gj / (G - 1) - 0.5) * spanY;
    const x = cx + (rnd() - 0.5) * (spanX / G) * 0.55;
    const y0 = cy + (rnd() - 0.5) * (spanY / G) * 0.55;
    // Head depth, plus a little pop toward the viewer for hot cells.
    const z0 = (h / (H - 1) - 0.5) * zSpread + w * 0.5 + (rnd() - 0.5) * 0.1;

    // Tilt the whole stack around X.
    out[k * 3] = x;
    out[k * 3 + 1] = y0 * Math.cos(tilt) - z0 * Math.sin(tilt);
    out[k * 3 + 2] = y0 * Math.sin(tilt) + z0 * Math.cos(tilt);
  }
  return out;
}

/**
 * Self-attention graph: a vertical sequence of token nodes wired together by
 * curved attention arcs that bow out into 3D. Local attention forms a tight
 * weave near the axis; every token attends back to the first (long sweeping
 * arcs), plus sparse long-range links. The ML / work shape.
 */
export function transformer(count) {
  const out = new Float32Array(count * 3);
  const rnd = makeRandom(4242);
  const T = 16; // tokens
  const yTop = 6.2;
  const yBot = -6.2;
  const tokenY = (i) => yBot + (yTop - yBot) * (i / (T - 1));

  // Build the causal attention edges (query i attends to key j <= i).
  const edges = [];
  for (let i = 0; i < T; i++) {
    for (let j = 0; j <= i; j++) {
      const dist = i - j;
      let p = Math.exp(-dist / 4) * 0.8; // local attention
      if (j === 0) p += 0.5; // attention sink on the first token
      if (rnd() < 0.15) p += 0.5; // occasional long-range link
      if (dist === 0) p = 0.22; // small self-loop
      if (rnd() < p) {
        edges.push({
          y0: tokenY(j),
          y1: tokenY(i),
          ang: rnd() * TAU, // which way the arc bows, around the axis
          // A quadratic bézier apex only reaches half its control distance,
          // so the control point is set to ~2x the target bow radius.
          bow: Math.min(7, 1.0 + dist * 0.45), // longer range bows further
        });
      }
    }
  }

  for (let k = 0; k < count; k++) {
    let x, y, z;
    if (k % 7 === 0) {
      // Token node: a soft blob on the vertical axis.
      const ti = Math.floor(rnd() * T);
      const r = Math.pow(rnd(), 0.5) * 0.32;
      const th = rnd() * TAU;
      const ph = Math.acos(rnd() * 2 - 1);
      x = r * Math.sin(ph) * Math.cos(th);
      y = tokenY(ti) + r * Math.sin(ph) * Math.sin(th);
      z = r * Math.cos(ph);
    } else {
      // Particle riding a quadratic-bezier attention arc: both endpoints on
      // the axis, the control point pushed out radially.
      const e = edges[Math.floor(rnd() * edges.length)];
      const t = rnd();
      const mt = 1 - t;
      const ymid = (e.y0 + e.y1) / 2;
      const ctrlX = Math.cos(e.ang) * e.bow;
      const ctrlZ = Math.sin(e.ang) * e.bow;
      x = 2 * mt * t * ctrlX + (rnd() - 0.5) * 0.05;
      y = mt * mt * e.y0 + 2 * mt * t * ymid + t * t * e.y1;
      z = 2 * mt * t * ctrlZ + (rnd() - 0.5) * 0.05;
    }
    out[k * 3] = x;
    out[k * 3 + 1] = y;
    out[k * 3 + 2] = z;
  }
  return out;
}

/**
 * A globe: a Fibonacci-distributed shell plus a couple of loose orbital
 * bands. Closing shape for skills + contact.
 */
export function globe(count) {
  const out = new Float32Array(count * 3);
  const rnd = makeRandom(90210);
  const R = 3.4;
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i++) {
    if (i % 11 === 0) {
      // Orbital band: a thin inclined ring around the shell.
      const band = i % 3;
      const a = rnd() * TAU;
      const r = R * (1.16 + band * 0.09);
      const tilt = 0.5 + band * 0.35;
      const px = Math.cos(a) * r;
      const pz = Math.sin(a) * r;
      const py = pz * Math.sin(tilt) + (rnd() - 0.5) * 0.1;
      out[i * 3] = px;
      out[i * 3 + 1] = py;
      out[i * 3 + 2] = pz * Math.cos(tilt);
    } else {
      // Shell: even coverage via the golden angle, with a little thickness.
      const y = 1 - (i / (count - 1)) * 2;
      const rad = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      const rr = R * (0.97 + rnd() * 0.06);
      out[i * 3] = Math.cos(theta) * rad * rr;
      out[i * 3 + 1] = y * rr;
      out[i * 3 + 2] = Math.sin(theta) * rad * rr;
    }
  }
  return out;
}

export const generators = { attention, transformer, globe };
