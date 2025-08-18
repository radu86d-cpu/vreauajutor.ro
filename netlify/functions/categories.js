// netlify/functions/categories.js
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

exports.handler = async () => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  try {
    const { data: services, error: e1 } = await supabase
      .from('services')
      .select('id, name')
      .order('name', { ascending: true });
    if (e1) throw e1;

    const { data: subs, error: e2 } = await supabase
      .from('subcategories')
      .select('id, service_id, name, slug, position')
      .order('position', { ascending: true });
    if (e2) throw e2;

    const { data: filters, error: e3 } = await supabase
      .from('subcategory_filters')
      .select('id, subcategory_id, key, label, type, options, position')
      .order('position', { ascending: true });
    if (e3) throw e3;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ services, subs, filters })
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
