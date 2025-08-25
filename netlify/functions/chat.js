import { cors, json, bad, method, rateLimit } from "./_shared/utils.js";
import { supabaseFromRequest } from "./_shared/supabase.js";

export default async (req) => {
  const m = method(req, ["POST"]);
  const headers = cors(req);
  if (m === "OPTIONS") return new Response(null, { status: 204, headers });
  if (!rateLimit(req, { windowSec: 15, max: 6 })) return bad("Prea multe cereri", 429);

  const supabase = supabaseFromRequest(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return bad("Necesită autentificare", 401);

  let body = {};
  try { body = await req.json(); } catch {}
  const { message, context } = body;
  if (typeof message !== "string" || !message.trim()) return bad("Mesaj invalid");

  // TODO: aici faci apelul la LLM folosind chei doar din env (NU din client).
  // Exemplu (pseudocod):
  // const resp = await fetch("https://api.openai.com/v1/chat/completions", { ... });
  // return json({ ok: true, reply: respText }, { headers });

  return json({ ok: true, echo: message.slice(0, 500), ctx: !!context }, { headers });
};
