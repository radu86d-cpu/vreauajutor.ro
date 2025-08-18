// netlify/functions/messages.js
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); // service key (RLS respectat prin policies)

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };

  // verificăm userul din token
  const auth = event.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const { data: usrRes, error: uerr } = await supabase.auth.getUser(token);
  if (uerr || !usrRes?.user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'unauthorized' }) };
  const user = usrRes.user;

  if (event.httpMethod === 'GET') {
    // inbox: ultimele 50 de mesaje din camerele la care participă userul
    const { data } = await supabase.from('messages')
      .select('id, room_id, sender_id, body, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    return { statusCode: 200, headers, body: JSON.stringify({ items: data || [] }) };
  }

  if (event.httpMethod === 'POST') {
    const payload = JSON.parse(event.body || '{}');
    const { room_id, body, to_provider_id } = payload;

    let roomId = room_id;

    // dacă vine 'to_provider_id', creăm/folosim cameră privată între user și acel provider (proprietarul lui)
    if (!roomId && to_provider_id) {
      // aflăm userul proprietar al providerului
      const { data: prov } = await supabase.from('providers').select('user_id').eq('id', to_provider_id).maybeSingle();
      if (!prov?.user_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'provider fără user' }) };

      // caută cameră existentă (private) între cei doi
      let { data: existing } = await supabase
        .from('rooms')
        .select('id')
        .eq('type', 'private')
        .limit(1);
      roomId = existing?.[0]?.id;

      if (!roomId) {
        const { data: roomIns, error: rerr } = await supabase
          .from('rooms')
          .insert({ type: 'private' })
          .select('id')
          .single();
        if (rerr) return { statusCode: 500, headers, body: JSON.stringify({ error: rerr.message }) };
        roomId = roomIns.id;

        // participanții: userul curent + proprietarul providerului
        await supabase.from('room_participants').insert([
          { room_id: roomId, user_id: user.id },
          { room_id: roomId, user_id: prov.user_id }
        ]);
      }
    }

    if (!roomId || !body) return { statusCode: 400, headers, body: JSON.stringify({ error: 'room_id/body lipsă' }) };

    const { data: msg, error: merr } = await supabase
      .from('messages')
      .insert({ room_id: roomId, sender_id: user.id, body })
      .select('id, created_at')
      .single();
    if (merr) return { statusCode: 500, headers, body: JSON.stringify({ error: merr.message }) };

    return { statusCode: 201, headers, body: JSON.stringify({ ok: true, id: msg.id }) };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};
