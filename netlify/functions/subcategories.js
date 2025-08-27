// netlify/functions/subcategories.js
import { json, bad, method, handleOptions } from "./_shared/utils.js";
import { createClient } from "@supabase/supabase-js";

/**
 * Endpoint: GET /.netlify/functions/subcategories?serviceId=...
 * Răspunde cu subcategoriile (id, name) pentru un service_id dat.
 * Returnează 400 dacă lipsește serviceId.
 */
export default async (req) => {
  // CORS preflight
  const opt = handleOptions(req);
  if (opt) return opt;

  // Doar GET
  const m = method(req, ["GET"]);
  if (m === "METHOD_NOT_ALLOWED") return bad("Method Not Allowed", 405);

  // Parametri
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId");
  if (!serviceId) return bad("Lipsește serviceId");

  // Env & DB client
  const SUPABASE_URL = process.env.SUPABASE_URL || "";
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return bad("Missing Supabase environment variables", 500);
  }
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  // Select subcategorii
  const { data, error } = await db
    .from("service_subcategories") // ← schimbă dacă tabela are alt nume
    .select("id, name")
    .eq("service_id", serviceId)
    .order("name", { ascending: true });

  if (error) return bad(error.message || "Eroare la interogare", 500);

  const items = (data || []).map((row) => ({
    id: row.id,
    name: row.name,
  }));

  return json(
    { items },
    200,
    { "Cache-Control": "public, max-age=120, s-maxage=120" }
  );
};