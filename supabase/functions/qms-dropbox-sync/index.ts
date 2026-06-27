/**
 * qms-dropbox-sync - Materialises the portal's QMS documents into the CETHOS
 * TEAM Dropbox.
 *
 * Two document families, both under /Cethos Team Folder/QMS/:
 *
 *   SOPs (markdown -> generated .docx):
 *     QMS/SOPs/SOP-001 - <Title>/
 *       SOP-001 v2.0 - <Title> -current.docx   (active version)
 *       SOP-001 v1.0 - <Title>.docx            (superseded version)
 *
 *   Manuals / controlled documents (real stored files copied as-is):
 *     QMS/Manuals/QM-001 - <Title>/
 *       QM-001 v5.0 - <Title> -current.docx
 *       QM-001 v4.0 - <Title>.docx
 *
 * Reconciliation is idempotent and keyed per version:
 *   - public.qms_dropbox_syncs        (sop_version_id)        for SOPs
 *   - public.qms_manual_dropbox_syncs (document_file_id)      for manuals
 * In both cases it ONLY ever touches files it created (tracked in the ledger),
 * so anything staff drop into these folders by hand is left untouched.
 *
 * Body: { sop_id?, document_id?, kind?: "sop"|"manual"|"all", limit? }
 *   - sop_id        -> reconcile that one SOP only
 *   - document_id   -> reconcile that one manual/document only
 *   - neither id    -> reconcile everything (kind filters which family); used by
 *                      the weekly cron. Default kind = "all".
 *   - limit (default 25 per family) caps work per call; `remaining` tells the
 *     caller whether to call again to drain the rest.
 */
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { crypto } from "https://deno.land/std@0.208.0/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.208.0/encoding/hex.ts";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { renderSopDocx, type SopMeta } from "../_shared/md-docx.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Bump to force every generated SOP doc to regenerate (e.g. layout changes).
const GENERATOR_VERSION = 1;
const SOPS_ROOT = "/Cethos Team Folder/QMS/SOPs";
const MANUALS_ROOT = "/Cethos Team Folder/QMS/Manuals";
const REGISTERS_ROOT = "/Cethos Team Folder/QMS/Registers";
const MANUALS_BUCKET = "portal-documents";
const DEFAULT_LIMIT = 25;

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** ASCII-escape a JSON object so it is safe in an HTTP header (ByteString). */
function headerSafeJson(obj: Record<string, unknown>): string {
  const raw = JSON.stringify(obj);
  let safe = "";
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    safe += code > 127 ? "\\u" + ("0000" + code.toString(16)).slice(-4) : raw[i];
  }
  return safe;
}

const RESERVED = /[\\/:*?"<>|]/g;
/** Sanitize a single path segment: strip reserved chars, collapse whitespace. */
function seg(s: string): string {
  return (s || "").replace(RESERVED, " ").replace(/\s+/g, " ").trim() || "untitled";
}

interface Ctx { supabase: any; accessToken: string; rootNs: string; }

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const APP_KEY = Deno.env.get("DROPBOX_APP_KEY");
    const APP_SECRET = Deno.env.get("DROPBOX_APP_SECRET");
    if (!APP_KEY || !APP_SECRET) return jsonResponse({ error: "Dropbox credentials not configured" }, 500);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: connection } = await supabase
      .from("dropbox_connections")
      .select("id, access_token, refresh_token, token_expires_at")
      .eq("purpose", "team").limit(1).maybeSingle();
    if (!connection) return jsonResponse({ skipped: true, reason: "Team Dropbox not connected" });

    const accessToken = await getValidAccessToken(supabase, connection, APP_KEY, APP_SECRET);
    if (!accessToken) return jsonResponse({ error: "Failed to get valid team Dropbox token" }, 500);

    const rootNs = await getRootNamespaceId(accessToken);
    if (!rootNs) return jsonResponse({ error: "Could not resolve team root namespace" }, 500);

    const ctx: Ctx = { supabase, accessToken, rootNs };
    const body = req.body ? await req.json().catch(() => ({})) : {};
    const limit = Math.max(1, Math.min(200, body.limit ?? DEFAULT_LIMIT));

    const out: Record<string, unknown> = { success: true };

    if (body.action === "scaffold_registers") {
      out.registers = await scaffoldRegisters(ctx, { force: !!body.force });
      return jsonResponse(out);
    }

    if (body.document_id) {
      out.manuals = await reconcileManuals(ctx, { document_id: body.document_id, limit });
    } else if (body.sop_id) {
      out.sops = await reconcileSops(ctx, { sop_id: body.sop_id, limit });
    } else {
      const kind = body.kind ?? "all";
      if (kind === "all" || kind === "sop") out.sops = await reconcileSops(ctx, { limit });
      if (kind === "all" || kind === "manual") out.manuals = await reconcileManuals(ctx, { limit });
    }
    return jsonResponse(out);
  } catch (err) {
    console.error("qms-dropbox-sync error:", err);
    return jsonResponse({ error: (err as Error).message || "Internal server error" }, 500);
  }
});

