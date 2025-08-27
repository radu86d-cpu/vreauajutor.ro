// netlify/functions/taxonomy.js
import { json, bad, method, handleOptions } from "./_shared/utils.js";
import { createClient } from "@supabase/supabase-js";

const CACHE_HDR = { "Cache-Control": "public, max-age=60, s-maxage=60" };

// Helpers diacritice / comparare tolerantă
const strip = (s = "") => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const norm = (s = "") => strip(String(s).trim()).toLowerCase();
const title = (s = "") => {
  const t = String(s || "").trim();
  if (!t) return "";
  const low = t.toLowerCase();
  return low.charAt(0).toUpperCase() + low.slice(1);
};

function areaFilterFactory(judetQ, orasQ) {
  const J = norm(judetQ || "");
  const O = norm(orasQ || "");
  return (row) => {
    if (J && norm(row.judet) !== J) return false;
    if (O && norm(row.oras) !== O) return false;
    return true;
  };
}

export default async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  const m = method(req, ["GET"]);
  if (m === "METHOD_NOT_ALLOWED") return bad("Method Not Allowed", 405);

  // ENV + DB
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return bad("Missing Supabase env", 500);
  }
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  try {
    const url = new URL(req.url);
    const mode = (url.searchParams.get("mode") || "").trim();

    // opționale – folosite DOAR pentru COUNT (nu influențează existența taxonomiei)
    const judetQ = (url.searchParams.get("judet") || "").trim();
    const orasQ = (url.searchParams.get("oras") || "").trim();
    const areaOK = areaFilterFactory(judetQ, orasQ);

    // ===================== SUBCATEGORIES =====================
    if (mode === "subcategories") {
      const svcNameQ = (url.searchParams.get("service") || "").trim();
      if (!svcNameQ) return json({ subcategories: [] }, 200, CACHE_HDR);

      // 1) mapăm numele serviciului -> service_id (tolerant la diacritice)
      const { data: allS, error: eS } = await db.from("services").select("id,name");
      if (eS) throw eS;
      const target = norm(svcNameQ);
      const svc =
        (allS || []).find((s) => norm(s.name) === target) ||
        (allS || []).find((s) => norm(s.name).includes(target) || target.includes(norm(s.name)));
      if (!svc?.id) {
        // fallback total pe taxonomy_flat după nume raw
        const { data: flat2 } = await db
          .from("taxonomy_flat")
          .select("service_name, subcat_name");
        const wanted = norm(svcNameQ);
        const uniq = new Set();
        (flat2 || []).forEach((r) => {
          if (norm(r.service_name) === wanted && r.subcat_name) {
            uniq.add(r.subcat_name.trim());
          }
        });
        const subcategories = [...uniq]
          .sort((a, b) => a.localeCompare(b, "ro"))
          .map((name) => ({ id: null, name, count: 0 }));
        return json({ subcategories }, 200, CACHE_HDR);
      }

      // 2) luăm subcategoriile de nivel 1 pentru acel serviciu
      const { data: subsAll, error: eSub } = await db
        .from("subcategories")
        .select("id, name, parent_id, service_id")
        .eq("service_id", svc.id);
      if (eSub) throw eSub;

      const top = (subsAll || []).filter((s) => !s.parent_id);
      if (!top.length) {
        // fallback pe taxonomy_flat când nu ai subcategories tabelate
        const { data: flat, error: flatErr } = await db
          .from("taxonomy_flat")
          .select("subcat_name")
          .eq("service_id", svc.id);
        if (flatErr) throw flatErr;

        const uniq = new Set();
        (flat || []).forEach((r) => {
          const n = (r.subcat_name || "").trim();
          if (n) uniq.add(n);
        });
        const subcategories = [...uniq]
          .sort((a, b) => a.localeCompare(b, "ro"))
          .map((name) => ({ id: null, name, count: 0 }));
        return json({ subcategories }, 200, CACHE_HDR);
      }

      // 3) calcul COUNT pe furnizori activi în zonă: părinte sau oricare din copiii lui
      //    a) colectăm copiii pentru fiecare părinte
      const childrenByParent = new Map();
      (subsAll || []).forEach((s) => {
        if (s.parent_id) {
          if (!childrenByParent.has(s.parent_id)) childrenByParent.set(s.parent_id, []);
          childrenByParent.get(s.parent_id).push(s.id);
        }
      });

      //    b) furnizori activi pentru serviciu + zonă
      const { data: provAll, error: eP } = await db
        .from("providers")
        .select("id,is_active,judet,oras,service_id");
      if (eP) throw eP;

      const activeSvc = (provAll || []).filter(
        (p) => p.is_active && p.service_id === svc.id && areaOK(p)
      );
      const providerIds = activeSvc.map((p) => p.id);

      let links = [];
      if (providerIds.length) {
        const { data: linkRows, error: eL } = await db
          .from("provider_subcategories")
          .select("provider_id, subcategory_id")
          .in("provider_id", providerIds);
        if (eL) throw eL;
        links = linkRows || [];
      }

      // map provider -> Set(subcategory_id)
      const setByProvider = new Map();
      for (const row of links) {
        if (!setByProvider.has(row.provider_id)) setByProvider.set(row.provider_id, new Set());
        setByProvider.get(row.provider_id).add(row.subcategory_id);
      }

      //    c) pentru fiecare părinte: count dacă provider are părintele sau vreun copil
      const subcategories = top
        .map((t) => {
          const kids = new Set(childrenByParent.get(t.id) || []);
          let count = 0;
          for (const p of activeSvc) {
            const s = setByProvider.get(p.id);
            if (!s) continue;
            if (s.has(t.id)) {
              count++;
              continue;
            }
            for (const k of kids) {
              if (s.has(k)) {
                count++;
                break;
              }
            }
          }
          return { id: t.id, name: title(t.name), count };
        })
        .filter((x) => x.name)
        .sort((a, b) => a.name.localeCompare(b.name, "ro"));

      return json({ subcategories }, 200, CACHE_HDR);
    }

    // ===================== CHILDREN =====================
    if (mode === "children") {
      const raw = (url.searchParams.get("subcat") || "").trim();
      if (!raw) return json({ children: [] }, 200, CACHE_HDR);

      // numeric id → copii reali din `subcategories`
      if (/^\d+$/.test(raw)) {
        const parentId = parseInt(raw, 10);

        const { data: parent, error: ePar } = await db
          .from("subcategories")
          .select("id, service_id")
          .eq("id", parentId)
          .maybeSingle();
        if (ePar) throw ePar;
        if (!parent?.service_id) return json({ children: [] }, 200, CACHE_HDR);

        const { data: kids, error: eKids } = await db
          .from("subcategories")
          .select("id, name, parent_id")
          .eq("parent_id", parentId);
        if (eKids) throw eKids;

        if (!kids?.length) return json({ children: [] }, 200, CACHE_HDR);

        // count: furnizori activi în zonă pentru serviciul părintelui, care au acel child
        const { data: provAll, error: eP } = await db
          .from("providers")
          .select("id,is_active,judet,oras,service_id");
        if (eP) throw eP;
        const activeSvc = (provAll || []).filter(
          (p) => p.is_active && p.service_id === parent.service_id && areaOK(p)
        );
        const providerIds = activeSvc.map((p) => p.id);

        let links = [];
        if (providerIds.length) {
          const { data: linkRows, error: eL } = await db
            .from("provider_subcategories")
            .select("provider_id, subcategory_id")
            .in("provider_id", providerIds);
          if (eL) throw eL;
          links = linkRows || [];
        }
        const setByProvider = new Map();
        for (const row of links) {
          if (!setByProvider.has(row.provider_id)) setByProvider.set(row.provider_id, new Set());
          setByProvider.get(row.provider_id).add(row.subcategory_id);
        }

        const children = (kids || [])
          .map((k) => {
            let count = 0;
            for (const p of activeSvc) {
              const s = setByProvider.get(p.id);
              if (s && s.has(k.id)) count++;
            }
            return { id: k.id, name: title(k.name), count };
          })
          .filter((x) => x.name)
          .sort((a, b) => a.name.localeCompare(b.name, "ro"));

        return json({ children }, 200, CACHE_HDR);
      }

      // ALTMINTERI: tratăm `subcat` ca Nume → fallback taxonomy_flat
      const subcatName = raw;
      const { data: flat, error: fErr } = await db
        .from("taxonomy_flat")
        .select("child_name, subcat_name")
        .eq("subcat_name", subcatName);
      if (fErr) throw fErr;

      const uniq = new Set();
      (flat || []).forEach((r) => {
        const n = (r.child_name || "").trim();
        if (n) uniq.add(n);
      });

      const children = [...uniq]
        .sort((a, b) => a.localeCompare(b, "ro"))
        .map((name) => ({ id: null, name, count: 0 }));

      return json({ children }, 200, CACHE_HDR);
    }

    return bad("Unknown mode", 400);
  } catch (e) {
    return bad(e?.message || "Server error", 500);
  }
};