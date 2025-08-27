// netlify/functions/_shared/tokens.js
import crypto from "crypto";

const SECRET = process.env.OTP_SESSION_SECRET || "";
if (!SECRET) {
  console.warn("WARN: Missing OTP_SESSION_SECRET (required for OTP session tokens)");
}

/**
 * b64url: codifică un string/binare în Base64 URL-safe (fără =,+,/)
 */
function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * b64urlJSON: stringify → base64url
 */
function b64urlJSON(obj) {
  return b64url(JSON.stringify(obj));
}

/**
 * Generează un token OTP semnat HMAC-SHA256.
 *
 * @param {Object} payload - Date utile (ex: { phone:"+407...", kind:"otp" })
 * @param {number} ttlSec  - Valabilitate în secunde (default: 15 min)
 * @returns {string} token (structură p.b.s — header.body.signature)
 */
export function signOtpToken(payload, ttlSec = 15 * 60) {
  if (!SECRET) throw new Error("OTP_SESSION_SECRET not set");

  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: now,
    exp: now + ttlSec,
    v: 1,
  };

  const header = b64urlJSON({ alg: "HS256", typ: "OTP" });
  const bodyStr = b64urlJSON(body);
  const data = `${header}.${bodyStr}`;

  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(data)
    .digest("base64url");

  return `${data}.${sig}`;
}

/**
 * Verifică un token OTP semnat.
 *
 * @param {string} token
 * @returns {object} { ok:boolean, body?, error? }
 */
export function verifyOtpToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false, error: "Malformed token" };

    const [headerB64, bodyB64, sig] = parts;
    const data = `${headerB64}.${bodyB64}`;

    const expected = crypto
      .createHmac("sha256", SECRET)
      .update(data)
      .digest("base64url");

    if (expected !== sig) return { ok: false, error: "Invalid signature" };

    const body = JSON.parse(Buffer.from(bodyB64, "base64").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);

    if (body.exp && now > body.exp) return { ok: false, error: "Expired token" };

    return { ok: true, body };
  } catch (e) {
    return { ok: false, error: "Token error: " + e.message };
  }
}