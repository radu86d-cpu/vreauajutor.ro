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
    const p = event.queryStringParameters || {};
    const mode  = (p.mode || '').trim();        // "" | "signup"
    const judet = (p.judet || '').trim();

    // 1) Branch "orașe pentru un județ"
    if (judet) {
      if (mode === 'signup') {
        // orașe din locations (toate, pentru formularul de înscriere)
        const { data, error } = await supabase
          .from('locations')
          .select('oras')
          .eq('judet', judet)
          .limit(5000);
        if (error) throw error;
        const orase = Array.from(new Set((data || []).map(r => r.oras)))
          .sort((a,b)=>a.localeCompare(b,'ro'));
        return { statusCode: 200, headers, body: JSON.stringify({ orase }) };
      } else {
        // orașe derivate din furnizori activi (pentru pagina principală)
        const { data, error } = await supabase
          .from('providers')
          .select('oras, is_active')
          .eq('judet', judet)
          .eq('is_active', true)
          .limit(5000);
        if (error) throw error;
        const orase = Array.from(new Set((data || []).map(r => r.oras)))
          .sort((a,b)=>a.localeCompare(b,'ro'));
        return { statusCode: 200, headers, body: JSON.stringify({ orase }) };
      }
    }

    // 2) Branch "liste generale"
    if (mode === 'signup') {
      // pentru formularul de înscriere:
      // - servicii (din services)
      // - județe (toate din locations)
      const [svcRes, locRes] = await Promise.all([
        supabase.from('services').select('name').order('name', { ascending: true }),
        supabase.from('locations').select('judet').limit(50000)
      ]);
      if (svcRes.error) throw svcRes.error;
      if (locRes.error) throw locRes.error;

      const services = (svcRes.data || []).map(s => s.name);
      const judete   = Array.from(new Set((locRes.data || []).map(r => r.judet)))
        .sort((a,b)=>a.localeCompare(b,'ro'));

      return { statusCode: 200, headers, body: JSON.stringify({ services, judete }) };
    }

    // în /netlify/functions/lists.js – la finalul handlerului, în locul "implicit (pagina principală)"
// 3) Implicit (pagina principală): servicii DOAR cu furnizori activi + lista de județe cu furnizori
const [svcRes, provRes] = await Promise.all([
  supabase.from('v_active_services_by_area')
    .select('service_id, service_name, providers_count'),
  supabase.from('providers')
    .select('judet, is_active').eq('is_active', true).limit(5000)
]);
if (svcRes.error) throw svcRes.error;
if (provRes.error) throw provRes.error;

const services = Array.from(
  new Map(
    (svcRes.data || [])
      .filter(r => Number(r.providers_count) > 0)
      .map(r => [r.service_id, r.service_name])
  ).values()
).sort((a,b)=>a.localeCompare(b,'ro'));

const judete   = Array.from(new Set((provRes.data || []).map(r => r.judet)))
  .sort((a,b)=>a.localeCompare(b,'ro'));

return { statusCode: 200, headers, body: JSON.stringify({ services, judete }) };
