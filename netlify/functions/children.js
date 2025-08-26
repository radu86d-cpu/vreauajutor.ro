import { json, bad, method, handleOptions } from "./_shared/utils.js";
import { createClient } from "@supabase/supabase-js";

// ⇣ Dacă ai alte nume de tabele, modifică aici:
const TABLE_CHILDREN = "service_children"; // coloane: id, subcategory_id, name
export default async (req) => {
  const opt = handleOptions(req); if (opt) return opt;
  const m = method(req, ["GET"]); if (m === "METHOD_NOT_ALLOWED") return bad("Method Not Allowed", 405);

  const url = new URL(req.url);
  const subcatId = url.searchParams.get("subcatId");
  if (!subcatId) return bad("Lipsește subcatId");

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

  const { data, error } = await db.from(TABLE_CHILDREN)
    .select("id, name")
    .eq("subcategory_id", subcatId)
    .order("name", { ascending: true });

  if (error) return bad(error.message, 500);

  const items = (data || []).map(s => ({ id: s.id, name: s.name }));
  return json({ items }, 200, { "Cache-Control": "public, max-age=120, s-maxage=120" });
};