// netlify/functions/categories.js (CommonJS)
const { createClient } = require('@supabase/supabase-js');

const toAsciiTitle = (s) =>
  (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // fără diacritice
    .trim().toLowerCase()
    .replace(/^./, c => c.toUpperCase());             // prima literă mare

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'public, max-age=300, s-maxage=300',
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

    // toate categoriile (serviciile) ordonate alfabetic
    const { data, error } = await db
      .from('services')
      .select('id, name')
      .order('name', { ascending: true });

    if (error) throw error;

    // trimitem și un „display” fără diacritice, ca în restul site-ului
    const items = (data || []).map(s => ({
      id: s.id,
      name: s.name,                 // denumirea exactă din DB
      display: toAsciiTitle(s.name) // pentru afișat în <select>
    }));

    return { statusCode: 200, headers, body: JSON.stringify({ items }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message || String(e) }) };
  }
};
