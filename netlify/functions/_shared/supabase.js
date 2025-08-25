// netlify/functions/_shared/supabase.js
import { createClient } from "@supabase/supabase-js";

/**
 * ENV obligatorii în Netlify -> Site settings -> Environment:
 *  - SUPABASE_URL
 *  - SUPABASE_ANON_KEY
 *  - (opțional) SUPABASE_SERVICE_ROLE_KEY  — NU o folosi în frontend!
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_ANON_KEY) console.warn("WARN: Missing SUPABASE_ANON_KEY");
if (!SUPABASE_SERVICE_ROLE_KEY) console.warn("WARN: Missing SUPABASE_SERVICE_ROLE_KEY (optional)");

// Cliente reutilizabile
export const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

export const sbAdmin = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

/**
 * Extrage tokenul de Auth din request (Bearer header sau cookies comune).
 */
export function getAuthTokenFromRequest(req) {
  // 1) Authorization: Bearer <jwt>
  const auth = req.headers.get("Authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m?.[1]) return m[1];

  // 2) Cookie: sb-access-token / supabase-auth-token / etc.
  const cookie = req.headers.get("Cookie") || "";
  // încercăm câteva chei frecvente
  const tryKeys = [
    "sb-access-token",
    "sb:token",
    "supabase-auth-token",
  ];
  for (const k of tryKeys) {
    const v = getCookie(cookie, k);
    if (v) {
      // uneori supabase-auth-token e un JSON stringificat cu { currentSession: { access_token } }
      try {
        if (v.startsWith("%7B") || v.startsWith("{")) {
          const obj = JSON.parse(decodeURIComponent(v));
          const tok =
            obj?.currentSession?.access_token ||
            obj?.access_token ||
            obj?.token;
          if (tok) return tok;
        }
      } catch { /* ignore */ }
      return decodeURIComponent(v);
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
 * supabaseFromRequest(req, { asAdmin })
 * - Dacă ai `Authorization: Bearer <jwt>` în request, întoarce un client cu acel JWT atașat.
 * - Altfel întoarce clientul anonim.
 * - Dacă setăm `{ asAdmin:true }` și există SERVICE_ROLE, întoarce clientul admin (atenție: folosește-l DOAR pentru operații server-side sigure).
 */
export function supabaseFromRequest(req, { asAdmin = false } = {}) {
  if (asAdmin && sbAdmin) return sbAdmin;

  const token = getAuthTokenFromRequest(req);
  if (!token) return sbAnon;

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
