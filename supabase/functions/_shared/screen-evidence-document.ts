// ============================================================================
// screen-evidence-document
//
// When a vendor uploads an ISO 17100 evidence file, run a Claude vision/OCR
// pass to (a) classify the document, (b) extract key facts, (c) check the
// holder name matches the vendor and that it matches what was requested, then
// file it as Tier-1 SCREENED qms.competence_evidence (verified=false,
// method='ai_document_screen'). A human clicks Verify on the QMS tab to
// finalize — which auto-promotes the qualification. Mismatches are flagged in
// the verification notes for the reviewer.
//
// Fire-and-forget: never blocks or fails the upload.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { unzipSync } from "https://esm.sh/fflate@0.8.2";

type SB = ReturnType<typeof createClient>;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// A .docx is a ZIP whose body text lives in word/document.xml. Claude can't
// ingest .docx natively, so we extract plain text here and classify that (the
// text is digital — no OCR needed). Returns "" on any failure (caller skips).
function extractDocxText(bytes: Uint8Array): string {
  try {
    const files = unzipSync(bytes);
    const xmlBytes = files["word/document.xml"];
    if (!xmlBytes) return "";
    let xml = new TextDecoder().decode(xmlBytes);
    xml = xml.replace(/<\/w:p>/g, "\n").replace(/<w:tab\/?>/g, "\t");
    let text = xml.replace(/<[^>]+>/g, "");
    text = text
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    return text.replace(/\n{3,}/g, "\n\n").trim();
  } catch (e) {
    console.error("screen-evidence: docx text extraction failed", e);
    return "";
  }
}

// AI doc_type → qms.evidence_types.code. "unknown" → skip (logged only).
const TYPE_MAP: Record<string, string> = {
  translation_degree: "degree_translation",
  other_degree: "degree_other",
  translation_certification: "domain_specific_certification",
  language_proficiency: "language_proficiency_test",
  experience_evidence: "documented_translation_experience",
};

