// netlify/functions/providers.js
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Use GET' }) };
  }

  try {
    const p = event.queryStringParameters || {};
    const judet   = (p.judet || '').trim();
    const oras    = (p.oras  || '').trim();
    const service = (p.service || '').trim();     // numele categoriei
    const sort    = (p.sort || 'new').trim();     // new|old|active
    const page    = Math.max(1, parseInt(p.page || '1', 10));
    const perPage = Math.min(30, Math.max(1, parseInt(p.per_page || '15', 10)));

    // subcategorie / sub-subcategorie (poate fi id sau slug)
    const subParam = (p.subsub ?? p.subcat ?? '').trim();
    let subId = null;
    if (subParam) {
      if (/^\d+$/.test(subParam)) {
        subId = Number(subParam);
      } else {
        const { data: subRow, error: subErr } = await supabase
          .from('subcategories')
          .select('id')
          .eq('slug', subParam)
          .maybeSingle();
        if (subErr) throw subErr;
        subId = subRow?.id || null;
      }
    }

    // View pentru căutare – trebuie să includă: id, judet, oras, service_name, created_at,
    // opțional is_online, și un array subcat_ids (int[])
    let query = supabase.from('v_search_providers').select('*', { count: 'exact' });

    if (judet)   query = query.eq('judet', judet);
    if (oras)    query = query.eq('oras', oras);
    if (service) query = query.eq('service_name', service);
    if (subId)   query = query.contains('subcat_ids', [subId]);

    // sortare
    if (sort === 'old') {
      query = query.order('created_at', { ascending: true });
    } else if (sort === 'active') {
      // asigură-te că v_search_providers are is_online (sau schimbă cu last_seen_at)
      query = query.order('is_online', { ascending: false })
                   .order('created_at', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false }); // 'new'
    }

    // paginare
    const from = (page - 1) * perPage;
    const to   = from + perPage - 1;

    const { data, error, count } = await query.range(from, to);
    if (error) throw error;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        items: data || [],
        total: count ?? 0,
        page,
        per_page: perPage,
      }),
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
