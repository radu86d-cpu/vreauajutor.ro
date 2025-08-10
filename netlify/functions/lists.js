// /netlify/functions/lists.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const ok = (body) => ({
  statusCode: 200,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  },
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const mode  = (params.mode || '').trim();   // <-- nou
    const judet = (params.judet || '').trim();

    // ==========  A) INSCRIERE: citim din `locations`  ==========
    if (mode === 'locations') {
      // orase pentru un judet
      if (judet) {
        const { data, error } = await supabase
          .from('locations')
          .select('oras, judet')
          .ilike('judet', judet)             // tolerant la majuscule/diacritice
          .order('oras', { ascending: true });
        if (error) throw error;

        const orase = [...new Set((data || []).map(r => r.oras))];
        return ok({ orase });
      }

      // lista completa de judete
      const { data, error } = await supabase
        .from('locations')
        .select('judet')
        .order('judet', { ascending: true });
      if (error) throw error;

      const judete = [...new Set((data || []).map(r => r.judet))];
      return ok({ judete });
    }

    // ==========  B) PAGINA PRINCIPALĂ: servicii + județe cu furnizori  ==========
    const [svcRes, provRes] = await Promise.all([
      supabase.from('services').select('name').order('name', { ascending: true }),
      supabase.from('v_public_providers').select('judet') // doar active, via view
    ]);
    if (svcRes.error) throw svcRes.error;
    if (provRes.error) throw provRes.error;

    const services = (svcRes.data || []).map(s => s.name);
    const judete   = [...new Set((provRes.data || []).map(r => r.judet))].sort((a,b)=>a.localeCompare(b,'ro'));
    return ok({ services, judete });

  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: e.message })
    };
  }
};
