// netlify/functions/providers.js
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// normalizare simplă (fără diacritice, lowercase)
const strip = (s='') => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const norm  = (s='') => strip(String(s).trim()).toLowerCase();

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'public, max-age=30, s-maxage=30',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'GET')     return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  try {
    const qs       = event.queryStringParameters || {};
    const judetQ   = (qs.judet   || '').trim();
    const orasQ    = (qs.oras    || '').trim();
    const serviceQ = (qs.service || '').trim();
    const subParam = (qs.subcat  || '').trim();
    const kidParam = (qs.subsub  || '').trim();

    // paginare + sort
    const page    = Math.max(parseInt(qs.page || '1', 10), 1);
    const perPage = Math.min(Math.max(parseInt(qs.per_page || '12', 10), 1), 50);
    const sort    = (qs.sort || 'new'); // 'new' | 'old' | 'name' | 'active'

    // pregătim filtrele normalizate
    const J = judetQ ? norm(judetQ)   : null;
    const O = orasQ  ? norm(orasQ)    : null;
    const S = serviceQ ? norm(serviceQ) : null;

    // baza interogării (folosim count exact pentru pager)
    let query = supabase
      .from('v_search_providers')
      .select('id, company_name, description, service_name, judet, oras, created_at, is_online, subcat_ids, judet_norm, oras_norm, service_norm', { count: 'exact' });

    // filtre pe coloanele normalizate din view
    if (J) query = query.eq('judet_norm', J);
    if (O) query = query.eq('oras_norm',  O);
    if (S) query = query.eq('service_norm', S);

    // filtre pe subcategorii direct în SQL (array contains)
    const subId = /^\d+$/.test(subParam) ? parseInt(subParam, 10) : null;
    const kidId = /^\d+$/.test(kidParam) ? parseInt(kidParam, 10) : null;
    if (kidId) {
      query = query.contains('subcat_ids', [kidId]);
    } else if (subId) {
      query = query.contains('subcat_ids', [subId]);
    }

    // sortare
    if (sort === 'old') {
      query = query.order('created_at', { ascending: true });
    } else if (sort === 'name') {
      query = query.order('company_name', { ascending: true });
    } else if (sort === 'active') {
      // "cele mai active" = online întâi, apoi cele mai noi
      query = query.order('is_online', { ascending: false }).order('created_at', { ascending: false });
    } else { // 'new'
      query = query.order('created_at', { ascending: false });
    }

    // paginare
    const from = (page - 1) * perPage;
    const to   = from + perPage - 1;
    const { data, count, error } = await query.range(from, to);
    if (error) throw error;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        items: data || [],
        total: count || 0,
        page,
        per_page: perPage,
        pages: Math.ceil((count || 0) / perPage)
      }),
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message || String(e) }) };
  }
};