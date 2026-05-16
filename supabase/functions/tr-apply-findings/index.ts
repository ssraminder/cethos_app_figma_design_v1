// ============================================================================
// tr-apply-findings — applies pending findings to the target .docx file in
// each pair. Produces a new output .docx per pair, stores it under
// tr-review-jobs/{job_id}/output/, inserts tr.job_files row with role=output.
//
// Phase 1 scope: .docx only (tracked_change / comment / highlight).
// .xlsx + .pdf annotation land in Phase 2.
//
// Input: { job_id, pair_id? }  // pair_id optional — defaults to all pairs
// Output: { applied: int, output_files: [{ pair_id, file_id, storage_path }] }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { CORS, json, serviceClient, actorFromRequest, writeAudit, tr, slug, sha256Hex } from "../_shared/tr.ts";
import JSZip from "https://esm.sh/jszip@3.10.1";

const BUCKET = "tr-review-jobs";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Highlight OOXML named colours that map nearest to a given hex.
// (Word's highlight only supports the 16 named colours; cells/runs can carry
// arbitrary fills/colours but highlights are limited.)
const NAMED_HIGHLIGHTS = ["yellow","green","cyan","magenta","blue","red","darkBlue","darkCyan","darkGreen","darkMagenta","darkRed","darkYellow","darkGray","lightGray","black"];
function nearestNamedHighlight(hex: string | null | undefined): string {
  if (!hex) return "yellow";
  const h = hex.toLowerCase();
  if (h === "#ffe699" || h === "#ffd966" || h === "#e36c09") return "yellow";
  if (h === "#a9d08e" || h === "#006100") return "green";
  if (h === "#b4c7e7") return "blue";
  if (h === "#cc99ff" || h === "#833c0c") return "magenta";
  return "yellow";
}

type ApplyTarget = {
  pair_id: string;
  pair_label: string;
  target_file: { id: string; storage_bucket: string; storage_path: string; original_filename: string };
  findings: Array<{ id: string; severity: string; application_mode: string; anchor_text: string | null; current_translation: string | null; proposed_change: string | null; rationale: string; color_hex: string | null; finding_number: number }>;
};

