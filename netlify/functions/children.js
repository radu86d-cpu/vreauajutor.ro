// netlify/functions/children.js
import { json, bad, method, handleOptions } from "./_shared/utils.js";
import { createClient } from "@supabase/supabase-js";

/**
 * Tabela așteptată în Supabase:
 *  - service_children (coloane: id, subcategory_id, name)
 *
 * Variabile de mediu necesare (în Netlify → Site settings → Environment):
 *  - SUPABASE_URL
 *  - SUPABASE_ANON_KEY
 */
const TABLE_CHILDREN = "service_children";

export default async (req) => {
  // CORS preflight
  const opt = handleOptions(req);
  if (opt) return opt;

  // Doar GET permis
  const m = method(req, ["GET"]);
  if (m === "METHOD_NOT_ALLOWED") {
    return bad("Method Not Allowed", 405);
  }

  // Parametri query
  const url = new URL(req.url);
  const subcatId = url.searchParams.get("subcatId");
  if (!subcatId) return bad("Lipsește subcatId");

  // Supabase client anonim
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return bad("Missing Supabase env vars", 500);
  }
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  // Query
  const { data, error } = await db
    .from(TABLE_CHILDREN)
    .select("id, name")
    .eq("subcategory_id", subcatId)
    .order("name", { ascending: true });

  if (error) return bad(error.message, 500);

  // Rezultat
  const items = (data || []).map((s) => ({ id: s.id, name: s.name }));
  return json(items, 200, {
    "Cache-Control": "public, max-age=120, s-maxage=120",
  });
};