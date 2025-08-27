// netlify/functions/otp_verify.js
import { json, bad, method, rateLimit, bodyJSON, handleOptions } from "./_shared/utils.js";
import { signOtpToken } from "./_shared/tokens.js";
import twilio from "twilio";

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SID } = process.env;
if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SID) {
  console.warn("WARN: Twilio env vars missing (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_VERIFY_SID)");
}

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// --- helpers ---
const strip = (s="") => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const isEmail = (v="") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const toE164RO = (raw="") => {
  const s = String(raw).replace(/\s+/g,"");
  if (/^07\d{8}$/.test(s)) return "+4" + s;
  if (/^\+?\d{8,15}$/.test(s)) return s.startsWith("+") ? s : "+" + s;
  return s;
};

export default async (req) => {
  const opt = handleOptions(req); if (opt) return opt;

  const m = method(req, ["POST"]);
  if (m === "METHOD_NOT_ALLOWED") return bad("Method Not Allowed", 405);

  if (!rateLimit(req, { windowSec: 60, max: 8 })) {
    return bad("Prea multe încercări. Reîncearcă în 1 minut.", 429);
  }

  const { channel = "sms", to: rawTo, code } = await bodyJSON(req);
  const ch = String(channel).toLowerCase();
  if (!rawTo) return bad("Lipsește destinatarul (to).");
  if (!code || String(code).trim().length < 4) return bad("Cod OTP invalid.");

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
    const check = await client.verify.v2
      .services(TWILIO_VERIFY_SID)
      .verificationChecks
      .create({ to, code: String(code).trim() });

    if (check.status !== "approved") {
      return bad("Cod incorect sau expirat.");
    }

    // Emit un token semnat (util dacă folosești create-offer.js care cere otpToken)
    const payload = ch === "email"
      ? { kind: "otp", channel: ch, email: strip(to) }
      : { kind: "otp", channel: ch, phone: to };

    const otpToken = signOtpToken(payload, 30 * 60); // valabil 30 minute

    return json({ ok: true, status: check.status, otpToken, channel: ch });
  } catch (e) {
    return bad(e?.message || "Eroare Twilio", 500);
  }
};