async function applyToDocx(zipBytes: Uint8Array, target: ApplyTarget, authorLabel: string): Promise<{ outBytes: Uint8Array; commentCount: number; trackedCount: number; highlightCount: number; skipped: number }> {
  const zip = await JSZip.loadAsync(zipBytes);
  const docXmlPath = "word/document.xml";
  if (!zip.files[docXmlPath]) throw new Error("document.xml missing — not a valid .docx");
  let docXml = await zip.files[docXmlPath].async("string");

  // Existing comments?
  const commentsPath = "word/comments.xml";
  let commentsXml = zip.files[commentsPath]
    ? await zip.files[commentsPath].async("string")
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:comments>';

  // Determine starting comment id (count existing <w:comment ... w:id="..."/>)
  const existingIds = [...commentsXml.matchAll(/w:id="(\d+)"/g)].map((m) => Number(m[1]));
  let nextCommentId = existingIds.length ? Math.max(...existingIds) + 1 : 0;

  const isoDate = new Date().toISOString();
  let commentCount = 0;
  let trackedCount = 0;
  let highlightCount = 0;
  let skipped = 0;

  for (const f of target.findings) {
    const anchor = f.anchor_text ?? f.current_translation;
    if (!anchor || anchor.trim().length < 2) {
      skipped++;
      continue;
    }
    // Find an EXACT text run containing the anchor. OOXML splits runs at
    // formatting boundaries, so we attempt to find a <w:r>...<w:t>anchor</w:t></w:r>
    // first; if not found, fall back to plain text replacement in document.xml.
    const escAnchor = escapeXml(anchor);

    // Try to wrap a single matching <w:t>anchor</w:t> with the comment range +
    // optional highlight / tracked-change markup.
    const runTagPattern = new RegExp(
      `(<w:r\\b[^>]*>(?:(?!</w:r>).)*?<w:t(?:\\s[^>]*)?>)${escAnchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(</w:t>(?:(?!</w:r>).)*?</w:r>)`,
      "s",
    );
    const runMatch = runTagPattern.exec(docXml);

    if (!runMatch) {
      // Fallback: just inject a comment reference at the first occurrence of the
      // anchor text inside any <w:t>; this is brittle but covers cases where
      // the anchor crosses run boundaries.
      const txtPattern = new RegExp(`(<w:t(?:\\s[^>]*)?>)([^<]*)${escAnchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^<]*)(</w:t>)`, "s");
      const fallbackMatch = txtPattern.exec(docXml);
      if (!fallbackMatch) {
        skipped++;
        continue;
      }
      const cid = nextCommentId++;
      const before = fallbackMatch[1] + fallbackMatch[2];
      const after = fallbackMatch[3] + fallbackMatch[4];
      const rangeStart = `<w:commentRangeStart w:id="${cid}"/>`;
      const rangeEnd = `<w:commentRangeEnd w:id="${cid}"/><w:r><w:rPr/><w:commentReference w:id="${cid}"/></w:r>`;
      docXml = docXml.replace(
        fallbackMatch[0],
        `${rangeStart}${before}${escAnchor}${after}${rangeEnd}`,
      );
      commentsXml = commentsXml.replace(
        "</w:comments>",
        `<w:comment w:id="${cid}" w:author="${escapeXml(authorLabel)}" w:date="${isoDate}" w:initials="C"><w:p><w:r><w:t xml:space="preserve">[${f.severity}] ${escapeXml(f.rationale)}${f.proposed_change ? `\nProposed: ${escapeXml(f.proposed_change)}` : ""}</w:t></w:r></w:p></w:comment></w:comments>`,
      );
      commentCount++;
      continue;
    }

    const cid = nextCommentId++;
    const rangeStart = `<w:commentRangeStart w:id="${cid}"/>`;
    const rangeEnd = `<w:commentRangeEnd w:id="${cid}"/><w:r><w:rPr/><w:commentReference w:id="${cid}"/></w:r>`;

    if (f.application_mode === "tracked_change" && f.proposed_change) {
      // Wrap matched anchor in <w:del> + insert <w:ins> with proposed text
      const delId = cid * 2 + 1;
      const insId = cid * 2 + 2;
      const delMarkup = `${rangeStart}<w:del w:id="${delId}" w:author="${escapeXml(authorLabel)}" w:date="${isoDate}">${runMatch[1].replace("<w:t", "<w:delText").replace(">", ">").replace(/<w:t( [^>]*)?>/, "<w:delText$1>")}${escapeXml(anchor)}${runMatch[2].replace("</w:t>", "</w:delText>").replace(/<w:t( [^>]*)?>/, "<w:delText$1>")}</w:del><w:ins w:id="${insId}" w:author="${escapeXml(authorLabel)}" w:date="${isoDate}"><w:r><w:rPr><w:color w:val="${(f.color_hex ?? "#000000").replace("#", "")}"/></w:rPr><w:t xml:space="preserve">${escapeXml(f.proposed_change)}</w:t></w:r></w:ins>${rangeEnd}`;
      docXml = docXml.replace(runMatch[0], delMarkup);
      trackedCount++;
    } else if (f.application_mode === "highlight") {
      const hi = nearestNamedHighlight(f.color_hex);
      // Inject highlight by mutating run properties; conservative — wrap the anchor in a new run with rPr highlight + retain surrounding text via comment range markers.
      const newMarkup = `${rangeStart}<w:r><w:rPr><w:highlight w:val="${hi}"/></w:rPr><w:t xml:space="preserve">${escAnchor}</w:t></w:r>${rangeEnd}`;
      docXml = docXml.replace(runMatch[0], newMarkup);
      highlightCount++;
    } else {
      // Plain comment (application_mode='comment' or fallback)
      docXml = docXml.replace(runMatch[0], `${rangeStart}${runMatch[1]}${escAnchor}${runMatch[2]}${rangeEnd}`);
      commentCount++;
    }

    commentsXml = commentsXml.replace(
      "</w:comments>",
      `<w:comment w:id="${cid}" w:author="${escapeXml(authorLabel)}" w:date="${isoDate}" w:initials="C"><w:p><w:r><w:t xml:space="preserve">[${f.severity}] ${escapeXml(f.rationale)}${f.proposed_change ? `\nProposed: ${escapeXml(f.proposed_change)}` : ""}</w:t></w:r></w:p></w:comment></w:comments>`,
    );
  }

  // Write updated parts
  zip.file(docXmlPath, docXml);
  zip.file(commentsPath, commentsXml);

  // Ensure [Content_Types].xml declares the comments part
  const ctPath = "[Content_Types].xml";
  if (zip.files[ctPath]) {
    let ct = await zip.files[ctPath].async("string");
    if (!ct.includes("/word/comments.xml")) {
      ct = ct.replace(
        "</Types>",
        `<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/></Types>`,
      );
      zip.file(ctPath, ct);
    }
  }

  // Ensure document.xml.rels has a relationship to comments.xml
  const relsPath = "word/_rels/document.xml.rels";
  if (zip.files[relsPath]) {
    let rels = await zip.files[relsPath].async("string");
    if (!rels.includes("comments.xml")) {
      const existingIds = [...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
      const newRid = existingIds.length ? Math.max(...existingIds) + 1 : 100;
      rels = rels.replace(
        "</Relationships>",
        `<Relationship Id="rId${newRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/></Relationships>`,
      );
      zip.file(relsPath, rels);
    }
  }

  const outBytes = await zip.generateAsync({ type: "uint8array" });
  return { outBytes, commentCount, trackedCount, highlightCount, skipped };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const { job_id, pair_id } = await req.json();
    if (!job_id) return json({ error: "job_id required" }, 400);

    const sb = serviceClient();
    const actor = await actorFromRequest(req, sb);
    const authorInitials = (actor.email ?? "Claude").split("@")[0].slice(0, 5);
    const dateLabel = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const authorLabel = `Claude+${authorInitials}-${dateLabel}`;

    // Load pairs to process
    const pairsQ = tr(sb).from("file_pairs").select("id, label").eq("job_id", job_id);
    if (pair_id) pairsQ.eq("id", pair_id);
    const { data: pairs } = await pairsQ;
    if (!pairs?.length) return json({ error: "no pairs found" }, 404);

    const outputs: Record<string, unknown>[] = [];
    let totalApplied = 0;

    for (const pair of pairs) {
      // Find target file for this pair
      const { data: target } = await tr(sb)
        .from("job_files")
        .select("id, storage_bucket, storage_path, original_filename, mime_type")
        .eq("pair_id", pair.id)
        .eq("role", "target")
        .maybeSingle();
      if (!target) continue;
      if (!(target.original_filename ?? "").toLowerCase().endsWith(".docx")) {
        outputs.push({ pair_id: pair.id, skipped: "not_a_docx", filename: target.original_filename });
        continue;
      }

      const { data: findings } = await tr(sb)
        .from("findings")
        .select("id, severity, application_mode, location_jsonb, current_translation, proposed_change, rationale, color_hex, finding_number")
        .eq("job_id", job_id)
        .eq("pair_id", pair.id)
        .eq("application_status", "pending");
      if (!findings?.length) continue;

      const findingsList = findings.map((f) => ({
        id: f.id,
        severity: f.severity,
        application_mode: f.application_mode,
        anchor_text: (f.location_jsonb as { anchor_text?: string } | null)?.anchor_text ?? null,
        current_translation: f.current_translation,
        proposed_change: f.proposed_change,
        rationale: f.rationale,
        color_hex: f.color_hex,
        finding_number: f.finding_number,
      }));

      // Download input
      const { data: blob } = await sb.storage.from(target.storage_bucket).download(target.storage_path);
      if (!blob) continue;
      const inBytes = new Uint8Array(await blob.arrayBuffer());

      // Apply
      const { outBytes, commentCount, trackedCount, highlightCount, skipped } = await applyToDocx(
        inBytes,
        {
          pair_id: pair.id,
          pair_label: pair.label,
          target_file: { id: target.id, storage_bucket: target.storage_bucket, storage_path: target.storage_path, original_filename: target.original_filename },
          findings: findingsList,
        },
        authorLabel,
      );

      // Upload as new output file
      const dt = new Date().toISOString().slice(0, 10);
      const outBaseSlug = slug(target.original_filename.replace(/\.docx$/i, ""));
      const outFilename = `${outBaseSlug}__review_${dt}.docx`;
      const outId = crypto.randomUUID();
      const outPath = `${job_id}/output/${outId}-${outFilename}`;
      const upload = await sb.storage.from(BUCKET).upload(outPath, outBytes, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: false,
      });
      if (upload.error) {
        console.error("[tr-apply-findings] upload error:", upload.error);
        continue;
      }
      const sha = await sha256Hex(outBytes);

      const { error: insertErr } = await tr(sb).from("job_files").insert({
        id: outId,
        job_id,
        pair_id: pair.id,
        role: "output",
        source_kind: "uploaded",
        storage_bucket: BUCKET,
        storage_path: outPath,
        original_filename: outFilename,
        mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        bytes: outBytes.length,
        sha256: sha,
        verified: true,
        verified_at: new Date().toISOString(),
        verification_method: "system_generated",
        created_by: actor.id,
      });
      if (insertErr) {
        console.error("[tr-apply-findings] job_files insert error:", insertErr);
        continue;
      }

      // Flip applied findings
      const appliedIds = findingsList.slice(0, commentCount + trackedCount + highlightCount).map((f) => f.id);
      if (appliedIds.length) {
        await tr(sb)
          .from("findings")
          .update({ application_status: "applied", applied_at: new Date().toISOString(), applied_by: actor.id })
          .in("id", appliedIds);
      }
      totalApplied += appliedIds.length;

      await writeAudit(sb, {
        job_id,
        action: "finding_applied",
        actor_id: actor.id,
        actor_email: actor.email,
        payload: {
          pair_id: pair.id,
          output_file_id: outId,
          counts: { comment: commentCount, tracked: trackedCount, highlight: highlightCount, skipped },
        },
      });

      outputs.push({
        pair_id: pair.id,
        file_id: outId,
        storage_path: outPath,
        filename: outFilename,
        counts: { comment: commentCount, tracked: trackedCount, highlight: highlightCount, skipped },
      });
    }

    return json({ applied: totalApplied, output_files: outputs });
  } catch (err) {
    console.error("[tr-apply-findings] fatal:", err);
    return json({ error: String(err) }, 500);
  }
});
