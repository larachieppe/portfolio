// Real scaled-dot-product self-attention, computed in the browser over the
// tokens the visitor types. The projection weights are untrained (seeded
// random), so this is the attention *mechanism* — Q·Kᵀ/√d → softmax — not a
// trained model's learned weights. Positional encoding gives it structure so
// the patterns read as meaningful rather than pure noise.

const D = 24; // embedding / projection dimension

function hashInt(str, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seedRnd(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000 - 0.5; // ~[-0.5, 0.5]
  };
}

/** Split into up to `max` word tokens (keeps it legible as a diagram). */
export function tokenize(text, max = 14) {
  const toks = (text.match(/[A-Za-z0-9']+|[.,!?;:]/g) || []).slice(0, max);
  return toks;
}

// Token embedding: a deterministic pseudo-embedding (hash per dimension) plus
// sinusoidal positional encoding — the same two ingredients a transformer
// input has, minus the learned lookup table.
function embed(tokens) {
  const n = tokens.length;
  const emb = [];
  for (let i = 0; i < n; i++) {
    const t = tokens[i].toLowerCase();
    const v = new Float64Array(D);
    for (let k = 0; k < D; k++) {
      const r = (hashInt(t, k * 2654435761) % 1000) / 1000 - 0.5;
      const pe =
        k % 2 === 0
          ? Math.sin(i / Math.pow(10000, k / D))
          : Math.cos(i / Math.pow(10000, (k - 1) / D));
      v[k] = r + pe * 0.9;
    }
    emb.push(v);
  }
  return emb;
}

// A fixed (seeded) linear projection matrix, [D x D].
function projection(seed) {
  const rnd = seedRnd(seed);
  const M = [];
  for (let i = 0; i < D; i++) {
    const row = new Float64Array(D);
    for (let j = 0; j < D; j++) row[j] = rnd();
    M.push(row);
  }
  return M;
}

function matVec(M, v) {
  const out = new Float64Array(D);
  for (let i = 0; i < D; i++) {
    let s = 0;
    const row = M[i];
    for (let j = 0; j < D; j++) s += row[j] * v[j];
    out[i] = s;
  }
  return out;
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < D; i++) s += a[i] * b[i];
  return s;
}

function softmax(arr) {
  const m = Math.max(...arr);
  const ex = arr.map((x) => Math.exp(x - m));
  const sum = ex.reduce((a, b) => a + b, 0) || 1;
  return ex.map((x) => x / sum);
}

/**
 * Compute a self-attention matrix.
 * @returns { tokens, weights } where weights[i][j] = how much query token i
 *   attends to key token j; each row sums to 1.
 * @param opts.head   which attention "head" (different seeded projections)
 * @param opts.causal mask out future keys (as in a decoder LM)
 */
export function selfAttention(tokens, { head = 0, causal = false } = {}) {
  const n = tokens.length;
  if (!n) return { tokens, weights: [] };

  const emb = embed(tokens);
  const Wq = projection(1000 + head * 97);
  const Wk = projection(7000 + head * 131);
  const Q = emb.map((v) => matVec(Wq, v));
  const K = emb.map((v) => matVec(Wk, v));
  const scale = Math.sqrt(D);

  const weights = [];
  for (let i = 0; i < n; i++) {
    const scores = new Array(n);
    for (let j = 0; j < n; j++) {
      scores[j] = causal && j > i ? -Infinity : dot(Q[i], K[j]) / scale;
    }
    weights.push(softmax(scores));
  }
  return { tokens, weights };
}

export const HEADS = 4;
