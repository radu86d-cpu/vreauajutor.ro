// netlify/functions/lists.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE env missing' }) };
    }

    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const url = new URL(event.rawUrl || `https://${event.headers.host}${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`);
    const judet = url.searchParams.get('judet');
    const oras = url.searchParams.get('oras');

    // 1) fără parametri -> JUDETE care au furnizori activi
    if (!judet && !oras) {
      const { data, error } = await supa
        .from('providers')
        .select('judet', { distinct: true })
        .eq('is_active', true)
        .order('judet', { ascending: true });

      if (error) throw error;

      const judete = (data || [])
        .map(r => r.judet)
        .filter(Boolean);

      return { statusCode: 200, headers, body: JSON.stringify({ judete }) };
    }

    // 2) doar judet -> ORAȘE care au furnizori activi în acel județ
    if (judet && !oras) {
      const { data, error } = await supa
        .from('providers')
        .select('oras', { distinct: true })
        .eq('judet', judet)
        .eq('is_active', true)
        .order('oras', { ascending: true });

      if (error) throw error;

      const orase = (data || [])
        .map(r => r.oras)
        .filter(Boolean);

      return { statusCode: 200, headers, body: JSON.stringify({ orase }) };
    }

    // 3) judet + oras -> SERVICII disponibile în acel oraș (după furnizori activi)
    if (judet && oras) {
      // Folosim view-ul tău agregat
      const { data, error } = await supa
        .from('v_active_services_by_area')
        .select('service_id, service_name, providers_count')
        .eq('judet', judet)
        .eq('oras', oras);

      if (error) throw error;

      // Unice pe service_id, sortate alfabetic
      const uniq = new Map();
      for (const row of (data || [])) {
        if (row.providers_count > 0 && row.service_id) {
          uniq.set(row.service_id, { id: row.service_id, name: row.service_name });
        }
      }
      const servicii = Array.from(uniq.values()).sort((a, b) =>
        String(a.name).localeCompare(String(b.name), 'ro'));

      return { statusCode: 200, headers, body: JSON.stringify({ servicii }) };
    }

    // fallback (nu ar trebui să ajungă aici)
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Parametri invalizi' }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
