// netlify/functions/providers.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  const { judet, oras, service } = event.queryStringParameters || {};

  let query = supabase.from('v_public_providers').select('*');
  if (judet)   query = query.eq('judet', judet);
  if (oras)    query = query.eq('oras', oras);
  if (service) query = query.eq('service_name', service);

  const { data, error } = await query.limit(50);

  if (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
  return { statusCode: 200, headers, body: JSON.stringify(data) };
};
