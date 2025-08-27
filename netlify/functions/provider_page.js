// netlify/functions/provider_page.js
// Returnează datele publice pentru o pagină de furnizor + produsele active

const { createClient } = require("@supabase/supabase-js");

// antete comune
const baseHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  // datele de pagină nu se schimbă foarte des; poți ajusta cache-ul
  "Cache-Control": "public, max-age=60, s-maxage=60",
};

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: baseHeaders };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: baseHeaders, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { statusCode: 500, headers: baseHeaders, body: JSON.stringify({ error: "Missing Supabase env" }) };
    }
    const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const qs = event.queryStringParameters || {};
    const rawSlug = (qs.slug || "").trim();
    if (!rawSlug) {
      return { statusCode: 400, headers: baseHeaders, body: JSON.stringify({ error: "Parametrul 'slug' este obligatoriu." }) };
    }

    // normalizare minimă (luăm slug exact cum vine; doar decodăm)
    const slug = decodeURIComponent(rawSlug);

    // 1) pagina (conține provider_id + conținutul public)
    const { data: page, error: e1 } = await db
      .from("provider_pages")
      .select("provider_id, slug, template_choice, cover_url, gallery, long_description")
      .eq("slug", slug)
      .maybeSingle();

    if (e1) {
      return { statusCode: 500, headers: baseHeaders, body: JSON.stringify({ error: e1.message }) };
    }
    if (!page) {
      return { statusCode: 404, headers: baseHeaders, body: JSON.stringify({ error: "Pagina furnizorului nu a fost găsită." }) };
    }

    // 2) providerul (din view-ul public de căutare)
    const { data: provider, error: e2 } = await db
      .from("v_search_providers")
      .select("*")
      .eq("id", page.provider_id)
      .maybeSingle();

    if (e2) {
      return { statusCode: 500, headers: baseHeaders, body: JSON.stringify({ error: e2.message }) };
    }
    if (!provider) {
      return { statusCode: 404, headers: baseHeaders, body: JSON.stringify({ error: "Furnizorul asociat nu există sau nu este public." }) };
    }

    // 3) produsele active
    const { data: products, error: e3 } = await db
      .from("products")
      .select("id, name, description, price, currency, image_url")
      .eq("provider_id", page.provider_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (e3) {
      return { statusCode: 500, headers: baseHeaders, body: JSON.stringify({ error: e3.message }) };
    }

    return {
      statusCode: 200,
      headers: baseHeaders,
      body: JSON.stringify({
        page,
        provider,
        products: products || [],
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: baseHeaders,
      body: JSON.stringify({ error: err?.message || String(err) }),
    };
  }
};