const IMAGE_MIMES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function screenEvidenceDocument(args: {
  supabase: SB;
  vendorId: string;
  vendorName: string;
  claimedLabel: string; // what the vendor said it is (cert_name / item label)
  bytes: Uint8Array;
  fileName: string;
  fileMime: string;
  storagePath: string | null;
}): Promise<void> {
  const { supabase, vendorId, vendorName, claimedLabel, bytes, fileName, fileMime, storagePath } = args;
  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) { console.error("screen-evidence: ANTHROPIC_API_KEY missing"); return; }

    const mime = (fileMime || "").toLowerCase();
    const lowerName = (fileName || "").toLowerCase();
    const isPdf = mime === "application/pdf";
    const isImage = IMAGE_MIMES.includes(mime);
    const isDocx = mime === DOCX_MIME || lowerName.endsWith(".docx");
    if (!isPdf && !isImage && !isDocx) {
      console.log(`screen-evidence: unsupported mime ${mime} — recording as other_document for ${fileName}`);
      const sha256 = await sha256Hex(bytes);
      await supabase.rpc("qms_add_evidence_wrapper", {
        p_vendor_id: vendorId, p_role_qualification_id: null,
        p_evidence_type_code: "other_document",
        p_title: (claimedLabel || fileName).slice(0, 200),
        p_org: null, p_country: null, p_issued_date: null, p_expiry_date: null,
        p_storage_path: storagePath, p_file_name: fileName, p_file_mime: fileMime,
        p_file_size: bytes.length, p_sha256: sha256, p_verified: false,
        p_verification_method: "ai_document_screen",
        p_verification_notes: `Unsupported file type (${mime}) — cannot AI-screen. Manual review needed.`,
        p_acting_user_id: null,
      });
      return;
    }

    // For PDFs/images we send a vision/document block; for .docx we extract the
    // text and send it as plain text (Claude can't read .docx natively).
    let docBlock: Record<string, unknown> | null = null;
    let docText = "";
    if (isDocx) {
      docText = extractDocxText(bytes);
      if (!docText) {
        console.log(`screen-evidence: empty/unreadable docx text — skipping AI screen for ${fileName}`);
        return;
      }
    } else {
      const b64 = bytesToBase64(bytes);
      docBlock = isPdf
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
        : { type: "image", source: { type: "base64", media_type: mime === "image/jpg" ? "image/jpeg" : mime, data: b64 } };
    }

    const prompt =
      `You are screening a document a translation vendor uploaded as ISO 17100 qualification evidence. ` +
      `The vendor is "${vendorName}". They labelled this upload as: "${claimedLabel}".\n\n` +
      `Classify and extract. Return ONLY valid JSON, no prose:\n` +
      `{\n` +
      `  "doc_type": "translation_degree" | "other_degree" | "translation_certification" | "language_proficiency" | "experience_evidence" | "unknown",\n` +
      `  "title": "the qualification/certificate name, or a short description",\n` +
      `  "institution": "issuing institution/body or null",\n` +
      `  "issued_date": "YYYY-MM-DD or null",\n` +
      `  "holder_name": "the name on the document or null",\n` +
      `  "name_matches_vendor": true | false | null,\n` +
      `  "matches_claim": true | false,\n` +
      `  "confidence": 0-100 (your confidence this is a genuine, legible qualification document of the stated type belonging to this vendor),\n` +
      `  "summary": "1-2 sentence factual description",\n` +
      `  "concerns": "any red flags (name mismatch, wrong doc type, illegible, expired) or empty string"\n` +
      `}`;

    // .docx has no visual — give the model the extracted text instead of a doc block.
    const userContent = isDocx
      ? [{ type: "text", text: `The uploaded file is a Word document. Its full extracted text is below, between the markers.\n\n--- BEGIN DOCUMENT TEXT ---\n${docText.slice(0, 30000)}\n--- END DOCUMENT TEXT ---\n\n${prompt}` }]
      : [docBlock, { type: "text", text: prompt }];

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("ISO17100_MODEL") || "claude-sonnet-4-6",
        max_tokens: 700,
        messages: [{ role: "user", content: userContent }],
      }),
    });
    if (!res.ok) { console.error("screen-evidence: Claude call failed", res.status, (await res.text()).slice(0, 300)); return; }
    const data = await res.json();
    const raw = (data?.content?.find((c: { type: string }) => c.type === "text")?.text ?? "").trim();
    let ex: Record<string, unknown>;
    try {
      ex = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim());
    } catch { console.error("screen-evidence: non-JSON output", raw.slice(0, 300)); return; }

    const docType = String(ex.doc_type ?? "unknown");
    // "unknown" gets recorded as other_document so it leaves the screened set
    // and doesn't loop forever through backfill. It is NOT a qualifying evidence record.
    const typeCode = TYPE_MAP[docType] ?? "other_document";

    const nameMatch = ex.name_matches_vendor;
    const concerns = String(ex.concerns ?? "").trim();
    const confidence = Math.max(0, Math.min(100, Number(ex.confidence ?? 0) || 0));

    // Auto-verify policy: high-confidence + name match + type match + no
    // concerns can verify itself to Tier-2 (config-driven, with a human policy
    // owner recorded as the verifier for the audit trail).
    let settings: { enabled?: boolean; threshold?: number; policy_owner?: string } = {};
    try {
      const { data } = await supabase.rpc("qms_ai_autoverify_settings");
      settings = (data ?? {}) as typeof settings;
    } catch (_) { /* default off */ }
    const clean = nameMatch !== false && ex.matches_claim !== false && concerns === "";
    const autoVerify = !!settings.enabled && !!settings.policy_owner
      && confidence >= (settings.threshold ?? 90) && clean;

    const note =
      `${autoVerify ? "AUTO-VERIFIED" : "SCREENED"} (AI document review of vendor upload` +
      `${autoVerify ? `; auto-verified at ${confidence}% confidence per QMS policy — no concerns`
                     : "; not yet verified by staff"}). ` +
      `AI confidence: ${confidence}%. ` +
      `Document: ${String(ex.summary ?? "").trim()} ` +
      `Holder: ${String(ex.holder_name ?? "unknown")} ` +
      `(name match: ${nameMatch === true ? "yes" : nameMatch === false ? "NO — review" : "uncertain"}). ` +
      (ex.matches_claim === false ? `MISMATCH: vendor labelled it "${claimedLabel}" but it appears to be a ${docType}. ` : "") +
      (concerns ? `Concerns: ${concerns}` : "");

    const sha256 = await sha256Hex(bytes);
    const issued = (typeof ex.issued_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ex.issued_date)) ? ex.issued_date : null;

    const { error } = await supabase.rpc("qms_add_evidence_wrapper", {
      p_vendor_id: vendorId,
      p_role_qualification_id: null,
      p_evidence_type_code: typeCode,
      p_title: String(ex.title ?? claimedLabel).slice(0, 200),
      p_org: ex.institution ? String(ex.institution).slice(0, 200) : null,
      p_country: null,
      p_issued_date: issued,
      p_expiry_date: null,
      p_storage_path: storagePath,
      p_file_name: fileName,
      p_file_mime: fileMime,
      p_file_size: bytes.length,
      p_sha256: sha256,
      p_verified: autoVerify,
      p_verification_method: autoVerify ? "ai_auto_verified" : "ai_document_screen",
      p_verification_notes: note,
      p_acting_user_id: autoVerify ? (settings.policy_owner ?? null) : null,
    });
    if (error) console.error("screen-evidence: qms_add_evidence_wrapper failed", error.message);
  } catch (e) {
    console.error("screenEvidenceDocument failed:", e);
  }
}
