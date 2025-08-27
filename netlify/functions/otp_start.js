// netlify/functions/otp_start.js
import { json, bad, method, rateLimit, bodyJSON, handleOptions } from "./_shared/utils.js";
import twilio from "twilio";

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SID } = process.env;
if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SID) {
  console.warn("WARN: Twilio env vars missing (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_VERIFY_SID)");
}

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// --- helpers ---
const strip = (s="") => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const norm  = (s="") => strip(String(s).trim()).toLowerCase();
const isEmail = (v="") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const toE164RO = (raw="") => {
  const s = String(raw).replace(/\s+/g,"");
  if (/^07\d{8}$/.test(s)) return "+4" + s;          // 07xxxxxxxx -> +407xxxxxxxx
  if (/^\+?\d{8,15}$/.test(s)) return s.startsWith("+") ? s : "+" + s;
  return s;
};

export default async (req) => {
  const opt = handleOptions(req); if (opt) return opt;

  const m = method(req, ["POST"]);
  if (m === "METHOD_NOT_ALLOWED") return bad("Method Not Allowed", 405);

  if (!rateLimit(req, { windowSec: 60, max: 5 })) {
    return bad("Prea multe încercări. Reîncearcă în 1 minut.", 429);
  }

  const { channel = "sms", to: rawTo } = await bodyJSON(req);
  const ch = String(channel).toLowerCase();
  if (!rawTo) return bad("Lipsește destinatarul (to).");

  // validăm în funcție de canal
  let to = rawTo;
  if (ch === "sms" || ch === "call") {
    to = toE164RO(rawTo);
    if (!/^\+\d{8,15}$/.test(to)) return bad("Număr de telefon invalid (așteptat E.164).");
  } else if (ch === "email") {
    if (!isEmail(rawTo)) return bad("Email invalid.");
  } else {
    return bad("Canal invalid. Folosește sms, call sau email.");
  }

  if (!TWILIO_VERIFY_SID) return bad("Twilio Verify neconfigurat.", 500);

  try {
    const resp = await client.verify.v2
      .services(TWILIO_VERIFY_SID)
      .verifications
      .create({ to, channel: ch });

    // status tipic: "pending"
    return json({ ok: true, status: resp.status, channel: ch });
  } catch (e) {
    return bad(e?.message || "Eroare Twilio", 500);
  }
};