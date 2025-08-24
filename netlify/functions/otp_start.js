// netlify/functions/otp_start.js
const twilio = require('twilio');

function json(statusCode, data) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
}

function emailValid(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(v||'').trim()); }

// Normalizare număr RO în E.164: 07XXXXXXXX -> +407XXXXXXXX
function normalizePhoneRO(raw){
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (/^07\d{8}$/.test(digits)) return '+4' + digits;        // 07........ -> +407........
  if (/^40\d{9}$/.test(digits) && digits.startsWith('407')) return '+' + digits; // 407........ -> +407........
  if (/^00?40\d{9}$/.test(digits)) return '+' + digits.replace(/^00?/, '');     // 0040 / 040
  if (/^\d{8,15}$/.test(digits)) return '+' + digits;        // fallback: presupune E.164 fără "+"
  return null;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SID } = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SID) {
      return json(500, { error: 'Twilio env vars not set' });
    }

    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

    const channel = (body.channel || '').toLowerCase(); // 'sms' | 'email'
    let to = String(body.to || '').trim();

    if (!['sms','email'].includes(channel)) return json(400, { error: 'Invalid channel' });
    if (!to) return json(400, { error: 'Missing recipient' });

    if (channel === 'sms') {
      to = normalizePhoneRO(to);
      if (!to) return json(400, { error: 'Phone invalid (ex: 07XXXXXXXX)' });
    } else {
      if (!emailValid(to)) return json(400, { error: 'Email invalid' });
      to = to.toLowerCase();
    }

    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

    await client.verify.v2.services(TWILIO_VERIFY_SID).verifications.create({
      to,
      channel // 'sms' sau 'email'
      // pentru email, configurează From & template în Twilio Verify Service
    });

    return json(200, { ok: true });
  } catch (e) {
    console.error('otp_start error', e);
    const msg = e?.message || 'Failed to start verification';
    return json(500, { error: msg });
  }
};

