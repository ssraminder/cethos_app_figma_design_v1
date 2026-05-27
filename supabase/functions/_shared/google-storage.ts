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
