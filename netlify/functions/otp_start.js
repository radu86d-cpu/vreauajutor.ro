import { json, bad, method, rateLimit, bodyJSON, handleOptions } from "./_shared/utils.js";
import twilio from "twilio";

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SID } = process.env;
if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SID) {
  console.warn("WARN: Twilio env vars missing (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_VERIFY_SID)");
}

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

export default async (req) => {
  const opt = handleOptions(req); if (opt) return opt;

  const m = method(req, ["POST"]);
  if (m === "METHOD_NOT_ALLOWED") return bad("Method Not Allowed", 405);

  if (!rateLimit(req, { windowSec: 60, max: 5 })) {
    return bad("Prea multe încercări. Reîncearcă în 1 minut.", 429);
  }

  const body = await bodyJSON(req);
  const phone = (body.phone || "").trim();
  const channel = (body.channel || "sms").toLowerCase(); // sms / call

  if (!phone) return bad("Lipsește numărul de telefon.");

  try {
    const resp = await client.verify.v2
      .services(TWILIO_VERIFY_SID)
      .verifications
      .create({ to: phone, channel });

    return json({ ok: true, status: resp.status }); // "pending"
  } catch (e) {
    return bad(e?.message || "Eroare Twilio", 500);
  }
};