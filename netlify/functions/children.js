// netlify/functions/children.js
import {
  handleOptions,
  requireMethod,
  json,
  bad,
  cache,
} from "./_shared/utils.js";
import { sbAnon as db } from "./_shared/supabase.js";

// Tabele (schimbă dacă ai alte nume/coloane)
const TABLE_CHILDREN = "service_children";       // coloane: id, subcategory_id, name
const TABLE_SUBCATS  = "service_subcategories";  // coloane: id, name (opțional, pt lookup după nume)

export default async (req) => {
  // CORS preflight
  const pre = handleOptions(req);
  if (pre) return pre;

  // doar GET
  const notAllowed = requireMethod(req, ["GET"]);
  if (notAllowed) return notAllowed;

  try {
    const url = new URL(req.url);
    // Acceptă fie ?subcatId=..., fie ?subcat=...
    const raw = url.searchParams.get("subcatId") ?? url.searchParams.get("subcat");
    if (!raw) return bad("Lipsește subcatId / subcat", 400, req);

    let subcatId = null;

    // 1) Dacă e numeric → folosește direct
    if (/^\d+$/.test(raw)) {
      subcatId = Number(raw);
    } else {
      // 2) Altfel încercăm un lookup după nume în tabela de subcategorii
      //    (dacă nu ai tabela TABLE_SUBCATS, poți elimina acest bloc)
      const { data: found, error: findErr } = await db
        .from(TABLE_SUBCATS)
        .select("id")
        .ilike("name", raw)     // tolerant la litere mari/mici
        .limit(1)
        .maybeSingle();

      if (findErr) {
        // nu dăm 500; întoarcem un mesaj explicit
        return bad("Eroare la căutarea subcategoriei", 500, req);
      }
      subcatId = found?.id ?? null;
    }

    if (!Number.isFinite(subcatId)) {
      // fallback prietenos: zero rezultate (nu 400), ca să nu stricăm UX-ul
      return json({ items: [] }, 200, req, cache(60));
    }

    // 3) Citește copiii pentru subcategoria aleasă
    const { data, error } = await db
      .from(TABLE_CHILDREN)
      .select("id, name")
      .eq("subcategory_id", subcatId)
      .order("name", { ascending: true });

    if (error) return bad(error.message || "Eroare DB", 500, req);

    const items = (data || []).map((r) => ({ id: r.id, name: r.name }));
    // Cache ușor 120s (public)
    return json({ items }, 200, req, cache(120));
  } catch (e) {
    // protecție generică
    return bad("Eroare internă", 500, req);
  }
};