// Live repository data from the public GitHub API — no auth (60 req/hr per
// IP is plenty for a portfolio), cached in localStorage so repeat opens and
// revisits don't re-hit the API. Every call fails soft: a network error or
// rate-limit returns null and the caller simply hides the section.

const CACHE_PREFIX = "gh:";
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Parse "https://github.com/owner/name" → { owner, name }, else null. */
export function parseRepo(url) {
  if (!url) return null;
  const m = /github\.com\/([^/]+)\/([^/?#]+)/.exec(url);
  if (!m) return null;
  return { owner: m[1], name: m[2].replace(/\.git$/, "") };
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw);
    if (Date.now() - t > TTL_MS) return null;
    return v;
  } catch {
    return null;
  }
}

function writeCache(key, v) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v }));
  } catch {
    /* storage full or disabled — fine, we just don't cache */
  }
}

/**
 * Returns { stars, pushedAt, language, languages: {name: bytes}, fullName }
 * or null on any failure. Cached per repo.
 */
export async function fetchRepoMeta(url) {
  const repo = parseRepo(url);
  if (!repo) return null;
  const key = `${repo.owner}/${repo.name}`;

  const cached = readCache(key);
  if (cached) return cached;

  try {
    const base = `https://api.github.com/repos/${repo.owner}/${repo.name}`;
    const headers = { Accept: "application/vnd.github+json" };
    const [repoRes, langRes] = await Promise.all([
      fetch(base, { headers }),
      fetch(`${base}/languages`, { headers }),
    ]);
    if (!repoRes.ok) return null;
    const r = await repoRes.json();
    const languages = langRes.ok ? await langRes.json() : {};

    const meta = {
      stars: r.stargazers_count ?? 0,
      pushedAt: r.pushed_at ?? null,
      language: r.language ?? null,
      languages,
      fullName: r.full_name ?? key,
    };
    writeCache(key, meta);
    return meta;
  } catch {
    return null;
  }
}

/** "3 days ago", "2 months ago", … from an ISO timestamp. */
export function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const secs = Math.max(1, Math.round((Date.now() - then) / 1000));
  const units = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [name, s] of units) {
    const n = Math.floor(secs / s);
    if (n >= 1) return `${n} ${name}${n > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

/**
 * Top-N languages as [{ name, pct }] by byte share. Buckets the remainder as
 * "Other" so the bar always sums to 100.
 */
export function topLanguages(languages, n = 4) {
  const entries = Object.entries(languages || {});
  if (!entries.length) return [];
  const total = entries.reduce((a, [, b]) => a + b, 0);
  if (!total) return [];
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, n).map(([name, bytes]) => ({
    name,
    pct: (bytes / total) * 100,
  }));
  const rest = sorted.slice(n).reduce((a, [, b]) => a + b, 0);
  if (rest > 0) top.push({ name: "Other", pct: (rest / total) * 100 });
  return top;
}
