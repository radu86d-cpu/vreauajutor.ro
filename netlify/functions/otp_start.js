import { cors, json, bad, method, rateLimit } from "./_shared/utils.js";
import twilio from "twilio";

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const VERIFY_SID = process.env.TWILIO_VERIFY_SID;

export default async (req) => {
  const m = method(req, ["POST"]);
  const headers = cors(req);
  if (m === "OPTIONS") return new Response(null, { status: 204, headers });

  // mic rate‑limit (protejează endpointul de spam)
  if (!rateLimit(req, { windowSec: 60, max: 5 })) return bad("Prea multe încercări. Reîncearcă în 1 minut.", 429);

  let body = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const phone = (body.phone || "").trim();

  // validare minimă pentru număr internațional
  if (!/^\+?[1-9]\d{6,15}$/.test(phone)) return bad("Număr de telefon invalid.");

  try {
    await client.verify.v2.services(VERIFY_SID).verifications.create({ to: phone, channel: "sms" });
    return json({ ok: true }, { headers });
  } catch (e) {
    console.error("otp_start", e?.message || e);
    return bad("Nu am putut trimite codul acum. Încearcă mai târziu.", 500);
  }
};
