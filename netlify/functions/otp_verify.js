// netlify/functions/otp_verify.js
import { json, bad, method, rateLimit, bodyJSON, handleOptions } from "./_shared/utils.js";
import twilio from "twilio";

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SID } = process.env;
if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SID) {
  console.warn("WARN: Twilio env vars missing (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_VERIFY_SID)");
}

const client = (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

export default async (req) => {
  const opt = handleOptions(req); if (opt) return opt;
  const m = method(req, ["POST"]); if (m === "METHOD_NOT_ALLOWED") return bad("Method Not Allowed", 405);
  if (!rateLimit(req, { windowSec: 60, max: 10 })) return bad("Prea multe încercări", 429);
  if (!client || !TWILIO_VERIFY_SID) return bad("Twilio Verify nu este configurat pe server.", 500);

  const { channel = "sms", to, code } = await bodyJSON(req);
  if (!to || !code) return bad("Lipsește 'to' sau 'code'.");

  try {
    const resp = await client.verify.v2
      .services(TWILIO_VERIFY_SID)
      .verificationChecks
      .create({ to, code });

    // status: 'approved' => OK
    const ok = resp.status === "approved";
    if (!ok) return bad("Cod invalid sau expirat.", 401);

    return json({ ok: true, status: resp.status });
  } catch (e) {
    return bad(e?.message || "Eroare Twilio", 500);
  }
};