// ESM – Netlify Functions
import { createClient } from '@supabase/supabase-js';

// --- helpers ---
const stripDiacritics = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const norm = (s) => stripDiacritics((s || '').trim()).toLowerCase();

// Afișare simplă, fără diacritice: Prima literă mare, restul mici
const toAsciiTitle = (s) => {
  const base = stripDiacritics((s || '').trim()).toLowerCase();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : '';
};

export async function handler(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'GET')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE env missing' }) };
    }
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const qs = event.queryStringParameters || {};
    const judetQ = (qs.judet || '').trim();
    const orasQ  = (qs.oras  || '').trim();

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

    /
