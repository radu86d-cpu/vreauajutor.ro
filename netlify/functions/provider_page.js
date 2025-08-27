// netlify/functions/provider_page.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// --- helpers ---
const strip = (s='') => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const norm  = (s='') => strip(String(s).trim()).toLowerCase();
const slugify = (name='', loc='') => {
  const n = norm(name).replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-');
  const l = norm(loc ).replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-');
  return l ? `${n}-${l}` : n;
};

// încearcă să deduci {companyPart, locPart} dintr-un slug gen: nume-firma-oras
function splitSlug(slug='') {
  const parts = String(slug).split('-').filter(Boolean);
  if (parts.length < 2) return { companyPart: slug, locPart: '' };
  // presupunem că ultimul token = locația (cum construim în front-end)
  const locPart = parts[parts.length - 1];
  const companyPart = parts.slice(0, -1).join('-');
  return { companyPart, locPart };
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'public, max-age=60, s-maxage=60'
  };

  // Preflight
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'GET')     return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  try {
    const qs   = event.queryStringParameters || {};
    const slug = (qs.slug || '').trim().toLowerCase();
    const idQ  = (qs.id   || '').trim();

    if (!slug && !idQ) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Parametru lipsă: slug sau id' }) };
    }

    // 1) Găsim pagina fie după slug, fie după provider_id
    let page = null;

    if (slug) {
      const { data, error } = await supabase
        .from('provider_pages')
        .select('provider_id, slug, template_choice, cover_url, gallery, long_description')
        .eq('slug', slug)
        .maybeSingle();
      if (error) throw error;
      page = data || null;
    } else if (idQ) {
      const pid = parseInt(idQ, 10);
      if (!Number.isFinite(pid)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'id invalid' }) };
      }
      const { data, error } = await supabase
        .from('provider_pages')
        .select('provider_id, slug, template_choice, cover_url, gallery, long_description')
        .eq('provider_id', pid)
        .maybeSingle();
      if (error) throw error;
      page = data || null;
    }

    // 2) Dacă nu avem pagină, încercăm să găsim provider-ul după slug (fallback)
    let provider = null;

    if (page?.provider_id) {
      const { data: prov, error: provErr } = await supabase
        .from('v_search_providers')
        .select('id, company_name, description, service_name, judet, oras, is_online, created_at')
        .eq('id', page.provider_id)
        .maybeSingle();
      if (provErr) throw provErr;
      provider = prov || null;
    } else {
      // Fallback: încearcă să deduci provider-ul din slug
      if (!slug && idQ) {
        // dacă avem id fără page, căutăm direct providerul
        const pid = parseInt(idQ, 10);
        const { data: prov, error: provErr } = await supabase
          .from('v_search_providers')
          .select('id, company_name, description, service_name, judet, oras, is_online, created_at')
          .eq('id', pid)
          .maybeSingle();
        if (provErr) throw provErr;
        provider = prov || null;
      } else if (slug) {
        const { companyPart, locPart } = splitSlug(slug);

        // Luăm un eșantion rezonabil și potrivim în cod (ca să păstrăm logica fără diacritice)
        const { data: provs, error: pErr } = await supabase
          .from('v_search_providers')
          .select('id, company_name, description, service_name, judet, oras, is_online, created_at')
          .limit(2000); // dacă ai mulți, poți pune un filtru suplimentar pe oras/judet cu ilike
        if (pErr) throw pErr;

        if (Array.isArray(provs)) {
          provider = provs.find(p => {
            const s = slugify(p.company_name || '', p.oras || p.judet || '');
            return s === slug
              || (companyPart && locPart && norm(s).endsWith(`-${locPart}`) && norm(s).startsWith(companyPart));
          }) || null;
        }
      }

      // Dacă am provider dar nu are încă înregistrare în provider_pages, sintetizăm una implicită
      if (provider && !page) {
        page = {
          provider_id: provider.id,
          slug: slug || slugify(provider.company_name || '', provider.oras || provider.judet || ''),
          template_choice: 'default',
          cover_url: null,
          gallery: [],
          long_description: null
        };
      }
    }

    if (!provider) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Furnizorul nu a fost găsit' }) };
    }

    // 3) Produsele furnizorului
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('id, name, description, price, currency, image_url')
      .eq('provider_id', provider.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (prodErr) throw prodErr;

    // 4) Asigură câmpuri default sigure
    const safePage = page ? {
      ...page,
      slug: page.slug || slugify(provider.company_name || '', provider.oras || provider.judet || ''),
      gallery: Array.isArray(page.gallery) ? page.gallery : [],
      long_description: page.long_description || null,
      cover_url: page.cover_url || null
    } : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        page: safePage,
        provider,
        products: products || []
      })
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message || String(e) }) };
  }
};