// ===========================================================================
// SOPs (markdown -> generated .docx)
// ===========================================================================

interface SopPlan {
  sop_id: string;
  version_id: string;
  meta: SopMeta;
  markdown: string;
  desiredPath: string;
  contentHash: string;
}

async function reconcileSops(ctx: Ctx, body: { sop_id?: string; limit: number }) {
  const generatedAt = new Date().toISOString();

  let sopQuery = ctx.supabase
    .from("sops")
    .select("id, sop_number, title, current_version_id, is_archived")
    .eq("is_archived", false);
  if (body.sop_id) sopQuery = sopQuery.eq("id", body.sop_id);
  const { data: sops, error: sopErr } = await sopQuery;
  if (sopErr) return { error: `load sops: ${sopErr.message}` };
  if (!sops?.length) return { processed: 0, remaining: 0, note: "no SOPs in scope" };

  const sopIds = sops.map((s: any) => s.id);
  const { data: versions, error: vErr } = await ctx.supabase
    .from("sop_versions")
    .select("id, sop_id, version_number, status, effective_date, approved_by_name, content_md")
    .in("sop_id", sopIds).neq("status", "draft");
  if (vErr) return { error: `load versions: ${vErr.message}` };

  const { data: ledger } = await ctx.supabase
    .from("qms_dropbox_syncs")
    .select("sop_version_id, dropbox_path, content_sha256, status")
    .in("sop_id", sopIds);
  const ledgerByVersion = new Map<string, any>((ledger ?? []).map((r: any) => [r.sop_version_id, r]));
  const sopById = new Map<string, any>(sops.map((s: any) => [s.id, s]));

  const plans: SopPlan[] = [];
  for (const v of versions ?? []) {
    const sop = sopById.get(v.sop_id);
    if (!sop) continue;
    const isCurrent = sop.current_version_id === v.id;
    const versionLabel = `v${v.version_number}.0`;
    const folder = `${sop.sop_number} - ${seg(sop.title)}`;
    const filename = `${sop.sop_number} ${versionLabel} - ${seg(sop.title)}${isCurrent ? " -current" : ""}.docx`;
    const desiredPath = `${SOPS_ROOT}/${folder}/${filename}`;
    const meta: SopMeta = {
      number: sop.sop_number, title: sop.title, versionLabel, status: v.status,
      effectiveDate: v.effective_date, isCurrent, approvedBy: v.approved_by_name, generatedAt,
    };
    const hashInput = [
      `gen:${GENERATOR_VERSION}`, sop.sop_number, sop.title, versionLabel,
      v.status, v.effective_date ?? "", String(isCurrent), v.approved_by_name ?? "",
      v.content_md ?? "",
    ].join("\n");
    plans.push({
      sop_id: v.sop_id, version_id: v.id, meta, markdown: v.content_md ?? "",
      desiredPath, contentHash: await sha256Hex(hashInput),
    });
  }

  const dirty = plans.filter((p) => {
    const row = ledgerByVersion.get(p.version_id);
    if (!row || row.status !== "synced") return true;
    return row.content_sha256 !== p.contentHash || row.dropbox_path !== p.desiredPath;
  });

  const slice = dirty.slice(0, body.limit);
  const results: any[] = [];

  for (const p of slice) {
    const row = ledgerByVersion.get(p.version_id);
    const oldPath: string | null = row?.dropbox_path ?? null;
    const contentChanged = !row || row.status !== "synced" || row.content_sha256 !== p.contentHash;
    const pathChanged = !!oldPath && oldPath !== p.desiredPath;
    try {
      await ensurePath(ctx, p.desiredPath.slice(0, p.desiredPath.lastIndexOf("/")));
      let bytes = 0;
      let contentHashHeader: string | undefined;
      if (contentChanged) {
        const docx = await renderSopDocx(p.meta, p.markdown);
        const up = await dbxUpload(ctx, p.desiredPath, docx);
        bytes = docx.length; contentHashHeader = up.content_hash;
        if (pathChanged && oldPath) await dbxDelete(ctx, oldPath);
      } else if (pathChanged && oldPath) {
        await dbxMove(ctx, oldPath, p.desiredPath);
      }
      await ctx.supabase.from("qms_dropbox_syncs").upsert({
        sop_id: p.sop_id, sop_version_id: p.version_id, dropbox_path: p.desiredPath,
        content_sha256: p.contentHash, generator_version: GENERATOR_VERSION, status: "synced",
        file_size_bytes: contentChanged ? bytes : (row?.file_size_bytes ?? null),
        dropbox_content_hash: contentHashHeader ?? row?.dropbox_content_hash ?? null,
        error_message: null, synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: "sop_version_id" });
      results.push({ version_id: p.version_id, path: p.desiredPath, action: contentChanged ? "written" : "renamed" });
    } catch (e) {
      await ctx.supabase.from("qms_dropbox_syncs").upsert({
        sop_id: p.sop_id, sop_version_id: p.version_id, dropbox_path: p.desiredPath,
        content_sha256: row?.content_sha256 ?? null, generator_version: GENERATOR_VERSION,
        status: "failed", error_message: (e as Error).message, updated_at: new Date().toISOString(),
      }, { onConflict: "sop_version_id" });
      results.push({ version_id: p.version_id, path: p.desiredPath, error: (e as Error).message });
    }
  }

  // Best-effort: remove the empty bare "SOP-NNN" stub folders (we use the
  // descriptive "SOP-NNN - Title" form). Only on a full scan, only if empty.
  if (!body.sop_id) {
    for (const s of sops) await dbxDeleteIfEmpty(ctx, `${SOPS_ROOT}/${s.sop_number}`);
  }

  return {
    scope: body.sop_id ? `sop ${body.sop_id}` : "all",
    versions_total: plans.length, processed: results.length,
    remaining: Math.max(0, dirty.length - slice.length), results,
  };
}

