// netlify/functions/messages.js
// Chat messages (GET list, POST create) – cu autentificare via Supabase JWT

const { createClient } = require("@supabase/supabase-js");

// === ENV necesare (anon, nu service role – ca să lase RLS să aplice corect) ===
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// CORS + cache
const baseHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store",
};

// mic rate-limit în memorie (per IP)
const RL = global.__MSG_RL__ || new Map();
global.__MSG_RL__ = RL;
function rateLimit(ip, windowMs = 10000, max = 8) {
  const now = Date.now();
  const bucket = RL.get(ip) || [];
  const fresh = bucket.filter((t) => now - t < windowMs);
  fresh.push(now);
  RL.set(ip, fresh);
  return fresh.length <= max;
}

function getBearerToken(event) {
  const auth = event.headers.authorization || event.headers.Authorization || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function sanitizeText(s = "") {
  return String(s).replace(/[<>]/g, "");
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: baseHeaders };
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      statusCode: 500,
      headers: baseHeaders,
      body: JSON.stringify({ error: "Missing Supabase env (URL/ANON_KEY)" }),
    };
  }

  // extrage tokenul
  const token = getBearerToken(event);
  if (!token) {
    return { statusCode: 401, headers: baseHeaders, body: JSON.stringify({ error: "Necesită autentificare" }) };
  }

  // client pt auth (folosim getUser(token))
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // client DB cu RLS, sub identitatea tokenului
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // validează userul
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { statusCode: 401, headers: baseHeaders, body: JSON.stringify({ error: "Token invalid" }) };
  }
  const user = userData.user;

  // GET: lista de mesaje (cu paginare)
  if (event.httpMethod === "GET") {
    try {
      const qs = event.queryStringParameters || {};
      const chat_id = qs.chat_id || qs.chatId || "";
      const from = Math.max(parseInt(qs.from || "0", 10), 0);
      const limit = Math.min(Math.max(parseInt(qs.limit || "50", 10), 1), 100);
      if (!chat_id) {
        return { statusCode: 400, headers: baseHeaders, body: JSON.stringify({ error: "chat_id obligatoriu" }) };
      }

      // IMPORTANT: RLS trebuie să te asigure că userul are dreptul la chat-ul respectiv.
      const { data, error } = await db
        .from("messages")
        .select("*")
        .eq("chat_id", chat_id)
        .order("created_at", { ascending: false })
        .range(from, from + limit - 1);

      if (error) {
        return { statusCode: 500, headers: baseHeaders, body: JSON.stringify({ error: error.message }) };
      }
      return { statusCode: 200, headers: baseHeaders, body: JSON.stringify({ ok: true, items: data || [] }) };
    } catch (e) {
      return { statusCode: 500, headers: baseHeaders, body: JSON.stringify({ error: e.message || String(e) }) };
    }
  }

  // POST: adaugă mesaj
  if (event.httpMethod === "POST") {
    // rate-limit per IP
    const ip = (event.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    if (!rateLimit(ip, 10000, 8)) {
      return { statusCode: 429, headers: baseHeaders, body: JSON.stringify({ error: "Prea des. Încearcă mai târziu." }) };
    }

    try {
      const body = JSON.parse(event.body || "{}");
      const chat_id = body.chat_id || body.chatId || "";
      const text = sanitizeText(body.text || body.message || "");

      if (!chat_id || !text.trim()) {
        return { statusCode: 400, headers: baseHeaders, body: JSON.stringify({ error: "Date invalide" }) };
      }

      const { data, error } = await db
        .from("messages")
        .insert([{ chat_id, sender_id: user.id, text }])
        .select()
        .single();

      if (error) {
        return { statusCode: 500, headers: baseHeaders, body: JSON.stringify({ error: error.message }) };
      }
      return { statusCode: 201, headers: baseHeaders, body: JSON.stringify({ ok: true, message: data }) };
    } catch (e) {
      return { statusCode: 500, headers: baseHeaders, body: JSON.stringify({ error: e.message || String(e) }) };
    }
  }

  // Metodă neacceptată
  return { statusCode: 405, headers: baseHeaders, body: JSON.stringify({ error: "Method Not Allowed" }) };
};