const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const { slug } = event.queryStringParameters || {};
  if (!slug) return { statusCode: 400, headers, body: JSON.stringify({ error: 'slug required' }) };

  const { data: page, error: e1 } = await supabase
    .from('provider_pages')
    .select('provider_id, slug, template_choice, cover_url, gallery, long_description')
    .eq('slug', slug)
    .maybeSingle();
  if (e1) return { statusCode: 500, headers, body: JSON.stringify({ error: e1.message }) };
  if (!page) return { statusCode: 404, headers, body: JSON.stringify({ error: 'not found' }) };

  const { data: provider } = await supabase
    .from('v_search_providers')
    .select('*')
    .eq('id', page.provider_id)
    .maybeSingle();

  const { data: products } = await supabase
    .from('products')
    .select('id, name, description, price, currency, image_url')
    .eq('provider_id', page.provider_id)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  return { statusCode: 200, headers, body: JSON.stringify({ page, provider, products }) };
};