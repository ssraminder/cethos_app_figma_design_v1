// Shared crypto helpers for edge functions.
// Extracted from the pattern originally in send-customer-login-otp/index.ts.

const HEX_CHARS = "0123456789abcdef";

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    out += HEX_CHARS[b >> 4] + HEX_CHARS[b & 0xf];
  }
  return out;
}

/** 32-byte cryptographic random token, hex encoded (64 chars). */
export function generateToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return bytesToHex(buf);
}

/** SHA-256 of a UTF-8 string, hex encoded. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Generate a human-enterable pairing code. 6 characters, uppercase alphanum,
 * with ambiguous chars (0/O, 1/I/L) removed.
 */
export function generatePairingCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  let out = "";
  for (const b of buf) out += alphabet[b % alphabet.length];
  return out;
}

/** HMAC-SHA256 using the shared service secret, hex output. */
export async function hmacSha256Hex(
  secret: string,
  message: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return bytesToHex(new Uint8Array(sig));
}

/** Constant-time string compare for hex digests. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ─── Short-lived kiosk staff token (signed with service role key) ───────────
//
// Payload: { staff_id, device_id, exp (unix seconds) }
// Encoded as base64url(JSON) + "." + hex(hmac(payload, secret)).

const TOKEN_TTL_SECONDS = 30 * 60; // 30 minutes

function b64urlEncode(input: string): string {
  return btoa(input).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function b64urlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? 0 : 4 - (input.length % 4);
  const padded = input.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat(pad);
  return atob(padded);
}

export interface KioskStaffTokenPayload {
  staff_id: string;
  device_id: string;
  exp: number;
}

export async function issueKioskStaffToken(
  secret: string,
  staffId: string,
  deviceId: string,
  ttlSeconds = TOKEN_TTL_SECONDS,
): Promise<string> {
  const payload: KioskStaffTokenPayload = {
    staff_id: staffId,
    device_id: deviceId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payloadB64 = b64urlEncode(JSON.stringify(payload));
  const sig = await hmacSha256Hex(secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

export async function verifyKioskStaffToken(
  secret: string,
  token: string,
): Promise<KioskStaffTokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expected = await hmacSha256Hex(secret, payloadB64);
  if (!safeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(payloadB64)) as KioskStaffTokenPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.staff_id || !payload.device_id) return null;
    return payload;
  } catch {
    return null;
  }
}
