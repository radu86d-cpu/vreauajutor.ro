// netlify/functions/_shared/utils.js

/** ========= C O N F I G   &   H E L P E R S ========= **/

// CORS origins din ENV (ex: CORS_ORIGINS="https://vreauajutor.ro,https://admin.vreauajutor.ro")
// Dacă lipsește => "*"
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "*")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const ALLOW_ALL = CORS_ORIGINS.includes("*");

// Extrage header indiferent de formă (Request v2/Edge sau event v1)
function getHeader(reqOrEvent, name) {
  try {
    if (reqOrEvent?.headers?.get) return reqOrEvent.headers.get(name) || "";
    const h = reqOrEvent?.headers || {};
    const k = Object.keys(h).find(x => x.toLowerCase() === name.toLowerCase());
    return k ? h[k] : "";
  } catch {
    return "";
  }
}

// Metoda HTTP unificată
function getMethod(reqOrEvent) {
  return (reqOrEvent?.method || reqOrEvent?.httpMethod || "GET").toUpperCase();
}

// IP simplu (x-forwarded-for)
export function getIP(reqOrEvent) {
  const xff = getHeader(reqOrEvent, "x-forwarded-for");
  return xff?.split(",")?.[0]?.trim() || "unknown";
}

// Origin client
export function getOrigin(reqOrEvent) {
  return getHeader(reqOrEvent, "Origin") || "";
}

/** ========= C O R S ========= **/

function pickAllowedOrigin(reqOrEvent) {
  if (ALLOW_ALL) return "*";
  const origin = getOrigin(reqOrEvent);
  if (!origin) return CORS_ORIGINS[0] || "";
  return CORS_ORIGINS.includes(origin) ? origin : "";
}

export function corsHeaders(reqOrEvent, extra = {}) {
  const allowOrigin = pickAllowedOrigin(reqOrEvent);
  const base = {
    "Access-Control-Allow-Origin": allowOrigin || "null",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
  return { ...base, ...extra };
}

// alias compat
export function cors(reqOrEvent, extra = {}) {
  return corsHeaders(reqOrEvent, extra);
}

// OPTIONS preflight (returnează Response sau null)
export function handleOptions(reqOrEvent) {
  if (getMethod(reqOrEvent) === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(reqOrEvent) });
  }
  return null;
}

/** ========= R Ă S P U N S U R I  J S O N ========= **/

export function json(data, status = 200, reqOrEvent = null, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(reqOrEvent),
      ...extraHeaders,
    },
  });
}

export function bad(message = "Bad Request", status = 400, reqOrEvent = null) {
  return json({ error: message }, status, reqOrEvent);
}

export function unauthorized(message = "Unauthorized", reqOrEvent = null) {
  return json({ error: message }, 401, reqOrEvent, { "WWW-Authenticate": "Bearer" });
}

export function forbidden(message = "Forbidden", reqOrEvent = null) {
  return json({ error: message }, 403, reqOrEvent);
}

export function notFound(message = "Not Found", reqOrEvent = null) {
  return json({ error: message }, 404, reqOrEvent);
}

export function methodNotAllowed(allowed = ["GET"], reqOrEvent = null) {
  return json(
    { error: "Method Not Allowed", allow: allowed },
    405,
    reqOrEvent,
    { "Allow": allowed.join(", ") }
  );
}

// Cache helpers
export function noCache(headers = {}) {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    ...headers,
  };
}

export function cache(seconds = 60, headers = {}) {
  return { "Cache-Control": `public, max-age=${seconds}`, ...headers };
}

/** ========= M E T H O D  /  G U A R D S ========= **/

// întoarce metoda validă sau "METHOD_NOT_ALLOWED"
export function method(reqOrEvent, allowed = ["GET"]) {
  const m = getMethod(reqOrEvent);
  return allowed.includes(m) ? m : "METHOD_NOT_ALLOWED";
}

// dacă metoda nu e permisă -> Response 405
export function requireMethod(reqOrEvent, allowed = ["GET"]) {
  const m = getMethod(reqOrEvent);
  if (!allowed.includes(m)) {
    return methodNotAllowed(allowed, reqOrEvent);
  }
  return null;
}

/** ========= R A T E  L I M I T ========= **/

// hartă globală (resetată la cold start)
const __RL__ = globalThis.__RATE_LIMIT__ || new Map();
globalThis.__RATE_LIMIT__ = __RL__;

/**
 * rateLimit(reqOrEvent, { windowSec, max, bucket })
 *  - windowSec: fereastră secunde (default 60)
 *  - max: cereri maxime / fereastră / IP / bucket (default 5)
 *  - bucket: șir pentru „grupare” (ex: 'otp', 'register')
 * Returnează { ok:boolean, retryAfter?: number }
 */
export function rateLimit(reqOrEvent, { windowSec = 60, max = 5, bucket = "" } = {}) {
  try {
    const ip = getIP(reqOrEvent);
    const key = `${ip}::${bucket}`;
    const now = Date.now();

    const list = __RL__.get(key) || [];
    const fresh = list.filter(ts => now - ts < windowSec * 1000);
    fresh.push(now);
    __RL__.set(key, fresh);

    if (fresh.length <= max) return { ok: true };

    const oldest = fresh[0];
    const retryAfterMs = windowSec * 1000 - (now - oldest);
    return { ok: false, retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  } catch {
    return { ok: true };
  }
}

/** ========= B O D Y  /  Q U E R Y ========= **/

/**
 * Citește JSON în siguranță, cu limită (default ~1MB).
 * Request (v2/Edge): citim .text() cu limită, apoi JSON.parse
 * Event (v1): folosim event.body (string)
 */
export async function bodyJSON(reqOrEvent, { maxBytes = 1_000_000 } = {}) {
  try {
    // v2/Edge Request
    if (typeof reqOrEvent?.text === "function") {
      const text = await reqOrEvent.text();
      if (text.length > maxBytes) throw new Error("Payload too large");
      return text ? JSON.parse(text) : {};
    }
    // v1 event
    const raw = reqOrEvent?.body || "";
    if (raw && typeof raw === "string") {
      if (raw.length > maxBytes) throw new Error("Payload too large");
      try { return JSON.parse(raw); } catch { return {}; }
    }
    return {};
  } catch {
    return {};
  }
}

// Query params pentru v2 (Request) și v1 (event)
export function getQuery(reqOrEvent) {
  try {
    if (reqOrEvent?.url) {
      return Object.fromEntries(new URL(reqOrEvent.url).searchParams.entries());
    }
    if (reqOrEvent?.rawUrl) {
      return Object.fromEntries(new URL(reqOrEvent.rawUrl).searchParams.entries());
    }
    if (reqOrEvent?.queryStringParameters) {
      return { ...reqOrEvent.queryStringParameters };
    }
  } catch {}
  return {};
}