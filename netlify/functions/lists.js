// /netlify/functions/lists.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    const params = event.queryStringParameters || {};
    const judet = (params.judet || '').trim();

    // 1) Dacă avem judet => întoarcem ORAȘE pentru acel județ
    if (judet) {
      const { data, error } = await supabase
        .from('providers')
        .select('oras, is_active, judet')
        .eq('judet', judet)
        .eq('is_active', true)
        .limit(2000); // suficient pentru început; optimizăm ulterior cu v_orase_distinct

      if (error) throw error;

      const orase = Array.from(new Set((data || []).map(r => r.oras))).sort((a,b)=>a.localeCompare(b,'ro'));
      return { statusCode: 200, headers, body: JSON.stringify({ orase }) };
    }

    // 2) Altfel => întoarcem SERVICII + JUDEȚE
    const [svcRes, judRes] = await Promise.all([
      supabase.from('services').select('name').order('name', { ascending: true }),
      supabase.from('providers').select('judet, is_active').eq('is_active', true).limit(5000)
    ]);

    if (svcRes.error) throw svcRes.error;
    if (judRes.error) throw judRes.error;

    const services = (svcRes.data || []).map(s => s.name);
    const judete   = Array.from(new Set((judRes.data || []).map(r => r.judet))).sort((a,b)=>a.localeCompare(b,'ro'));

    return { statusCode: 200, headers, body: JSON.stringify({ services, judete }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
