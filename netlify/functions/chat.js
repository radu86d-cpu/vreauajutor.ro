// netlify/functions/chat.js
import {
  handleOptions,
  requireMethod,
  json,
  bad,
  unauthorized,
  rateLimit,
  bodyJSON,
  noCache,
} from "./_shared/utils.js";
import { supabaseFromRequest } from "./_shared/supabase.js";

export default async (req) => {
  // CORS preflight
  const pre = handleOptions(req);
  if (pre) return pre;

  // doar POST
  const notAllowed = requireMethod(req, ["POST"]);
  if (notAllowed) return notAllowed;

  // rate limit pe bucket „chat” (max 6 cereri / 15s / IP)
  const rl = rateLimit(req, { windowSec: 15, max: 6, bucket: "chat" });
  if (!rl.ok) {
    return json(
      { error: "Too Many Requests", retry_after: rl.retryAfter },
      429,
      req,
      noCache()
    );
  }

  // autentificare (token din Authorization sau cookie – vezi supabaseFromRequest)
  const supabase = supabaseFromRequest(req);
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) {
    return json({ error: "Auth error", detail: userErr.message }, 401, req, noCache());
  }
  if (!user) {
    return unauthorized("Necesită autentificare", req);
  }

  // body JSON în siguranță (cu limită ~1MB)
  const { message = "", context = null } = await bodyJSON(req);
  if (typeof message !== "string" || !message.trim()) {
    return bad("Mesaj invalid", 400, req);
  }

  // === TODO: integrează LLM-ul aici (folosește chei doar din ENV, nu din client) ===
  // EXEMPlU (pseudo):
  // const r = await fetch("https://api.openai.com/v1/chat/completions", {
  //   method: "POST",
  //   headers: {
  //     "Content-Type": "application/json",
  //     "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
  //   },
  //   body: JSON.stringify({
  //     model: "gpt-4o-mini",
  //     messages: [
  //       { role: "system", content: "You are AjutorBot..." },
  //       { role: "user",   content: message }
  //     ],
  //   }),
  // });
  // if (!r.ok) {
  //   const t = await r.text();
  //   return json({ error: "LLM upstream error", detail: t }, 502, req, noCache());
  // }
  // const data = await r.json();
  // const reply = data.choices?.[0]?.message?.content?.trim() || "Nu am un răspuns.";

  // Pentru moment, facem echo controlat (max 500 chars), ca fallback de test:
  const reply = `Echo: ${message.slice(0, 500)}`;

  return json(
    {
      ok: true,
      reply,
      has_context: !!context,
      user_id: user.id,
    },
    200,
    req,
    noCache()
  );
};