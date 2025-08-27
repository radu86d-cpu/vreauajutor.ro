// netlify/functions/register_provider.js
// Creează un furnizor nou asociat unui user autentificat

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// helpers
const stripDiacritics = (s = "") => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const norm = (s = "") => stripDiacritics(String(s).trim()).toLowerCase();
const titleCase = (s = "") =>
  String(s)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ""))
    .join(" ");

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
  if (event.httpMethod !== "POST")
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Use POST" }) };

  try {
    const body = JSON.parse(event.body || "{}");

    // validări obligatorii
    const required = ["company_name", "service_name", "judet", "oras"];
    for (const k of required) {
      if (!body[k] || String(body[k]).trim() === "") {
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Lipsește: ${k}` }) };
      }
    }

    // autentificare
    const auth = event.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: "Lipsește token-ul de autentificare." }) };
    }
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: "Token invalid sau expirat." }) };
    }
    const user = userData.user;

    // găsește service_id după nume
    let serviceId = null;
    {
      const { data: svcExact, error: e1 } = await supabase
        .from("services")
        .select("id, name")
        .eq("name", body.service_name)
        .maybeSingle();
      if (e1) throw e1;
      if (svcExact?.id) serviceId = svcExact.id;
    }
    if (!serviceId) {
      const { data: all, error: e2 } = await supabase.from("services").select("id, name");
      if (e2) throw e2;
      const target = norm(body.service_name);
      const found =
        (all || []).find((s) => norm(s.name) === target) ||
        (all || []).find((s) => norm(s.name).includes(target) || target.includes(norm(s.name)));
      if (found) serviceId = found.id;
    }
    if (!serviceId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Serviciu inexistent." }) };
    }

    // creează provider
    const insert = {
      user_id: user.id,
      company_name: (body.company_name || "").trim(),
      description: (body.description || "").trim() || null,
      service_id: serviceId,
      judet: titleCase(body.judet),
      oras: titleCase(body.oras),
      phone: (body.phone || "").trim() || null,
      email: (body.email || "").trim() || null,
      is_active: true,
    };

    const { data: provRows, error: insErr } = await supabase
      .from("providers")
      .insert(insert)
      .select("id, company_name")
      .limit(1);

    if (insErr) {
      if (insErr.code === "23505") {
        return { statusCode: 409, headers, body: JSON.stringify({ error: "Compania există deja." }) };
      }
      throw insErr;
    }

    const provider = provRows?.[0];
    if (!provider?.id) throw new Error("Insert provider fără id.");

    // Subcategorii (opțional)
    const linkIds = new Set();
    const addIfNum = (v) => {
      if (/^\d+$/.test(String(v))) linkIds.add(parseInt(v, 10));
    };
    addIfNum(body.subcat);
    addIfNum(body.subsub);
    if (Array.isArray(body.subsubs)) body.subsubs.forEach(addIfNum);

    if (linkIds.size) {
      const ids = Array.from(linkIds);
      const { data: subs, error: subErr } = await supabase
        .from("subcategories")
        .select("id")
        .in("id", ids);
      if (subErr) throw subErr;

      const validIds = new Set((subs || []).map((r) => r.id));
      for (const sid of ids) {
        if (!validIds.has(sid)) continue;
        await supabase
          .from("provider_subcategories")
          .insert({ provider_id: provider.id, subcategory_id: sid })
          .catch((e) => {
            if (e.code !== "23505") throw e; // ignoră duplicate
          });
      }
    }

    return { statusCode: 201, headers, body: JSON.stringify({ ok: true, provider }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || String(err) }) };
  }
};