/**
 * qms-dropbox-sync - Materialises QMS SOPs from the portal into the CETHOS TEAM
 * Dropbox as Word (.docx) documents, one folder per SOP, one file per version.
 *
 * Layout (under the team root namespace):
 *   /Cethos Team Folder/QMS/SOPs/SOP-001 - <Title>/
 *       SOP-001 v2.0 - <Title> -current.docx     (active version)
 *       SOP-001 v1.0 - <Title>.docx              (superseded version)
 *
 * Reconciliation is idempotent and keyed by sop_version_id in
 * `public.qms_dropbox_syncs`:
 *   - never-synced version            -> generate .docx + upload
 *   - content/metadata changed (hash) -> regenerate + overwrite (+ remove old path)
 *   - only the path changed (current  -> rename/move the existing file
 *     pointer moved, title renamed)
 * It ONLY ever touches files it created (tracked in the ledger), so any
 * documents staff drop into these folders by hand are left untouched.
 *
 * Body: { action?: "sync", sop_id?: uuid, limit?: number }
 *   - omit sop_id to reconcile every non-archived SOP (weekly cron / manual)
 *   - pass sop_id to reconcile a single SOP (on-change DB trigger)
 *   - limit (default 25) caps work per invocation; `remaining` tells the caller
 *     whether to call again to drain the rest.
 */
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { crypto } from "https://deno.land/std@0.208.0/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.208.0/encoding/hex.ts";
import { renderSopDocx, type SopMeta } from "../_shared/md-docx.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Bump to force every document to regenerate (e.g. when the layout changes).
const GENERATOR_VERSION = 1;
const QMS_ROOT = "/Cethos Team Folder/QMS/SOPs";
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
    return await syncSops(ctx, body);
  } catch (err) {
    console.error("qms-dropbox-sync error:", err);
    return jsonResponse({ error: (err as Error).message || "Internal server error" }, 500);
  }
});

// -- Reconcile --------------------------------------------------------------

interface Plan {
  sop_id: string;
  version_id: string;
  meta: SopMeta;
  markdown: string;
  desiredPath: string;
  contentHash: string;
}

async function syncSops(ctx: Ctx, body: { sop_id?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(200, body.limit ?? DEFAULT_LIMIT));
  const generatedAt = new Date().toISOString();

  // 1) Load SOPs (+ their non-draft versions) in scope.
  let sopQuery = ctx.supabase
    .from("sops")
    .select("id, sop_number, title, current_version_id, is_archived")
    .eq("is_archived", false);
  if (body.sop_id) sopQuery = sopQuery.eq("id", body.sop_id);
  const { data: sops, error: sopErr } = await sopQuery;
  if (sopErr) return jsonResponse({ error: `load sops: ${sopErr.message}` }, 500);
  if (!sops?.length) return jsonResponse({ success: true, processed: 0, remaining: 0, note: "no SOPs in scope" });

  const sopIds = sops.map((s: any) => s.id);
  const { data: versions, error: vErr } = await ctx.supabase
    .from("sop_versions")
    .select("id, sop_id, version_number, status, effective_date, approved_by_name, content_md")
    .in("sop_id", sopIds).neq("status", "draft");
  if (vErr) return jsonResponse({ error: `load versions: ${vErr.message}` }, 500);

  const { data: ledger } = await ctx.supabase
    .from("qms_dropbox_syncs")
    .select("sop_version_id, dropbox_path, content_sha256, status")
    .in("sop_id", sopIds);
  const ledgerByVersion = new Map<string, any>((ledger ?? []).map((r: any) => [r.sop_version_id, r]));
  const sopById = new Map<string, any>(sops.map((s: any) => [s.id, s]));

  // 2) Build the desired plan for every version + its content hash.
  const plans: Plan[] = [];
  for (const v of versions ?? []) {
    const sop = sopById.get(v.sop_id);
    if (!sop) continue;
    const isCurrent = sop.current_version_id === v.id;
    const versionLabel = `v${v.version_number}.0`;
    const folder = `${sop.sop_number} - ${seg(sop.title)}`;
    const filename = `${sop.sop_number} ${versionLabel} - ${seg(sop.title)}${isCurrent ? " -current" : ""}.docx`;
    const desiredPath = `${QMS_ROOT}/${folder}/${filename}`;
    const meta: SopMeta = {
      number: sop.sop_number,
      title: sop.title,
      versionLabel,
      status: v.status,
      effectiveDate: v.effective_date,
      isCurrent,
      approvedBy: v.approved_by_name,
      generatedAt,
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

  // 3) Determine which plans need work (content change, path change, or new).
  const dirty = plans.filter((p) => {
    const row = ledgerByVersion.get(p.version_id);
    if (!row || row.status !== "synced") return true;
    return row.content_sha256 !== p.contentHash || row.dropbox_path !== p.desiredPath;
  });

  const slice = dirty.slice(0, limit);
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
        bytes = docx.length;
        contentHashHeader = up.content_hash;
        // Re-uploaded at the (possibly new) path; remove the stale old file.
        if (pathChanged && oldPath) await dbxDelete(ctx, oldPath);
      } else if (pathChanged && oldPath) {
        // Content identical, only the filename/folder moved -> rename.
        await dbxMove(ctx, oldPath, p.desiredPath);
      }

      await ctx.supabase.from("qms_dropbox_syncs").upsert({
        sop_id: p.sop_id,
        sop_version_id: p.version_id,
        dropbox_path: p.desiredPath,
        content_sha256: p.contentHash,
        generator_version: GENERATOR_VERSION,
        status: "synced",
        file_size_bytes: contentChanged ? bytes : (row?.file_size_bytes ?? null),
        dropbox_content_hash: contentHashHeader ?? row?.dropbox_content_hash ?? null,
        error_message: null,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
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

  // 4) Best-effort: remove the empty bare "SOP-NNN" stub folders (we use the
  //    descriptive "SOP-NNN - Title" form). Only deletes when truly empty.
  if (!body.sop_id) {
    for (const s of sops) {
      await dbxDeleteIfEmpty(ctx, `${QMS_ROOT}/${s.sop_number}`);
    }
  }

  return jsonResponse({
    success: true,
    scope: body.sop_id ? `sop ${body.sop_id}` : "all",
    versions_total: plans.length,
    processed: results.length,
    remaining: Math.max(0, dirty.length - slice.length),
    results,
  });
}

// -- Dropbox helpers (team root namespace) ----------------------------------

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
    if (!res.ok) return; // not found / not a folder -> nothing to do
    const data = await res.json();
    if (Array.isArray(data.entries) && data.entries.length === 0) {
      await dbxDelete(ctx, path);
    }
  } catch (e) {
    console.warn(`[deleteIfEmpty] ${path} threw:`, (e as Error).message);
  }
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
