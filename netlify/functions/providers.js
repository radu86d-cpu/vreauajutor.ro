// netlify/functions/providers.js
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// helpers
const stripDiacritics = (s = "") => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const norm = (s = "") => stripDiacritics((s || "").trim()).toLowerCase();

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "public, max-age=30, s-maxage=30",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
  if (event.httpMethod !== "GET")
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };

  try {
    const qs = event.queryStringParameters || {};
    const judetQ = (qs.judet || "").trim();
    const orasQ = (qs.oras || "").trim();
    const serviceQ = (qs.service || "").trim();
    const subParam = (qs.subcat || "").trim();
    const kidParam = (qs.subsub || "").trim();

    // paginare + sort
    const page = Math.max(parseInt(qs.page || "1", 10), 1);
    const perPage = Math.min(Math.max(parseInt(qs.per_page || "12", 10), 1), 50);
    const sort = qs.sort || "new"; // new | old | name

    // normalize
    const J = norm(judetQ);
    const O = norm(orasQ);

    // caută service după nume
    let wantedServiceName = "";
    if (serviceQ) {
      const { data: allServices } = await supabase.from("services").select("id, name");
      const nWanted = norm(serviceQ);
      const match =
        (allServices || []).find((s) => norm(s.name) === nWanted) ||
        (allServices || []).find((s) => norm(s.name).includes(nWanted) || nWanted.includes(norm(s.name)));
      wantedServiceName = match?.name || "";
    }

    // citește din view (dacă nu există, fallback la tabela providers)
    let rows = [];
    let error = null;
    try {
      const resp = await supabase
        .from("v_search_providers")
        .select("id, company_name, description, service_name, judet, oras, created_at, is_online, subcat_ids");
      rows = resp.data || [];
      error = resp.error;
    } catch (e) {
      error = e;
    }

    if (error) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "View v_search_providers lipsește." }) };
    }

    // filtre JS
    let filtered = rows.filter((r) => {
      if (J && norm(r.judet) !== J) return false;
      if (O && norm(r.oras) !== O) return false;

      if (serviceQ) {
        const rn = norm(r.service_name);
        const S = norm(wantedServiceName || serviceQ);
        if (wantedServiceName) {
          if (rn !== S) return false;
        } else {
          if (!(rn === S || rn.includes(S) || S.includes(rn))) return false;
        }
      }
      return true;
    });

    // subcategorii
    const subId = /^\d+$/.test(subParam) ? parseInt(subParam, 10) : null;
    const kidId = /^\d+$/.test(kidParam) ? parseInt(kidParam, 10) : null;
    if (kidId) {
      filtered = filtered.filter((r) => Array.isArray(r.subcat_ids) && r.subcat_ids.includes(kidId));
    } else if (subId) {
      filtered = filtered.filter((r) => Array.isArray(r.subcat_ids) && r.subcat_ids.includes(subId));
    }

    // sortare
    if (sort === "old") {
      filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (sort === "name") {
      filtered.sort((a, b) => (a.company_name || "").localeCompare(b.company_name || ""));
    } else {
      filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    // paginare
    const total = filtered.length;
    const from = (page - 1) * perPage;
    const to = Math.min(from + perPage, total);
    const items = filtered.slice(from, to);

    return { statusCode: 200, headers, body: JSON.stringify({ items, total, page, per_page: perPage }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message || String(e) }) };
  }
};