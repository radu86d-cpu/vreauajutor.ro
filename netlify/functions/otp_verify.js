// netlify/functions/otp_verify.js
// Verifică un cod OTP trimis anterior via Twilio Verify (SMS sau call)

const twilio = require("twilio");

// === ENV necesare ===
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SID } = process.env;

const baseHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store",
};

// mic rate-limit în memorie per IP
const RL = global.__OTP_V_RL__ || new Map();
global.__OTP_V_RL__ = RL;
function rateLimit(ip, windowMs = 60_000, max = 8) {
  const now = Date.now();
  const bucket = RL.get(ip) || [];
  const fresh = bucket.filter((t) => now - t < windowMs);
  fresh.push(now);
  RL.set(ip, fresh);
  return fresh.length <= max;
}

// validări simple
function isE164(v = "") {
  return /^\+?[1-9]\d{7,14}$/.test(String(v).trim());
}
function isOtpCode(v = "") {
  // Twilio acceptă în general 4–10 caractere; păstrăm 4–8 cifre uzual
  return /^\d{4,8}$/.test(String(v).trim());
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: baseHeaders };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: baseHeaders, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  // verifică env
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SID) {
    return {
      statusCode: 500,
      headers: baseHeaders,
      body: JSON.stringify({ error: "Twilio env missing (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_VERIFY_SID)" }),
    };
  }

  // rate-limit per IP
  const ip = (event.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (!rateLimit(ip, 60_000, 8)) {
    return { statusCode: 429, headers: baseHeaders, body: JSON.stringify({ error: "Prea multe încercări. Reîncearcă peste 1 minut." }) };
  }

  // body
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const phone = String(body.phone || body.to || "").trim();
  const code  = String(body.code || "").trim();

  if (!phone) {
    return { statusCode: 400, headers: baseHeaders, body: JSON.stringify({ error: "Lipsește numărul de telefon." }) };
  }
  if (!isE164(phone)) {
    return { statusCode: 400, headers: baseHeaders, body: JSON.stringify({ error: "Telefon invalid. Folosește formatul internațional (ex: +407...)." }) };
  }
  if (!isOtpCode(code)) {
    return { statusCode: 400, headers: baseHeaders, body: JSON.stringify({ error: "Cod OTP invalid." }) };
  }

  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

  try {
    const resp = await client.verify.v2
      .services(TWILIO_VERIFY_SID)
      .verificationChecks
      .create({ to: phone, code });

    // status „approved” => cod corect
    if (resp.status === "approved") {
      return { statusCode: 200, headers: baseHeaders, body: JSON.stringify({ ok: true, status: resp.status }) };
    }

    // orice alt status îl tratăm ca invalid/expirat
    return { statusCode: 400, headers: baseHeaders, body: JSON.stringify({ ok: false, error: "Cod incorect sau expirat.", status: resp.status }) };
  } catch (e) {
    const msg = e?.message || "Eroare Twilio";
    return { statusCode: 500, headers: baseHeaders, body: JSON.stringify({ error: msg }) };
  }
};