// netlify/functions/register_provider.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  // SERVICE ROLE KEY — numai pe server!
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

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

    // 1) aflăm service_id după nume
    const { data: svc, error: e1 } = await supabase
      .from('services')
      .select('id')
      .eq('name', body.service_name)
      .single();

    if (e1 || !svc) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Serviciu inexistent' }) };
    }

    // 2) inserăm furnizorul
    const insert = {
      company_name: body.company_name.trim(),
      description: body.description?.trim() || null,
      service_id: svc.id,
      judet: body.judet.trim(),
      oras: body.oras.trim(),
      phone: body.phone?.trim() || null,
      email: body.email?.trim() || null,
      is_active: true, // sau false dacă vrei aprobare manuală
      user_id: null
    };

    const { data, error } = await supabase
      .from('providers')
      .insert(insert)
      .select('id, company_name');

    if (error) throw error;

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({ ok: true, provider: data?.[0] || null })
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
