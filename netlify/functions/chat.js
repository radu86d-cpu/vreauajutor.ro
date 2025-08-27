// netlify/functions/chat.js
import { json, bad, method, rateLimit, bodyJSON, handleOptions } from "./_shared/utils.js";
import { supabaseFromRequest } from "./_shared/supabase.js";

/**
 * Variabile de mediu necesare (setate în Netlify → Site settings → Environment):
 *  - OPENAI_API_KEY   (opțional; dacă lipsește, folosim fallback local)
 *
 * Opțional: poți schimba modelul fără alte modificări.
 */
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL   = process.env.OPENAI_MODEL   || "gpt-4o-mini";

/**
 * Mic utilitar: taie textul la N caractere, pentru a evita abuzul.
 */
function clampText(s = "", max = 1200) {
  const t = String(s);
  return t.length > max ? t.slice(0, max) + "…" : t;
}

export default async (req) => {
  // CORS preflight
  const opt = handleOptions(req);
  if (opt) return opt;

  // Acceptăm doar POST
  const m = method(req, ["POST"]);
  if (m === "METHOD_NOT_ALLOWED") return bad("Method Not Allowed", 405);

  // Rate-limit simplu (IP-based)
  if (!rateLimit(req, { windowSec: 15, max: 8 })) {
    return bad("Prea multe cereri. Încearcă peste câteva secunde.", 429);
  }

  // Autentificare (trebuie să fii logat în Supabase)
  const supabase = supabaseFromRequest(req);
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return bad("Necesită autentificare", 401);

  // Body
  const { message = "", context } = await bodyJSON(req);
  const userMessage = clampText(message, 1500).trim();
  if (!userMessage) return bad("Mesaj invalid");

  // Dacă nu avem cheie OpenAI, răspundem cu fallback (eco + notă)
  if (!OPENAI_API_KEY) {
    return json({
      ok: true,
      reply: "Salut! Momentan nu pot contacta modelul AI. Îți pot repeta mesajul: " + userMessage,
      model: "fallback",
    });
  }

  // Pregătim promptul minimal (în română, concis și util)
  const messages = [
    {
      role: "system",
      content:
        "Ești AjutorBot pe VreauAjutor.ro. Răspunde concis, prietenos și în limba română. " +
        "Dacă utilizatorul cere ceva ce nu ține de site, oferă un răspuns util sau o clarificare scurtă.",
    },
    { role: "user", content: userMessage },
  ];

  // (Opțional) dacă ne trimiți deja context (array cu {role, content}), îl îmbinăm
  if (Array.isArray(context)) {
    // luăm doar câteva mesaje, scurtate, ca să rămână simplu
    const trimmed = context
      .slice(-6)
      .map((m) => ({
        role: m?.role === "assistant" ? "assistant" : "user",
        content: clampText(String(m?.content || ""), 800),
      }))
      .filter((m) => m.content);
    if (trimmed.length) {
      // punem contextul înaintea întrebării curente
      messages.splice(1, 0, ...trimmed);
    }
  }

  // Apel OpenAI clasic (chat.completions) – simplu și stabil
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      // Nu expune tot erorile către clientul final
      return json({
        ok: true,
        reply:
          "Momentan nu pot răspunde din partea modelului AI. Poți reîncerca în curând. " +
          "Între timp, am primit mesajul tău: " + userMessage,
        model: OPENAI_MODEL,
        note: "LLM indisponibil",
      });
    }

    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "Nu am un răspuns în acest moment.";
    return json({
      ok: true,
      reply,
      model: OPENAI_MODEL,
      usage: data?.usage || undefined,
    });
  } catch (e) {
    // Fallback în caz de network error etc.
    return json({
      ok: true,
      reply:
        "A apărut o problemă la contactarea modelului AI. Reîncearcă te rog. " +
        "Mesajul tău a fost: " + userMessage,
      model: OPENAI_MODEL,
      note: "Eroare la rețea sau API",
    });
  }
};