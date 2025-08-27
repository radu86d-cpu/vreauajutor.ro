// netlify/functions/subcategories.js
import { json, bad, method, handleOptions } from "./_shared/utils.js";
import { createClient } from "@supabase/supabase-js";

// === Config: adaptează dacă ai alte nume de tabele/coloane ===
const TABLE_SUBCATS = "service_subcategories"; // coloane: id, service_id, name
const TABLE_SERVICES = "services";             // coloane: id, name

// Helpers: comparare tolerantă la diacritice/capitalizare
const strip = (s = "") => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const norm  = (s = "") => strip(String(s).trim()).toLowerCase();

export default async (req) => {
  // CORS preflight
  const opt = handleOptions(req);
  if (opt) return opt;

  // Metodă
  const m = method(req, ["GET"]);
  if (m === "METHOD_NOT_ALLOWED") return bad("Method Not Allowed", 405);

  // ENV & DB
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
    // Acceptă EITHER serviceId OR service (nume)
    const serviceIdParam = url.searchParams.get("serviceId");
    const serviceName    = url.searchParams.get("service");

    let serviceId = serviceIdParam ? String(serviceIdParam).trim() : "";

    if (!serviceId) {
      // Rezolvă după nume, tolerant la diacritice
      const target = norm(serviceName || "");
      if (!target) return json({ items: [] }, 200, { "Cache-Control": "public, max-age=60, s-maxage=60" });

      const { data: services, error: eS } = await db
        .from(TABLE_SERVICES)
        .select("id, name");
      if (eS) throw eS;

      const hit =
        (services || []).find((s) => norm(s.name) === target) ||
        (services || []).find((s) => norm(s.name).includes(target) || target.includes(norm(s.name)));

      if (!hit?.id) return json({ items: [] }, 200, { "Cache-Control": "public, max-age=60, s-maxage=60" });
      serviceId = String(hit.id);
    }

    // Subcategorii pentru service_id
    const { data, error } = await db
      .from(TABLE_SUBCATS)
      .select("id, name")
      .eq("service_id", serviceId)
      .order("name", { ascending: true });

    if (error) return bad(error.message || "DB error", 500);

    const items = (data || [])
      .filter((r) => (r?.name || "").trim())
      .map((r) => ({ id: r.id, name: r.name }));

    return json(
      { items },
      200,
      { "Cache-Control": "public, max-age=120, s-maxage=120" }
    );
  } catch (e) {
    return bad(e?.message || "Server error", 500);
  }
};
```0