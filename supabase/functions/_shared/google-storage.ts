// Google Cloud Storage helpers — used by transcription-process to stage audio
// for Google STT v2 batchRecognize (which only accepts gs:// URIs as input).
//
// All operations authenticate via the service-account access token from
// _shared/google-auth.ts. The service account needs roles/storage.objectAdmin
// (NOT bucket-admin) on the bucket. Bucket creation + CORS + lifecycle are
// one-time setup performed via scripts/setup-gcs.sh by an operator with
// project-level permissions — this keeps the edge-function service account
// scoped narrowly to object-level read/write.

import { getGoogleAccessToken, getGoogleProjectId } from "./google-auth.ts";

// Resolve the STT input bucket name.
//
// Priority order:
//   1. CETHOS_STT_BUCKET secret (override for non-default deployments)
//   2. Derived from project ID: `${projectId}-stt-input`
//
// The bucket itself must already exist — see scripts/setup-gcs.sh for the
// one-time creation recipe. If the bucket is missing, the first signed-URL
// or upload call will fail with a clear "bucket not found" error that points
// at the setup script.
export function getSttInputBucketName(): string {
  const override = Deno.env.get("CETHOS_STT_BUCKET");
  if (override && override.trim()) return override.trim();
  const projectId = getGoogleProjectId();
  return `${projectId.replace(/[^a-z0-9-]/g, "-").slice(0, 50)}-stt-input`;
}

// Returns the bucket name. Kept as an async function for source-compatibility
// with callers that awaited the previous create-if-missing implementation.
// No remote calls; no permissions required.
//
// If you need to verify the bucket exists at runtime, call assertSttBucketExists()
// — that's a separate, optional check used by the edge function on first call.
export function ensureSttInputBucket(): Promise<string> {
  return Promise.resolve(getSttInputBucketName());
}

// Probes the bucket once and throws a clear setup-pointing error if it's missing.
// Cached in-memory so we don't HEAD on every request.
const bucketExistsCache = new Map<string, boolean>();
export async function assertSttBucketExists(bucketName?: string): Promise<void> {
  const name = bucketName ?? getSttInputBucketName();
  if (bucketExistsCache.get(name)) return;

  const accessToken = await getGoogleAccessToken();
  const checkResp = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(name)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (checkResp.status === 200) {
    bucketExistsCache.set(name, true);
    return;
  }

  if (checkResp.status === 404) {
    throw new Error(
      `STT input bucket "${name}" does not exist. Run scripts/setup-gcs.sh on a machine with project-level gcloud access to create it. (Setup is a one-time operation; the edge-function service account only needs object-level permissions.)`,
    );
  }

  if (checkResp.status === 403) {
    throw new Error(
      `STT input bucket "${name}" exists but the edge-function service account can't read it. Grant roles/storage.objectAdmin on the bucket — see scripts/setup-gcs.sh.`,
    );
  }

  const errText = await checkResp.text();
  throw new Error(`STT input bucket check failed: ${checkResp.status} — ${errText.slice(0, 200)}`);
}

// Upload an audio blob to GCS. Returns the gs:// URI.
export async function uploadAudioToGcs(
  bucketName: string,
  objectName: string,
  blob: Blob,
  contentType: string,
): Promise<string> {
  const accessToken = await getGoogleAccessToken();
  const arrayBuffer = await blob.arrayBuffer();

  // Media upload (simple upload) via JSON API. For files > 5 MB we should
  // technically use resumable uploads, but a single PUT works up to 5 GB
  // — well within our STT input size range.
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucketName)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": contentType,
      "Content-Length": String(arrayBuffer.byteLength),
    },
    body: arrayBuffer,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`GCS upload failed: ${resp.status} — ${errText.slice(0, 300)}`);
  }

  return `gs://${bucketName}/${objectName}`;
}

// Best-effort delete an object from GCS. Never throws — failed cleanup
// is non-fatal because the bucket has a 1-day lifecycle as backstop.
export async function deleteFromGcs(gcsUri: string): Promise<void> {
  try {
    const match = gcsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
    if (!match) return;
    const [, bucket, objectName] = match;
    const accessToken = await getGoogleAccessToken();
    await fetch(
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  } catch (e) {
    console.warn("GCS cleanup delete failed (non-fatal):", e);
  }
}

// ── V4 signed URLs ──────────────────────────────────────────────────────────
//
// GCS V4 signed URLs are what we use to (a) let the browser PUT a file
// directly to GCS without going through Supabase, and (b) generate short-lived
// download URLs for the Cloud Run extractor and Google STT v2 batchRecognize.
//
// V4 signing requires RS256-signing a canonical request with the service
// account's private key. We do this inline here so we don't need the Google
// Cloud SDK (would be ~10 MB extra in the edge function bundle).
//
// Spec: https://cloud.google.com/storage/docs/access-control/signing-urls-manually

interface ServiceAccountCreds {
  client_email: string;
  private_key: string;
}

function loadServiceAccountCreds(): ServiceAccountCreds {
  const credentialsJson = Deno.env.get("GOOGLE_APPLICATION_CREDENTIALS_JSON");
  if (!credentialsJson) throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON not configured");
  const creds = JSON.parse(credentialsJson);
  if (!creds.client_email || !creds.private_key) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON missing client_email or private_key");
  }
  return { client_email: creds.client_email, private_key: creds.private_key };
}

