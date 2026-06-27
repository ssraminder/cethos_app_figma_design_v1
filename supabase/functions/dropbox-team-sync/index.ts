/**
 * dropbox-team-sync - Syncs order files into the CETHOS TEAM Dropbox using a
 * per-workflow folder structure.
 *
 * Differs from the legacy `dropbox-sync`:
 *   - uses the `purpose='team'` connection (Cethos team account)
 *   - writes into the team root namespace via Dropbox-API-Path-Root
 *   - builds the folder tree from the order's ACTUAL workflow steps + a generic
 *     pre-workflow shell (00_Admin / 01_Source / 02_Reference) + 90_Delivery
 *     (+ 95_Certification), so the structure matches each workflow in practice
 *   - logs every file to `dropbox_file_syncs` with `target='team'`
 *
 * Actions:
 *   backfill_order      - build the tree + sync the full ISO record for one order
 *   sync_order_file     - single-file lifecycle sync (used by the shared trigger)
 *   ensure_step_folder  - create one step's folder (add-step wiring)
 *   archive_step_folder - move a step's folder to {order}/_Archive (remove-step)
 *   share_folder        - create a shared link for a folder
 *   check_status        - team sync status for an order
 */
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { crypto } from "https://deno.land/std@0.208.0/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.208.0/encoding/hex.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

// File-category -> folder routing (UUIDs are stable; slugs/labels are not).
const CAT = {
  to_translate: "45cb02ba-fca5-423a-8cb9-6ad807ad3bbc", // label "To Process"
  source: "85e2ac91-9c80-4983-8fc6-e6ed340e4663",
  reference: "f1aed462-a25f-4dd0-96c0-f952c3a72950",
  glossary: "481fc982-6bdd-40e4-8f9a-91c4c4b7615e",
  style_guide: "222e2fc8-2f6b-4708-8f5d-c59cd5ece4c7",
  work_files: "aa7c2f54-d075-4864-9362-fbb3547cb37d",
  final_deliverable: "22e6b243-2cbf-4c81-87ef-7684e6b9a90e",
  draft_translation: "66b8b5f2-fea8-4a10-888b-7f2e5ee08c21",
  draft: "4fe849da-b229-4bf5-8876-8d8efbd0f814",
};
const SOURCE_CATS = new Set([CAT.to_translate, CAT.source]);
const REFERENCE_CATS = new Set([CAT.reference, CAT.glossary, CAT.style_guide, CAT.work_files]);
const FINAL_CATS = new Set([CAT.final_deliverable]);
const DRAFT_CATS = new Set([CAT.draft_translation, CAT.draft]);

const SHELL = {
  admin: "00_Admin",
  source: "01_Source",
  reference: "02_Reference",
  client_review: "05_Client-Review",
  delivery: "90_Delivery",
  certification: "95_Certification",
  archive: "_Archive",
};

// Team-space members cannot write at the team-space ROOT (only admins can
// create top-level folders there) -> path/no_write_permission. So the whole
// project tree lives INSIDE the team folder. With Dropbox-API-Path-Root set to
// the team-space root namespace, this name navigates into the team folder.
const TEAM_ROOT = "/Cethos Team Folder";

