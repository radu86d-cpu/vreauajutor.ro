import { cors, json, bad, method } from "./_shared/utils.js";
import twilio from "twilio";

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const VERIFY_SID = process.env.TWILIO_VERIFY_SID;

// opțional DOAR pentru test: dacă îl setezi, codul egal cu această valoare va trece direct.
// În producție lasă-l necompletat în Netlify (sau șters).
const TEST_MASTER_OTP = process.env.TEST_MASTER_OTP || "";

export default async (req) => {
  const m = method(req, ["POST"]);
  const headers = cors(req);
  if (m === "OPTIONS") return new Response(null, { status: 204, headers });

  let body = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const phone = (body.phone || "").trim();
  const code  = (body.code  || "").trim();

  if (!phone || !code) return bad("Lipsește telefonul sau codul.");
  if (!/^\+?[1-9]\d{6,15}$/.test(phone)) return bad("Număr de telefon invalid.");
  if (!/^\d{3,10}$/.test(code) && code !== TEST_MASTER_OTP) return bad("Cod OTP invalid.");

  // master OTP numai pentru dezvoltare
  if (TEST_MASTER_OTP && code === TEST_MASTER_OTP) {
    return json({ ok: true, bypass: true }, { headers });
  }

  try {
    const res = await client.verify.v2.services(VERIFY_SID).verificationChecks.create({ to: phone, code });
    if (res.status === "approved") return json({ ok: true }, { headers });
    return bad("Cod invalid sau expirat.", 400);
  } catch (e) {
    console.error("otp_verify", e?.message || e);
    return bad("Eroare la verificare. Încearcă din nou.", 500);
  }
};
