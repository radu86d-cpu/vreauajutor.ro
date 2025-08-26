const { createClient } = require('@supabase/supabase-js');

// --- helpers ---
const stripDiacritics = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const norm = (s) => stripDiacritics((s || '').trim()).toLowerCase();
const toAsciiTitle = (s) => {
  const base = stripDiacritics((s || '').trim()).toLowerCase();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : '';
};

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'public, max-age=60, s-maxage=60',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'GET')     return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE env missing' }) };
    }
    const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const qs     = event.queryStringParameters || {};
    const mode   = (qs.mode || '').trim();
    const judetQ = (qs.judet || '').trim();
    const orasQ  = (qs.oras  || '').trim();

// ========= MODE=SIGNUP =========
if (mode === 'signup') {
  if (!judetQ) {
    const { data: svc, error: e1 } = await db
      .from('services')
      .select('id, name')
      .order('name', { ascending: true });
    if (e1) throw e1;

    const services = (svc || []).map(s => ({
      name: s.name,
      label: toAsciiTitle(s.name)
    }));

    const { data: locs, error: e2 } = await db
      .from('locations')
      .select('judet');
    if (e2) throw e2;

    const judMap = new Map();
    for (const r of (locs || [])) {
      const key = norm(r.judet);
      if (!key) continue;
      if (!judMap.has(key)) judMap.set(key, toAsciiTitle(r.judet));
    }
    const judete = Array.from(judMap.values()).sort((a,b)=>a.localeCompare(b));

    return { statusCode: 200, headers, body: JSON.stringify({ services, judete }) };
  } else {
    const judKey = norm(judetQ);
    const { data: locs, error: e3 } = await db
      .from('locations')
      .select('oras, judet');
    if (e3) throw e3;

    const map = new Map();
    for (const r of (locs || [])) {
      if (norm(r.judet) !== judKey) continue;
      const k = norm(r.oras);
      if (!k) continue;
      if (!map.has(k)) map.set(k, toAsciiTitle(r.oras));
    }
    const orase = Array.from(map.values()).sort((a,b)=>a.localeCompare(b));
    return { statusCode: 200, headers, body: JSON.stringify({ orase }) };
  }
}

    // ========= HOMEPAGE / SELECTOARE =========

    // 1) JUDEȚE cu furnizori activi
    if (!judetQ && !orasQ) {
      const { data, error } = await db
        .from('providers')
        .select('judet')
        .eq('is_active', true);
      if (error) throw error;

      const map = new Map();
      for (const r of (data || [])) {
        const key = norm(r.judet);
        if (!key) continue;
        if (!map.has(key)) map.set(key, toAsciiTitle(r.judet));
      }
      const judete = Array.from(map.values()).sort((a,b)=>a.localeCompare(b));
      return { statusCode: 200, headers, body: JSON.stringify({ judete }) };
    }

    // 2) ORAȘE pentru județ
    if (judetQ && !orasQ) {
      const judKey = norm(judetQ);

      const { data, error } = await db
        .from('providers')
        .select('oras, judet')
        .eq('is_active', true);
      if (error) throw error;

      const map = new Map();
      for (const r of (data || [])) {
        if (norm(r.judet) !== judKey) continue;
        const key = norm(r.oras);
        if (!key) continue;
        if (!map.has(key)) map.set(key, toAsciiTitle(r.oras));
      }
      const orase = Array.from(map.values()).sort((a,b)=>a.localeCompare(b));
      return { statusCode: 200, headers, body: JSON.stringify({ orase }) };
    }

    // 3) CATEGORII pentru (judet, oras)
    if (judetQ && orasQ) {
      const judKey = norm(judetQ);
      const orasKey= norm(orasQ);

      const { data, error } = await db
        .from('providers')
        .select('service_id, services(name), judet, oras')
        .eq('is_active', true);
      if (error) throw error;

      const byId = new Map();
      for (const r of (data || [])) {
        if (norm(r.judet) !== judKey) continue;
        if (norm(r.oras)  !== orasKey) continue;
        const sid = r.service_id;
        const sname = r.services?.name;
        if (!sid || !sname) continue;
        if (!byId.has(sid)) byId.set(sid, { id: sid, name: toAsciiTitle(sname) });
      }
      const servicii = Array.from(byId.values()).sort((a,b)=>a.name.localeCompare(b.name));
      const names    = servicii.map(s => s.name);
      return { statusCode: 200, headers, body: JSON.stringify({ servicii, names }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Parametri invalizi' }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message || String(e) }) };
  }
};