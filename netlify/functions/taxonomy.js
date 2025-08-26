const { createClient } = require('@supabase/supabase-js');

const strip = (s='') => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const norm  = (s='') => strip(String(s).trim()).toLowerCase();
const title = (s='') => {
  const t = String(s).trim().toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
};

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'public, max-age=30, s-maxage=30'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error:'Method not allowed' }) };

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error:'Missing Supabase env' }) };
    }
    const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const qs   = event.queryStringParameters || {};
    const mode = (qs.mode || '').trim();
    const jud  = (qs.judet || '').trim();
    const ora  = (qs.oras  || '').trim();

    const J = norm(jud), O = norm(ora);
    const areaOK = (p) => {
      if (J && norm(p.judet) !== J) return false;
      if (O && norm(p.oras)  !== O) return false;
      return true;
    };

    // === categories
    if (mode === 'categories') {
      const { data: prov, error: e1 } = await db
        .from('providers')
        .select('service_id, is_active, judet, oras');
      if (e1) throw e1;

      const act = (prov || []).filter(p => p.is_active && areaOK(p));
      const serviceIds = Array.from(new Set(act.map(p => p.service_id).filter(Boolean)));

      if (!serviceIds.length) {
        return { statusCode: 200, headers, body: JSON.stringify({ services: [] }) };
      }

      const { data: svcs, error: e2 } = await db
        .from('services')
        .select('id, name')
        .in('id', serviceIds);
      if (e2) throw e2;

      const services = (svcs || [])
        .map(s => s.name)
        .filter(Boolean)
        .sort((a,b)=>a.localeCompare(b));

      return { statusCode: 200, headers, body: JSON.stringify({ services }) };
    }

    // === subcategories
    if (mode === 'subcategories') {
      const svcNameQ = (qs.service || '').trim();
      if (!svcNameQ) return { statusCode: 400, headers, body: JSON.stringify({ subcategories: [] }) };

      const { data: allS, error: eS } = await db.from('services').select('id,name');
      if (eS) throw eS;
      const target = norm(svcNameQ);
      const svc = (allS || []).find(s => norm(s.name) === target)
             || (allS || []).find(s => norm(s.name).includes(target) || target.includes(norm(s.name)));

      let subcategories = [];

      if (svc?.id) {
        const { data: subs, error: eSub } = await db
          .from('subcategories')
          .select('id, name, parent_id, service_id')
          .eq('service_id', svc.id);
        if (eSub) throw eSub;

        const top = (subs || []).filter(s => !s.parent_id);

        const childrenByParent = {};
        (subs || []).forEach(s => {
          if (s.parent_id) (childrenByParent[s.parent_id] ||= []).push(s.id);
        });

        const { data: prov, error: eP } = await db
          .from('providers')
          .select('id, is_active, judet, oras, service_id');
        if (eP) throw eP;

        const act = (prov || []).filter(p => p.is_active && p.service_id === svc.id && areaOK(p));
        const pids = act.map(p => p.id);

        let links = [];
        if (pids.length) {
          const { data: linkRows, error: eL } = await db
            .from('provider_subcategories')
            .select('provider_id, subcategory_id')
            .in('provider_id', pids);
          if (eL) throw eL;
          links = linkRows || [];
        }

        const setMap = new Map();
        for (const row of links) {
          if (!setMap.has(row.provider_id)) setMap.set(row.provider_id, new Set());
          setMap.get(row.provider_id).add(row.subcategory_id);
        }

        subcategories = top.map(t => {
          const kids = new Set(childrenByParent[t.id] || []);
          let count = 0;
          for (const p of act) {
            const s = setMap.get(p.id);
            if (!s) continue;
            if (s.has(t.id)) { count++; continue; }
            for (const kidId of kids) { if (s.has(kidId)) { count++; break; } }
          }
          return { id: t.id, name: title(t.name), count };
        }).filter(x => x.name);

        subcategories.sort((a,b)=> a.name.localeCompare(b.name));
      }

      // Fallback pe taxonomy_flat
      if (!subcategories.length) {
        let serviceId = svc?.id;
        if (!serviceId) {
          const normName = (s) => s?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          const wanted = normName(svcNameQ);
          const hit = (allS || []).find(x => normName(x.name) === wanted);
          serviceId = hit?.id;
        }

        if (serviceId) {
          const { data: flat, error: flatErr } = await db
            .from('taxonomy_flat')
            .select('subcat_name')
            .eq('service_id', serviceId);
          if (flatErr) throw flatErr;

          const uniq = new Set();
          (flat || []).forEach(r => {
            const name = (r.subcat_name || '').trim();
            if (name) uniq.add(name);
          });
          subcategories = [...uniq].sort((a,b)=>a.localeCompare(b, 'ro')).map(name => ({
            id: null, name, count: 0
          }));
        } else {
          const { data: flat2 } = await db
            .from('taxonomy_flat')
            .select('service_name, subcat_name');
          const normName = (s) => s?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          const wanted = normName(svcNameQ);
          const uniq = new Set();
          (flat2 || []).forEach(r => {
            if (normName(r.service_name) === wanted && r.subcat_name) uniq.add(r.subcat_name.trim());
          });
          subcategories = [...uniq].sort((a,b)=>a.localeCompare(b, 'ro')).map(name => ({
            id: null, name, count: 0
          }));
        }
      }

      return { statusCode: 200, headers, body: JSON.stringify({ subcategories }) };
    }

    // === children
    if (mode === 'children') {
      const raw = (qs.subcat || '').trim();

      if (/^\d+$/.test(raw)) {
        const parentId = parseInt(raw, 10);
        const { data: parent, error: ePar } = await db
          .from('subcategories')
          .select('id, service_id')
          .eq('id', parentId)
          .maybeSingle();
        if (ePar) throw ePar;
        if (!parent?.service_id) return { statusCode: 200, headers, body: JSON.stringify({ children: [] }) };

        const { data: kids, error: eKids } = await db
          .from('subcategories')
          .select('id, name, parent_id')
          .eq('parent_id', parentId);
        if (eKids) throw eKids;

        const { data: prov, error: eP } = await db
          .from('providers')
          .select('id, is_active, judet, oras, service_id');
        if (eP) throw eP;
        const act = (prov || []).filter(p => p.is_active && p.service_id === parent.service_id && areaOK(p));
        const pids = act.map(p => p.id);

        let links = [];
        if (pids.length) {
          const { data: linkRows, error: eL } = await db
            .from('provider_subcategories')
            .select('provider_id, subcategory_id')
            .in('provider_id', pids);
          if (eL) throw eL;
          links = linkRows || [];
        }

        const setMap = new Map();
        for (const row of links) {
          if (!setMap.has(row.provider_id)) setMap.set(row.provider_id, new Set());
          setMap.get(row.provider_id).add(row.subcategory_id);
        }

        const children = (kids || []).map(k => {
          let count = 0;
          for (const p of act) {
            const s = setMap.get(p.id);
            if (s && s.has(k.id)) count++;
          }
          return { id: k.id, name: title(k.name), count };
        }).filter(x => x.name)
          .sort((a,b)=>a.name.localeCompare(b.name));

        return { statusCode: 200, headers, body: JSON.stringify({ children }) };
      }

      // fallback pe taxonomy_flat după nume
      const subcatName = raw;
      if (!subcatName) return { statusCode: 200, headers, body: JSON.stringify({ children: [] }) };

      const { data: flat, error: fErr } = await db
        .from('taxonomy_flat')
        .select('child_name, subcat_name')
        .eq('subcat_name', subcatName);
      if (fErr) throw fErr;

      const uniq = new Set();
      (flat || []).forEach(r => {
        const n = (r.child_name || '').trim();
        if (n) uniq.add(n);
      });

      const children = [...uniq]
        .sort((a,b)=>a.localeCompare(b, 'ro'))
        .map(name => ({ id: null, name, count: 0 }));

      return { statusCode: 200, headers, body: JSON.stringify({ children }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error:'Unknown mode' }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message || String(e) }) };
  }
};