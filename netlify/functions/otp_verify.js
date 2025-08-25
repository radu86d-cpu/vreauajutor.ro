// netlify/functions/otp_verify.js
import { json, bad, method, rateLimit, bodyJSON, handleOptions } from "./_shared/utils.js";
import twilio from "twilio";

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SID } = process.env;
const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

export default async (req) => {
  const opt = handleOptions(req); if (opt) return opt;

  const m = method(req, ["POST"]);
  if (m === "METHOD_NOT_ALLOWED") return bad("Method Not Allowed", 405);

  if (!rateLimit(req, { windowSec: 60, max: 8 })) {
    return bad("Prea multe încercări. Reîncearcă în 1 minut.", 429);
  }

  const body = await bodyJSON(req);
  const phone = (body.phone || "").trim();
  const code = (body.code || "").trim();

  if (!phone || !code) return bad("Telefon și cod sunt obligatorii.");

  try {
    const resp = await client.verify.v2
      .services(TWILIO_VERIFY_SID)
      .verificationChecks
      .create({ to: phone, code });

    const verified = resp.status === "approved";
    return json({ ok: verified, status: resp.status });
  } catch (e) {
    return bad(e?.message || "Eroare Twilio", 500);
  }
};