// ===========================================================================
// Manuals / controlled documents (real stored files copied as-is)
// ===========================================================================

interface ManualPlan {
  document_id: string;
  file_id: string;
  storage_path: string;
  desiredPath: string;
}

async function reconcileManuals(ctx: Ctx, body: { document_id?: string; limit: number }) {
  let docQuery = ctx.supabase
    .from("portal_documents")
    .select("id, doc_code, title, current_file_id, is_published, is_archived")
    .eq("is_published", true).eq("is_archived", false);
  if (body.document_id) docQuery = docQuery.eq("id", body.document_id);
  const { data: docs, error: dErr } = await docQuery;
  if (dErr) return { error: `load documents: ${dErr.message}` };
  if (!docs?.length) return { processed: 0, remaining: 0, note: "no documents in scope" };

  const docIds = docs.map((d: any) => d.id);
  const { data: files, error: fErr } = await ctx.supabase
    .from("portal_document_files")
    .select("id, document_id, version, storage_path, file_name, is_current")
    .in("document_id", docIds);
  if (fErr) return { error: `load document files: ${fErr.message}` };

  const { data: ledger } = await ctx.supabase
    .from("qms_manual_dropbox_syncs")
    .select("document_file_id, dropbox_path, status")
    .in("document_id", docIds);
  const ledgerByFile = new Map<string, any>((ledger ?? []).map((r: any) => [r.document_file_id, r]));
  const docById = new Map<string, any>(docs.map((d: any) => [d.id, d]));

  const plans: ManualPlan[] = [];
  for (const f of files ?? []) {
    const doc = docById.get(f.document_id);
    if (!doc || !f.storage_path) continue;
    const isCurrent = doc.current_file_id ? doc.current_file_id === f.id : !!f.is_current;
    const code = doc.doc_code ? `${doc.doc_code} ` : "";
    const folder = `${doc.doc_code ? doc.doc_code + " - " : ""}${seg(doc.title)}`;
    const dot = (f.file_name || "").lastIndexOf(".");
    const ext = dot > 0 ? f.file_name.slice(dot) : "";
    const base = `${code}v${f.version} - ${seg(doc.title)}`;
    const filename = `${seg(base)}${isCurrent ? " -current" : ""}${ext}`;
    plans.push({
      document_id: f.document_id, file_id: f.id, storage_path: f.storage_path,
      desiredPath: `${MANUALS_ROOT}/${folder}/${filename}`,
    });
  }

  // A document file row is immutable (new version = new row), so a synced row at
  // the right path needs nothing; a path mismatch is a rename (current pointer
  // moved or the title changed) and needs no re-download.
  const dirty = plans.filter((p) => {
    const row = ledgerByFile.get(p.file_id);
    if (!row || row.status !== "synced") return true;
    return row.dropbox_path !== p.desiredPath;
  });

  const slice = dirty.slice(0, body.limit);
  const results: any[] = [];

  for (const p of slice) {
    const row = ledgerByFile.get(p.file_id);
    const oldPath: string | null = row?.dropbox_path ?? null;
    const needsUpload = !row || row.status !== "synced";
    const pathChanged = !!oldPath && oldPath !== p.desiredPath;
    try {
      await ensurePath(ctx, p.desiredPath.slice(0, p.desiredPath.lastIndexOf("/")));
      let size = row?.file_size_bytes ?? null;
      let sha = row?.content_sha256 ?? null;
      let contentHashHeader = row?.dropbox_content_hash ?? null;
      if (needsUpload) {
        const bytes = await downloadFromStorage(ctx, MANUALS_BUCKET, p.storage_path);
        sha = await sha256HexBytes(bytes);
        const up = await dbxUpload(ctx, p.desiredPath, bytes);
        size = bytes.length; contentHashHeader = up.content_hash ?? null;
        if (pathChanged && oldPath) await dbxDelete(ctx, oldPath);
      } else if (pathChanged && oldPath) {
        await dbxMove(ctx, oldPath, p.desiredPath);
      }
      await ctx.supabase.from("qms_manual_dropbox_syncs").upsert({
        document_id: p.document_id, document_file_id: p.file_id, dropbox_path: p.desiredPath,
        content_sha256: sha, status: "synced", file_size_bytes: size,
        dropbox_content_hash: contentHashHeader, error_message: null,
        synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: "document_file_id" });
      results.push({ file_id: p.file_id, path: p.desiredPath, action: needsUpload ? "written" : "renamed" });
    } catch (e) {
      await ctx.supabase.from("qms_manual_dropbox_syncs").upsert({
        document_id: p.document_id, document_file_id: p.file_id, dropbox_path: p.desiredPath,
        status: "failed", error_message: (e as Error).message, updated_at: new Date().toISOString(),
      }, { onConflict: "document_file_id" });
      results.push({ file_id: p.file_id, path: p.desiredPath, error: (e as Error).message });
    }
  }

  return {
    scope: body.document_id ? `document ${body.document_id}` : "all",
    versions_total: plans.length, processed: results.length,
    remaining: Math.max(0, dirty.length - slice.length), results,
  };
}

