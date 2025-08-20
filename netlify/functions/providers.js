// netlify/functions/providers.js
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// helpers
const stripDiacritics = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const norm = (s) => stripDiacritics((s || '').trim()).toLowerCase();

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
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const qs       = event.queryStringParameters || {};
    const judetQ   = (qs.judet || '').trim();
    const orasQ    = (qs.oras  || '').trim();
    const serviceQ = (qs.service || '').trim();     // poate fi fără diacritice
    const subParam = (qs.subcat || '').trim();      // id/slug
    const kidParam = (qs.subsub || '').trim();      // id/slug

    // paginare + sort
    const page    = Math.max(parseInt(qs.page || '1', 10), 1);
    const perPage = Math.min(Math.max(parseInt(qs.per_page || '12', 10), 1), 50);
    const sort    = (qs.sort || 'new'); // 'new' | 'old' | 'name'

    // 1) Dacă s-a trimis service=name (posibil fără diacritice),
    // îl mapăm la denumirea exactă din tabela services.
    let serviceName = '';
    if (serviceQ) {
      const { data: allServices, error: svcErr } = await supabase
        .from('services')
        .select('id, name');
      if (svcErr) throw svcErr;

      const nWanted = norm(serviceQ);
      const match = (allServices || []).find(s => norm(s.name) === nWanted);
      // dacă nu găsim egalitate exactă fără diacritice, încearcăm "includes"
      const match2 = match || (allServices || []).find(s => norm(s.name).includes(nWanted) || nWanted.includes(norm(s.name)));
      serviceName = (match2 && match2.name) || '';
    }

    // 2) Subcategorie / sub-subcategorie (opțional)
    let subId = null;
    if (subParam) {
      if (/^\d+$/.test(subParam)) {
        subId = parseInt(subParam, 10);
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
    let kidId = null;
    if (kidParam) {
      if (/^\d+$/.test(kidParam)) {
        kidId = parseInt(kidParam, 10);
      } else {
        const { data: kidRow, error: kidErr } = await supabase
          .from('subcategories')
          .select('id')
          .eq('slug', kidParam)
          .maybeSingle();
        if (kidErr) throw kidErr;
        kidId = kidRow?.id || null;
      }
    }

    // 3) Construim query pe view-ul de căutare
    // View-ul trebuie să aibă: id, company_name, description, service_name,
    // judet, oras, created_at, is_online, subcat_ids (array)
    let query = supabase.from('v_search_providers').select('*', { count: 'exact' });

    // județ/oras – dacă DB poate avea diacritice, folosim egal exact pe forma cu diacritice,
    // DAR cum în index trimitem fără, încercăm ambele variante:
    if (judetQ) {
      // mai întâi egal exact
      query = query.eq('judet', judetQ);
    }
    if (orasQ) {
      query = query.eq('oras', orasQ);
    }

    // serviciu (categorie)
    if (serviceName) {
      query = query.eq('service_name', serviceName);
    } else if (serviceQ) {
      // fallback: încearcă potrivire case-insensitive pe view (poate să nu prindă diacritice, dar încercăm)
      query = query.ilike('service_name', `%${serviceQ}%`);
    }

    // subcategorie/sub-subcategorie prin array-ul subcat_ids
    if (kidId) {
      query = query.contains('subcat_ids', [kidId]);
    } else if (subId) {
      query = query.contains('subcat_ids', [subId]);
    }

    // sortare
    if (sort === 'old')      query = query.order('created_at', { ascending: true });
    else if (sort === 'name')query = query.order('company_name', { ascending: true });
    else                     query = query.order('created_at', { ascending: false });

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
