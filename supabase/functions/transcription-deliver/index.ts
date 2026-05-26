// POST /functions/v1/transcription-deliver
// Body: { job_id: string }
// Generates TXT/DOCX/PDF output files, uploads to storage,
// marks job completed, emails customer with signed download URLs.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  jsonResponse,
  preflight,
  getServiceClient,
  getTranscriptionSettings,
  sendBrevoEmail,
  auditLog,
} from "../_shared/transcription.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => null);
    const jobId = body?.job_id as string;
    if (!jobId) {
      return jsonResponse({ success: false, error: "job_id required" }, 400);
    }

    const admin = getServiceClient();

    const { data: job, error: jobErr } = await admin
      .from("transcription_jobs")
      .select("*")
      .eq("id", jobId)
      .is("deleted_at", null)
      .maybeSingle();

    if (jobErr || !job) {
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    }

    // If translation was requested but not yet done, wait and retry
    if (job.translation_requested && !job.translated_text) {
      // Check if we've been waiting too long (> 5 minutes)
      const jobAge = Date.now() - new Date(job.created_at).getTime();
      if (jobAge < 5 * 60 * 1000) {
        return jsonResponse({
          success: false,
          error: "Translation not yet complete, will retry",
          retry: true,
        }, 202);
      }
      // Proceed without translation after timeout
    }

    if (!job.transcript_text?.trim()) {
      return jsonResponse({ success: false, error: "No transcript to deliver" }, 400);
    }

    const settings = await getTranscriptionSettings(admin);
    const mainWebUrl = Deno.env.get("MAIN_WEB_URL") ?? "https://cethos.com";

    // ── Generate output files ────────────────────────────────────────────

    const formats: string[] = job.delivery_formats ?? ["txt"];
    const uploadedFiles: Array<{ format: string; path: string }> = [];

    // Resolve language names for the header
    let sourceLangName = job.detected_language ?? "Auto-detected";
    if (job.source_language_id) {
      const { data: sl } = await admin
        .from("languages")
        .select("name")
        .eq("id", job.source_language_id)
        .maybeSingle();
      if (sl) sourceLangName = sl.name;
    }

    let targetLangName: string | null = null;
    if (job.translation_target_language_id) {
      const { data: tl } = await admin
        .from("languages")
        .select("name")
        .eq("id", job.translation_target_language_id)
        .maybeSingle();
      if (tl) targetLangName = tl.name;
    }

    const metadata = {
      fileName: job.file_name,
      duration: formatDuration(job.file_duration_seconds),
      language: sourceLangName,
      wordCount: job.word_count,
      qualityScore: job.ai_quality_score,
      date: new Date().toISOString().split("T")[0],
    };

    for (const fmt of formats) {
      let content: string;
      let contentType: string;

      if (fmt === "txt") {
        content = buildTxtOutput(job, metadata, targetLangName);
        contentType = "text/plain";
      } else if (fmt === "docx") {
        content = buildDocxXml(job, metadata, targetLangName);
        contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      } else if (fmt === "pdf") {
        // PDF: plain text for now (true PDF generation requires a library)
        content = buildTxtOutput(job, metadata, targetLangName);
        contentType = "text/plain";
      } else if (fmt === "srt") {
        content = buildSrtOutput(job);
        contentType = "text/plain";
      } else if (fmt === "vtt") {
        content = buildVttOutput(job);
        contentType = "text/vtt";
      } else if (fmt === "json") {
        content = buildJsonOutput(job, metadata, targetLangName);
        contentType = "application/json";
      } else {
        continue;
      }

      const storagePath = `${jobId}/output/transcript.${fmt}`;
      const blob = new Blob([content], { type: contentType });

      const { error: upErr } = await admin.storage
        .from("transcription-uploads")
        .upload(storagePath, blob, {
          contentType,
          upsert: true,
        });

      if (upErr) {
        console.error(`Upload ${fmt} failed:`, upErr.message, upErr);
        continue;
      }

      uploadedFiles.push({ format: fmt, path: storagePath });
    }

    // ── Generate signed URLs ─────────────────────────────────────────────

    const expirySeconds = (job.pricing_tier === "free" && job.amount_charged === 0)
      ? 7 * 24 * 60 * 60
      : 30 * 24 * 60 * 60;

    const downloadLinks: Array<{ format: string; url: string }> = [];

    for (const file of uploadedFiles) {
      const { data: signed, error: signErr } = await admin.storage
        .from("transcription-uploads")
        .createSignedUrl(file.path, expirySeconds);

      if (!signErr && signed?.signedUrl) {
        downloadLinks.push({ format: file.format, url: signed.signedUrl });
      }
    }

    // ── Mark job completed ───────────────────────────────────────────────

    await admin
      .from("transcription_jobs")
      .update({
        status: "completed",
        delivered_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    await auditLog(admin, jobId, "delivered", "system", null, {
      formats: uploadedFiles.map((f) => f.format),
      download_links: downloadLinks.length,
    });

    // ── Email customer ───────────────────────────────────────────────────

    const downloadRows = downloadLinks
      .map(
        (l) =>
          `<tr><td style="padding:6px 0;">
            <a href="${l.url}" style="display:inline-block;padding:10px 24px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Download ${l.format.toUpperCase()}</a>
            <div style="font-size:12px;color:#6b7280;margin-top:2px;">Download link valid for ${job.pricing_tier === "free" ? "7" : "30"} days</div>
          </td></tr>`,
      )
      .join("");

    const translationNote = job.translated_text
      ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:#111827;">Your AI translation to <strong>${targetLangName}</strong> is included in the download files.</p>
         <p style="margin:4px 0 0;font-size:12px;color:#6b7280;font-style:italic;">AI-translated. For certified or human-reviewed translation, visit <a href="${mainWebUrl}/services/translation" style="color:#0f766e;">cethos.com/services/translation</a>.</p>`
      : "";

    const qualityLabel =
      job.ai_quality_score === "A" ? "High" :
      job.ai_quality_score === "B" ? "Good" :
      job.ai_quality_score === "C" ? "Acceptable" : "Review Recommended";

    const humanReviewCta = job.ai_quality_score && ["C", "D"].includes(job.ai_quality_score)
      ? `<div style="margin:16px 0 0;padding:12px;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;">
           <p style="color:#92400e;font-size:13px;margin:0;line-height:1.5;">
             <strong>Quality: ${qualityLabel}</strong> — We recommend a human review for best results.
             <a href="${mainWebUrl}/services/transcription?job=${jobId}&action=human-review" style="color:#92400e;font-weight:bold;">Request Human Review →</a>
           </p>
         </div>`
      : "";

    const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const emailHtml = `<!doctype html>
<html><body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:20px 24px;background:#0f766e;color:#ffffff;">
          <div style="font-size:18px;font-weight:600;">Cethos Translation Services</div>
          <div style="font-size:13px;opacity:0.85;margin-top:2px;">AI Transcription</div>
        </td></tr>
        <tr><td style="padding:24px;color:#111827;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">Your transcription is ready! The file <strong>${escapeHtml(job.file_name)}</strong> has been transcribed successfully.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;">
            <tr><td style="padding:12px 16px;font-size:13px;line-height:1.8;color:#374151;">
              <strong>Duration:</strong> ${metadata.duration}<br/>
              <strong>Words:</strong> ${metadata.wordCount ?? "—"}<br/>
              <strong>Language:</strong> ${metadata.language}<br/>
              <strong>Quality:</strong> ${qualityLabel} (${job.ai_quality_score ?? "—"})
            </td></tr>
          </table>
          ${humanReviewCta}
          ${translationNote}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
            ${downloadRows || '<tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">No download files were generated. Please contact support.</td></tr>'}
          </table>
          <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">Need anything else? Just reply to this email and we'll be in touch.</p>
        </td></tr>
        <tr><td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
          Thank you for choosing Cethos. Replies go to support@cethos.com.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`.trim();

    // Skip email for internal/admin-test jobs — staff downloads from job detail page
    const isInternal = job.customer_email === "internal@cethos.com" ||
      job.customer_email === "admin-test@cethos.com" ||
      job.customer_email.startsWith("internal@");
    if (!isInternal) {
      await sendBrevoEmail(
        job.customer_email,
        "Your Transcription is Ready — Cethos",
        emailHtml,
      );
    }

    return jsonResponse({
      success: true,
      job_id: jobId,
      formats: uploadedFiles.map((f) => f.format),
      download_links: downloadLinks,
    });
  } catch (e) {
    console.error("transcription-deliver error:", e);
    return jsonResponse({ success: false, error: "Internal error" }, 500);
  }
});

// ── Output builders ──────────────────────────────────────────────────────────

interface OutputMetadata {
  fileName: string;
  duration: string;
  language: string;
  wordCount: number | null;
  qualityScore: string | null;
  date: string;
}

function buildTxtOutput(
  job: Record<string, unknown>,
  meta: OutputMetadata,
  targetLangName: string | null,
): string {
  const lines: string[] = [
    "TRANSCRIPTION REPORT",
    "=" .repeat(50),
    `File: ${meta.fileName}`,
    `Duration: ${meta.duration}`,
    `Language: ${meta.language}`,
    `Words: ${meta.wordCount ?? "N/A"}`,
    `Quality: ${meta.qualityScore ?? "N/A"}`,
    `Date: ${meta.date}`,
    `Powered by Cethos AI Transcription`,
    "=".repeat(50),
    "",
    "TRANSCRIPT",
    "-".repeat(50),
    "",
    job.transcript_text as string,
  ];

  if (targetLangName && job.translated_text) {
    lines.push(
      "",
      "",
      `TRANSLATION (${targetLangName})`,
      "-".repeat(50),
      "",
      job.translated_text as string,
      "",
      "Note: AI-translated. For certified or human-reviewed translation,",
      "visit cethos.com/services/translation",
    );
  }

  lines.push(
    "",
    "=".repeat(50),
    "Generated by Cethos Solutions Inc. — cethos.com",
  );

  return lines.join("\n");
}

function buildDocxXml(
  job: Record<string, unknown>,
  meta: OutputMetadata,
  targetLangName: string | null,
): string {
  // Minimal Word-compatible XML (flat OPC / single-file approach)
  const escXml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const transcriptParas = (job.transcript_text as string)
    .split("\n")
    .map((line) => `<w:p><w:r><w:t xml:space="preserve">${escXml(line)}</w:t></w:r></w:p>`)
    .join("\n");

  let translationSection = "";
  if (targetLangName && job.translated_text) {
    const translatedParas = (job.translated_text as string)
      .split("\n")
      .map((line) => `<w:p><w:r><w:t xml:space="preserve">${escXml(line)}</w:t></w:r></w:p>`)
      .join("\n");

    translationSection = `
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Translation (${escXml(targetLangName)})</w:t></w:r></w:p>
      ${translatedParas}
      <w:p><w:r><w:rPr><w:i/><w:sz w:val="20"/></w:rPr><w:t>AI-translated. For certified or human-reviewed translation, visit cethos.com/services/translation</w:t></w:r></w:p>
    `;
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?mso-application progid="Word.Document"?>
<w:wordDocument xmlns:w="http://schemas.microsoft.com/office/word/2003/wordml">
<w:body>
  <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Transcription Report</w:t></w:r></w:p>
  <w:p><w:r><w:t>File: ${escXml(meta.fileName)} | Duration: ${escXml(meta.duration)} | Language: ${escXml(meta.language)}</w:t></w:r></w:p>
  <w:p><w:r><w:t>Words: ${meta.wordCount ?? "N/A"} | Quality: ${meta.qualityScore ?? "N/A"} | Date: ${meta.date}</w:t></w:r></w:p>
  <w:p/>
  <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Transcript</w:t></w:r></w:p>
  ${transcriptParas}
  ${translationSection}
  <w:p/>
  <w:p><w:r><w:rPr><w:sz w:val="18"/><w:color w:val="999999"/></w:rPr><w:t>Generated by Cethos Solutions Inc. — cethos.com</w:t></w:r></w:p>
</w:body>
</w:wordDocument>`;
}

// ── Subtitle helpers ────────────────────────────────────────────────────────

interface SubtitleBlock {
  start: number; // milliseconds
  end: number;
  text: string;
}

function buildSubtitleBlocks(job: Record<string, unknown>): SubtitleBlock[] {
  const json = job.transcript_json as Record<string, unknown> | null;
  const words = (json?.words ?? []) as Array<{
    text: string;
    start: number;
    end: number;
  }>;

  if (words.length > 0) {
    const blocks: SubtitleBlock[] = [];
    let current: SubtitleBlock = {
      start: words[0].start,
      end: words[0].end,
      text: words[0].text,
    };

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const blockDurationSec = (word.end - current.start) / 1000;

      if (blockDurationSec >= 5) {
        blocks.push(current);
        current = { start: word.start, end: word.end, text: word.text };
      } else {
        current.end = word.end;
        current.text += " " + word.text;
      }
    }
    blocks.push(current);
    return blocks;
  }

  // Fallback: single block spanning the whole duration
  const durationMs = ((job.file_duration_seconds as number) ?? 0) * 1000;
  return [
    {
      start: 0,
      end: durationMs || 1000,
      text: (job.transcript_text as string) ?? "",
    },
  ];
}

function fmtSrtTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const msRem = Math.floor(ms % 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(msRem).padStart(3, "0")}`;
}

function fmtVttTime(ms: number): string {
  return fmtSrtTime(ms).replace(",", ".");
}

function buildSrtOutput(job: Record<string, unknown>): string {
  const blocks = buildSubtitleBlocks(job);
  return blocks
    .map(
      (b, i) =>
        `${i + 1}\n${fmtSrtTime(b.start)} --> ${fmtSrtTime(b.end)}\n${b.text}\n`,
    )
    .join("\n");
}

function buildVttOutput(job: Record<string, unknown>): string {
  const blocks = buildSubtitleBlocks(job);
  const cues = blocks
    .map((b) => `${fmtVttTime(b.start)} --> ${fmtVttTime(b.end)}\n${b.text}\n`)
    .join("\n");
  return `WEBVTT\n\n${cues}`;
}

function buildJsonOutput(
  job: Record<string, unknown>,
  meta: OutputMetadata,
  targetLangName: string | null,
): string {
  const json = job.transcript_json as Record<string, unknown> | null;

  const output: Record<string, unknown> = {
    metadata: {
      file_name: meta.fileName,
      duration: meta.duration,
      duration_seconds: job.file_duration_seconds,
      language: meta.language,
      word_count: meta.wordCount,
      quality_score: meta.qualityScore,
      generated_at: meta.date,
      provider: job.provider,
      powered_by: "Cethos AI Transcription",
    },
    transcript: {
      text: job.transcript_text,
      ...(json?.words ? { words: json.words } : {}),
      ...(json?.utterances ? { segments: json.utterances } : {}),
    },
  };

  if (targetLangName && job.translated_text) {
    output.translation = {
      language: targetLangName,
      text: job.translated_text,
      type: "ai_instant",
      disclaimer:
        "AI-translated. For certified or human-reviewed translation, visit cethos.com/services/translation",
    };
  }

  if (job.ai_quality_score) {
    output.quality = {
      score: job.ai_quality_score,
      notes: job.ai_quality_notes ?? null,
    };
  }

  return JSON.stringify(output, null, 2);
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "N/A";
  const s = Math.round(Number(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec}s`;
  return `${m}m ${sec}s`;
}
