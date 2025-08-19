const { createClient } = require('@supabase/supabase-js');

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// helper: ia id categorie după nume (fallback pe slug/nume)
async function getServiceId(service) {
  if (!service) return null;
  // dacă e număr, îl folosim ca id
  if (/^\d+$/.test(service)) return Number(service);

  // altfel căutăm după nume (case-insens.)
  const { data } = await supa
    .from('services')
    .select('id')
    .ilike('name', service)
    .maybeSingle();
  return data?.id || null;
}

exports.handler = async (event) => {
  try {
    const p = event.queryStringParameters || {};
    const mode   = (p.mode || 'categories').trim(); // categories | subcategories | children | filters
    const judet  = (p.judet || '').trim();
    const oras   = (p.oras  || '').trim();
    const signup = p.signup === '1'; // la înscriere vrem TOT (nu doar active)
    const serviceParam = (p.service || '').trim();
    const subcatId     = p.subcat ? Number(p.subcat) : null;

    // ========== 1) LISTĂ CATEGORII ==========
    if (mode === 'categories') {
      if (signup) {
        // toată lista (pt. formularul de înscriere)
        const { data, error } = await supa
          .from('services')
          .select('id, name')
          .order('name', { ascending: true });
        if (error) throw error;
        return ok({ services: data });
      }

      // doar cele cu furnizori; opțional: filtrare pe zonă
      let q = supa.from('v_active_services_by_area')
        .select('service_id, service_name, judet, oras, providers_count');
      if (judet) q = q.eq('judet', judet);
      if (oras)  q = q.eq('oras', oras);

      const { data, error } = await q;
      if (error) throw error;

      // agregăm pe service_id (să nu dublăm pe orașe)
      const map = new Map();
      for (const r of data) {
        if (!map.has(r.service_id)) {
          map.set(r.service_id, { id: r.service_id, name: r.service_name, count: 0 });
        }
        map.get(r.service_id).count += Number(r.providers_count || 0);
      }
      const services = Array.from(map.values())
        .filter(s => s.count > 0)
        .sort((a,b)=> a.name.localeCompare(b.name, 'ro'));
      return ok({ services });
    }

    // ========== 2) SUBCATEGORII DE NIVEL 1 PENTRU O CATEGORIE ==========
    if (mode === 'subcategories') {
      const service_id = await getServiceId(serviceParam);
      if (!service_id) return bad('Parametrul "service" este necesar.');

      if (signup) {
        // TOT nivelul 1 + filtre de categorie
        const [scRes, fcRes] = await Promise.all([
          supa.from('subcategories').select('id, name, slug, position').eq('service_id', service_id).is('parent_id', null).order('position', { ascending: true }),
          supa.from('filters').select('id, key, label, type, options, unit, step, min, max, multi, position').eq('scope', 'category').eq('service_id', service_id).order('position', { ascending: true })
        ]);
        if (scRes.error) throw scRes.error;
        if (fcRes.error) throw fcRes.error;
        return ok({ subcategories: scRes.data, category_filters: fcRes.data });
      }

      // doar subcategoriile care AU furnizori în acea zonă (dacă e setată)
      let q = supa.from('v_active_subcategories_by_area')
        .select('subcategory_id, subcategory_name, parent_id, providers_count')
        .eq('service_id', service_id)
        .is('parent_id', null);
      if (judet) q = q.eq('judet', judet);
      if (oras)  q = q.eq('oras', oras);

      const { data: actives, error } = await q;
      if (error) throw error;

      // filtre de categorie
      const { data: catFilters, error: fErr } = await supa
        .from('filters')
        .select('id, key, label, type, options, unit, step, min, max, multi, position')
        .eq('scope', 'category')
        .eq('service_id', service_id)
        .order('position', { ascending: true });
      if (fErr) throw fErr;

      // returnăm doar cele active
      return ok({
        subcategories: actives
          .map(x => ({ id: x.subcategory_id, name: x.subcategory_name, count: x.providers_count }))
          .sort((a,b)=> a.name.localeCompare(b.name,'ro')),
        category_filters: catFilters
      });
    }

    // ========== 3) COPIII unei SUBCATEGORII (sub-subcategorii) ==========
    if (mode === 'children') {
      if (!subcatId) return bad('Parametrul "subcat" este necesar.');

      if (signup) {
        // toți copiii + filtre pe subcategorie
        const [kidsRes, fRes] = await Promise.all([
          supa.from('subcategories').select('id, name, slug, position').eq('parent_id', subcatId).order('position', { ascending: true }),
          supa.from('filters').select('id, key, label, type, options, unit, step, min, max, multi, position').eq('scope','subcategory').eq('subcategory_id', subcatId).order('position', { ascending: true })
        ]);
        if (kidsRes.error) throw kidsRes.error;
        if (fRes.error) throw fRes.error;
        return ok({ children: kidsRes.data, subcategory_filters: fRes.data });
      }

      // doar copiii activi (au furnizori)
      let q = supa.from('v_active_subcategories_by_area')
        .select('subcategory_id, subcategory_name, providers_count')
        .eq('parent_id', subcatId);
      if (judet) q = q.eq('judet', judet);
      if (oras)  q = q.eq('oras', oras);

      const { data: actives, error } = await q;
      if (error) throw error;

      // filtre pe subcategoria părinte
      const { data: subFilters, error: fErr } = await supa
        .from('filters')
        .select('id, key, label, type, options, unit, step, min, max, multi, position')
        .eq('scope','subcategory')
        .eq('subcategory_id', subcatId)
        .order('position', { ascending: true });
      if (fErr) throw fErr;

      return ok({
        children: actives
          .map(x => ({ id: x.subcategory_id, name: x.subcategory_name, count: x.providers_count }))
          .sort((a,b)=> a.name.localeCompare(b.name,'ro')),
        subcategory_filters: subFilters
      });
    }

    // ========== 4) DOAR FILTRE (pt. pagina Rezultate) ==========
    if (mode === 'filters') {
      // combină filtre de categorie + (opțional) de subcategorie
      const service_id = await getServiceId(serviceParam);
      const results = { category_filters: [], subcategory_filters: [] };

      if (service_id) {
        const { data, error } = await supa
          .from('filters')
          .select('id, key, label, type, options, unit, step, min, max, multi, position')
          .eq('scope', 'category')
          .eq('service_id', service_id)
          .order('position', { ascending: true });
        if (error) throw error;
        results.category_filters = data;
      }

      if (subcatId) {
        const { data, error } = await supa
          .from('filters')
          .select('id, key, label, type, options, unit, step, min, max, multi, position')
          .eq('scope', 'subcategory')
          .eq('subcategory_id', subcatId)
          .order('position', { ascending: true });
        if (error) throw error;
        results.subcategory_filters = data;
      }
      return ok(results);
    }

    return bad('Mode necunoscut.');
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

function ok(body){ return { statusCode: 200, headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }; }
function bad(msg){ return { statusCode: 400, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ error: msg }) }; }
