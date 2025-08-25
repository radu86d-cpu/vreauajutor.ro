import { createClient } from "@supabase/supabase-js";

export function supabaseFromRequest(req) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnon = process.env.SUPABASE_ANON_KEY;
  const auth = req.headers.get("authorization") || "";
  return createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: auth } }
  });
}
