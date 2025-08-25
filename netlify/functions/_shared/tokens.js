// netlify/functions/_shared/tokens.js
import crypto from "crypto";

const SECRET = process.env.OTP_SESSION_SECRET || "";
if (!SECRET) {
  console.warn("WARN: Missing OTP_SESSION_SECRET (required for OTP session tokens)");
}

function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function b64urlJSON(obj) { return b64url(JSON.stringify(obj)); }

export function signOtpToken(payload, ttlSec = 15 * 60) {
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,            // e.g., { phone:"+407...", kind:"otp" }
    iat: now,
    exp: now + ttlSec,
    v: 1
  };
  const p = b64urlJSON({ alg: "HS256", typ: "OTP" });
  const b = b64urlJSON(body);
  const data = `${p}.${b}`;
  const sig = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyOtpToken(token) {
  try {
    const [p, b, s] = token.split(".");
    if (!p || !b || !s) return { ok: false, error: "Malformed token" };
    const data = `${p}.${b}`;
    const expSig = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
    if (expSig !== s) return { ok: false, error: "Invalid signature" };
    const body = JSON.parse(Buffer.from(b, "base64").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (body.exp && now > body.exp) return { ok: false, error: "Expired token" };
    return { ok: true, body };
  } catch (e) {
    return { ok: false, error: "Token error" };
  }
}
