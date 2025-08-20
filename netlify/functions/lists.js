// netlify/functions/lists.js
const { createClient } = require('@supabase/supabase-js');

// --- helpers ---
const stripDiacritics = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const norm = (s) => stripDiacritics((s || '').trim()).toLowerCase();

// Afișare simplă, fără diacritice: Prima literă mare, restul mici
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

    const url   = new URL(event.rawUrl || `https://${event.headers.host}${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`);
    const judetQ = (url.searchParams.get('judet') || '').trim();
    const orasQ  = (url.searchParams.get('oras')  || '').trim();

    // 1) Fără parametri -> JUDEȚE cu furnizori activi (dedupe, fără diacritice)
    if (!judetQ && !orasQ) {
      const { data, error } = await supa
        .from('providers')
        .select('judet')
        .eq('is_active', true);
      if (error) throw error;

      const map = new Map(); // key = norm(judet) ; val = AsciiTitle
      for (const r of (data || [])) {
        const key = norm(r.judet);
        if (!key) continue;
        if (!map.has(key)) map.set(key, toAsciiTitle(r.judet));
      }
      const judete = Array.from(map.values()).sort((a, b) => a.localeCompare(b));
      return { statusCode: 200, headers, body: JSON.stringify({ judete }) };
    }

    // 2) Avem județ -> ORAȘE cu furnizori activi în acel județ (potrivire fără diacritice)
    if (judetQ && !orasQ) {
      const judKey = norm(judetQ);

      // luăm toate providers activi (evităm filtrarea „ilike” care pierde diacriticele)
      const { data, error } = await supa
        .from('providers')
        .select('oras, judet')
        .eq('is_active', true);
      if (error) throw error;

      const map = new Map();
      for (const r of (data || [])) {
        if (norm(r.judet) !== judKey) continue; // potrivire fără diacritice
        const oKey = norm(r.oras);
        if (!oKey) continue;
        if (!map.has(oKey)) map.set(oKey, toAsciiTitle(r.oras));
      }
      const orase = Array.from(map.values()).sort((a, b) => a.localeCompare(b));
      return { statusCode: 200, headers, body: JSON.stringify({ orase }) };
    }

    // 3) Avem județ + oraș -> CATEGORII (servicii) disponibile (potrivire fără diacritice)
    if (judetQ && orasQ) {
      const judKey = norm(judetQ);
      const orasKey = norm(orasQ);

      // luăm providers activi + numele categoriei prin FK către services
      const { data, error } = await supa
        .from('providers')
        .select('service_id, services(name), judet, oras')
        .eq('is_active', true);
      if (error) throw error;

      const byId = new Map(); // service_id -> {id, name}
      for (const r of (data || [])) {
        if (norm(r.judet) !== judKey) continue;
        if (norm(r.oras)  !== orasKey) continue;

        const sid = r.service_id;
        const sname = r.services?.name;
        if (!sid || !sname) continue;

        if (!byId.has(sid)) byId.set(sid, { id: sid, name: toAsciiTitle(sname) });
      }
      const servicii = Array.from(byId.values()).sort((a, b)
