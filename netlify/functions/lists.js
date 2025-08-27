// netlify/functions/lists.js
import { handleOptions, requireMethod, json, bad, cache } from "./_shared/utils.js";
import { sbAnon as db } from "./_shared/supabase.js";

/* ---------- Helpers ---------- */
const stripDiacritics = (s) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const norm = (s) => stripDiacritics(String(s || "").trim()).toLowerCase();
const toAsciiTitle = (s) => {
  const base = stripDiacritics(String(s || "").trim()).toLowerCase();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "";
};

/* ---------- Tabele (ajustează dacă ai alte nume) ---------- */
const TBL_PROVIDERS = "providers";         // coloane: is_active bool, judet text, oras text, service_id int
const TBL_SERVICES  = "services";          // coloane: id int, name text
const TBL_LOCATIONS = "locations";         // coloane: judet text, oras text (opțional; folosit pt signup)

export default async (req) => {
  // CORS preflight
  const pre = handleOptions(req);
  if (pre) return pre;

  // doar GET
  const notAllowed = requireMethod(req, ["GET"]);
  if (notAllowed) return notAllowed;

  try {
    const url    = new URL(req.url);
    const mode   = (url.searchParams.get("mode") || "").trim();
    const judetQ = (url.searchParams.get("judet") || "").trim();
    const orasQ  = (url.searchParams.get("oras")  || "").trim();

    /* =========================================================
       MODE=signup — folosit pe pagina de înscriere furnizor
       ========================================================= */
    if (mode === "signup") {
      // fără județ → servicii + toate județele din `locations`
      if (!judetQ) {
        // servicii (listă simplă, ordonată)
        {
          const { data, error } = await db
            .from(TBL_SERVICES)
            .select("id, name")
            .order("name", { ascending: true });
          if (error) return bad(error.message || "Eroare servicii", 500, req);

          // forma: { name, label } – păstrează compatibilitatea cu UI-ul tău
          var services = (data || []).map((s) => ({
            name: s.name,
            label: toAsciiTitle(s.name),
          }));
        }

        // judete distinct din `locations` (mai curate pentru înscriere)
        {
          const { data, error } = await db
            .from(TBL_LOCATIONS)
            .select("judet");
          if (error) return bad(error.message || "Eroare județe", 500, req);

          const judMap = new Map();
          for (const r of data || []) {
            const key = norm(r.judet);
            if (!key) continue;
            if (!judMap.has(key)) judMap.set(key, toAsciiTitle(r.judet));
          }
          var judete = Array.from(judMap.values()).sort((a, b) => a.localeCompare(b));
        }

        return json({ services, judete }, 200, req, cache(300)); // 5 min
      }

      // cu județ → orase distinct din `locations`
      {
        const judKey = norm(judetQ);
        const { data, error } = await db
          .from(TBL_LOCATIONS)
          .select("oras, judet");
        if (error) return bad(error.message || "Eroare orașe", 500, req);

        const map = new Map();
        for (const r of data || []) {
          if (norm(r.judet) !== judKey) continue;
          const k = norm(r.oras);
          if (!k) continue;
          if (!map.has(k)) map.set(k, toAsciiTitle(r.oras));
        }
        const orase = Array.from(map.values()).sort((a, b) => a.localeCompare(b));
        return json({ orase }, 200, req, cache(300));
      }
    }

    /* =========================================================
       HOMEPAGE / SELECTOARE — bazate pe furnizori activi
       ========================================================= */

    // 1) Doar județe (din providers activi)
    if (!judetQ && !orasQ) {
      // Ideal ar fi un `select('judet', { head: true, count: 'exact' })` cu distinct,
      // dar Supabase PostgREST nu face DISTINCT simplu cu head. Așa că agregăm client-side.
      const { data, error } = await db
        .from(TBL_PROVIDERS)
        .select("judet")
        .eq("is_active", true);
      if (error) return bad(error.message || "Eroare județe", 500, req);

      const map = new Map();
      for (const r of data || []) {
        const key = norm(r.judet);
        if (!key) continue;
        if (!map.has(key)) map.set(key, toAsciiTitle(r.judet));
      }
      const judete = Array.from(map.values()).sort((a, b) => a.localeCompare(b));
      return json({ judete }, 200, req, cache(120));
    }

    // 2) Orase pentru un județ (din providers activi)
    if (judetQ && !orasQ) {
      const judKey = norm(judetQ);
      // luăm doar coloanele necesare; filtrăm în JS pt robusteză la diacritice/caz
      const { data, error } = await db
        .from(TBL_PROVIDERS)
        .select("oras, judet")
        .eq("is_active", true);
      if (error) return bad(error.message || "Eroare orașe", 500, req);

      const map = new Map();
      for (const r of data || []) {
        if (norm(r.judet) !== judKey) continue;
        const k = norm(r.oras);
        if (!k) continue;
        if (!map.has(k)) map.set(k, toAsciiTitle(r.oras));
      }
      const orase = Array.from(map.values()).sort((a, b) => a.localeCompare(b));
      return json({ orase }, 200, req, cache(120));
    }

    // 3) Categorii pentru (judet, oras) (din providers activi)
    if (judetQ && orasQ) {
      const judKey = norm(judetQ);
      const orasKey = norm(orasQ);

      // select cu join la services pentru nume
      const { data, error } = await db
        .from(TBL_PROVIDERS)
        .select("service_id, services(name), judet, oras")
        .eq("is_active", true);
      if (error) return bad(error.message || "Eroare servicii", 500, req);

      const byId = new Map();
      for (const r of data || []) {
        if (norm(r.judet) !== judKey) continue;
        if (norm(r.oras) !== orasKey) continue;
        const sid = r.service_id;
        const sname = r.services?.name;
        if (!sid || !sname) continue;
        if (!byId.has(sid)) byId.set(sid, { id: sid, name: toAsciiTitle(sname) });
      }
      const servicii = Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
      const names = servicii.map((s) => s.name);
      return json({ servicii, names }, 200, req, cache(120));
    }

    return bad("Parametri invalizi", 400, req);
  } catch (e) {
    return bad(e?.message || "Eroare internă", 500, req);
  }
};