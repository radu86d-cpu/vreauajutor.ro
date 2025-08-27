// netlify/functions/register_provider.js
import { json, bad, method, rateLimit, bodyJSON, handleOptions } from "./_shared/utils.js";
import { supabaseFromRequest, sbAdmin } from "./_shared/supabase.js";

/* ===== Helpers locale ===== */
const strip = (s = "") => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const norm  = (s = "") => strip(String(s).trim()).toLowerCase();
const titleCaseRO = (s = "") =>
  String(s).trim().toLowerCase().replace(/\s+/g, " ")
    .split(" ").map(w => (w ? w[0].toUpperCase() + w.slice(1) : "")).join(" ");

function ensureArrayOfIds(val) {
  const ids = new Set();
  const add = (v) => { const s = String(v ?? ""); if (/^\d+$/.test(s)) ids.add(parseInt(s, 10)); };
  if (Array.isArray(val)) val.forEach(add);
  else if (typeof val === "string" && val.trim()) val.split(",").forEach(add);
  else if (val != null) add(val);
  return Array.from(ids);
}

/* ===== Handler ===== */
export default async (req) => {
  // CORS / preflight
  const opt = handleOptions(req);
  if (opt) return opt;

  const m = method(req, ["POST"]);
  if (m === "METHOD_NOT_ALLOWED") return bad("Method Not Allowed", 405);

  if (!rateLimit(req, { windowSec: 20, max: 10 })) {
    return bad("Prea multe cereri. Încearcă mai târziu.", 429);
  }
  if (!sbAdmin) return bad("Server misconfigured (no service role key)", 500);

  // Autentificare pe token (Bearer sau cookie) → extragem user-ul
  const supa = supabaseFromRequest(req);
  const { data: { user }, error: uerr } = await supa.auth.getUser();
  if (uerr || !user) return bad("Trebuie să fii autentificat.", 401);

  // Body
  const body = await bodyJSON(req);
  const {
    company_name,
    service_name,
    judet,
    oras,
    phone,
    email,
    description,
    subcat,        // poate fi id sau string
    subsub,        // idem
    subsubs        // array sau string cu ids separate prin virgulă
  } = body || {};

  // Validări minime
  const required = { company_name, service_name, judet, oras };
  for (const [k, v] of Object.entries(required)) {
    if (!v || String(v).trim() === "") return bad(`Lipsește: ${k}`);
  }

  /* ===== Găsire service_id după service_name (cu fallback fără diacritice) ===== */
  let serviceId = null;

  // 1) Match exact
  {
    const { data: svcExact, error: e1 } = await sbAdmin
      .from("services")
      .select("id, name")
      .eq("name", service_name)
      .maybeSingle();
    if (e1) return bad(e1.message, 500);
    if (svcExact?.id) serviceId = svcExact.id;
  }

  // 2) Fallback – fără diacritice / insensitive
  if (!serviceId) {
    const { data: allS, error: e2 } = await sbAdmin.from("services").select("id, name");
    if (e2) return bad(e2.message, 500);

    const target = norm(service_name);
    const found =
      (allS || []).find(s => norm(s.name) === target) ||
      (allS || []).find(s => norm(s.name).includes(target) || target.includes(norm(s.name)));

    if (found?.id) serviceId = found.id;
  }

  if (!serviceId) return bad("Serviciu inexistent.");

  /* ===== Inserare provider ===== */
  const insertProvider = {
    user_id:      user.id,
    company_name: String(company_name).trim(),
    description:  (description || "").trim() || null,
    service_id:   serviceId,
    judet:        titleCaseRO(judet),
    oras:         titleCaseRO(oras),
    phone:        (phone || "").trim() || null,
    email:        (email || "").trim() || null,
    is_active:    true,
  };

  const { data: provRows, error: insErr } = await sbAdmin
    .from("providers")
    .insert(insertProvider)
    .select("id, company_name")
    .limit(1);

  if (insErr) {
    if (insErr.code === "23505") return bad("Compania există deja.", 409); // unique_violation
    return bad(insErr.message || "Eroare la inserare provider", 500);
  }

  const provider = provRows?.[0];
  if (!provider?.id) return bad("Insert provider fără id.", 500);
  const providerId = provider.id;

  /* ===== Legare subcategorii / copii ===== */
  const candidateIds = ensureArrayOfIds([subcat, subsub, subsubs].flat());

  if (candidateIds.length) {
    // Validăm că subcategoriile există
    const { data: subs, error: sErr } = await sbAdmin
      .from("subcategories")
      .select("id")
      .in("id", candidateIds);
    if (sErr) return bad(sErr.message, 500);

    const validIds = new Set((subs || []).map(r => r.id));
    const rows = candidateIds
      .filter(id => validIds.has(id))
      .map(id => ({ provider_id: providerId, subcategory_id: id }));

    if (rows.length) {
      // Dacă ai o constrângere unică (provider_id, subcategory_id), poți folosi upsert
      const { error: linkErr } = await sbAdmin
        .from("provider_subcategories")
        .upsert(rows, { onConflict: "provider_id,subcategory_id", ignoreDuplicates: true });

      if (linkErr && linkErr.code !== "23505") {
        // dacă nu ai onConflict configurat corect, revenim pe insert în buclă, ignorând duplicatele
        for (const r of rows) {
          const { error } = await sbAdmin.from("provider_subcategories").insert(r);
          if (error && error.code !== "23505") return bad(error.message, 500);
        }
      }
    }
  }

  return json({ ok: true, provider }, 201);
};
```0