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
 * An alpha-helix: two counter-wound backbones joined by rungs.
 * The bioengineering half of the page.
 */
export function helix(count) {
  const out = new Float32Array(count * 3);
  const rnd = makeRandom(7);
  const radius = 2.5;
  const height = 15.5;
  const turns = 6.5;

  for (let i = 0; i < count; i++) {
    const role = i % 5; // 0,1,2,3 = backbone, 4 = rung
    let x, y, z;

    if (role === 4) {
      // Rung: a bar spanning the two strands at a given height.
      const step = Math.floor(i / 5);
      const t = (step % 220) / 220;
      const angle = t * turns * TAU;
      const across = rnd() * 2 - 1;
      const jitter = (rnd() - 0.5) * 0.16;
      x = Math.cos(angle) * radius * across + jitter;
      z = Math.sin(angle) * radius * across + jitter;
      y = (t - 0.5) * height;
    } else {
      // Backbone: two strands, offset half a turn from each other.
      const strand = role < 2 ? 0 : 1;
      const t = rnd();
      const angle = t * turns * TAU + strand * Math.PI;
      // Thicken each strand into a tube instead of a bare line.
      const tubeAngle = rnd() * TAU;
      const tubeR = Math.pow(rnd(), 0.65) * 0.3;
      x = Math.cos(angle) * radius + Math.cos(tubeAngle) * tubeR;
      z = Math.sin(angle) * radius + Math.sin(tubeAngle) * tubeR;
      y = (t - 0.5) * height + Math.sin(tubeAngle) * tubeR * 0.5;
    }

    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  }
  return out;
}

/**
 * A feed-forward network: layers of nodes with particles streaming along
 * the edges between them. The ML half of the page.
 */
export function lattice(count) {
  const out = new Float32Array(count * 3);
  const rnd = makeRandom(4242);

  // Kept deliberately narrow: the field lives in a reserved right-hand
  // column, so a wide diagram would run off the edge of the screen.
  // Half-width here (~3.2 + node radius) is what has to fit that column.
  const layers = [
    { n: 4, x: -3.2 },
    { n: 7, x: -1.05 },
    { n: 7, x: 1.05 },
    { n: 3, x: 3.2 },
  ];
  const spread = 2.9;

  // Precompute node centres, laid out as a ring per layer so it reads as
  // volume rather than a flat diagram.
  const nodes = layers.map((layer) => {
    const pts = [];
    for (let k = 0; k < layer.n; k++) {
      const a = (k / layer.n) * TAU + layer.x * 0.3;
      const r = layer.n === 1 ? 0 : spread * (0.55 + 0.45 * ((k % 3) / 2));
      pts.push([layer.x, Math.cos(a) * r, Math.sin(a) * r * 0.85]);
    }
    return pts;
  });

  // Flatten every valid edge so particles can be dealt across them evenly.
  const edges = [];
  for (let l = 0; l < nodes.length - 1; l++) {
    for (const a of nodes[l]) for (const b of nodes[l + 1]) edges.push([a, b]);
  }

  for (let i = 0; i < count; i++) {
    let x, y, z;
    if (i % 4 === 0) {
      // Node cloud: a soft blob sitting at a node centre.
      const layer = nodes[i % nodes.length];
      const p = layer[Math.floor(rnd() * layer.length)];
      const r = Math.pow(rnd(), 0.5) * 0.42;
      const th = rnd() * TAU;
      const ph = Math.acos(rnd() * 2 - 1);
      x = p[0] + r * Math.sin(ph) * Math.cos(th);
      y = p[1] + r * Math.sin(ph) * Math.sin(th);
      z = p[2] + r * Math.cos(ph);
    } else {
      // Edge particle: somewhere along a connection, with a slight sag.
      const [a, b] = edges[Math.floor(rnd() * edges.length)];
      const t = rnd();
      const sag = Math.sin(t * Math.PI) * 0.22;
      x = a[0] + (b[0] - a[0]) * t;
      y = a[1] + (b[1] - a[1]) * t - sag;
      z = a[2] + (b[2] - a[2]) * t + (rnd() - 0.5) * 0.08;
    }
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
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

export const generators = { helix, lattice, globe };
