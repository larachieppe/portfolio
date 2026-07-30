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
 * A distributed network: hub nodes scattered through a 3D volume, wired to
 * their nearest neighbours into a connected mesh — the graph/distributed-
 * systems motif. Particles cluster at the nodes and stream along the edges.
 * Opening shape for the top of the page.
 */
export function network(count) {
  const out = new Float32Array(count * 3);
  const rnd = makeRandom(2024);
  const N = 16; // hub nodes
  const R = 4.0;

  // Hubs placed inside an ellipsoid (taller in Y to sit in the column).
  const hubs = [];
  while (hubs.length < N) {
    const x = rnd() * 2 - 1;
    const y = rnd() * 2 - 1;
    const z = rnd() * 2 - 1;
    if (x * x + y * y + z * z > 1) continue;
    hubs.push([x * R, y * R * 1.2, z * R * 0.8]);
  }

  const d2 = (a, b) =>
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

  // Connect each hub to its 2–3 nearest neighbours (dedup undirected edges).
  const edges = [];
  const seen = new Set();
  for (let i = 0; i < N; i++) {
    const near = hubs
      .map((h, j) => ({ j, d: j === i ? Infinity : d2(hubs[i], h) }))
      .sort((a, b) => a.d - b.d);
    const k = 2 + Math.floor(rnd() * 2);
    for (let m = 0; m < k; m++) {
      const j = near[m].j;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([hubs[i], hubs[j]]);
    }
  }

  for (let p = 0; p < count; p++) {
    let x, y, z;
    if (p % 3 === 0) {
      // Node: a soft glowing blob at a hub.
      const h = hubs[Math.floor(rnd() * N)];
      const r = Math.pow(rnd(), 0.5) * 0.5;
      const th = rnd() * TAU;
      const ph = Math.acos(rnd() * 2 - 1);
      x = h[0] + r * Math.sin(ph) * Math.cos(th);
      y = h[1] + r * Math.sin(ph) * Math.sin(th);
      z = h[2] + r * Math.cos(ph);
    } else {
      // Edge: a particle strung along a connection between two hubs.
      const [a, b] = edges[Math.floor(rnd() * edges.length)];
      const t = rnd();
      x = a[0] + (b[0] - a[0]) * t + (rnd() - 0.5) * 0.05;
      y = a[1] + (b[1] - a[1]) * t + (rnd() - 0.5) * 0.05;
      z = a[2] + (b[2] - a[2]) * t + (rnd() - 0.5) * 0.05;
    }
    out[p * 3] = x;
    out[p * 3 + 1] = y;
    out[p * 3 + 2] = z;
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

export const generators = { transformer, network, globe };
