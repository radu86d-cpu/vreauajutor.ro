// netlify/functions/spa_env.mjs
export default async (req) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };

  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  // Acceptă mai multe prefixuri (în funcție de cum sunt setate în Netlify)
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

  // Payload de răspuns
  const payload = { SUPABASE_URL, SUPABASE_ANON_KEY };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Missing Supabase env vars",
        ...payload,
      }),
      { status: 500, headers }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, ...payload }),
    { status: 200, headers }
  );
};