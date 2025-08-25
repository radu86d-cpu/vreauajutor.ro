// netlify/functions/_shared/utils.js
import crypto from "crypto";

// Allowed origins – ajustează cu domeniile tale
const ALLOW = new Set([
  "https://vreauajutor.ro",
  "https://www.vreauajutor.ro",
  "http://localhost:8888",
  "http://localhost:5173"
]);

export function cors(req, resInit = {}) {
  const origin = req.headers.get("origin") || "";
  const headers = new Headers(resInit.headers || {});
  if (ALLOW.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

export function json(data, { status = 200, headers = new Headers() } = {}) {
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers });
}

export function bad(msg, code = 400) {
  return json({ ok: false, error: msg }, { status: code });
}

export function method(req, allowed = ["POST"]) {
  const m = req.method.toUpperCase();
  if (m === "OPTIONS") return "OPTIONS";
  if (!allowed.includes(m)) return null;
  return m;
}

// mini rate-limit (per IP + endpoint) în memorie edge (fallback: hash)
const BUCKET = new Map();
export function rateLimit(req, { windowSec = 60, max = 20 } = {}) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
               req.headers.get("client-ip") || "0.0.0.0";
    const key = req.url + "::" + crypto.createHash("sha1").update(ip).digest("hex");
    const now = Date.now();
    const w = BUCKET.get(key) || [];
    const fresh = w.filter(t => now - t < windowSec * 1000);
    fresh.push(now);
    BUCKET.set(key, fresh);
    return fresh.length <= max;
  } catch { return true; }
}