// Dropbox-reserved characters only; keep hyphens (order numbers, dates).
const RESERVED = /[\\/:*?"<>|]/g;
/** Sanitize a single path segment: strip reserved chars, collapse whitespace. */
function seg(s: string): string {
  return (s || "").replace(RESERVED, " ").replace(/\s+/g, " ").trim() || "untitled";
}
/** Step folder slug: real step name, hyphenated, ASCII-safe. */
function stepSlug(name: string): string {
  return seg(name).replace(/\s+/g, "-");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const APP_KEY = Deno.env.get("DROPBOX_APP_KEY");
    const APP_SECRET = Deno.env.get("DROPBOX_APP_SECRET");
    if (!APP_KEY || !APP_SECRET) {
      return jsonResponse({ error: "Dropbox credentials not configured" }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: connection } = await supabase
      .from("dropbox_connections")
      .select("id, access_token, refresh_token, token_expires_at")
      .eq("purpose", "team")
      .limit(1)
      .maybeSingle();

    if (!connection) {
      return jsonResponse({ skipped: true, reason: "Team Dropbox not connected" });
    }

    const accessToken = await getValidAccessToken(supabase, connection, APP_KEY, APP_SECRET);
    if (!accessToken) return jsonResponse({ error: "Failed to get valid team Dropbox token" }, 500);

    const rootNs = await getRootNamespaceId(accessToken);
    if (!rootNs) return jsonResponse({ error: "Could not resolve team root namespace" }, 500);

    const ctx: Ctx = { supabase, accessToken, rootNs };
    const body = await req.json();

    switch (body.action) {
      case "backfill_order": return await backfillOrder(ctx, body);
      case "sync_order_file": return await syncOrderFile(ctx, body);
      case "ensure_step_folder": return await ensureStepFolder(ctx, body);
      case "archive_step_folder": return await archiveStepFolder(ctx, body);
      case "share_folder": return await shareFolder(ctx, body);
      case "check_status": return await checkStatus(ctx, body);
      default: return jsonResponse({ error: "Invalid action" }, 400);
    }
  } catch (err) {
    console.error("dropbox-team-sync error:", err);
    return jsonResponse({ error: (err as Error).message || "Internal server error" }, 500);
  }
});

interface Ctx { supabase: any; accessToken: string; rootNs: string; }

// Dropbox helpers (all scoped to the team root namespace).

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
      // conflict = already exists = fine
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
    body: JSON.stringify({ from_path: from, to_path: to, autorename: true }),
  });
  if (res.ok) return true;
  const err = await res.json().catch(() => ({}));
  // not_found at source = nothing to move = treat as success (idempotent)
  if (JSON.stringify(err).includes("not_found")) return true;
  console.warn(`[move] ${from} -> ${to}:`, JSON.stringify(err));
  return false;
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

// Token + namespace.

