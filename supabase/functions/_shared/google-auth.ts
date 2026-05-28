// Google Cloud service-account JWT → OAuth access token exchange.
//
// Reads GOOGLE_APPLICATION_CREDENTIALS_JSON (the full service-account key
// JSON), signs a JWT, and exchanges it for an access token with
// cloud-platform scope. That scope covers every Google Cloud API the
// portal currently uses (Document AI, Speech-to-Text, etc.).
//
// The token cache keeps a single short-lived token in-process so repeated
// calls in the same edge-function invocation don't all re-sign the JWT.
// Tokens are valid for ~1 hour; we refresh 5 minutes before expiry.

interface CachedToken {
  token: string;
  expires_at_ms: number;
}

let cachedToken: CachedToken | null = null;
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export async function getGoogleAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires_at_ms - REFRESH_BUFFER_MS) {
    return cachedToken.token;
  }

  const credentialsJson = Deno.env.get("GOOGLE_APPLICATION_CREDENTIALS_JSON");
  if (!credentialsJson) throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON not configured");

  const credentials = JSON.parse(credentialsJson);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const privateKey = credentials.private_key as string;
  const pemContents = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(unsignedToken),
  );
  const signatureB64 = base64UrlEncode(
    String.fromCharCode(...new Uint8Array(signature)),
  );

  const jwt = `${unsignedToken}.${signatureB64}`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    throw new Error(
      `Google auth failed: ${tokenData.error_description || tokenData.error || "Unknown error"}`,
    );
  }

  const expiresInSec = (tokenData.expires_in as number | undefined) ?? 3600;
  cachedToken = {
    token: tokenData.access_token,
    expires_at_ms: Date.now() + expiresInSec * 1000,
  };
  return tokenData.access_token;
}

function base64UrlEncode(s: string): string {
  return btoa(s)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

// ── Google ID tokens (for invoking Cloud Run with --no-allow-unauthenticated)
//
// Cloud Run with IAM auth requires the caller to send an OpenID Connect ID
// token signed for the target service URL as audience. Service accounts can
// mint such tokens via the JWT-bearer grant flow — same shape as
// getGoogleAccessToken above, except the JWT payload uses `target_audience`
// instead of `scope`, and the token endpoint returns `id_token` instead of
// `access_token`.
//
// Tokens are cached per-audience for ~50 minutes (Google issues them at
// 1 hour TTL; we refresh 10 min before expiry).

interface CachedIdToken {
  token: string;
  expires_at_ms: number;
}

const idTokenCache = new Map<string, CachedIdToken>();

export async function getGoogleIdToken(audience: string): Promise<string> {
  const cached = idTokenCache.get(audience);
  if (cached && Date.now() < cached.expires_at_ms - REFRESH_BUFFER_MS) {
    return cached.token;
  }

  const credentialsJson = Deno.env.get("GOOGLE_APPLICATION_CREDENTIALS_JSON");
  if (!credentialsJson) throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON not configured");

  const credentials = JSON.parse(credentialsJson);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: credentials.client_email,
    target_audience: audience,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const privateKey = credentials.private_key as string;
  const pemContents = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(unsignedToken),
  );
  const signatureB64 = base64UrlEncode(
    String.fromCharCode(...new Uint8Array(signature)),
  );

  const jwt = `${unsignedToken}.${signatureB64}`;
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const data = await resp.json();
  if (!data.id_token) {
    throw new Error(
      `Google ID token failed: ${data.error_description || data.error || "Unknown error"}`,
    );
  }

  // Google ID tokens are JWTs; expiry is in the claims but we just assume
  // a conservative 1-hour TTL (matching the exp we asked for in the JWT-bearer
  // assertion). This keeps us well clear of the actual Google-set expiry.
  idTokenCache.set(audience, {
    token: data.id_token,
    expires_at_ms: Date.now() + 60 * 60 * 1000,
  });
  return data.id_token;
}

// Look up the Google Cloud project ID. Honours an explicit override
// (GOOGLE_STT_PROJECT_ID / GOOGLE_PROJECT_ID) first, then falls back to
// GOOGLE_CLOUD_PROJECT (the OCR pipeline's existing setting), then finally
// derives the project from the service-account credentials JSON.
export function getGoogleProjectId(): string {
  const explicit =
    Deno.env.get("GOOGLE_STT_PROJECT_ID") ??
    Deno.env.get("GOOGLE_PROJECT_ID") ??
    Deno.env.get("GOOGLE_CLOUD_PROJECT");
  if (explicit) return explicit;

  const credentialsJson = Deno.env.get("GOOGLE_APPLICATION_CREDENTIALS_JSON");
  if (credentialsJson) {
    try {
      const c = JSON.parse(credentialsJson);
      if (typeof c.project_id === "string" && c.project_id) return c.project_id;
    } catch {
      // fall through
    }
  }

  throw new Error(
    "Google project ID not configured. Set GOOGLE_STT_PROJECT_ID, GOOGLE_PROJECT_ID, or GOOGLE_CLOUD_PROJECT, or include project_id in GOOGLE_APPLICATION_CREDENTIALS_JSON.",
  );
}
