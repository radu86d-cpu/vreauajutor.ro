// netlify/functions/create-offer.js
import {
  json,
  bad,
  method,
  rateLimit,
  bodyJSON,
  handleOptions,
} from "./_shared/utils.js";
import { verifyOtpToken } from "./_shared/tokens.js";
import { sbAdmin, supabaseFromRequest } from "./_shared/supabase.js";

/* ---------- Helpers ---------- */
function normStr(v = "", max = 2000) {
  return String(v || "").trim().slice(0, max);
}
function isEmail(v = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
// Normalizează numărul: scoate spații/dash-uri, 0040 -> +40, +40... ok
function normalizePhone(v = "") {
  let s = String(v || "").trim().replace(/\s|-/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (/^0\d{9,}$/.test(s)) s = "+4" + s.slice(1); // heuris. RO: 07... -> +407...
  if (!s.startsWith("+") && /^\d+$/.test(s)) s = "+" + s;
  return s;
}
// E.164 simplu (8–15 cifre, fără zero la începutul MSISDN)
function isE164(v = "") {
  return /^\+?[1-9]\d{7,14}$/.test(v);
}

/* ---------- Handler ---------- */
export default async (req) => {
  // CORS preflight
  const pre = handleOptions(req);
  if (pre) return pre;

  // Doar POST
  const m = method(req, ["POST"]);
  if (m === "METHOD_NOT_ALLOWED") return bad("Method Not Allowed", 405);

  // Rate limit (10 cereri / 30s / IP)
  if (!rateLimit(req, { windowSec: 30, max: 10 })) {
    return bad("Prea multe încercări. Încearcă mai târziu.", 429);
  }

  if (!sbAdmin) return bad("Server misconfigured (no service role key)", 500);

  // Body
  const {
    email: rawEmail,
    phone: rawPhone,
    serviceId,
    descriere: rawDescriere,
    otpToken,
    meta = null, // opțional: extra câmpuri (de ex. judet/oras)
  } = await bodyJSON(req);

  // Curățare & validări
  const email = normStr(rawEmail, 320);
  const phone = normalizePhone(normStr(rawPhone, 32));
  const description = normStr(rawDescriere, 2000);

  if (!isEmail(email)) return bad("Email invalid.", 400);
  if (!isE164(phone)) return bad("Telefon invalid (E.164).", 400);
  if (!serviceId) return bad("Alege un serviciu.", 400);

  // OTP token
  const ver = verifyOtpToken(otpToken || "");
  if (!ver.ok) return bad("Telefon neverificat sau sesiune expirată.", 401);
  if (ver.body?.phone !== phone) {
    return bad("Token OTP nu corespunde acestui număr.", 401);
  }

  // Context request (IP/User Agent)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const ua = req.headers.get("user-agent") || null;

  // Încearcă să atașezi utilizatorul (dacă este logat) — nu e obligatoriu
  let created_by = null;
  try {
    const supa = supabaseFromRequest(req);
    const { data: { user } = {} } = await supa.auth.getUser();
    if (user?.id) created_by = user.id;
  } catch {
    // non-fatal
  }

  // Insert
  const payload = {
    email,
    phone,
    service_id: serviceId,
    description,
    source_ip: ip,
    user_agent: ua,
    created_by,            // poate fi null
    meta: meta ?? null,    // JSONB opțional în tabel
  };

  const { data, error } = await sbAdmin
    .from("offers")
    .insert(payload)
    .select("id, created_at")
    .single();

  if (error) return bad(error.message || "Eroare la salvare", 500);

  // 201 Created + no-store (e o operațiune de mutație)
  return json(
    { ok: true, id: data.id, created_at: data.created_at },
    201,
    { "Cache-Control": "no-store" }
  );
};