// Shared helpers for transcription-* edge functions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export function preflight(): Response {
  return new Response("ok", { headers: CORS_HEADERS });
}

export function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// ── OTP helpers ──────────────────────────────────────────────────────────────

export function generateOtp(): string {
  const buf = new Uint8Array(3);
  crypto.getRandomValues(buf);
  const num = ((buf[0] << 16) | (buf[1] << 8) | buf[2]) % 1000000;
  return num.toString().padStart(6, "0");
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const arr = new Uint8Array(digest);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Session token (HMAC-signed, 24h TTL) ─────────────────────────────────────

interface SessionPayload {
  email: string;
  exp: number;
}

function b64urlEncode(input: string): string {
  return btoa(input).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function b64urlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? 0 : 4 - (input.length % 4);
  const padded = input.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat(pad);
  return atob(padded);
}

async function hmacSign(secret: string, message: string): Promise<string> {
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
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

const SESSION_TTL = 24 * 60 * 60; // 24 hours

export async function issueSessionToken(email: string): Promise<string> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const payload: SessionPayload = {
    email: email.toLowerCase().trim(),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL,
  };
  const payloadB64 = b64urlEncode(JSON.stringify(payload));
  const sig = await hmacSign(secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

export async function verifySessionToken(
  token: string,
): Promise<{ email: string } | null> {
  if (!token || !token.includes(".")) return null;
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const [payloadB64, sig] = token.split(".");
  const expected = await hmacSign(secret, payloadB64);
  if (!safeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(payloadB64)) as SessionPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.email) return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}

// ── Settings loader ──────────────────────────────────────────────────────────

export async function getTranscriptionSettings(
  admin: ReturnType<typeof createClient>,
): Promise<Record<string, string>> {
  const { data } = await admin
    .from("app_settings")
    .select("setting_key, setting_value")
    .like("setting_key", "transcription_%");
  const settings: Record<string, string> = {};
  for (const row of data ?? []) {
    settings[row.setting_key] = row.setting_value;
  }
  return settings;
}

// ── Audit logging ────────────────────────────────────────────────────────────

export async function auditLog(
  admin: ReturnType<typeof createClient>,
  jobId: string | null,
  action: string,
  actorType: "customer" | "staff" | "system" | "vendor",
  actorId: string | null,
  details?: Record<string, unknown>,
) {
  await admin.from("transcription_audit_log").insert({
    job_id: jobId,
    action,
    actor_type: actorType,
    actor_id: actorId,
    details: details ?? null,
  });
}

// ── Provider language support check ──────────────────────────────────────────

const ASSEMBLYAI_LANGUAGES = new Set([
  "en", "es", "fr", "de", "it", "pt", "nl", "hi", "ja", "zh", "ko",
  "ru", "tr", "pl", "uk", "vi", "ar", "he", "cs", "da", "fi", "el",
  "hu", "id", "ms", "no", "ro", "sv", "th", "bg", "ca", "hr", "lt",
  "lv", "mk", "sk", "sl", "sr", "ta", "te", "tl", "et", "gl", "ka",
  "kk", "az", "bs", "eu", "cy",
]);

export function isAssemblyAiSupported(langCode: string): boolean {
  return ASSEMBLYAI_LANGUAGES.has(langCode.toLowerCase().split("-")[0]);
}

// ── Brevo email sender ───────────────────────────────────────────────────────

export async function sendBrevoEmail(
  to: string,
  subject: string,
  htmlContent: string,
): Promise<boolean> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) {
    console.error("BREVO_API_KEY not configured");
    return false;
  }
  try {
    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "Cethos Translation Services", email: "donotreply@cethos.com" },
        replyTo: { email: "support@cethos.com", name: "Cethos Support" },
        to: [{ email: to }],
        subject,
        htmlContent,
        tags: ["transcription"],
      }),
    });
    return resp.ok;
  } catch (e) {
    console.error("Brevo send failed:", e);
    return false;
  }
}
