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
      let blob: Blob;

      if (fmt === "txt") {
        blob = new Blob([buildTxtOutput(job, metadata, targetLangName)], { type: "text/plain" });
      } else if (fmt === "docx") {
        const zipData = buildDocxZip(job, metadata, targetLangName);
        blob = new Blob([zipData], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      } else if (fmt === "pdf") {
        blob = new Blob([buildPdfOutput(job, metadata, targetLangName)], { type: "text/plain" });
      } else if (fmt === "srt") {
        blob = new Blob([buildSrtOutput(job)], { type: "text/plain" });
      } else if (fmt === "vtt") {
        blob = new Blob([buildVttOutput(job)], { type: "text/vtt" });
      } else if (fmt === "json") {
        blob = new Blob([buildJsonOutput(job, metadata, targetLangName)], { type: "application/json" });
      } else {
        continue;
      }

      const storagePath = `${jobId}/output/transcript.${fmt}`;
      const contentType = blob.type;

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

// ── Speaker diarization helpers ─────────────────────────────────────────────

interface SpeakerSegment {
  speaker: string;
  startMs: number;
  endMs: number;
  text: string;
}

function extractSpeakerSegments(
  job: Record<string, unknown>,
): SpeakerSegment[] | null {
  const json = job.transcript_json as Record<string, unknown> | null;
  if (!json) return null;

  // AssemblyAI: utterances already grouped by speaker
  const utterances = json.utterances as
    | Array<{ text: string; start: number; end: number; speaker: string }>
    | undefined;
  if (utterances?.length && utterances[0]?.speaker != null) {
    return utterances.map((u) => ({
      speaker: `Speaker ${u.speaker}`,
      startMs: u.start,
      endMs: u.end,
      text: u.text,
    }));
  }

  // ElevenLabs: words with speaker_id — group consecutive words by speaker
  // ElevenLabs timestamps are in seconds (e.g., 8.06), not milliseconds
  const words = json.words as
    | Array<{
        text: string;
        start: number;
        end: number;
        speaker_id?: string;
        type?: string;
      }>
    | undefined;
  if (words?.length && words.some((w) => w.speaker_id != null)) {
    // Detect units: if max timestamp < 100000, likely seconds; else ms
    const maxTs = Math.max(...words.filter(w => w.type !== "spacing").map(w => w.end));
    const isSeconds = maxTs < 100000;

    const segs: SpeakerSegment[] = [];
    let current: SpeakerSegment | null = null;

    for (const word of words) {
      if (word.type === "spacing") continue;
      const spkRaw = word.speaker_id ?? "unknown";
      const speaker = spkRaw.replace("speaker_", "Speaker ");
      const startMs = isSeconds ? Math.round(word.start * 1000) : word.start;
      const endMs = isSeconds ? Math.round(word.end * 1000) : word.end;
      if (!current || current.speaker !== speaker) {
        if (current) segs.push(current);
        current = {
          speaker,
          startMs,
          endMs,
          text: word.text,
        };
      } else {
        current.endMs = endMs;
        current.text += " " + word.text;
      }
    }
    if (current) segs.push(current);
    return segs.length > 0 ? segs : null;
  }

  // OpenAI: segments with start/end (no speaker IDs, but has timestamps)
  const oaiSegments = json.segments as
    | Array<{ text: string; start: number; end: number }>
    | undefined;
  if (oaiSegments?.length) {
    return oaiSegments.map((s, i) => ({
      speaker: `Segment ${i + 1}`,
      startMs: s.start,
      endMs: s.end,
      text: s.text?.trim() ?? "",
    }));
  }

  return null;
}

function fmtTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
  ];

  const segments = extractSpeakerSegments(job);
  if (segments) {
    for (const seg of segments) {
      lines.push(`${seg.speaker} [${fmtTimestamp(seg.startMs)}]`);
      lines.push(seg.text);
      lines.push("");
    }
  } else {
    lines.push(job.transcript_text as string);
  }

  if (targetLangName && job.translated_text) {
    lines.push(
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

function buildPdfOutput(
  job: Record<string, unknown>,
  meta: OutputMetadata,
  targetLangName: string | null,
): string {
  const hasTranslation = !!(targetLangName && job.translated_text);
  const segments = extractSpeakerSegments(job);

  const lines: string[] = [
    "TRANSCRIPTION REPORT",
    "=" .repeat(100),
    `File: ${meta.fileName}`,
    `Duration: ${meta.duration}  |  Language: ${meta.language}  |  Words: ${meta.wordCount ?? "N/A"}  |  Quality: ${meta.qualityScore ?? "N/A"}`,
    `Date: ${meta.date}`,
    "=".repeat(100),
    "",
  ];

  // Build tabular output
  const sep = "-".repeat(100);
  if (hasTranslation) {
    lines.push(padRow("SPEAKER", "TIMESTAMP", "TRANSCRIPTION", `TRANSLATION (${targetLangName})`));
  } else {
    lines.push(padRow("SPEAKER", "TIMESTAMP", "TRANSCRIPTION", null));
  }
  lines.push(sep);

  const translatedParas = hasTranslation
    ? splitTranslationBySegments(job.translated_text as string, segments?.length ?? 1)
    : [];

  if (segments && segments.length > 0) {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const trans = hasTranslation ? (translatedParas[i] ?? "") : null;
      lines.push(padRow(seg.speaker, fmtTimestamp(seg.startMs), seg.text, trans));
      lines.push(sep);
    }
  } else {
    lines.push(padRow(
      "—",
      "00:00:00",
      job.transcript_text as string,
      hasTranslation ? (job.translated_text as string) : null,
    ));
    lines.push(sep);
  }

  if (hasTranslation) {
    lines.push("");
    lines.push("Note: AI-translated. For certified or human-reviewed translation, visit cethos.com/services/translation");
  }

  lines.push("");
  lines.push("Generated by Cethos Solutions Inc. — cethos.com");

  return lines.join("\n");
}

function padRow(
  speaker: string,
  timestamp: string,
  transcript: string,
  translation: string | null,
): string {
  const s = speaker.substring(0, 14).padEnd(14);
  const t = timestamp.padEnd(10);
  if (translation !== null) {
    const tr = transcript.substring(0, 36).padEnd(36);
    const tl = translation.substring(0, 36);
    return `${s} | ${t} | ${tr} | ${tl}`;
  }
  return `${s} | ${t} | ${transcript}`;
}

// ── DOCX table helpers ──────────────────────────────────────────────────────

function tableHeaderRow(
  col1: string,
  col2: string,
  col3: string,
  col4: string | null,
): string {
  const cell = (text: string) =>
    `<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="0F766E"/><w:tcMar><w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>${text}</w:t></w:r></w:p></w:tc>`;

  const cells = [cell(col1), cell(col2), cell(col3)];
  if (col4 !== null) cells.push(cell(col4));
  return `<w:tr>${cells.join("")}</w:tr>`;
}

function tableRow(
  speaker: string,
  timestamp: string,
  transcript: string,
  translation: string | null,
): string {
  const cellSmall = (text: string) =>
    `<w:tc><w:tcPr><w:tcMar><w:top w:w="40" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`;

  const cellBody = (text: string) =>
    `<w:tc><w:tcPr><w:tcMar><w:top w:w="40" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`;

  const cells = [cellSmall(speaker), cellSmall(timestamp), cellBody(transcript)];
  if (translation !== null) cells.push(cellBody(translation));
  return `<w:tr>${cells.join("")}</w:tr>`;
}

function splitTranslationBySegments(
  translatedText: string,
  segmentCount: number,
): string[] {
  if (segmentCount <= 1) return [translatedText];

  const paras = translatedText.split(/\n+/).filter((p) => p.trim());
  if (paras.length === segmentCount) return paras;

  // If paragraph count doesn't match segments, distribute evenly
  if (paras.length > segmentCount) {
    const result: string[] = [];
    const perChunk = Math.ceil(paras.length / segmentCount);
    for (let i = 0; i < segmentCount; i++) {
      result.push(paras.slice(i * perChunk, (i + 1) * perChunk).join(" "));
    }
    return result;
  }

  // Fewer paragraphs than segments — pad with empty strings
  return [...paras, ...Array(segmentCount - paras.length).fill("")];
}

// ── Minimal ZIP + OOXML DOCX builder ────────────────────────────────────────

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildDocxZip(
  job: Record<string, unknown>,
  meta: OutputMetadata,
  targetLangName: string | null,
): Uint8Array {
  const escXml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const hasTranslation = !!(targetLangName && job.translated_text);
  const segments = extractSpeakerSegments(job);

  // Split translated_text into paragraphs to try aligning with segments
  const translatedParas = hasTranslation
    ? splitTranslationBySegments(job.translated_text as string, segments?.length ?? 1)
    : [];

  // Build table rows from segments or fallback to plain text
  let tableRows: string;
  if (segments && segments.length > 0) {
    tableRows = segments
      .map((seg, i) => {
        const transText = hasTranslation ? (translatedParas[i] ?? "") : null;
        return tableRow(
          escXml(seg.speaker),
          fmtTimestamp(seg.startMs),
          escXml(seg.text),
          transText !== null ? escXml(transText) : null,
        );
      })
      .join("");
  } else {
    // No segments — single row with full transcript
    tableRows = tableRow(
      "—",
      "00:00:00",
      escXml(job.transcript_text as string),
      hasTranslation ? escXml(job.translated_text as string) : null,
    );
  }

  // Column widths (twips) — portrait letter, margins 1080 each side = 10080 usable
  const colW = hasTranslation
    ? { speaker: 1200, time: 1200, transcript: 3840, translation: 3840 }
    : { speaker: 1400, time: 1400, transcript: 7280, translation: 0 };

  const gridCols = hasTranslation
    ? `<w:gridCol w:w="${colW.speaker}"/><w:gridCol w:w="${colW.time}"/><w:gridCol w:w="${colW.transcript}"/><w:gridCol w:w="${colW.translation}"/>`
    : `<w:gridCol w:w="${colW.speaker}"/><w:gridCol w:w="${colW.time}"/><w:gridCol w:w="${colW.transcript}"/>`;

  const headerRow = hasTranslation
    ? tableHeaderRow("Speaker", "Timestamp", "Transcription", `Translation (${escXml(targetLangName!)})`)
    : tableHeaderRow("Speaker", "Timestamp", "Transcription", null);

  const translationDisclaimer = hasTranslation
    ? `<w:p><w:r><w:rPr><w:i/><w:sz w:val="18"/><w:color w:val="6B7280"/></w:rPr><w:t xml:space="preserve">AI-translated. For certified or human-reviewed translation, visit cethos.com/services/translation</w:t></w:r></w:p>`
    : "";

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
 xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
 xmlns:v="urn:schemas-microsoft-com:vml"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
 xmlns:w10="urn:schemas-microsoft-com:office:word"
 xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
 mc:Ignorable="w14 wp14">
<w:body>
  <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Transcription Report</w:t></w:r></w:p>
  <w:p><w:r><w:t>File: ${escXml(meta.fileName)} | Duration: ${escXml(meta.duration)} | Language: ${escXml(meta.language)}</w:t></w:r></w:p>
  <w:p><w:r><w:t>Words: ${meta.wordCount ?? "N/A"} | Quality: ${meta.qualityScore ?? "N/A"} | Date: ${meta.date}</w:t></w:r></w:p>
  <w:p/>
  <w:tbl>
    <w:tblPr>
      <w:tblStyle w:val="TableGrid"/>
      <w:tblW w:w="0" w:type="auto"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>
      </w:tblBorders>
      <w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>
    </w:tblPr>
    <w:tblGrid>${gridCols}</w:tblGrid>
    ${headerRow}
    ${tableRows}
  </w:tbl>
  <w:p/>
  ${translationDisclaimer}
  <w:p><w:r><w:rPr><w:sz w:val="18"/><w:color w:val="999999"/></w:rPr><w:t>Generated by Cethos Solutions Inc. — cethos.com</w:t></w:r></w:p>
  <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
</w:body>
</w:document>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/><w:color w:val="0F766E"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/><w:color w:val="374151"/></w:rPr>
  </w:style>
  <w:style w:type="table" w:styleId="TableGrid">
    <w:name w:val="Table Grid"/>
    <w:tblPr><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr>
  </w:style>
</w:styles>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const documentRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const files: Array<{ name: string; data: Uint8Array }> = [
    { name: "[Content_Types].xml", data: new TextEncoder().encode(contentTypesXml) },
    { name: "_rels/.rels", data: new TextEncoder().encode(relsXml) },
    { name: "word/document.xml", data: new TextEncoder().encode(documentXml) },
    { name: "word/styles.xml", data: new TextEncoder().encode(stylesXml) },
    { name: "word/_rels/document.xml.rels", data: new TextEncoder().encode(documentRelsXml) },
  ];

  return buildZip(files);
}

function buildZip(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder();
  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    // Local file header (30 bytes + name + data)
    const local = new Uint8Array(30 + nameBytes.length + size);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);   // signature
    lv.setUint16(4, 20, true);            // version needed
    lv.setUint16(6, 0, true);             // flags
    lv.setUint16(8, 0, true);             // compression (store)
    lv.setUint16(10, 0, true);            // mod time
    lv.setUint16(12, 0, true);            // mod date
    lv.setUint32(14, crc, true);          // crc32
    lv.setUint32(18, size, true);         // compressed size
    lv.setUint32(22, size, true);         // uncompressed size
    lv.setUint16(26, nameBytes.length, true); // name length
    lv.setUint16(28, 0, true);            // extra length
    local.set(nameBytes, 30);
    local.set(file.data, 30 + nameBytes.length);
    localHeaders.push(local);

    // Central directory header (46 bytes + name)
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);    // signature
    cv.setUint16(4, 20, true);            // version made by
    cv.setUint16(6, 20, true);            // version needed
    cv.setUint16(8, 0, true);             // flags
    cv.setUint16(10, 0, true);            // compression
    cv.setUint16(12, 0, true);            // mod time
    cv.setUint16(14, 0, true);            // mod date
    cv.setUint32(16, crc, true);          // crc32
    cv.setUint32(20, size, true);         // compressed size
    cv.setUint32(24, size, true);         // uncompressed size
    cv.setUint16(28, nameBytes.length, true); // name length
    cv.setUint16(30, 0, true);            // extra length
    cv.setUint16(32, 0, true);            // comment length
    cv.setUint16(34, 0, true);            // disk start
    cv.setUint16(36, 0, true);            // internal attrs
    cv.setUint32(38, 0, true);            // external attrs
    cv.setUint32(42, offset, true);       // local header offset
    central.set(nameBytes, 46);
    centralHeaders.push(central);

    offset += local.length;
  }

  // End of central directory (22 bytes)
  const centralDirSize = centralHeaders.reduce((a, h) => a + h.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);       // signature
  ev.setUint16(4, 0, true);                // disk number
  ev.setUint16(6, 0, true);                // central dir disk
  ev.setUint16(8, files.length, true);     // entries on disk
  ev.setUint16(10, files.length, true);    // total entries
  ev.setUint32(12, centralDirSize, true);  // central dir size
  ev.setUint32(16, offset, true);          // central dir offset
  ev.setUint16(20, 0, true);              // comment length

  const totalSize = offset + centralDirSize + 22;
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (const lh of localHeaders) {
    result.set(lh, pos);
    pos += lh.length;
  }
  for (const ch of centralHeaders) {
    result.set(ch, pos);
    pos += ch.length;
  }
  result.set(eocd, pos);

  return result;
}

