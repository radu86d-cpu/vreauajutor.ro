// netlify/functions/_shared/supabase.js
import { createClient } from "@supabase/supabase-js";

/**
 * Încarcă variabilele de mediu acceptând mai multe alias-uri
 * (ca să nu depindem de cum sunt setate în Netlify).
 */
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Fail-fast pentru URL; fără el nu putem inițializa nimic coerent.
if (!SUPABASE_URL) {
  throw new Error(
    "Missing SUPABASE_URL (acceptat și ca VITE_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL)"
  );
}

// Nu dărâmăm procesul dacă lipsesc cheile; doar avertizăm.
// (Unele funcții pot folosi doar operații publice fără auth.)
if (!SUPABASE_ANON_KEY) {
  console.warn(
    "WARN: Missing SUPABASE_ANON_KEY (acceptat și ca VITE_SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY)"
  );
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("WARN: Missing SUPABASE_SERVICE_ROLE_KEY (opțional, doar server-side)");
}

/**
 * Client anonim (fără sesiune persistentă).
 * Folosește pentru interogări publice sau când nu ai token de utilizator.
 */
export const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Client de admin (service role). Folosit DOAR pe server (Netlify functions),
 * pentru operațiuni care necesită privilegii mai ridicate.
 */
export const sbAdmin = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

/**
 * Extrage tokenul din:
 *  - Antetul Authorization: Bearer <token>
 *  - Unele cookie-uri supabase (json sau raw) — încercăm câteva chei comune
 */
export function getAuthTokenFromRequest(req) {
  // Authorization: Bearer <token>
  const auth = req.headers.get?.("Authorization") || req.headers?.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (m?.[1]) return m[1];

  // Din cookie
  const cookie = req.headers.get?.("Cookie") || req.headers?.cookie || "";
  if (!cookie) return null;

  // Chei comune folosite de SDK/host-uri
  const tryKeys = [
    "sb-access-token",
    "sb:token",
    "supabase-auth-token",
    // uneori SDK-ul pune un JSON sub chei generice
    "sb-auth",
  ];

  for (const key of tryKeys) {
    const raw = getCookie(cookie, key);
    if (!raw) continue;

    try {
      const dec = decodeURIComponent(raw);
      // dacă e JSON, încearcă să extragi access_token
      if (dec.startsWith("{") || dec.startsWith("%7B")) {
        const obj = JSON.parse(dec);
        const tok =
          obj?.currentSession?.access_token ||
          obj?.access_token ||
          obj?.token ||
          (Array.isArray(obj) && obj[0]?.access_token);
        if (tok) return tok;
      }
      // altfel consideră-l token direct
      return dec;
    } catch {
      // dacă nu e json valid, tratăm ca token raw
      return raw;
    }
  }

  return null;
}

function getCookie(cookieHeader, name) {
  const re = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`);
  const m = re.exec(cookieHeader);
  return m ? m[1] : null;
}

/**
 * Creează un client Supabase „scoped” la request:
 *  - asAdmin=true → folosește sbAdmin (dacă există cheie de service)
 *  - dacă există Bearer token/cookie → client cu token-ul utilizatorului
 *  - altfel → client anonim
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
```0