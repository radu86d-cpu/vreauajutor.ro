// netlify/functions/_shared/supabase.js
import { createClient } from "@supabase/supabase-js";

/**
 * IMPORTANT:
 * Acest fișier trebuie folosit DOAR pe server (Netlify Functions).
 * Nu-l importa în codul trimis către browser!
 */
function ensureServerOnly() {
  if (typeof window !== "undefined") {
    throw new Error("supabase server helper imported in the browser – abort.");
  }
}
ensureServerOnly();

/**
 * ENV în Netlify -> Site settings -> Environment:
 *  - SUPABASE_URL                  (obligatoriu)
 *  - SUPABASE_ANON_KEY             (obligatoriu pentru clientul anon)
 *  - SUPABASE_SERVICE_ROLE_KEY     (opțional, DOAR server-side!)
 */
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Validări prietenoase
if (!SUPABASE_URL) {
  throw new Error("[supabase] Missing SUPABASE_URL (set it in Netlify ENV)");
}
if (!SUPABASE_ANON_KEY) {
  console.warn("[supabase] WARN: Missing SUPABASE_ANON_KEY – anon client will be limited.");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("[supabase] WARN: Missing SUPABASE_SERVICE_ROLE_KEY – admin features disabled.");
}

// ===== Reusable clients (singleton per process) =====
export const sbAnon = SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export const sbAdmin = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

/**
 * Extrage antete indiferent de forma (Request vs event)
 */
function getHeader(reqOrEvent, name) {
  try {
    // v2/Edge: native Request
    if (reqOrEvent?.headers?.get) return reqOrEvent.headers.get(name) || "";
    // v1: event.headers (plain object, case-insensitive)
    const h = reqOrEvent?.headers || {};
    const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? h[key] : "";
  } catch {
    return "";
  }
}

/**
 * Extrage valoarea unui cookie dintr-un header Cookie raw
 */
function getCookie(cookieHeader = "", name = "") {
  if (!cookieHeader || !name) return null;
  const re = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`);
  const m = cookieHeader.match(re);
  return m ? m[1] : null;
}

/**
 * În unele implementări, tokenul este un JSON serializat în cookie (ex: supabase-auth-token)
 * sau URL-encodat – încearcă să-l decriptezi robust.
 */
function parseMaybeJsonToken(raw) {
  if (!raw) return null;
  try {
    const dec = decodeURIComponent(raw);
    if (dec.startsWith("{")) {
      const obj = JSON.parse(dec);
      // diverse forme întâlnite
      return (
        obj?.currentSession?.access_token ||
        obj?.access_token ||
        obj?.token ||
        null
      );
    }
    return dec;
  } catch {
    // dacă nu e JSON valid, întoarce raw decodat
    try { return decodeURIComponent(raw); } catch { return raw; }
  }
}

/**
 * getAuthTokenFromRequest(reqOrEvent)
 *  - Caută "Authorization: Bearer <token>"
 *  - Dacă nu există, încearcă câteva chei de cookie uzuale:
 *    "sb-access-token", "sb:token", "supabase-auth-token", "sb-auth-token"
 */
export function getAuthTokenFromRequest(reqOrEvent) {
  // 1) Authorization header
  const auth = getHeader(reqOrEvent, "Authorization");
  const m = auth?.match?.(/^Bearer\s+(.+)$/i);
  if (m?.[1]) return m[1];

  // 2) Cookies
  const cookie = getHeader(reqOrEvent, "Cookie") || "";
  const tryKeys = [
    "sb-access-token",
    "sb:token",
    "supabase-auth-token",
    "sb-auth-token",
  ];
  for (const k of tryKeys) {
    const v = getCookie(cookie, k);
    const tok = parseMaybeJsonToken(v);
    if (tok) return tok;
  }

  return null;
}

/**
 * supabaseFromRequest(reqOrEvent, { asAdmin = false })
 *  - Dacă asAdmin === true și avem SERVICE_ROLE -> întoarce client admin (server-only)
 *  - Altfel, dacă există un Bearer token -> client cu acel token pe header
 *  - Altfel -> client anonim
 */
export function supabaseFromRequest(reqOrEvent, { asAdmin = false } = {}) {
  if (asAdmin && sbAdmin) return sbAdmin;

  const token = getAuthTokenFromRequest(reqOrEvent);
  if (!token) {
    if (!sbAnon) {
      throw new Error(
        "[supabase] No anon client available (SUPABASE_ANON_KEY missing)."
      );
    }
    return sbAnon;
  }

  // Client „impersonal” cu token injectat pe request (nu persistă sesiunea)
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY || "public-anon-key", {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}