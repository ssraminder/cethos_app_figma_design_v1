// Google Cloud Storage helpers — used by transcription-process to stage audio
// for Google STT v2 batchRecognize (which only accepts gs:// URIs as input).
//
// All operations authenticate via the service-account access token from
// _shared/google-auth.ts. The service account needs Storage Admin or
// Storage Object Admin on the bucket (auto-granted when it creates the
// bucket itself, since the service account becomes owner).

import { getGoogleAccessToken, getGoogleProjectId } from "./google-auth.ts";

// Derive a project-scoped, deterministic bucket name. GCS bucket names must be
// 3-63 chars, lowercase, no spaces. The project ID is already lowercase and
// safe; we suffix with "-stt-input" to make the bucket purpose obvious.
export function getSttInputBucketName(): string {
  const projectId = getGoogleProjectId();
  return `${projectId.replace(/[^a-z0-9-]/g, "-").slice(0, 50)}-stt-input`;
}

// Ensure the STT input bucket exists. Idempotent: GET to check, POST to create
// if 404. Applies a 1-day lifecycle so audio files auto-delete after a day even
// if the poll-and-cleanup misses one. Returns the bucket name.
export async function ensureSttInputBucket(): Promise<string> {
  const bucketName = getSttInputBucketName();
  const accessToken = await getGoogleAccessToken();

  // Check first — if it exists, we're done.
  const checkResp = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (checkResp.status === 200) return bucketName;
  if (checkResp.status !== 404) {
    const errText = await checkResp.text();
    throw new Error(`GCS bucket check failed: ${checkResp.status} — ${errText.slice(0, 300)}`);
  }

  // Create the bucket with a sensible default region + 1-day lifecycle.
  const projectId = getGoogleProjectId();
  const createBody = {
    name: bucketName,
    location: "US",                       // multi-region; cheap egress, low latency for STT
    storageClass: "STANDARD",
    lifecycle: {
      rule: [{
        action: { type: "Delete" },
        condition: { age: 1 },             // delete objects 1 day after creation
      }],
    },
    iamConfiguration: {
      uniformBucketLevelAccess: { enabled: true },
      publicAccessPrevention: "enforced",
    },
  };

  const createResp = await fetch(
    `https://storage.googleapis.com/storage/v1/b?project=${encodeURIComponent(projectId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createBody),
    },
  );

  if (createResp.status === 409) {
    // Someone else created it between our check and POST — that's fine.
    return bucketName;
  }
  if (!createResp.ok) {
    const errText = await createResp.text();
    // Common first-run cause: Cloud Storage API not enabled.
    if (createResp.status === 403 && /storage\.googleapis\.com|SERVICE_DISABLED/i.test(errText)) {
      throw new Error(
        `GCS bucket creation failed: Cloud Storage API is not enabled on project ${projectId}. Enable it at https://console.cloud.google.com/apis/library/storage.googleapis.com — original error: ${errText.slice(0, 300)}`,
      );
    }
    throw new Error(`GCS bucket creation failed: ${createResp.status} — ${errText.slice(0, 300)}`);
  }

  return bucketName;
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
 * Ensure the bucket allows CORS preflight + actual cross-origin PUT/GET
 * from the cethos web origins. Called from edge functions so the user
 * doesn't have to run a separate gsutil command.
 *
 * Idempotent: GCS PATCH on the bucket overwrites the cors config wholesale;
 * we pass our canonical config every time.
 */
export async function ensureSttBucketCors(): Promise<void> {
  const bucketName = getSttInputBucketName();
  const accessToken = await getGoogleAccessToken();

  // Canonical CORS: origins are the cethos surfaces that initiate browser
  // uploads. methods include PUT (signed-URL upload) + GET (signed-URL
  // download if the browser ever needs it). responseHeaders cover the ones
  // GCS returns that the browser needs to read.
  const corsConfig = [
    {
      origin: [
        "https://portal.cethos.com",
        "https://cethos.com",
        "https://www.cethos.com",
        "http://localhost:5173",
        "http://localhost:3000",
      ],
      method: ["PUT", "GET", "HEAD", "OPTIONS"],
      responseHeader: [
        "Content-Type",
        "Content-Length",
        "Content-Range",
        "ETag",
        "X-Goog-*",
        "Access-Control-Allow-Origin",
      ],
      maxAgeSeconds: 3600,
    },
  ];

  const resp = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}?fields=cors`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cors: corsConfig }),
    },
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`GCS bucket CORS patch failed: ${resp.status} — ${errText.slice(0, 300)}`);
  }
}
