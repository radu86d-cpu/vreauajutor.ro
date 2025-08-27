// netlify/functions/spa_env.js
import { json, handleOptions } from "./_shared/utils.js";

// Acceptă mai multe denumiri posibile pentru chei, ca să nu depinzi de cum sunt setate în Netlify
function pickEnv(...keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (v) return v;
  }
  return "";
}

export default async (req) => {
  // CORS preflight
  const opt = handleOptions(req);
  if (opt) return opt;

  const SUPABASE_URL = pickEnv("SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const SUPABASE_ANON_KEY = pickEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");

  // Răspuns JSON + no-store (e configurat și în utils.json să pună CORS)
  const extraHeaders = { "Cache-Control": "no-store" };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    // întoarce JSON valid + status 500, dar include ce s-a găsit (util pentru debug)
    return json(
      { ok: false, error: "Missing Supabase envs", SUPABASE_URL, SUPABASE_ANON_KEY },
      500,
      extraHeaders
    );
  }

  return json({ ok: true, SUPABASE_URL, SUPABASE_ANON_KEY }, 200, extraHeaders);
};