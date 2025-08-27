// netlify/functions/create-offer.js
import { json, bad, method, rateLimit, bodyJSON, handleOptions } from "./_shared/utils.js";
import { sbAdmin, supabaseFromRequest } from "./_shared/supabase.js";

/**
 * ENV necesare (Netlify → Site settings → Environment):
 *  - SUPABASE_URL
 *  - SUPABASE_ANON_KEY
 *  - SUPABASE_SERVICE_ROLE_KEY  (obligatoriu aici; inserăm server-side)
 *
 * Tabele așteptate în baza de date:
 *  - services (id, name)
 *  - offers   (id, user_id, email, phone, service_id, description, source_ip, created_at)
 */

function isEmail(v = "") { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function isE164(v = "") { return /^\+?[1-9]\d{7,14}$/.test(v); } // simplă, suficientă pt MVP

export default async (req) => {
  // CORS preflight
  const opt = handleOptions(req);
  if (opt) return opt;

  // Doar POST
  const m = method(req, ["POST"]);
  if (m === "METHOD_NOT_ALLOWED") return bad("Method Not Allowed", 405);

  // Rate-limit lejer
  if (!rateLimit(req, { windowSec: 30, max: 10 })) {
    return bad("Prea multe încercări. Încearcă mai târziu.", 429);
  }

  // Verificăm configurarea server-ului
  if (!sbAdmin) return bad("Server misconfigured (no service role key)", 500);

  // Autentificare: trebuie să fii logat (folosește tokenul Supabase din header/cookie)
  const supa = supabaseFromRequest(req);
  const { data: { user }, error: uerr } = await supa.auth.getUser();
  if (uerr || !user) return bad("Necesită autentificare", 401);

  // Body
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const { email, phone, service_id, service_name, description } = await bodyJSON(req);

  if (!isEmail(email || "")) return bad("Email invalid.");
  if (!isE164(phone || "")) return bad("Telefon invalid (format E.164).");

  // Determină serviceId: fie vine direct, fie îl rezolvăm după nume
  let finalServiceId = Number.isFinite(Number(service_id)) ? Number(service_id) : null;

  try {
    if (!finalServiceId && service_name) {
      const { data: svc, error: se } = await sbAdmin
        .from("services")
        .select("id, name")
        .ilike("name", service_name)   // tolerant la case/diacritice dacă ai setat collation potrivit
        .maybeSingle();
      if (se) throw se;
      if (!svc?.id) return bad("Serviciu inexistent.");
      finalServiceId = svc.id;
    }
    if (!finalServiceId) return bad("Lipsește service_id sau service_name valid.");
  } catch (e) {
    return bad(e?.message || "Eroare la identificarea serviciului.", 500);
  }

  // Inserare ofertă
  try {
    const { data, error } = await sbAdmin
      .from("offers")
      .insert({
        user_id: user.id,
        email,
        phone,
        service_id: finalServiceId,
        description: (description || "").trim() || null,
        source_ip: ip
      })
      .select("id")
      .single();

    if (error) throw error;

    return json({ ok: true, id: data.id });
  } catch (e) {
    return bad(e?.message || "Eroare la salvare", 500);
  }
};