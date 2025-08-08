export async function handler(event) {
  // CORS preflight (sigur și pentru debug)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { message } = JSON.parse(event.body || '{}');
    if (!message || !message.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Mesaj lipsă' }) };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'OPENAI_API_KEY lipsă' }) };
    }

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // poți schimba în gpt-4o
        temperature: 0.7,
        messages: [
          { role: 'system', content: 'Ești AjutorBot, asistent prietenos pentru marketplace-ul VreauAjutor.ro.' },
          { role: 'user', content: message }
        ]
      }),
    });

    if (!resp.ok) {
      const errTxt = await resp.text();
      return { statusCode: 500, body: JSON.stringify({ error: 'OpenAI error', details: errTxt }) };
    }

    const data = await resp.json();
    const reply = data?.choices?.[0]?.message?.content || 'Nu am un răspuns momentan.';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}