// ===========================================================================
// QMS registers (one-time Excel scaffolds, seeded from current portal data)
// ===========================================================================

type Col = { key: string; label: string };

const QUAL_SUMMARY_COLS: Col[] = [
  { key: "full_name", label: "Linguist" }, { key: "email", label: "Email" },
  { key: "country", label: "Country" }, { key: "qualified_roles", label: "Qualified roles" },
  { key: "under_review_roles", label: "Under review" }, { key: "suspended_roles", label: "Suspended" },
  { key: "active_verified_evidence_count", label: "Verified evidence #" },
  { key: "has_active_nda", label: "Active NDA" }, { key: "nda_next_expiry", label: "NDA next expiry" },
  { key: "next_re_qualification_due", label: "Next re-qualification due" },
];
const ROLE_QUAL_COLS: Col[] = [
  { key: "vendor", label: "Linguist" }, { key: "email", label: "Email" }, { key: "country", label: "Country" },
  { key: "role", label: "Role" }, { key: "competence_basis", label: "Competence basis" },
  { key: "iso_clause", label: "ISO clause" }, { key: "status", label: "Status" },
  { key: "qualified_at", label: "Qualified at" }, { key: "qualified_by", label: "Qualified by" },
  { key: "last_re_qualified_at", label: "Last re-qualified" }, { key: "re_qualification_due", label: "Re-qual due" },
  { key: "notes", label: "Notes" },
];
const LP_COLS: Col[] = [
  { key: "vendor", label: "Linguist" }, { key: "role", label: "Role" },
  { key: "source", label: "Source" }, { key: "target", label: "Target" },
  { key: "direction", label: "Direction" }, { key: "notes", label: "Notes" },
];
const EVID_COLS: Col[] = [
  { key: "vendor", label: "Linguist" }, { key: "evidence_type", label: "Evidence type" },
  { key: "title", label: "Title" }, { key: "issuing_organization", label: "Issuing org" },
  { key: "issuing_country", label: "Issuing country" }, { key: "issued_date", label: "Issued" },
  { key: "expiry_date", label: "Expiry" }, { key: "verified", label: "Verified" },
  { key: "verified_by", label: "Verified by" }, { key: "verified_at", label: "Verified at" },
  { key: "verification_method", label: "Method" }, { key: "file_name", label: "File" },
];
const CAPA_COLS: Col[] = [
  { key: "capa_number", label: "CAPA #" }, { key: "nc_number", label: "NC #" },
  { key: "action_type", label: "Type" }, { key: "description", label: "Description" },
  { key: "owner", label: "Owner" }, { key: "due_date", label: "Due" }, { key: "status", label: "Status" },
  { key: "completed_at", label: "Completed" }, { key: "effectiveness_result", label: "Effectiveness" },
  { key: "effectiveness_checked_at", label: "Effectiveness checked" },
];
const COMPLAINT_COLS: Col[] = [
  { key: "complaint_number", label: "Complaint #" }, { key: "source", label: "Source" },
  { key: "received_at", label: "Received" }, { key: "received_via", label: "Via" },
  { key: "complainant", label: "Complainant" }, { key: "category", label: "Category" },
  { key: "severity", label: "Severity" }, { key: "summary", label: "Summary" },
  { key: "status", label: "Status" }, { key: "vendor", label: "Linguist" },
  { key: "resolution_note", label: "Resolution" }, { key: "resolved_at", label: "Resolved" },
];
const NC_COLS: Col[] = [
  { key: "nc_number", label: "NC #" }, { key: "title", label: "Title" },
  { key: "description", label: "Description" }, { key: "source", label: "Source" },
  { key: "vendor", label: "Linguist" }, { key: "severity", label: "Severity" },
  { key: "discovered_at", label: "Discovered" }, { key: "root_cause", label: "Root cause" },
  { key: "status", label: "Status" }, { key: "closure_summary", label: "Closure" },
  { key: "closed_at", label: "Closed" }, { key: "attributed_to_vendor", label: "Attributed to vendor" },
];
const PERF_COLS: Col[] = [
  { key: "vendor", label: "Linguist" }, { key: "event_type", label: "Event" },
  { key: "severity", label: "Severity" }, { key: "occurred_at", label: "Occurred" },
  { key: "recorded_at", label: "Recorded" }, { key: "project_reference", label: "Project" },
  { key: "description", label: "Description" },
];
const TRAINING_COLS: Col[] = [
  { key: "full_name", label: "Person" }, { key: "email", label: "Email" },
  { key: "role", label: "Role" }, { key: "job_title", label: "Job title" },
  { key: "training_module", label: "Training / module" }, { key: "provider", label: "Provider" },
  { key: "completed_date", label: "Completed date" }, { key: "result_score", label: "Result / score" },
  { key: "verified_by", label: "Verified by" }, { key: "evidence_link", label: "Evidence link" },
  { key: "notes", label: "Notes" },
];

