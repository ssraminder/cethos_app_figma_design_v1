// Adobe PDF Services "Create PDF from Office" — DOCX bytes in, PDF bytes out.
// Mirrors the pattern in pdf-to-word-convert (PDF → DOCX direction). Same
// IMS auth + asset upload + job polling shape, just /operation/createpdf
// instead of /operation/exportpdf.
//
// Requires ADOBE_CLIENT_ID + ADOBE_CLIENT_SECRET edge-function secrets.

const ADOBE_IMS_URL = "https://ims-na1.adobelogin.com/ims/token/v3";
const ADOBE_PDF_BASE = "https://pdf-services.adobe.io";
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function convertWordToPdf(input: Uint8Array): Promise<Uint8Array> {
  const clientId = Deno.env.get("ADOBE_CLIENT_ID");
  const clientSecret = Deno.env.get("ADOBE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("ADOBE_CLIENT_ID / ADOBE_CLIENT_SECRET not configured");
  }

  const accessToken = await getAdobeAccessToken(clientId, clientSecret);
  const { uploadUri, assetID } = await createAdobeAsset(accessToken, clientId, DOCX_MIME);

  // Upload DOCX bytes to Adobe's presigned URL.
  const up = await fetch(uploadUri, {
    method: "PUT",
    headers: { "Content-Type": DOCX_MIME },
    body: input,
  });
  if (!up.ok) {
    throw new Error(`Adobe asset upload failed: ${up.status} ${await up.text().catch(() => "")}`);
  }

  // Kick off Office → PDF.
  const jobUrl = await startCreatePdfJob(accessToken, clientId, assetID);

  // Poll until done.
  const { downloadUri } = await pollAdobeJob(accessToken, clientId, jobUrl);

  // Download the PDF bytes.
  const pdfResp = await fetch(downloadUri);
  if (!pdfResp.ok) {
    throw new Error(`Adobe PDF download failed: ${pdfResp.status}`);
  }
  return new Uint8Array(await pdfResp.arrayBuffer());
}

async function getAdobeAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const form = new URLSearchParams();
  form.set("client_id", clientId);
  form.set("client_secret", clientSecret);
  form.set("grant_type", "client_credentials");
  form.set("scope", "openid,AdobeID,DCAPI");
  const resp = await fetch(ADOBE_IMS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!resp.ok) {
    throw new Error(`Adobe IMS token failed: ${resp.status} ${await resp.text().catch(() => "")}`);
  }
  const data = await resp.json();
  if (!data.access_token) throw new Error("Adobe IMS missing access_token");
  return data.access_token as string;
}

async function createAdobeAsset(
  accessToken: string,
  clientId: string,
  mediaType: string,
): Promise<{ uploadUri: string; assetID: string }> {
  const resp = await fetch(`${ADOBE_PDF_BASE}/assets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-API-Key": clientId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mediaType }),
  });
  if (!resp.ok) {
    throw new Error(`Adobe asset create failed: ${resp.status} ${await resp.text().catch(() => "")}`);
  }
  const data = await resp.json();
  if (!data.uploadUri || !data.assetID) throw new Error("Adobe asset response missing uploadUri/assetID");
  return { uploadUri: data.uploadUri, assetID: data.assetID };
}

async function startCreatePdfJob(accessToken: string, clientId: string, assetID: string): Promise<string> {
  const resp = await fetch(`${ADOBE_PDF_BASE}/operation/createpdf`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-API-Key": clientId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ assetID }),
  });
  if (resp.status !== 201) {
    throw new Error(`Adobe createpdf start failed: ${resp.status} ${await resp.text().catch(() => "")}`);
  }
  const location = resp.headers.get("location");
  if (!location) throw new Error("Adobe createpdf missing Location header");
  return location;
}

async function pollAdobeJob(
  accessToken: string,
  clientId: string,
  jobUrl: string,
): Promise<{ downloadUri: string }> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const resp = await fetch(jobUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, "X-API-Key": clientId },
    });
    if (!resp.ok) {
      throw new Error(`Adobe job poll failed: ${resp.status} ${await resp.text().catch(() => "")}`);
    }
    const data = await resp.json();
    const status = (data.status || "").toLowerCase();
    if (status === "done") {
      const downloadUri = data?.asset?.downloadUri;
      if (!downloadUri) throw new Error("Adobe job done but downloadUri missing");
      return { downloadUri };
    }
    if (status === "failed") {
      const errMsg = data?.error?.message || JSON.stringify(data?.error || {});
      throw new Error(`Adobe job failed: ${errMsg}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("Adobe job timed out after 5 minutes");
}
