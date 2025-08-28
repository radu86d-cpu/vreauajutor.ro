// netlify/functions/_shared/supabase.js
import { createClient } from "@supabase/supabase-js";

/**
 * ENV necesare:
 *  - SUPABASE_URL
 *  - SUPABASE_ANON_KEY
 *  - (opțional) SUPABASE_SERVICE_ROLE_KEY
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_ANON_KEY) console.warn("WARN: Missing SUPABASE_ANON_KEY");
if (!SUPABASE_SERVICE_ROLE_KEY) console.warn("WARN: Missing SUPABASE_SERVICE_ROLE_KEY (optional)");

// Client anonim reutilizabil
export const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Client service-role (dacă există cheia)
export const sbAdmin = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

/**
 * Extrage tokenul de auth din request:
 * - Header: Authorization: Bearer <token>
 * - Cookie: sb-access-token | sb:token | supabase-auth-token (poate fi JSON)
 */
export function getAuthTokenFromRequest(req) {
  const auth = req.headers.get?.("Authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m?.[1]) return m[1];

  const cookie = req.headers.get?.("Cookie") || "";
  const tryKeys = ["sb-access-token", "sb:token", "supabase-auth-token"];

  for (const k of tryKeys) {
    const v = getCookie(cookie, k);
    if (!v) continue;

    try {
      const dec = decodeURIComponent(v);
      if (dec.startsWith("{")) {
        const obj = JSON.parse(dec);
        const tok =
          obj?.currentSession?.access_token ||
          obj?.access_token ||
          obj?.token;
        if (tok) return tok;
      }
      return dec;
    } catch {
      return v;
    }
  }
  return null;
}

function getCookie(cookieHeader, name) {
  const re = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`);
  const m = cookieHeader.match(re);
  return m ? m[1] : null;
}

/**
 * Creează un client Supabase pe baza requestului:
 *  - asAdmin:true → returnează sbAdmin (dacă există)
 *  - Dacă găsește Bearer token → atașează token-ul pe header
 *  - Altfel → folosește sbAnon
 */
export function supabaseFromRequest(req, { asAdmin = false } = {}) {
  if (asAdmin && sbAdmin) return sbAdmin;

  const token = getAuthTokenFromRequest(req);
  if (!token) return sbAnon;

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}