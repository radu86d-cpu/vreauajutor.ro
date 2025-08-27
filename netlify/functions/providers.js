// netlify/functions/providers.js
// Listare furnizori (filtre + sort + paginare) — variantă simplă & robustă

const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Helpers pentru căutare tolerantă (fără diacritice)
const stripDiacritics = (s = "") => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const norm = (s = "") => stripDiacritics(String(s).trim()).toLowerCase();

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "public, max-age=30, s-maxage=30",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const qs = event.queryStringParameters || {};
    const judetQ   = (qs.judet   || "").trim();
    const orasQ    = (qs.oras    || "").trim();
    const serviceQ = (qs.service || "").trim();
    const subParam = (qs.subcat  || "").trim();
    const kidParam = (qs.subsub  || "").trim();
    const sort     = (qs.sort    || "new").toLowerCase(); // new | old | name
    const page     = Math.max(parseInt(qs.page || "1", 10), 1);
    const perPage  = Math.min(Math.max(parseInt(qs.per_page || "12", 10), 1), 50);

    // 1) Încercăm să reducem cât de cât datele direct din DB (ilike),
    // apoi facem normalizare în JS ca să nu ne încurcăm în diacritice.
    let base = supabase
      .from("v_search_providers")
      .select("id, company_name, description, service_name, judet, oras, created_at, is_online, subcat_ids, logo, photo_url");

    // Filtre “largi” (case-insensitive) — evităm să ratăm rezultate
    if (judetQ)   base = base.ilike("judet", `%${judetQ}%`);
    if (orasQ)    base = base.ilike("oras", `%${orasQ}%`);
    if (serviceQ) base = base.ilike("service_name", `%${serviceQ}%`);

    const { data: rows, error } = await base;
    if (error) throw error;

    // 2) Filtrare fină în JS cu normalizare fără diacritice
    const J = norm(judetQ), O = norm(orasQ), S = norm(serviceQ);
    const isNum = (v) => /^\d+$/.test(String(v || ""));

    let filtered = (rows || []).filter((r) => {
      if (J && norm(r.judet) !== J) return false;
      if (O && norm(r.oras)  !== O) return false;
      if (S) {
        const sv = norm(r.service_name || "");
        // acceptă egalitate sau “conține” în ambele sensuri (pentru cazuri precum “curatenie” vs “curatenie generala”)
        if (!(sv === S || sv.includes(S) || S.includes(sv))) return false;
      }
      return true;
    });

    // 3) Subcategorie / copil (dacă vin ca ID numeric)
    const subId = isNum(subParam) ? parseInt(subParam, 10) : null;
    const kidId = isNum(kidParam) ? parseInt(kidParam, 10) : null;
    if (kidId) {
      filtered = filtered.filter((r) => Array.isArray(r.subcat_ids) && r.subcat_ids.includes(kidId));
    } else if (subId) {
      filtered = filtered.filter((r) => Array.isArray(r.subcat_ids) && r.subcat_ids.includes(subId));
    }

    // 4) Sortare
    if (sort === "old") {
      filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (sort === "name") {
      filtered.sort((a, b) => (a.company_name || "").localeCompare(b.company_name || "", "ro"));
    } else {
      // "new"
      filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    // 5) Paginare în JS
    const total = filtered.length;
    const from = (page - 1) * perPage;
    const to = Math.min(from + perPage, total);
    const items = filtered.slice(from, to);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ items, total, page, per_page: perPage }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message || String(e) }),
    };
  }
};