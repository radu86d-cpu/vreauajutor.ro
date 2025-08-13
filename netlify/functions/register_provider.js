// /netlify/functions/register_provider.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  // SERVICE ROLE KEY — numai pe server!
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// mic helper: "Cluj-Napoca" nu "cluj-napoca"
function titleCaseRO(s = '') {
  return s
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // CORS preflight pentru Authorization
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Use POST' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    const required = ['company_name', 'service_name', 'judet', 'oras'];
    for (const k of required) {
      if (!body[k] || String(body[k]).trim() === '') {
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Lipsește: ${k}` }) };
      }
    }

    // 0) Aflăm user-ul din token (trebuie să trimiți Authorization: Bearer <token>)
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

    // 1) aflăm service_id după nume
    const { data: svc, error: e1 } = await supabase
      .from('services')
      .select('id')
      .eq('name', body.service_name)
      .single();

    if (e1 || !svc) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Serviciu inexistent' }) };
    }

    // 2) inserăm furnizorul (normalizez județ/oras + setez user_id)
    const insert = {
      user_id: user.id, // ← IMPORTANT
      company_name: body.company_name.trim(),
      description: body.description?.trim() || null,
      service_id: svc.id,
      judet: titleCaseRO(body.judet),
      oras: titleCaseRO(body.oras),
      phone: body.phone?.trim() || null,
      email: body.email?.trim() || null,
      is_active: true
    };

    const { data, error } = await supabase
      .from('providers')
      .insert(insert)
      .select('id, company_name');

    if (error) {
      // eroare de unicitate pe company_name
      if (error.code === '23505') {
        return { statusCode: 409, headers, body: JSON.stringify({ error: 'Compania există deja.' }) };
      }
      throw error;
    }

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({ ok: true, provider: data?.[0] || null })
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
