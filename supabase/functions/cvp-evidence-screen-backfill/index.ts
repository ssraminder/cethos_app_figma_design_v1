// ============================================================================
// cvp-evidence-screen-backfill  (2026-06-21)
//
// Re-screens applicant uploads that never got an AI screening. Many applicants
// uploaded degree/experience docs into their applicant vendor account
// (vendors.certifications) but screenEvidenceDocument never filed a QMS
// competence_evidence row for them (screening skipped/failed on upload). This
// walks APPLICANT-status vendors' certifications, skips any file that already
// has competence_evidence (by storage_path), downloads the rest, infers the
// mime from the extension, and runs the screener to file Tier-1
// ai_document_screen evidence — which then surfaces in the recruitment ISO panel.
//
// Secret-gated + dry_run + limit + throttle (AI-vision calls are slow/costly).
// Body: { secret, dry_run?, limit? }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { screenEvidenceDocument } from "../_shared/screen-evidence-document.ts";

const BUCKET = "vendor-certifications";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mimeFromPath(p: string): string {
  const l = p.toLowerCase();
  if (l.endsWith(".pdf")) return "application/pdf";
  if (l.endsWith(".png")) return "image/png";
  if (l.endsWith(".jpg") || l.endsWith(".jpeg")) return "image/jpeg";
  if (l.endsWith(".heic")) return "image/heic";
  if (l.endsWith(".webp")) return "image/webp";
  if (l.endsWith(".gif")) return "image/gif";
  if (l.endsWith(".docx")) return DOCX_MIME;
  return "application/octet-stream";
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
  }
  const body = await req.json().catch(() => ({}));
  if (body?.secret !== Deno.env.get("EVIDENCE_BACKFILL_SECRET")) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }
  const dryRun = body?.dry_run === true;
  const limit = Math.min(Math.max(1, Number(body?.limit ?? 25)), 50);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Files already screened (skip them) — by storage_path on competence_evidence.
  // Uses an RPC because qms schema is not exposed via PostgREST directly.
  const screened = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .rpc("qms_list_screened_storage_paths", { p_offset: offset, p_limit: 1000 });
    if (error) { console.error("backfill: screened-set query failed", error.message); break; }
    for (const r of data ?? []) if ((r as { storage_path: string }).storage_path) screened.add((r as { storage_path: string }).storage_path);
    if ((data ?? []).length < 1000) break;
  }

  // Walk APPLICANT vendors' uploaded certs; collect unscreened files.
  const entries: Array<{ vendor_id: string; full_name: string; cert_name: string; storage_path: string }> = [];
  for (let offset = 0; ; offset += 1000) {
    const { data: vendors, error } = await supabase
      .from("vendors")
      .select("id, full_name, certifications")
      .eq("status", "applicant")
      .not("certifications", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + 999);
    if (error) {
      return new Response(JSON.stringify({ error: "vendor_query_failed", detail: error.message }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }
    const batch = vendors ?? [];
    for (const v of batch) {
      const certs = Array.isArray((v as any).certifications) ? (v as any).certifications : [];
      for (const c of certs) {
        const sp = (c?.storage_path ?? "") as string;
        if (sp && !screened.has(sp)) {
          entries.push({ vendor_id: (v as any).id, full_name: (v as any).full_name ?? "", cert_name: c?.name ?? "Document", storage_path: sp });
        }
      }
    }
    if (batch.length < 1000) break;
  }

  const todo = entries.slice(0, limit);
  if (dryRun) {
    return new Response(JSON.stringify({ dry_run: true, total_unscreened: entries.length, would_process: todo.length, sample: todo.slice(0, 10) }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  // Process in concurrent batches of 6 to stay under the edge-function wall-time
  // while still saturating the AI-vision rate limit comfortably.
  const CONCURRENCY = 6;
  const results: Array<Record<string, unknown>> = [];
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(async (e) => {
      try {
        const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(e.storage_path);
        if (dlErr || !blob) return { storage_path: e.storage_path, ok: false, reason: dlErr?.message ?? "download_failed" };
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const fileName = e.storage_path.split("/").pop() ?? "document";
        await screenEvidenceDocument({
          supabase,
          vendorId: e.vendor_id,
          vendorName: e.full_name,
          claimedLabel: e.cert_name,
          bytes,
          fileName,
          fileMime: mimeFromPath(e.storage_path),
          storagePath: e.storage_path,
        });
        return { storage_path: e.storage_path, vendor: e.full_name, ok: true };
      } catch (err) {
        return { storage_path: e.storage_path, ok: false, reason: String(err) };
      }
    }));
    results.push(...batchResults);
    if (i + CONCURRENCY < todo.length) await sleep(300);
  }

  return new Response(JSON.stringify({ processed: results.length, remaining: entries.length - todo.length, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