function cell(v: unknown): string | number | boolean {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return v;
  return String(v);
}

/** Build one sheet (array-of-arrays): banner + note + header + data rows. */
function sheet(name: string, cols: Col[], rows: any[], note: string) {
  const aoa: any[][] = [];
  aoa.push([`Cethos QMS — ${name}`]);
  aoa.push([note]);
  aoa.push([]);
  aoa.push(cols.map((c) => c.label));
  for (const r of rows ?? []) aoa.push(cols.map((c) => cell(r[c.key])));
  return { name: name.slice(0, 31), aoa };
}

function buildXlsx(sheets: { name: string; aoa: any[][] }[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.aoa);
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

async function scaffoldRegisters(ctx: Ctx, opts: { force: boolean }) {
  const { data, error } = await ctx.supabase.rpc("qms_register_export");
  if (error) return { error: `qms_register_export: ${error.message}` };
  const gen = String(data.generated_at ?? new Date().toISOString());
  const stamp = `Seeded from the Cethos portal on ${gen}. ONE-TIME SCAFFOLD — maintain manually; the portal remains the source of truth for live data. Backfill pre-portal records on the "Legacy (pre-portal)" sheet.`;

  const workbooks: { filename: string; sheets: { name: string; aoa: any[][] }[] }[] = [
    {
      filename: "Qualification Register (ISO 6.1).xlsx",
      sheets: [
        sheet("Linguist Summary", QUAL_SUMMARY_COLS, data.qualification_summary, stamp),
        sheet("Role Qualifications", ROLE_QUAL_COLS, data.role_qualifications, stamp),
        sheet("Language-Pair Quals", LP_COLS, data.language_pairs, stamp),
        sheet("Competence Evidence", EVID_COLS, data.competence_evidence, stamp),
        sheet("Legacy (pre-portal)", QUAL_SUMMARY_COLS, [], "Enter pre-portal qualification records here. Not synced — yours to maintain."),
      ],
    },
    {
      filename: "Quality-Event Registers.xlsx",
      sheets: [
        sheet("CAPA", CAPA_COLS, data.capa, stamp),
        sheet("Complaints", COMPLAINT_COLS, data.complaints, stamp),
        sheet("Nonconformities", NC_COLS, data.nonconformities, stamp),
        sheet("Performance Events", PERF_COLS, data.performance, stamp),
        sheet("Legacy (pre-portal)", NC_COLS, [], "Enter pre-portal quality events (CAPA / complaints / NCs) here. Not synced — yours to maintain."),
      ],
    },
    {
      filename: "Training Register (template).xlsx",
      sheets: [
        sheet("Training Records", TRAINING_COLS, data.staff, "Template seeded with active staff. Fill in training/module, dates, results. Portal training tables are currently empty."),
        sheet("Legacy (pre-portal)", TRAINING_COLS, [], "Enter pre-portal training records here. Not synced — yours to maintain."),
      ],
    },
  ];

  const results: any[] = [];
  for (const wb of workbooks) {
    const path = `${REGISTERS_ROOT}/${wb.filename}`;
    try {
      if (!opts.force && (await dbxExists(ctx, path))) {
        results.push({ path, action: "skipped (exists)" });
        continue;
      }
      await ensurePath(ctx, REGISTERS_ROOT);
      const bytes = buildXlsx(wb.sheets);
      await dbxUpload(ctx, path, bytes);
      results.push({ path, action: "written", bytes: bytes.length });
    } catch (e) {
      results.push({ path, error: (e as Error).message });
    }
  }
  return { generated_at: gen, results };
}

// ===========================================================================
// Dropbox + storage helpers (team root namespace)
// ===========================================================================

function pathRootHeader(rootNs: string): string {
  return JSON.stringify({ ".tag": "root", root: rootNs });
}

async function dbxCreateFolder(ctx: Ctx, path: string): Promise<void> {
  try {
    const res = await fetch("https://api.dropboxapi.com/2/files/create_folder_v2", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "Content-Type": "application/json",
        "Dropbox-API-Path-Root": pathRootHeader(ctx.rootNs),
      },
      body: JSON.stringify({ path, autorename: false }),
    });
    if (!res.ok) {
      const err = await res.json();
      if (err?.error?.[".tag"] !== "path" || err.error.path?.[".tag"] !== "conflict") {
        console.warn(`[createFolder] ${path}:`, JSON.stringify(err));
      }
    }
  } catch (e) {
    console.warn(`[createFolder] ${path} threw:`, (e as Error).message);
  }
}

