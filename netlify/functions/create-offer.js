// netlify/functions/create-offer.js
import { json, bad, method, rateLimit, bodyJSON, handleOptions } from "./_shared/utils.js";
import { verifyOtpToken } from "./_shared/tokens.js";
import { sbAdmin } from "./_shared/supabase.js";

function isEmail(v=""){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function isE164(v=""){ return /^\+?[1-9]\d{7,14}$/.test(v); } // simplu

export default async (req) => {
  const opt = handleOptions(req); if (opt) return opt;

  const m = method(req, ["POST"]);
  if (m === "METHOD_NOT_ALLOWED") return bad("Method Not Allowed", 405);

  if (!rateLimit(req, { windowSec: 30, max: 10 })) {
    return bad("Prea multe încercări. Încearcă mai târziu.", 429);
  }
  if (!sbAdmin) return bad("Server misconfigured (no service role key)", 500);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const { email, phone, serviceId, descriere, otpToken } = await bodyJSON(req);

  if (!isEmail(email || "")) return bad("Email invalid.");
  if (!isE164(phone || "")) return bad("Telefon invalid (E.164).");
  if (!serviceId) return bad("Alege un serviciu.");

  // verificăm tokenul OTP
  const ver = verifyOtpToken(otpToken || "");
  if (!ver.ok) return bad("Telefon neverificat sau sesiune expirată.", 401);
  if (ver.body?.phone !== phone) return bad("Token OTP nu corespunde acestui număr.", 401);

  // salvăm oferta
  const { data, error } = await sbAdmin
    .from("offers")
    .insert({
      email,
      phone,
      service_id: serviceId,
      description: descriere || null,
      source_ip: ip
    })
    .select("id")
    .single();

  if (error) return bad(error.message || "Eroare la salvare", 500);

  return json({ ok: true, id: data.id });
};
