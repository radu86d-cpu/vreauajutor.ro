// netlify/functions/providers.js
import { cors, json, bad, method, handleOptions } from "./_shared/utils.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// helpers
const strip = (s="") => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const norm  = (s="") => strip(s.trim()).toLowerCase();

export default async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  const m = method(req, ["GET"]);
  if (m === "METHOD_NOT_ALLOWED") return bad("Method Not Allowed", 405);

  try {
    const url = new URL(req.url);
    const qs  = url.searchParams;

    const judetQ   = qs.get("judet")   || "";
    const orasQ    = qs.get("oras")    || "";
    const serviceQ = qs.get("service") || "";
    const subParam = qs.get("subcat")  || "";
    const kidParam = qs.get("subsub")  || "";

    // paginare + sort
    const page    = Math.max(parseInt(qs.get("page") || "1", 10), 1);
    const perPage = Math.min(Math.max(parseInt(qs.get("per_page") || "12", 10), 1), 50);
    const sort    = qs.get("sort") || "new";

    // 1) Mapăm serviceQ la denumirea exactă din tabela services
    let wantedServiceName = "";
    if (serviceQ) {
      const { data: allServices, error: svcErr } = await supabase.from("services").select("id,name");
      if (svcErr) throw svcErr;
      const nWanted = norm(serviceQ);
      const match = (allServices || []).find(s => norm(s.name) === nWanted)
                 || (allServices || []).find(s => norm(s.name).includes(nWanted) || nWanted.includes(norm(s.name)));
      wantedServiceName = match?.name || "";
    }

    // 2) Citim din view
    const { data: rows, error } = await supabase
      .from("v_search_providers")
      .select("id, company_name, description, service_name, judet, oras, created_at, is_online, subcat_ids");
    if (error) throw error;

    // 3) Filtrăm în JS (normalize diacritice)
    const J = norm(judetQ), O = norm(orasQ);
    const S = wantedServiceName ? norm(wantedServiceName) : (serviceQ ? norm(serviceQ) : "");

    let filtered = (rows || []).filter(r => {
      if (J && norm(r.judet) !== J) return false;
      if (O && norm(r.oras)  !== O) return false;
      if (S) {
        const rn = norm(r.service_name);
        if (wantedServiceName) {
          if (rn !== S) return false;
        } else {
          if (!(rn === S || rn.includes(S) || S.includes(rn))) return false;
        }
      }
      return true;
    });

    // 4) Subcategorii
    const subId = /^\d+$/.test(subParam) ? subParam : null;
    const kidId = /^\d+$/.test(kidParam) ? kidParam : null;
    if (kidId) {
      filtered = filtered.filter(r => Array.isArray(r.subcat_ids) && r.subcat_ids.includes(kidId));
    } else if (subId) {
      filtered = filtered.filter(r => Array.isArray(r.subcat_ids) && r.subcat_ids.includes(subId));
    }

    // 5) Sort
    if (sort === "old") {
      filtered.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (sort === "name") {
      filtered.sort((a,b) => (a.company_name || "").localeCompare(b.company_name || ""));
    } else {
      filtered.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    }

    // 6) Paginare
    const total = filtered.length;
    const from = (page - 1) * perPage;
    const to   = Math.min(from + perPage, total);
    const items = filtered.slice(from, to);

    return json({ items, total, page, per_page: perPage, pages: Math.ceil(total/perPage) });
  } catch (e) {
    return bad(e.message || String(e), 500);
  }
};