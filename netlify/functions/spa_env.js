// netlify/functions/spa_env.js
exports.handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify({
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY
    })
  };
};
import { cors, json, method } from "./_shared/utils.js";

export default async (req) => {
  const m = method(req, ["GET"]);
  const headers = cors(req);
  if (m === "OPTIONS") return new Response(null, { status: 204, headers });
  return json({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  }, { headers });
};