async function getValidAccessToken(supabase: any, conn: any, appKey: string, appSecret: string): Promise<string | null> {
  const exp = conn.token_expires_at ? new Date(conn.token_expires_at) : null;
  if (exp && exp.getTime() > Date.now() + 60_000) return conn.access_token;

  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token,
      client_id: appKey,
      client_secret: appSecret,
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

// Order path + step-folder derivation.

interface OrderMeta {
  order: any; basePath: string; serviceName: string;
  srcCode: string; tgtCode: string; clientName: string;
  projectNumber: string | null; clientProjectCode: string | null; orderDate: string;
}

async function resolveOrder(ctx: Ctx, orderId: string): Promise<OrderMeta | null> {
  const { data: order } = await ctx.supabase
    .from("orders")
    .select("id, order_number, internal_project_id, customer_id, quote_id, service_id, created_at, client_project_number")
    .eq("id", orderId).maybeSingle();
  if (!order?.order_number) return null;

  const orderDate = (order.created_at ? new Date(order.created_at) : new Date()).toISOString().slice(0, 10);

  let projectNumber: string | null = null;
  let clientProjectCode: string | null = order.client_project_number ?? null;
  if (order.internal_project_id) {
    const { data: p } = await ctx.supabase.from("internal_projects")
      .select("project_number, client_project_number").eq("id", order.internal_project_id).maybeSingle();
    projectNumber = p?.project_number ?? null;
    clientProjectCode = clientProjectCode ?? p?.client_project_number ?? null;
  }

  let companyName = "", fullName = "";
  if (order.customer_id) {
    const { data: c } = await ctx.supabase.from("customers")
      .select("company_name, full_name").eq("id", order.customer_id).maybeSingle();
    companyName = c?.company_name ?? ""; fullName = c?.full_name ?? "";
  }

  let serviceName = "Order";
  if (order.service_id) {
    const { data: s } = await ctx.supabase.from("services").select("name").eq("id", order.service_id).maybeSingle();
    if (s?.name) serviceName = s.name;
  }

  let srcCode = "", tgtCode = "";
  if (order.quote_id) {
    const { data: q } = await ctx.supabase.from("quotes")
      .select("source_language_id, target_language_id").eq("id", order.quote_id).maybeSingle();
    const ids = [q?.source_language_id, q?.target_language_id].filter(Boolean);
    if (ids.length) {
      const { data: langs } = await ctx.supabase.from("languages").select("id, code").in("id", ids);
      const map = new Map((langs ?? []).map((l: any) => [l.id, l.code]));
      srcCode = (map.get(q?.source_language_id) as string) ?? "";
      tgtCode = (map.get(q?.target_language_id) as string) ?? "";
    }
  }

  const langPair = [srcCode, tgtCode].filter(Boolean).join("-") || "xx";
  const orderFolder = `${order.order_number} - ${seg(serviceName)} - ${seg(langPair)} - ${orderDate}`;

  let basePath: string;
  if (companyName) {
    const client = seg(companyName);
    const projectFolder = projectNumber
      ? `${projectNumber}${clientProjectCode ? " - " + seg(clientProjectCode) : ""}`
      : "_No-Project";
    basePath = `${TEAM_ROOT}/01_Clients/${client}/${seg(projectFolder)}/${seg(orderFolder)}`;
  } else {
    const ind = `${order.order_number} - ${seg(fullName || "Individual")} - ${seg(tgtCode || "xx")} - ${orderDate}`;
    basePath = `${TEAM_ROOT}/02_Certified-Individuals/${seg(ind)}`;
  }

  return {
    order, basePath, serviceName, srcCode, tgtCode,
    clientName: companyName || fullName || "Unknown Client",
    projectNumber, clientProjectCode, orderDate,
  };
}

interface StepFolder { step: any; folder: string | null; }

/** Decide each step's folder. Final Deliverable -> 90_Delivery; create only when
 *  create_dropbox_folder=true OR (NULL AND file-bearing step). */
function stepFolderFor(step: any): string | null {
  // EVERY workflow step gets its own numbered folder; deliveries are versioned
  // (v1, v2, ...) inside it, so the artifact at each stage (vendor output,
  // QA-approved copy, released copy) is a retained, hashed record. The per-step
  // create_dropbox_folder flag, only when explicitly false, opts out (a rare
  // sign-off-only step you don't want a folder for).
  if (step.create_dropbox_folder === false) return null;
  const nn = String(step.step_number * 10).padStart(2, "0");
  return `${nn}_${stepSlug((step.name || "").trim())}`;
}

async function loadSteps(ctx: Ctx, orderId: string): Promise<any[]> {
  const { data } = await ctx.supabase.from("order_workflow_steps")
    .select("id, step_number, name, actor_type, status, vendor_id, assigned_staff_id, approved_at, delivered_at, create_dropbox_folder, final_delivery_id")
    .eq("order_id", orderId).neq("status", "cancelled").order("step_number");
  return data ?? [];
}

// File sync (download from Supabase, upload to team Dropbox, log).

function quoteFileBucket(categoryId: string | null, storagePath: string): string {
  if (categoryId === CAT.reference) return "quote-reference-files";
  if (storagePath && !storagePath.includes("/")) return "ocr-uploads";
  return "quote-files";
}

async function alreadySynced(ctx: Ctx, dropboxPath: string): Promise<boolean> {
  // Dedup by DESTINATION: the same source artifact legitimately appears in
  // multiple stage folders (Cognitive Debriefing, QA Review, Final Deliverable),
  // so "already synced" means this exact Dropbox path is already there.
  const { data } = await ctx.supabase.from("dropbox_file_syncs")
    .select("id").eq("dropbox_path", dropboxPath)
    .eq("target", "team").eq("status", "synced").maybeSingle();
  return !!data;
}

async function syncOne(ctx: Ctx, args: {
  source_bucket: string; source_path: string; dropbox_path: string; sync_trigger: string;
  fallback_buckets?: string[];
  order_id?: string; quote_id?: string; quote_file_id?: string; step_delivery_id?: string;
}): Promise<{ ok: boolean; skipped?: boolean; sha256?: string; size?: number; error?: string; dropbox_path: string }> {
  const { source_bucket, source_path, dropbox_path, sync_trigger } = args;

  if (await alreadySynced(ctx, dropbox_path)) {
    return { ok: true, skipped: true, dropbox_path };
  }

  const { data: rec, error: insErr } = await ctx.supabase.from("dropbox_file_syncs").insert({
    source_bucket, source_path, dropbox_path, sync_trigger, target: "team",
    order_id: args.order_id, quote_id: args.quote_id, quote_file_id: args.quote_file_id,
    step_delivery_id: args.step_delivery_id, status: "pending",
  }).select("id").single();
  if (insErr) return { ok: false, error: `audit insert failed: ${insErr.message}`, dropbox_path };

  try {
    // The bucket recorded on a delivery isn't always where the file lives: vendor
    // deliveries land in `vendor-deliveries`, staff deliveries (same workflows/…
    // path) land in `quote-files`. Try the primary bucket, then any fallbacks, and
    // record whichever actually held the object.
    const buckets = [source_bucket, ...(args.fallback_buckets ?? [])];
    let file: any = null, usedBucket = source_bucket, lastErr = "no data";
    for (const b of buckets) {
      const { data, error } = await ctx.supabase.storage.from(b).download(source_path);
      if (!error && data) { file = data; usedBucket = b; break; }
      lastErr = error?.message || "no data";
    }
    if (!file) throw new Error(`download failed: ${lastErr}`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = encodeHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
    const up = await dbxUpload(ctx, dropbox_path, bytes);
    await ctx.supabase.from("dropbox_file_syncs").update({
      status: "synced", source_bucket: usedBucket, sha256_hash: sha256, file_size_bytes: bytes.length,
      dropbox_content_hash: up.content_hash, synced_at: new Date().toISOString(),
    }).eq("id", rec.id);
    return { ok: true, sha256, size: bytes.length, dropbox_path };
  } catch (e) {
    await ctx.supabase.from("dropbox_file_syncs").update({
      status: "failed", error_message: (e as Error).message, retry_count: 1,
    }).eq("id", rec.id);
    return { ok: false, error: (e as Error).message, dropbox_path };
  }
}

// Actions.

async function backfillOrder(ctx: Ctx, body: { order_id: string }) {
  const meta = await resolveOrder(ctx, body.order_id);
  if (!meta) return jsonResponse({ skipped: true, reason: "Could not resolve order" });

  const steps = await loadSteps(ctx, body.order_id);
  const stepFolders: StepFolder[] = steps.map((s) => ({ step: s, folder: stepFolderFor(s) }));

  // 1) Generic shell + a folder for every workflow step.
  await ensurePath(ctx, `${meta.basePath}/${SHELL.admin}`);
  await ensurePath(ctx, `${meta.basePath}/${SHELL.source}`);
  await ensurePath(ctx, `${meta.basePath}/${SHELL.reference}`);
  for (const sf of stepFolders) {
    if (sf.folder) await ensurePath(ctx, `${meta.basePath}/${sf.folder}`);
  }
  // Quote-file finals/drafts (certified-style orders) route to the matching
  // step folder when there is one; otherwise to source/reference.
  const finalFolder = stepFolders.find((s) => s.folder && /final deliverable/i.test(s.step.name))?.folder ?? null;
  const draftFolder = stepFolders.find((s) => s.folder && /customer/i.test(s.step.name))?.folder ?? null;

  const synced: any[] = [];
  const note = (r: any, folder: string, filename: string) => {
    if (r.ok && !r.skipped) synced.push({ folder, filename, sha256: r.sha256, size: r.size });
  };

  // 2) Quote files (source / reference / final / affidavit) by category.
  const { data: qfiles } = await ctx.supabase.from("quote_files")
    .select("id, storage_path, original_filename, file_category_id, quote_id")
    .eq("quote_id", meta.order.quote_id).is("deleted_at", null);
  let hasCert = false;
  for (const qf of qfiles ?? []) {
    if (!qf.storage_path) continue;
    const cat = qf.file_category_id;
    const isCert = /\/certified\//i.test(qf.storage_path);
    let folder: string, trigger: string;
    if (isCert) { folder = `${SHELL.certification}/v1`; trigger = "certified_final"; hasCert = true; }
    else if (SOURCE_CATS.has(cat)) { folder = `${SHELL.source}/v1`; trigger = "client_upload"; }
    else if (REFERENCE_CATS.has(cat)) { folder = `${SHELL.reference}/v1`; trigger = "reference_upload"; }
    else if (FINAL_CATS.has(cat)) { folder = `${finalFolder ?? SHELL.source}/v1`; trigger = "final_delivery"; }
    else if (DRAFT_CATS.has(cat)) { folder = `${draftFolder ?? SHELL.reference}/v1`; trigger = "draft_promoted"; }
    else { folder = `${SHELL.source}/v1`; trigger = "client_upload"; } // default: treat as input
    await ensurePath(ctx, `${meta.basePath}/${folder}`);
    const filename = seg(qf.original_filename || qf.storage_path.split("/").pop() || "file");
    const r = await syncOne(ctx, {
      source_bucket: quoteFileBucket(cat, qf.storage_path), source_path: qf.storage_path,
      dropbox_path: `${meta.basePath}/${folder}/${filename}`, sync_trigger: trigger,
      order_id: meta.order.id, quote_id: qf.quote_id, quote_file_id: qf.id,
    });
    note(r, folder, filename);
  }

  // 3) Step deliveries -> {step folder}/v{version}/ for EVERY step. The same
  //    artifact copied through QA review + final deliverable is retained at each
  //    stage; a revision round becomes v2, v3, ...
  for (const sf of stepFolders) {
    if (!sf.folder) continue; // explicit opt-out
    const { data: dels } = await ctx.supabase.from("step_deliveries")
      .select("id, version, file_paths").eq("step_id", sf.step.id).order("version");
    for (const d of dels ?? []) {
      const files = parseDeliveryFiles(d.file_paths);
      const vsub = `/v${d.version ?? 1}`;
      for (const f of files) {
        if (!f.storage_path) continue;
        const filename = seg(f.original_filename || f.storage_path.split("/").pop() || "file");
        const r = await syncOne(ctx, {
          source_bucket: "vendor-deliveries", fallback_buckets: ["quote-files"],
          source_path: f.storage_path,
          dropbox_path: `${meta.basePath}/${sf.folder}${vsub}/${filename}`,
          sync_trigger: "step_delivery",
          order_id: meta.order.id, step_delivery_id: d.id,
        });
        note(r, `${sf.folder}${vsub}`, filename);
      }
    }
  }

  // 4) Admin docs: vendor POs + client invoices -> 00_Admin.
  const { data: pos } = await ctx.supabase.from("vendor_purchase_orders")
    .select("pdf_storage_path, po_number").eq("order_id", meta.order.id).not("pdf_storage_path", "is", null);
  for (const po of pos ?? []) {
    const filename = seg(`${po.po_number || "VPO"}.pdf`);
    const r = await syncOne(ctx, {
      source_bucket: "vendor-pos", source_path: po.pdf_storage_path,
      dropbox_path: `${meta.basePath}/${SHELL.admin}/${filename}`, sync_trigger: "vendor_evidence",
      order_id: meta.order.id,
    });
    note(r, SHELL.admin, filename);
  }
  const { data: invs } = await ctx.supabase.from("customer_invoices")
    .select("pdf_storage_path, invoice_number").eq("order_id", meta.order.id).not("pdf_storage_path", "is", null);
  for (const inv of invs ?? []) {
    const filename = seg(`${inv.invoice_number || "INV"}.pdf`);
    const r = await syncOne(ctx, {
      source_bucket: "invoices", source_path: inv.pdf_storage_path,
      dropbox_path: `${meta.basePath}/${SHELL.admin}/${filename}`, sync_trigger: "client_upload",
      order_id: meta.order.id,
    });
    note(r, SHELL.admin, filename);
  }

  // 4.5) Post-delivery client review/feedback rounds -> 05_Client-Review/round-N/
  //      (the client's feedback text as feedback.md + their markup attachments).
  //      Each client_email communication is one round, in date order.
  const { data: comms } = await ctx.supabase.from("order_communications")
    .select("id, subject, body, email_date, created_at")
    .eq("order_id", meta.order.id).eq("kind", "client_email")
    .order("email_date", { ascending: true }).order("created_at", { ascending: true });
  let clientRounds = 0;
  for (const c of comms ?? []) {
    clientRounds++;
    const roundDir = `${SHELL.client_review}/round-${clientRounds}`;
    await ensurePath(ctx, `${meta.basePath}/${roundDir}`);
    const fb = [
      `# Client Review - Round ${clientRounds}`, "",
      `- **Order:** ${meta.order.order_number}`,
      `- **Date:** ${c.email_date ?? c.created_at ?? "-"}`,
      `- **Subject:** ${c.subject ?? "-"}`, "",
      `## Feedback`, "", String(c.body ?? "").trim(), "",
    ].join("\n");
    try {
      await dbxUpload(ctx, `${meta.basePath}/${roundDir}/feedback.md`, new TextEncoder().encode(fb));
    } catch (e) { console.warn("feedback.md upload failed:", (e as Error).message); }
    const { data: atts } = await ctx.supabase.from("order_communication_attachments")
      .select("id, original_filename, storage_path").eq("communication_id", c.id);
    for (const a of atts ?? []) {
      if (!a.storage_path) continue;
      const filename = seg(a.original_filename || a.storage_path.split("/").pop() || "file");
      const r = await syncOne(ctx, {
        source_bucket: "quote-files", source_path: a.storage_path,
        dropbox_path: `${meta.basePath}/${roundDir}/${filename}`, sync_trigger: "client_feedback",
        order_id: meta.order.id,
      });
      note(r, roundDir, filename);
    }
  }

  // 5) PROJECT-RECORD.md manifest (incl. QA sign-off as data) -> 00_Admin.
  const manifest = buildManifest(meta, stepFolders, synced, clientRounds);
  try {
    await dbxUpload(ctx, `${meta.basePath}/${SHELL.admin}/PROJECT-RECORD.md`,
      new TextEncoder().encode(manifest));
  } catch (e) {
    console.warn("manifest upload failed:", (e as Error).message);
  }

  return jsonResponse({
    success: true, order: meta.order.order_number, base_path: meta.basePath,
    folders: stepFolders.filter((s) => s.folder).map((s) => s.folder),
    has_certification: hasCert, files_synced: synced.length, files: synced,
  });
}

function parseDeliveryFiles(file_paths: any): Array<{ storage_path: string; original_filename?: string }> {
  if (!Array.isArray(file_paths)) return [];
  const out: any[] = [];
  for (const el of file_paths) {
    if (typeof el === "string") {
      const t = el.trim();
      if (t.startsWith("{")) { try { out.push(JSON.parse(t)); continue; } catch { /* fallthrough */ } }
      out.push({ storage_path: el });
    } else if (el && typeof el === "object") out.push(el);
  }
  return out;
}

function buildManifest(meta: OrderMeta, stepFolders: StepFolder[], synced: any[], clientRounds = 0): string {
  const L: string[] = [];
  L.push(`# Project Record - ${meta.order.order_number}`, "");
  L.push(`> Auto-generated by dropbox-team-sync. ISO 17100 sec 6.2 production record.`, "");
  L.push(`## Order`, "");
  L.push(`- **Client:** ${meta.clientName}`);
  L.push(`- **Project:** ${meta.projectNumber ?? "-"}${meta.clientProjectCode ? ` (${meta.clientProjectCode})` : ""}`);
  L.push(`- **Order:** ${meta.order.order_number}`);
  L.push(`- **Service / workflow:** ${meta.serviceName}`);
  L.push(`- **Languages:** ${meta.srcCode || "?"} -> ${meta.tgtCode || "?"}`);
  L.push(`- **Order date:** ${meta.orderDate}`, "");
  L.push(`## Workflow steps (who did what, when)`, "");
  L.push(`| # | Step | Actor | Status | Delivered | QA/approved | Folder |`);
  L.push(`|---|------|-------|--------|-----------|-------------|--------|`);
  for (const sf of stepFolders) {
    const s = sf.step;
    L.push(`| ${s.step_number} | ${s.name} | ${s.actor_type ?? ""} | ${s.status ?? ""} | ${s.delivered_at ?? "-"} | ${s.approved_at ?? "-"} | ${sf.folder ?? "(manifest)"} |`);
  }
  L.push("", `> QA sign-off = the QA Review step's approved-at + status above; the QA-approved copy is retained in that step's folder (v-versioned).`, "");
  if (clientRounds > 0) L.push(`**Post-delivery client review rounds:** ${clientRounds} (see \`05_Client-Review/\`; each revision round re-versions the affected step folders to v2, v3, ...).`, "");
  L.push(`## Files synced to Dropbox (${synced.length})`, "");
  if (synced.length) {
    L.push(`| Folder | File | SHA-256 | Bytes |`);
    L.push(`|--------|------|---------|-------|`);
    for (const f of synced) L.push(`| ${f.folder} | ${f.filename} | \`${f.sha256 ?? ""}\` | ${f.size ?? ""} |`);
  } else {
    L.push(`_No new files synced (already up to date, or none in the system)._`);
  }
  L.push("");
  return L.join("\n");
}

async function ensureStepFolder(ctx: Ctx, body: { order_id: string; step_id: string }) {
  const meta = await resolveOrder(ctx, body.order_id);
  if (!meta) return jsonResponse({ skipped: true, reason: "Could not resolve order" });
  const { data: step } = await ctx.supabase.from("order_workflow_steps")
    .select("id, step_number, name, actor_type, create_dropbox_folder").eq("id", body.step_id).maybeSingle();
  if (!step) return jsonResponse({ error: "Step not found" }, 404);
  const folder = stepFolderFor({ ...step, create_dropbox_folder: true }); // explicit add => make it
  if (!folder) return jsonResponse({ success: true, created: null });
  await ensurePath(ctx, `${meta.basePath}/${folder}`);
  return jsonResponse({ success: true, created: `${meta.basePath}/${folder}` });
}

async function archiveStepFolder(ctx: Ctx, body: { order_id: string; step_id: string; step_name?: string; step_number?: number }) {
  const meta = await resolveOrder(ctx, body.order_id);
  if (!meta) return jsonResponse({ skipped: true, reason: "Could not resolve order" });
  // The step may already be cancelled/renumbered; caller passes its pre-removal
  // identity. Fall back to a lookup if needed.
  let name = body.step_name, num = body.step_number;
  if (name == null || num == null) {
    const { data: step } = await ctx.supabase.from("order_workflow_steps")
      .select("step_number, name").eq("id", body.step_id).maybeSingle();
    name = name ?? step?.name; num = num ?? step?.step_number;
  }
  if (name == null || num == null) return jsonResponse({ success: true, archived: null });
  const folder = `${String(Math.min(num * 10, 89)).padStart(2, "0")}_${stepSlug(name)}`;
  await ensurePath(ctx, `${meta.basePath}/${SHELL.archive}`);
  const ok = await dbxMove(ctx, `${meta.basePath}/${folder}`, `${meta.basePath}/${SHELL.archive}/${folder}`);
  return jsonResponse({ success: ok, archived: ok ? `${meta.basePath}/${SHELL.archive}/${folder}` : null });
}

async function syncOrderFile(ctx: Ctx, body: {
  order_id: string; source_bucket: string; source_path: string; sync_trigger: string;
  step_id?: string; delivery_version?: number; filename?: string; quote_file_id?: string; step_delivery_id?: string;
}) {
  const meta = await resolveOrder(ctx, body.order_id);
  if (!meta) return jsonResponse({ skipped: true, reason: "Could not resolve order" });

  let folder: string | null = null;
  if (body.step_id) {
    const { data: step } = await ctx.supabase.from("order_workflow_steps")
      .select("step_number, name, actor_type, create_dropbox_folder").eq("id", body.step_id).maybeSingle();
    if (step) folder = stepFolderFor(step);
  }
  if (!folder) {
    const T: Record<string, string> = {
      client_upload: SHELL.source, reference_upload: SHELL.reference, draft_promoted: SHELL.delivery,
      affidavit_generated: SHELL.certification, certified_final: SHELL.certification, final_delivery: SHELL.delivery,
      vendor_delivery: SHELL.delivery, vendor_evidence: SHELL.admin,
    };
    folder = T[body.sync_trigger] ?? SHELL.source;
  }
  const vsub = body.delivery_version ? `/v${body.delivery_version}` : "";
  await ensurePath(ctx, `${meta.basePath}/${folder}${vsub}`);
  const filename = seg(body.filename || body.source_path.split("/").pop() || "file");
  const r = await syncOne(ctx, {
    source_bucket: body.source_bucket, source_path: body.source_path,
    dropbox_path: `${meta.basePath}/${folder}${vsub}/${filename}`, sync_trigger: body.sync_trigger,
    order_id: meta.order.id, quote_file_id: body.quote_file_id, step_delivery_id: body.step_delivery_id,
  });
  return jsonResponse(r.ok ? { success: true, ...r } : { error: r.error }, r.ok ? 200 : 500);
}

async function shareFolder(ctx: Ctx, body: { dropbox_folder_path: string }) {
  if (!body.dropbox_folder_path) return jsonResponse({ error: "dropbox_folder_path required" }, 400);
  const res = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/json",
      "Dropbox-API-Path-Root": pathRootHeader(ctx.rootNs),
    },
    body: JSON.stringify({ path: body.dropbox_folder_path, settings: { audience: "team", access: "viewer" } }),
  });
  if (res.ok) return jsonResponse({ success: true, url: (await res.json()).url });
  const err = await res.json().catch(() => ({}));
  if (err?.error?.[".tag"] === "shared_link_already_exists") {
    const ex = await fetch("https://api.dropboxapi.com/2/sharing/list_shared_links", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/json",
        "Dropbox-API-Path-Root": pathRootHeader(ctx.rootNs),
      },
      body: JSON.stringify({ path: body.dropbox_folder_path, direct_only: true }),
    });
    if (ex.ok) return jsonResponse({ success: true, url: (await ex.json()).links?.[0]?.url ?? null });
  }
  return jsonResponse({ error: "Failed to create shared link", detail: err }, 400);
}

async function checkStatus(ctx: Ctx, body: { order_id: string }) {
  if (!body.order_id) return jsonResponse({ error: "order_id required" }, 400);
  const { data } = await ctx.supabase.from("dropbox_file_syncs")
    .select("source_path, dropbox_path, sync_trigger, status, sha256_hash, synced_at, error_message")
    .eq("order_id", body.order_id).eq("target", "team").order("created_at");
  const rows = data ?? [];
  return jsonResponse({
    summary: {
      total: rows.length,
      synced: rows.filter((r: any) => r.status === "synced").length,
      failed: rows.filter((r: any) => r.status === "failed").length,
      pending: rows.filter((r: any) => r.status === "pending").length,
    },
    files: rows,
  });
}
