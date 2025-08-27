// netlify/functions/otp_start.js
import { json, bad, method, rateLimit, bodyJSON, handleOptions } from "./_shared/utils.js";
import twilio from "twilio";

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SID } = process.env;
if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SID) {
  console.warn("WARN: Twilio env vars missing (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_VERIFY_SID)");
}

const client = (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

function isEmail(v=""){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function isE164(v=""){ return /^\+?[1-9]\d{7,14}$/.test(v); } // validare simplă E.164

export default async (req) => {
  const opt = handleOptions(req); if (opt) return opt;
  const m = method(req, ["POST"]); if (m === "METHOD_NOT_ALLOWED") return bad("Method Not Allowed", 405);
  if (!rateLimit(req, { windowSec: 60, max: 5 })) return bad("Prea multe încercări. Reîncearcă în 1 minut.", 429);
  if (!client || !TWILIO_VERIFY_SID) return bad("Twilio Verify nu este configurat pe server.", 500);

  const { channel = "sms", to } = await bodyJSON(req);
  if (!to) return bad("Lipsește destinatarul (to).");

  // Validare în funcție de canal
  if (channel === "sms" || channel === "call") {
    if (!isE164(to)) return bad("Telefon invalid. Folosește format E.164 (ex: +407... ).");
  } else if (channel === "email") {
    if (!isEmail(to)) return bad("Email invalid.");
  } else {
    return bad("Canal invalid. Folosește 'sms', 'call' sau 'email'.");
  }

  try {
    const resp = await client.verify.v2
      .services(TWILIO_VERIFY_SID)
      .verifications
      .create({ to, channel });

    // status tipic: "pending"
    return json({ ok: true, status: resp.status });
  } catch (e) {
    return bad(e?.message || "Eroare Twilio", 500);
  }
};