// /netlify/functions/taxonomy.js
const { createClient } = require('@supabase/supabase-js');

// helpers
const stripDiacritics = (s='') => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const norm = (s='') => stripDiacritics(String(s).trim()).toLowerCase();

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

    const qs   = event.queryStringParameters || {};
    const mode = (qs.mode || '').trim();

    // filtre de arie
    const judetQ = (qs.judet || '').trim();
    const orasQ  = (qs.oras  || '').trim();
    const J = norm(judetQ);
    const O = norm(orasQ);

    // helper: află id-ul serviciului din nume (acceptă și fără diacritice)
    async function getServiceIdByName(serviceName) {
      if (!serviceName) return null;
      // 1) match exact
      let { data: svc1, error: e1 } = await db
        .from('services')
        .select('id, name')
        .eq('name', serviceName)
        .maybeSingle();
      if (e1) throw e1;
      if (svc1?.id) return svc1.id;

      // 2) fallback: fără diacritice
      const { data: all, error: e2 } = await db.from('services').select('id,name');
      if (e2) throw e2;
      const target = norm(serviceName);
      const found = (all || []).find(s => norm(s.name) === target)
                || (all || []).find(s => norm(s.name).includes(target) || target.includes(norm(s.name)));
      return found?.id || null;
    }

    // ========== MODE: categories ==========
    // întoarce categoriile (services) disponibile, filtrat opțional pe judet/oras
    if (mode === 'categories') {
      // dacă nu filtrăm după arie: trimite toate serviciile (după nume)
      if (!J && !O) {
        const { data: svc, error } = await db.from('services').select('name').order('name', { ascending: true });
        if (error) throw error;
        const services = (svc || []).map(r => r.name);
        return { statusCode: 200, headers, body: JSON.stringify({ services }) };
      }

      // altfel, luăm din providers activi + FK spre services
      const { data: provs, error } = await db
        .from('providers')
        .select('services(name), judet, oras, is_active')
        .eq('is_active', true);
      if (error) throw error;

      const map = new Map();
      for (const r of (provs || [])) {
        if (J && norm(r.judet) !== J) continue;
        if (O && norm(r.oras)  !== O) continue;
        const name = r.services?.name;
        if (!name) continue;
        if (!map.has(name)) map.set(name, true);
      }
      return { statusCode: 200, headers, body: JSON.stringify({ services: Array.from(map.keys()).sort((a,b)=>a.localeCompare(b)) }) };
    }

    // ========== MODE: subcategories ==========
    // params: service=<nume exact/varianta>, optional judet/oras
    if (mode === 'subcategories') {
      const serviceName = (qs.service || '').trim();
      const serviceId = await getServiceIdByName(serviceName);
      if (!serviceId) {
        return { statusCode: 200, headers, body: JSON.stringify({ subcategories: [] }) };
      }

      // folosim view-ul v_active_subcategories_by_area (are deja providers_count per subcat + arie)
      let { data: rows, error } = await db
        .from('v_active_subcategories_by_area')
        .select('subcategory_id, subcategory_name, service_id, parent_id, judet, oras, providers_count')
        .eq('service_id', serviceId);
      if (error) throw error;

      // filtrăm în JS pe arie + doar top-level (parent_id null)
      rows = (rows || []).filter(r => (!J || norm(r.judet) === J) && (!O || norm(r.oras) === O) && (r.parent_id === null));

      // agregăm count pe subcategory_id (view-ul e per arie)
      const agg = new Map();
      for (const r of rows) {
        const id = r.subcategory_id;
        if (!agg.has(id)) agg.set(id, { id, name: r.subcategory_name, count: 0 });
        agg.get(id).count += Number(r.providers_count || 0);
      }
      const subcategories = Array.from(agg.values()).sort((a,b)=>a.name.localeCompare(b.name));
      return { statusCode: 200, headers, body: JSON.stringify({ subcategories }) };
    }

    // ========== MODE: children ==========
    // params: subcat=<id>, optional judet/oras
    if (mode === 'children') {
      const subId = /^\d+$/.test(String(qs.subcat || '')) ? parseInt(qs.subcat, 10) : null;
      if (!subId) return { statusCode: 200, headers, body: JSON.stringify({ children: [] }) };

      // copii acelei subcategorii (parent_id = subId), tot din view, + filtrare arie
      let { data: rows, error } = await db
        .from('v_active_subcategories_by_area')
        .select('subcategory_id, subcategory_name, parent_id, judet, oras, providers_count')
        .eq('parent_id', subId);
      if (error) throw error;

      rows = (rows || []).filter(r => (!J || norm(r.judet) === J) && (!O || norm(r.oras) === O));

      const agg = new Map();
      for (const r of rows) {
        const id = r.subcategory_id;
        if (!agg.has(id)) agg.set(id, { id, name: r.subcategory_name, count: 0 });
        agg.get(id).count += Number(r.providers_count || 0);
      }
      const children = Array.from(agg.values()).sort((a,b)=>a.name.localeCompare(b.name));
      return { statusCode: 200, headers, body: JSON.stringify({ children }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid mode' }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message || String(e) }) };
  }
};
