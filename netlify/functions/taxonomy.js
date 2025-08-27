// netlify/functions/taxonomy.js
import { json, bad, method, handleOptions } from "./_shared/utils.js";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing Supabase env vars (SUPABASE_URL / SUPABASE_ANON_KEY)");
}

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

/**
 * GET /.netlify/functions/taxonomy?mode=...&service=...&subcat=...
 * Mode = categories | subcategories | children
 */
export default async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  const m = method(req, ["GET"]);
  if (m === "METHOD_NOT_ALLOWED") return bad("Method Not Allowed", 405);

  const url = new URL(req.url);
  const mode = (url.searchParams.get("mode") || "").toLowerCase();

  try {
    if (mode === "categories") {
      // Toate serviciile disponibile
      const { data, error } = await db.from("services").select("id, name").order("name");
      if (error) return bad(error.message, 500);
      return json({ categories: data || [] });
    }

    if (mode === "subcategories") {
      const serviceId = url.searchParams.get("serviceId");
      if (!serviceId) return bad("Lipsește serviceId");
      const { data, error } = await db
        .from("service_subcategories")
        .select("id, name")
        .eq("service_id", serviceId)
        .order("name");
      if (error) return bad(error.message, 500);
      return json({ subcategories: data || [] });
    }

    if (mode === "children") {
      const subcatId = url.searchParams.get("subcatId");
      if (!subcatId) return bad("Lipsește subcatId");
      const { data, error } = await db
        .from("service_children")
        .select("id, name")
        .eq("subcategory_id", subcatId)
        .order("name");
      if (error) return bad(error.message, 500);
      return json({ children: data || [] });
    }

    return bad("Parametru 'mode' invalid", 400);
  } catch (e) {
    return bad(e.message || "Eroare necunoscută", 500);
  }
};