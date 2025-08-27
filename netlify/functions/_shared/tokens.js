// netlify/functions/_shared/tokens.js
import crypto from "crypto";

const SECRET = process.env.OTP_SESSION_SECRET || "";
if (!SECRET) {
  console.warn("WARN: Missing OTP_SESSION_SECRET (required for OTP session tokens)");
}

/* ---------- base64url helpers ---------- */
function toBase64Url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(str = "") {
  // transformăm în base64 clasic + padding
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad) b64 += "=".repeat(4 - pad);
  return Buffer.from(b64, "base64");
}

function b64urlJSON(obj) {
  return toBase64Url(JSON.stringify(obj));
}

function hmacSha256(data, key) {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function timingSafeEq(a, b) {
  try {
    const A = Buffer.isBuffer(a) ? a : Buffer.from(String(a));
    const B = Buffer.isBuffer(b) ? b : Buffer.from(String(b));
    // dacă lungimile diferă, evităm leak de timing setând comparația pe buffers egale ca lungime
    if (A.length !== B.length) {
      // comparație dummy ca să nu scurtcircuităm instant
      const dummyA = crypto.randomBytes(32);
      const dummyB = crypto.randomBytes(32);
      crypto.timingSafeEqual(dummyA, dummyB);
      return false;
    }
    return crypto.timingSafeEqual(A, B);
  } catch {
    return false;
  }
}

/* ---------- Public API ---------- */

/**
 * Creează un "OTP session token" (structură asemănătoare JWT, HS256)
 * payload: obiect mic, ex: { phone:"+407...", kind:"otp" }
 * ttlSec: expirare în secunde (default 15 minute)
 */
export function signOtpToken(payload, ttlSec = 15 * 60) {
  if (!SECRET) {
    throw new Error("OTP_SESSION_SECRET is required to sign tokens");
  }
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: now,
    exp: now + Math.max(1, Number(ttlSec) | 0),
    v: 1,
    jti: toBase64Url(crypto.randomBytes(12)), // nonce scurt
  };

  const header = { alg: "HS256", typ: "OTP" };
  const p = b64urlJSON(header);
  const b = b64urlJSON(body);
  const data = `${p}.${b}`;
  const sig = toBase64Url(hmacSha256(data, SECRET));
  return `${data}.${sig}`;
}

/**
 * Verifică tokenul:
 *  - semnătură HS256
 *  - exp (expirat?)
 * Returnează { ok:boolean, body?, error?, ttl_left? }
 */
export function verifyOtpToken(token) {
  try {
    if (!token || typeof token !== "string") {
      return { ok: false, error: "Missing token" };
    }
    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false, error: "Malformed token" };

    const [p, b, s] = parts;
    const data = `${p}.${b}`;

    // recompute sign
    const expectedSigB64url = toBase64Url(hmacSha256(data, SECRET || ""));
    if (!timingSafeEq(expectedSigB64url, s)) {
      return { ok: false, error: "Invalid signature" };
    }

    // decode & parse
    let header, body;
    try {
      header = JSON.parse(fromBase64Url(p).toString("utf8"));
      body = JSON.parse(fromBase64Url(b).toString("utf8"));
    } catch {
      return { ok: false, error: "Invalid token payload" };
    }

    // validări de bază
    if (header?.alg !== "HS256" || header?.typ !== "OTP") {
      return { ok: false, error: "Invalid header" };
    }
    if (!body || typeof body !== "object") {
      return { ok: false, error: "Invalid body" };
    }

    const now = Math.floor(Date.now() / 1000);
    if (typeof body.exp === "number" && now > body.exp) {
      return { ok: false, error: "Expired token" };
    }

    const ttl_left = typeof body.exp === "number" ? Math.max(0, body.exp - now) : undefined;

    return { ok: true, body, ttl_left };
  } catch {
    return { ok: false, error: "Token error" };
  }
}