async function dbxMove(ctx: Ctx, from: string, to: string): Promise<boolean> {
  const res = await fetch("https://api.dropboxapi.com/2/files/move_v2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      "Content-Type": "application/json",
      "Dropbox-API-Path-Root": pathRootHeader(ctx.rootNs),
    },
    body: JSON.stringify({ from_path: from, to_path: to, autorename: false }),
  });
  if (res.ok) return true;
  const err = await res.json().catch(() => ({}));
  if (JSON.stringify(err).includes("not_found")) return true; // nothing to move
  console.warn(`[move] ${from} -> ${to}:`, JSON.stringify(err));
  return false;
}

async function dbxDelete(ctx: Ctx, path: string): Promise<void> {
  try {
    const res = await fetch("https://api.dropboxapi.com/2/files/delete_v2", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "Content-Type": "application/json",
        "Dropbox-API-Path-Root": pathRootHeader(ctx.rootNs),
      },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) {
      const err = await res.text();
      if (!err.includes("not_found")) console.warn(`[delete] ${path}:`, err);
    }
  } catch (e) {
    console.warn(`[delete] ${path} threw:`, (e as Error).message);
  }
}

/** Delete a folder only if it has no children (safe stub cleanup). */
async function dbxDeleteIfEmpty(ctx: Ctx, path: string): Promise<void> {
  try {
    const res = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "Content-Type": "application/json",
        "Dropbox-API-Path-Root": pathRootHeader(ctx.rootNs),
      },
      body: JSON.stringify({ path, limit: 1 }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.entries) && data.entries.length === 0) await dbxDelete(ctx, path);
  } catch (e) {
    console.warn(`[deleteIfEmpty] ${path} threw:`, (e as Error).message);
  }
}

