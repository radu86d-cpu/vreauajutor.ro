// netlify/functions/providers.js
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const p = event.queryStringParameters || {};

  const judet = p.judet || '';
  const oras  = p.oras  || '';
  const service = p.service || '';        // numele categoriei
  const subcat  = p.subcat  || '';        // subcategory_id (sau slug)
  const sort    = p.sort    || 'new';     // new|old|active
  const page    = Math.max(1, parseInt(p.page || '1', 10));
  const perPage = Math.min(30, parseInt(p.per_page || '15', 10));

  let query = supabase.from('v_search_providers').select('*', { count: 'exact' });

  if (judet)   query = query.eq('judet', judet);
  if (oras)    query = query.eq('oras', oras);
  if (service) query = query.eq('service_name', service);

  // subcat poate veni ca id sau ca slug; acceptăm ambele
  if (subcat) {
    const subId = Number(subcat);
    if (Number.isFinite(subId)) {
      query = query.contains('subcat_ids', [subId]);
    } else {
      // rezolvăm slug -> id
      const { data: found } = await supabase.from('subcategories').select('id').eq('slug', subcat).maybeSingle();
      if (found?.id) query = query.contains('subcat_ids', [found.id]);
    }
  }

  // sortare
  if (sort === 'old')      query = query.order('created_at', { ascending: true });
  else if (sort === 'active') query = query.order('is_online', { ascending: false }).order('created_at', { ascending: false });
  else                      query = query.order('created_at', { ascending: false });

  const from = (page - 1) * perPage;
  const to   = from + perPage - 1;

  const { data, error, count } = await query.range(from, to);
  if (error) return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };

  return { statusCode: 200, headers, body: JSON.stringify({ items: data, total: count }) };
};
