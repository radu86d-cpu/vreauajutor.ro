// netlify/functions/categories.js
import { json, bad, method, handleOptions } from "./_shared/utils.js";
import { createClient } from "@supabase/supabase-js";

function toAsciiTitle(s = "") {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // fără diacritice
    .trim().toLowerCase()
    .replace(/^./, c => c.toUpperCase());            // prima literă mare
}

export default async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  const m = method(req, ["GET"]);
  if (m === "METHOD_NOT_ALLOWED") return bad("Method Not Allowed", 405);

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return bad("SUPABASE env missing", 500);
    }

    const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // toate categoriile (serviciile) ordonate alfabetic
    const { data, error } = await db
      .from("services")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) return bad(error.message, 500);

    const items = (data || []).map(s => ({
      id: s.id,
      name: s.name,
      display: toAsciiTitle(s.name)
    }));

    // cache ușor la edge (poți scoate dacă nu vrei)
    return json({ items }, 200, {
      "Cache-Control": "public, max-age=300, s-maxage=300"
    });
  } catch (e) {
    return bad(e?.message || "Server error", 500);
  }
};
