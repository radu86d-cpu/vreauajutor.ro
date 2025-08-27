// netlify/functions/_shared/utils.js

// ===== CORS =====
/**
 * Poți seta în Netlify env: ALLOWED_ORIGINS="https://vreauajutor.ro,https://www.vreauajutor.ro"
 * Dacă nu e setat, folosim "*".
 */
const ORIGINS =
  (process.env.ALLOWED_ORIGINS || "*")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

function pickOrigin(req) {
  try {
    if (ORIGINS.length === 1 && ORIGINS[0] === "*") return "*";
    const reqOrigin = req.headers.get("origin") || "";
    return ORIGINS.includes(reqOrigin) ? reqOrigin : ORIGINS[0] || "*";
  } catch {
    return "*";
  }
}

export function corsHeaders(req) {
  const origin = pickOrigin(req || new Request("http://localhost"));
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  };
}

// alias pentru compat
export function cors(req) {
  return corsHeaders(req);
}

/**
 * Răspunde rapid la preflight.
 */
export function handleOptions(req) {
  if ((req.method || "").toUpperCase() === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  return null;
}

// ===== Răspunsuri JSON =====
export function json(data, status = 200, extraHeaders = {}, req) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(req),
      ...extraHeaders,
    },
  });
}

export function bad(message = "Bad Request", status = 400, req) {
  return json({ error: message }, status, {}, req);
}

// ===== Metodă HTTP =====
/**
 * @param {Request} req
 * @param {string[]} allowed ex: ["GET","POST"]
 * @returns {"METHOD_NOT_ALLOWED" | string}
 */
export function method(req, allowed = ["GET"]) {
  const m = (req.method || "").toUpperCase();
  if (!allowed.includes(m)) {
    return "METHOD_NOT_ALLOWED";
  }
  return m;
}

// ===== Rate limit simplu (în memorie) =====
/**
 * Rate-limit best-effort in-memory (reset la cold start).
 * Cheie = ip + path
 */
const RL = globalThis.__RATE_LIMIT__ || new Map();
globalThis.__RATE_LIMIT__ = RL;

export function getIP(req) {
  try {
    // Netlify / proxied
    const xf = req.headers.get("x-forwarded-for") || "";
    if (xf) return xf.split(",")[0].trim();
    // Cloudflare style (în unele setups)
    const cf = req.headers.get("cf-connecting-ip");
    if (cf) return cf.trim();
  } catch {}
  return "unknown";
}

/**
 * @param {Request} req
 * @param {{ windowSec?: number, max?: number, keyExtra?: string }} opts
 * @returns {boolean} true = OK, false = limited
 */
export function rateLimit(req, { windowSec = 60, max = 5, keyExtra = "" } = {}) {
  try {
    const ip = getIP(req);
    const url = new URL(req.url);
    const key = `${ip}:${url.pathname}${keyExtra ? ":" + keyExtra : ""}`;
    const now = Date.now();

    const bucket = RL.get(key) || [];
    const fresh = bucket.filter(ts => now - ts < windowSec * 1000);
    fresh.push(now);
    RL.set(key, fresh);

    return fresh.length <= max;
  } catch {
    // dacă nu putem aplica, lăsăm să treacă
    return true;
  }
}

// ===== Body / utilitare =====
export async function bodyJSON(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

/**
 * Parsează sigur un întreg din query.
 */
export function intParam(url, name, def = 0) {
  const v = parseInt(new URL(url).searchParams.get(name) || "", 10);
  return Number.isFinite(v) ? v : def;
}

/**
 * Extrage șir non-gol din query.
 */
export function strParam(url, name, def = "") {
  const v = new URL(url).searchParams.get(name);
  return (v && String(v).trim()) || def;
}