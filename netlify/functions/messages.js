import { cors, json, bad, method, rateLimit } from "./_shared/utils.js";
import { supabaseFromRequest } from "./_shared/supabase.js";

export default async (req) => {
  const m = method(req, ["GET","POST"]);
  const headers = cors(req);
  if (m === "OPTIONS") return new Response(null, { status: 204, headers });

  const supabase = supabaseFromRequest(req);
  const { data: { user }, error: uerr } = await supabase.auth.getUser();
  if (uerr || !user) return bad("Necesită autentificare", 401);

  if (m === "GET") {
    const url = new URL(req.url);
    const chatId = url.searchParams.get("chat_id");
    const from = parseInt(url.searchParams.get("from") || "0", 10);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);
    if (!chatId) return bad("chat_id obligatoriu");

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .range(from, from + limit - 1);

    if (error) return bad(error.message, 500);
    return json({ ok: true, items: data }, { headers });
  }

  // POST
  if (!rateLimit(req, { windowSec: 10, max: 8 })) return bad("Prea des", 429);

  let body = {};
  try { body = await req.json(); } catch {}
  const { chat_id, text } = body;
  if (!chat_id || typeof text !== "string" || !text.trim()) return bad("Date invalide");

  const clean = text.replace(/[<>]/g, "");

  const { data, error } = await supabase
    .from("messages")
    .insert([{ chat_id, sender_id: user.id, text: clean }])
    .select()
    .single();

  if (error) return bad(error.message, 500);
  return json({ ok: true, message: data }, { headers });
};
