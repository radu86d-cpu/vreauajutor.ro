// /netlify/functions/register_provider.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  // SERVICE ROLE KEY — numai pe server!
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// helpers
const stripDiacritics = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const norm = (s = '') => stripDiacritics(String(s).trim()).toLowerCase();
function titleCaseRO(s = '') {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers, body: JSON.stringify({ error: 'Use POST' }) };

  try {
    const body = JSON.parse(event.body || '{}');

    // ------------------ Validări minime ------------------
    const required = ['company_name', 'service_name', 'judet', 'oras'];
    for (const k of required) {
      if (!body[k] || String(body[k]).trim() === '') {
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Lipsește: ${k}` }) };
      }
    }

    // autentificare (token din Authorization: Bearer <jwt>)
    const auth = event.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Trebuie autentificare (lipsește token-ul).' }) };
    }
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token invalid.' }) };
    }
    const user = userData.user;

    // ------------------ Găsește service_id după service_name ------------------
    // întâi încercăm egalitate directă (exact cum e în DB)
    let serviceId = null;

    // 1) match exact
    {
      const { data: svc1, error: e1 } = await supabase
        .from('services')
        .select('id, name')
        .eq('name', body.service_name)
        .maybeSingle();
      if (e1) throw e1;
      if (svc1?.id) serviceId = svc1.id;
    }

    // 2) fallback: potrivire fără diacritice + case-insensitive
    if (!serviceId) {
      const { data: allS, error: e2 } = await supabase
        .from('services')
        .select('id, name');
      if (e2) throw e2;
      const target = norm(body.service_name);
      const found = (allS || []).find(s => norm(s.name) === target)
                || (allS || []).find(s => norm(s.name).includes(target) || target.includes(norm(s.name)));
      if (found) serviceId = found.id;
    }

    if (!serviceId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Serviciu inexistent' }) };
    }

    // ------------------ Inserare provider ------------------
    const insert = {
      user_id:     user.id,
      company_name: (body.company_name || '').trim(),
      description:  (body.description || '').trim() || null,
      service_id:   serviceId,
      judet:        titleCaseRO(body.judet),
      oras:         titleCaseRO(body.oras),
      phone:        (body.phone || '').trim() || null,
      email:        (body.email || '').trim() || null,
      is_active:    true,
    };

    const { data: provRows, error: insErr } = await supabase
      .from('providers')
      .insert(insert)
      .select('id, company_name')
      .limit(1);

    if (insErr) {
      if (insErr.code === '23505') {
        // unicitate pe company_name
        return { statusCode: 409, headers, body: JSON.stringify({ error: 'Compania există deja.' }) };
      }
      throw insErr;
    }

    const provider = provRows?.[0];
    const providerId = provider?.id;
    if (!providerId) throw new Error('Insert provider fără id.');

        // ------------------ Subcategorie / Sub-subcategorie ------------------
    // Acceptăm:
    //  - body.subcat  : id numeric (părinte)
    //  - body.subsub  : id numeric (primul copil, compat)
    //  - body.subsubs : listă de id-uri (copiii bifați)
    const toLink = new Set();

    const addIfNum = (v) => {
      const s = String(v ?? '');
      if (/^\d+$/.test(s)) toLink.add(parseInt(s, 10));
    };

    addIfNum(body.subcat);
    addIfNum(body.subsub);

    if (Array.isArray(body.subsubs)) {
      body.subsubs.forEach(addIfNum);
    } else if (typeof body.subsubs === 'string' && body.subsubs.trim()) {
      // suport și pentru "1,2,3"
      body.subsubs.split(',').forEach(addIfNum);
    }

    if (toLink.size) {
      const ids = Array.from(toLink);
      const { data: subs, error: sErr } = await supabase
        .from('subcategories')
        .select('id')
        .in('id', ids);
      if (sErr) throw sErr;

      const validIds = new Set((subs || []).map(r => r.id));
      for (const sid of ids) {
        if (!validIds.has(sid)) continue;
        const { error: linkErr } = await supabase
          .from('provider_subcategories')
          .insert({ provider_id: providerId, subcategory_id: sid });
        if (linkErr && linkErr.code !== '23505') throw linkErr;
      }
    }

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({ ok: true, provider }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || String(err) }) };
  }
};
