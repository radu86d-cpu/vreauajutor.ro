// netlify/functions/lists.js
// Liste pentru selectoare: signup + homepage (judet/oras/servicii)

const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Helpers
const strip = (s = "") => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const norm = (s = "") => strip(String(s).trim()).toLowerCase();
const titleCase = (s = "") => {
  const t = String(s || "").trim().toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
};

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "public, max-age=60, s-maxage=60",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const qs = event.queryStringParameters || {};
    const mode = (qs.mode || "").trim();
    const judetQ = (qs.judet || "").trim();
    const orasQ = (qs.oras || "").trim();

    // === MODE=SIGNUP ===
    if (mode === "signup") {
      if (!judetQ) {
        // 1) Toate serviciile
        const { data: svc, error: e1 } = await supabase.from("services").select("id, name").order("name");
        if (e1) throw e1;
        const services = (svc || []).map((s) => ({ name: s.name, label: titleCase(s.name) }));

        // 2) Toate județele
        const { data: locs, error: e2 } = await supabase.from("locations").select("judet");
        if (e2) throw e2;
        const judMap = new Map();
        for (const r of locs || []) {
          const k = norm(r.judet);
          if (k && !judMap.has(k)) judMap.set(k, titleCase(r.judet));
        }
        const judete = Array.from(judMap.values()).sort((a, b) => a.localeCompare(b, "ro"));

        return { statusCode: 200, headers, body: JSON.stringify({ services, judete }) };
      } else {
        // Orașe pentru un județ dat
        const judKey = norm(judetQ);
        const { data: locs, error: e3 } = await supabase.from("locations").select("oras, judet");
        if (e3) throw e3;

        const map = new Map();
        for (const r of locs || []) {
          if (norm(r.judet) !== judKey) continue;
          const k = norm(r.oras);
          if (k && !map.has(k)) map.set(k, titleCase(r.oras));
        }
        const orase = Array.from(map.values()).sort((a, b) => a.localeCompare(b, "ro"));
        return { statusCode: 200, headers, body: JSON.stringify({ orase }) };
      }
    }

    // === HOMEPAGE SELECTORS ===

    // 1) Toate județele cu furnizori activi
    if (!judetQ && !orasQ) {
      const { data, error } = await supabase.from("providers").select("judet").eq("is_active", true);
      if (error) throw error;

      const map = new Map();
      for (const r of data || []) {
        const k = norm(r.judet);
        if (k && !map.has(k)) map.set(k, titleCase(r.judet));
      }
      const judete = Array.from(map.values()).sort((a, b) => a.localeCompare(b, "ro"));
      return { statusCode: 200, headers, body: JSON.stringify({ judete }) };
    }

    // 2) Orașe pentru un județ
    if (judetQ && !orasQ) {
      const judKey = norm(judetQ);
      const { data, error } = await supabase.from("providers").select("oras, judet").eq("is_active", true);
      if (error) throw error;

      const map = new Map();
      for (const r of data || []) {
        if (norm(r.judet) !== judKey) continue;
        const k = norm(r.oras);
        if (k && !map.has(k)) map.set(k, titleCase(r.oras));
      }
      const orase = Array.from(map.values()).sort((a, b) => a.localeCompare(b, "ro"));
      return { statusCode: 200, headers, body: JSON.stringify({ orase }) };
    }

    // 3) Servicii pentru un (judet, oras)
    if (judetQ && orasQ) {
      const judKey = norm(judetQ);
      const orasKey = norm(orasQ);

      const { data, error } = await supabase
        .from("providers")
        .select("service_id, services(name), judet, oras")
        .eq("is_active", true);
      if (error) throw error;

      const byId = new Map();
      for (const r of data || []) {
        if (norm(r.judet) !== judKey) continue;
        if (norm(r.oras) !== orasKey) continue;
        const sid = r.service_id;
        const sname = r.services?.name;
        if (sid && sname && !byId.has(sid)) byId.set(sid, { id: sid, name: titleCase(sname) });
      }
      const servicii = Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, "ro"));
      return { statusCode: 200, headers, body: JSON.stringify({ servicii }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: "Parametri invalizi" }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message || String(e) }) };
  }
};