// ── Subtitle helpers ────────────────────────────────────────────────────────

interface SubtitleBlock {
  start: number; // milliseconds
  end: number;
  text: string;
}

function buildSubtitleBlocks(job: Record<string, unknown>): SubtitleBlock[] {
  const json = job.transcript_json as Record<string, unknown> | null;

  // Try words first (ElevenLabs, AssemblyAI word-level)
  const words = (json?.words ?? []) as Array<{
    text: string;
    start: number;
    end: number;
    speaker_id?: string;
    type?: string;
  }>;

  const realWords = words.filter((w) => w.type !== "spacing");

  if (realWords.length > 0) {
    const blocks: SubtitleBlock[] = [];
    let currentSpeaker = realWords[0].speaker_id ?? null;
    let current: SubtitleBlock = {
      start: realWords[0].start,
      end: realWords[0].end,
      text: realWords[0].text,
    };

    for (let i = 1; i < realWords.length; i++) {
      const word = realWords[i];
      const blockDurationSec = (word.end - current.start) / 1000;
      const speakerChanged = word.speaker_id != null && word.speaker_id !== currentSpeaker;

      if (blockDurationSec >= 5 || speakerChanged) {
        if (currentSpeaker) {
          current.text = `${currentSpeaker.replace("speaker_", "Speaker ")}: ${current.text}`;
        }
        blocks.push(current);
        currentSpeaker = word.speaker_id ?? currentSpeaker;
        current = { start: word.start, end: word.end, text: word.text };
      } else {
        current.end = word.end;
        current.text += " " + word.text;
      }
    }
    if (currentSpeaker) {
      current.text = `${currentSpeaker.replace("speaker_", "Speaker ")}: ${current.text}`;
    }
    blocks.push(current);
    return blocks;
  }

  // Try segments (OpenAI verbose_json)
  const segments = (json?.segments ?? []) as Array<{
    text: string;
    start: number;
    end: number;
  }>;
  if (segments.length > 0) {
    return segments.map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text?.trim() ?? "",
    }));
  }

  // Try utterances (AssemblyAI speaker-labeled)
  const utterances = (json?.utterances ?? []) as Array<{
    text: string;
    start: number;
    end: number;
    speaker: string;
  }>;
  if (utterances.length > 0) {
    return utterances.map((u) => ({
      start: u.start,
      end: u.end,
      text: `Speaker ${u.speaker}: ${u.text}`,
    }));
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
      ...(json?.utterances ? { utterances: json.utterances } : {}),
      ...(extractSpeakerSegments(job) ? { speakers: extractSpeakerSegments(job) } : {}),
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
