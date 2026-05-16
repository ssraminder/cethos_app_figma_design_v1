// ============================================================================
// tr-preflight — runs pre-flight checks on every file in a job, updates
// tr.job_files.verified + actual_marker, returns structured warnings.
// No Claude call. Calls tr-extract-marker internally per file.
//
// Input: { job_id }
// Output: {
//   job_id, status: 'preflight_passed'|'preflight_warnings'|'preflight_blocked',
//   files: [{ file_id, role, verified, expected_marker, actual_marker, feasible_modes, warnings: [] }],
//   warnings: [{ code, file_id?, message }]
// }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { CORS, json, serviceClient, actorFromRequest, writeAudit, tr } from "../_shared/tr.ts";

const FEASIBLE_MODES: Record<string, string[]> = {
  docx: ["tracked_change", "comment", "highlight"],
  doc: ["comment", "highlight"],
  xlsx: ["cell_change", "comment"],
  xls: ["comment"],
  pdf: ["pdf_annotation"],
  txt: ["tracked_change"],
  md: ["tracked_change"],
  odt: ["comment"],
  ods: ["comment"],
};

function inferExt(filename: string, mime: string | null): string {
  const fromName = filename.split(".").pop()?.toLowerCase() ?? "";
  if (fromName && fromName.length <= 5) return fromName;
  if (mime?.includes("wordprocessingml")) return "docx";
  if (mime?.includes("spreadsheetml")) return "xlsx";
  if (mime?.includes("pdf")) return "pdf";
  return "bin";
}

async function callExtractMarker(file_id: string): Promise<{ primary_marker: string | null; extracted_markers: string[] } | null> {
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/tr-extract-marker`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file_id }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error("[tr-preflight] extract-marker call failed:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const { job_id } = await req.json();
    if (!job_id) return json({ error: "job_id required" }, 400);

    const sb = serviceClient();
    const actor = await actorFromRequest(req, sb);

    const { data: job } = await tr(sb).from("review_jobs").select("id, status, source_language_id, target_language_id").eq("id", job_id).maybeSingle();
    if (!job) return json({ error: "job not found" }, 404);

    const { data: files } = await tr(sb)
      .from("job_files")
      .select("id, role, original_filename, mime_type, expected_marker, actual_marker, verified, verification_method")
      .eq("job_id", job_id);
    if (!files || !files.length) return json({ error: "job has no files" }, 400);

    const results: Record<string, unknown>[] = [];
    const warnings: Record<string, unknown>[] = [];
    let blocked = false;

    for (const f of files) {
      const ext = inferExt(f.original_filename, f.mime_type);
      const feasible = FEASIBLE_MODES[ext] ?? [];
      const fileWarnings: Record<string, unknown>[] = [];

      // Skip marker extraction for client_email / output / open_question_image roles
      const skipMarker = ["client_email", "output", "open_question_image", "reference"].includes(f.role);
      let actual_marker: string | null = f.actual_marker ?? null;
      let verified = f.verified;
      let verification_method = f.verification_method ?? null;

      if (!skipMarker && !verified) {
        const markerRes = await callExtractMarker(f.id);
        actual_marker = markerRes?.primary_marker ?? null;
        verification_method = "footer_extract";

        if (f.expected_marker) {
          const expected = f.expected_marker.trim().toLowerCase();
          const haystack = (markerRes?.extracted_markers ?? []).map((m: string) => m.toLowerCase());
          verified = haystack.some((m: string) => m.includes(expected));
          if (!verified) {
            blocked = true;
            fileWarnings.push({
              code: "file_identity_mismatch",
              severity: "blocking",
              message: `expected marker '${f.expected_marker}' not found in file`,
            });
          }
        } else {
          // No expected marker declared — auto-pass but note this
          verified = true;
          fileWarnings.push({
            code: "no_expected_marker_declared",
            severity: "info",
            message: "no expected_marker declared; identity check skipped",
          });
        }

        await tr(sb)
          .from("job_files")
          .update({
            actual_marker,
            verified,
            verified_at: verified ? new Date().toISOString() : null,
            verification_method,
          })
          .eq("id", f.id);
      } else if (skipMarker) {
        // Non-content files auto-verify
        verified = true;
      }

      if (!feasible.length && !skipMarker) {
        fileWarnings.push({
          code: "format_unsupported",
          severity: "warning",
          message: `extension '${ext}' has no known feasible application modes`,
        });
      }

      results.push({
        file_id: f.id,
        role: f.role,
        filename: f.original_filename,
        verified,
        expected_marker: f.expected_marker,
        actual_marker,
        feasible_modes: feasible,
        warnings: fileWarnings,
      });
      warnings.push(...fileWarnings.map((w) => ({ ...w, file_id: f.id })));
    }

    // Methodology-compatibility check: cross-reference any locked terminology
    // decisions for this job. (Currently a no-op since locked_decisions are
    // typically added AFTER preflight; left here as the integration point.)

    const newStatus = blocked ? "preflight" : "preflight";
    // Transition from intake → preflight if applicable (status guard allows it)
    if (job.status === "intake") {
      await tr(sb).from("review_jobs").update({ status: "preflight" }).eq("id", job_id);
    }

    await writeAudit(sb, {
      job_id,
      action: "job_status_changed",
      actor_id: actor.id,
      actor_email: actor.email,
      payload: {
        from: job.status,
        to: newStatus,
        preflight_summary: { files: results.length, warnings: warnings.length, blocked },
      },
    });

    return json({
      job_id,
      status: blocked
        ? "preflight_blocked"
        : warnings.length
        ? "preflight_warnings"
        : "preflight_passed",
      files: results,
      warnings,
    });
  } catch (err) {
    console.error("[tr-preflight] fatal:", err);
    return json({ error: String(err) }, 500);
  }
});
