// netlify/functions/lists.js
const { createClient } = require('@supabase/supabase-js');

// helperi
const norm = (s) => (s || '').trim().toLowerCase();
// normalizează simplu: prima literă mare, restul mici
const title = (s) => {
  if (!s) return '';
  const clean = s.trim().toLowerCase();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE env missing' }) };
    }
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // params
    const url   = new URL(event.rawUrl || `https://${event.headers.host}${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`);
    const judet = (url.searchParams.get('judet') || '').trim();
    const oras  = (url.searchParams.get('oras')  || '').trim();

    // === 1) Fără parametri -> JUDEȚE cu furnizori activi (unic pe lowercase) ===
    if (!judet && !oras) {
      const { data, error } = await supa
        .from('providers')
        .select('judet,is_active')
        .eq('is_active', true);

      if (error) throw error;

      const map = new Map(); // key: normalized -> display
      for (const r of (data || [])) {
        const key = norm(r.judet);
        if (!key) continue;
        if (!map.has(key)) map.set(key, title(r.judet));
      }
      const judete = Array.from(map.values()).sort((a,b)=>a.localeCompare(b,'ro'));
      return { statusCode: 200, headers, body: JSON.stringify({ judete }) };
    }

    // === 2) Doar judet -> ORAȘE cu furnizori activi în acel județ (case-insensitive) ===
    if (judet && !oras) {
      const { data, error } = await supa
        .from('providers')
        .select('oras,judet,is_active')
        .eq('is_active', true)
        // ilike = case-insensitive; fără wildcards înseamnă “egal ignore-case”
        .ilike('judet', judet);

      if (error) throw error;

      const map = new Map();
      for (const r of (data || [])) {
        const key = norm(r.oras);
        if (!key) continue;
        if (!map.has(key)) map.set(key, title(r.oras));
      }
      const orase = Array.from(map.values()).sort((a,b)=>a.localeCompare(b,'ro'));
      return { statusCode: 200, headers, body: JSON.stringify({ orase }) };
    }

    // === 3) judet + oras -> CATEGORII disponibile în acel oraș (case-insensitive) ===
    if (judet && oras) {
      const { data, error } = await supa
        .from('v_active_services_by_area')
        .select('service_id, service_name, providers_count, judet, oras')
        .ilike('judet', judet)
        .ilike('oras',  oras);

      if (error) throw error;

      const byId = new Map(); // dedupe pe service_id
      for (const row of (data || [])) {
        if (row.providers_count > 0 && row.service_id) {
          // păstrăm primul nume întâlnit (titlizat pentru siguranță)
          if (!byId.has(row.service_id)) {
            byId.set(row.service_id, { id: row.service_id, name: title(row.service_name) });
          }
        }
      }
      const servicii = Array.from(byId.values()).sort((a,b)=>a.name.localeCompare(b.name,'ro'));
      const names    = servicii.map(s => s.name); // pentru <select>ul tău actual

      return { statusCode: 200, headers, body: JSON.stringify({ servicii, names }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Parametri invalizi' }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
