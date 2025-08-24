// netlify/functions/otp_verify.js
const twilio = require('twilio');

function json(statusCode, data) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
}

function emailValid(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(v||'').trim()); }
function normalizePhoneRO(raw){
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (/^07\d{8}$/.test(digits)) return '+4' + digits;
  if (/^40\d{9}$/.test(digits) && digits.startsWith('407')) return '+' + digits;
  if (/^00?40\d{9}$/.test(digits)) return '+' + digits.replace(/^00?/, '');
  if (/^\d{8,15}$/.test(digits)) return '+' + digits;
  return null;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SID, TEST_MASTER_OTP } = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SID) {
      return json(500, { error: 'Twilio env vars not set' });
    }

    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

    const channel = (body.channel || '').toLowerCase();
    let to = String(body.to || '').trim();
    const code = String(body.code || '').trim();

    if (!['sms','email'].includes(channel)) return json(400, { error: 'Invalid channel' });
    if (!to) return json(400, { error: 'Missing recipient' });
    if (!code) return json(400, { error: 'Missing code' });

    if (channel === 'sms') {
      to = normalizePhoneRO(to);
      if (!to) return json(400, { error: 'Phone invalid' });
    } else {
      if (!emailValid(to)) return json(400, { error: 'Email invalid' });
      to = to.toLowerCase();
    }

    // opțional: master code pentru staging/dev (NU pentru producție)
    if (TEST_MASTER_OTP && code === TEST_MASTER_OTP) {
      return json(200, { ok: true, status: 'approved', bypass: true });
    }

    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

    const check = await client.verify.v2.services(TWILIO_VERIFY_SID).verificationChecks.create({
      to,
      code
    });

    if (check.status === 'approved') {
      return json(200, { ok: true, status: check.status });
    }
    return json(400, { error: 'Invalid or expired code', status: check.status || 'failed' });
  } catch (e) {
    console.error('otp_verify error', e);
    const msg = e?.message || 'Failed to verify code';
    return json(500, { error: msg });
  }
};

