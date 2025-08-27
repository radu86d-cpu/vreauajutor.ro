// netlify/functions/spa_env.mjs
export default async (req) => {
  const headers = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  // Acceptă mai multe nume posibile, ca să nu depindem de cum sunt setate în Netlify
  const SUPABASE_URL =
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const SUPABASE_ANON_KEY =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  const payload = { SUPABASE_URL, SUPABASE_ANON_KEY };

  // Dacă lipsesc, întoarcem tot JSON valid, dar cu status 500 și motiv clar
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "Missing Supabase envs", ...payload }), {
      status: 500,
      headers,
    });
  }

  return new Response(JSON.stringify({ ok: true, ...payload }), { status: 200, headers });
};