async function importRsaPrivateKey(pemContents: string): Promise<CryptoKey> {
  const pem = pemContents
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binaryKey = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function rsaSignToHex(message: string, key: CryptoKey): Promise<string> {
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

// Format a Date as YYYYMMDD'T'HHMMSS'Z' (V4 spec)
function formatIsoBasic(d: Date): string {
  return (
    `${d.getUTCFullYear()}` +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    "T" +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) +
    "Z"
  );
}

// RFC 3986 unreserved-char URI encoding — GCS expects path/query encoded this way.
// JS encodeURIComponent already does this except for !'()*; we patch those too.
function uriEncode(s: string, encodeSlash = true): string {
  let out = encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
  if (!encodeSlash) out = out.replace(/%2F/g, "/");
  return out;
}

export interface SignedUrlOptions {
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  contentType?: string;          // required for PUT
  expirySeconds?: number;        // default 1 hour, max 7 days (604800)
  // Optional custom headers the request will include. Each becomes part of the
  // signed canonical headers — the caller MUST send the same headers verbatim
  // when invoking the signed URL.
  extraSignedHeaders?: Record<string, string>;
}

/**
 * Generate a V4 signed URL for a GCS object.
 *
 * For PUT (upload): the browser/extractor sends a single PUT to this URL with
 * the file body. Object lands at gs://{bucket}/{objectName}. No GCS auth needed
 * by the client.
 *
 * For GET (download): any HTTP fetcher can pull the object via this URL —
 * used to feed Cloud Run extractor or pass to Google STT batchRecognize.
 */
export async function generateSignedUrl(
  bucketName: string,
  objectName: string,
  opts: SignedUrlOptions,
): Promise<string> {
  const creds = loadServiceAccountCreds();
  const expiry = opts.expirySeconds ?? 3600;
  if (expiry < 1 || expiry > 7 * 24 * 60 * 60) {
    throw new Error("expirySeconds must be between 1 and 604800");
  }

  const now = new Date();
  const datestamp = formatIsoBasic(now).slice(0, 8);
  const requestTimestamp = formatIsoBasic(now);
  const credentialScope = `${datestamp}/auto/storage/goog4_request`;
  const credential = `${creds.client_email}/${credentialScope}`;

  // Canonical headers always include host. Additional signed headers come from
  // extraSignedHeaders. For PUT we also sign content-type (else GCS validates
  // it against the request later).
  const headers: Record<string, string> = {
    host: "storage.googleapis.com",
    ...(opts.extraSignedHeaders ?? {}),
  };
  if (opts.method === "PUT" && opts.contentType) {
    headers["content-type"] = opts.contentType;
  }
  const sortedHeaderKeys = Object.keys(headers).map((k) => k.toLowerCase()).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k}:${headers[k] ?? headers[Object.keys(headers).find((h) => h.toLowerCase() === k)!]}\n`)
    .join("");
  const signedHeaders = sortedHeaderKeys.join(";");

  // Query string carries the auth params + any required SignedHeaders
  const queryParams: [string, string][] = [
    ["X-Goog-Algorithm", "GOOG4-RSA-SHA256"],
    ["X-Goog-Credential", credential],
    ["X-Goog-Date", requestTimestamp],
    ["X-Goog-Expires", String(expiry)],
    ["X-Goog-SignedHeaders", signedHeaders],
  ];
  const canonicalQueryString = queryParams
    .map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`)
    .sort()
    .join("&");

  const canonicalUri = `/${uriEncode(bucketName, false)}/${uriEncode(objectName, false)}`;
  const payloadHash = "UNSIGNED-PAYLOAD";

  const canonicalRequest = [
    opts.method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "GOOG4-RSA-SHA256",
    requestTimestamp,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const key = await importRsaPrivateKey(creds.private_key);
  const signature = await rsaSignToHex(stringToSign, key);

  return `https://storage.googleapis.com${canonicalUri}?${canonicalQueryString}&X-Goog-Signature=${signature}`;
}

/**
 * @deprecated CORS is one-time bucket setup performed via scripts/setup-gcs.sh.
 * Edge functions assume CORS is already in place. Leaving this as a no-op
 * stub so existing imports don't break — call sites should be removed.
 */
export function ensureSttBucketCors(): Promise<void> {
  return Promise.resolve();
}