/** True if a file/folder already exists at this path. */
async function dbxExists(ctx: Ctx, path: string): Promise<boolean> {
  const res = await fetch("https://api.dropboxapi.com/2/files/get_metadata", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      "Content-Type": "application/json",
      "Dropbox-API-Path-Root": pathRootHeader(ctx.rootNs),
    },
    body: JSON.stringify({ path }),
  });
  return res.ok;
}

async function dbxUpload(ctx: Ctx, path: string, bytes: Uint8Array): Promise<{ content_hash?: string }> {
  const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Path-Root": pathRootHeader(ctx.rootNs),
      "Dropbox-API-Arg": headerSafeJson({ path, mode: "overwrite", autorename: false, mute: true }),
    },
    body: bytes,
  });
  if (!res.ok) throw new Error(`Dropbox upload failed (${res.status}): ${await res.text()}`);
  return await res.json();
}

/** Create a folder + all missing parents, top-down. */
async function ensurePath(ctx: Ctx, fullPath: string): Promise<void> {
  const parts = fullPath.split("/").filter(Boolean);
  let cur = "";
  for (const p of parts) {
    cur += "/" + p;
    await dbxCreateFolder(ctx, cur);
  }
}

async function downloadFromStorage(ctx: Ctx, bucket: string, path: string): Promise<Uint8Array> {
  const { data, error } = await ctx.supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`storage download failed (${bucket}/${path}): ${error?.message || "no data"}`);
  return new Uint8Array(await data.arrayBuffer());
}

async function getValidAccessToken(supabase: any, conn: any, appKey: string, appSecret: string): Promise<string | null> {
  const exp = conn.token_expires_at ? new Date(conn.token_expires_at) : null;
  if (exp && exp.getTime() > Date.now() + 60_000) return conn.access_token;
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token", refresh_token: conn.refresh_token,
      client_id: appKey, client_secret: appSecret,
    }),
  });
  if (!res.ok) { console.error("Team token refresh failed:", await res.text()); return null; }
  const tokens = await res.json();
  await supabase.from("dropbox_connections").update({
    access_token: tokens.access_token,
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", conn.id);
  return tokens.access_token;
}

async function getRootNamespaceId(accessToken: string): Promise<string | null> {
  const res = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const acct = await res.json();
  return acct?.root_info?.root_namespace_id ?? acct?.root_info?.home_namespace_id ?? null;
}

async function sha256Hex(s: string): Promise<string> {
  return encodeHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
}
async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  return encodeHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}
