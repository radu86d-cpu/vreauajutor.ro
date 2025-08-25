// netlify/functions/_shared/utils.js
const ALLOWED_ORIGINS = ["*"]; // pune domeniul tău dacă vrei să restrângi

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(), ...extraHeaders }
  });
}

export function bad(message = "Bad Request", status = 400) {
  return json({ error: message }, status);
}

export function method(req, allowed = ["GET"]) {
  const m = req.method?.toUpperCase?.() || "GET";
  return allowed.includes(m) ? m : "METHOD_NOT_ALLOWED";
}

// Rate-limit simplu în memorie (per IP). Pe serverless se resetează la cold start.
const rlMap = globalThis.__RATE_LIMIT__ || new Map();
globalThis.__RATE_LIMIT__ = rlMap;

export function rateLimit(req, { windowSec = 60, max = 5 } = {}) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const now = Date.now();
    const bucket = rlMap.get(ip) || [];
    const fresh = bucket.filter(ts => now - ts < windowSec * 1000);
    fresh.push(now);
    rlMap.set(ip, fresh);
    return fresh.length <= max;
  } catch {
    return true;
  }
}

export async function bodyJSON(req) { try { return await req.json(); } catch { return {}; } }

export function handleOptions(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  return null;
}
