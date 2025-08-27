// netlify/functions/otp_start.js
// Pornește trimiterea unui cod OTP via Twilio Verify (SMS sau call)

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
const RL = global.__OTP_RL__ || new Map();
global.__OTP_RL__ = RL;
function rateLimit(ip, windowMs = 60_000, max = 5) {
  const now = Date.now();
  const bucket = RL.get(ip) || [];
  const fresh = bucket.filter((t) => now - t < windowMs);
  fresh.push(now);
  RL.set(ip, fresh);
  return fresh.length <= max;
}

// validare E.164 simplă (acceptăm și numere +407..., etc.)
function isE164(v = "") {
  return /^\+?[1-9]\d{7,14}$/.test(String(v).trim());
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
  if (!rateLimit(ip, 60_000, 5)) {
    return { statusCode: 429, headers: baseHeaders, body: JSON.stringify({ error: "Prea multe încercări. Reîncearcă peste 1 minut." }) };
  }

  // body
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const channel = String(body.channel || "sms").toLowerCase(); // "sms" | "call" (opțional)
  const phone   = String(body.phone || body.to || "").trim();

  if (!phone) {
    return { statusCode: 400, headers: baseHeaders, body: JSON.stringify({ error: "Lipsește numărul de telefon." }) };
  }
  if (!isE164(phone)) {
    return { statusCode: 400, headers: baseHeaders, body: JSON.stringify({ error: "Telefon invalid. Folosește formatul internațional (ex: +407...)." }) };
  }
  if (!["sms", "call"].includes(channel)) {
    return { statusCode: 400, headers: baseHeaders, body: JSON.stringify({ error: "Canal invalid. Folosește 'sms' sau 'call'." }) };
  }

  // Twilio client
  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

  try {
    const resp = await client.verify.v2
      .services(TWILIO_VERIFY_SID)
      .verifications
      .create({ to: phone, channel });

    // status tipic: "pending"
    return { statusCode: 200, headers: baseHeaders, body: JSON.stringify({ ok: true, status: resp.status }) };
  } catch (e) {
    // răspuns clar, fără a expune detalii sensibile
    const msg = e?.message || "Eroare Twilio";
    return { statusCode: 500, headers: baseHeaders, body: JSON.stringify({ error: msg }) };
  }
};