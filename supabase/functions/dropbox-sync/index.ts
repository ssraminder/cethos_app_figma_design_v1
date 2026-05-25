/**
 * dropbox-sync — Syncs files from Supabase Storage to Dropbox
 *
 * Called by other edge functions at lifecycle stage completion points.
 * Every sync is logged in `dropbox_file_syncs` with SHA-256 hash for
 * ISO 17100 reproducibility and tamper detection.
 *
 * Actions:
 *   sync_file     — Download from Supabase, upload to Dropbox, log with hash
 *   sync_batch    — Sync multiple files in one call
 *   sync_order_file — Auto-resolve Dropbox path from order_id, then sync
 *   setup_order   — Create folder structure + batch-sync existing quote files
 *   create_order_folder — Create the full order folder structure
 *   share_folder  — Create a shared link for a folder (customer delivery)
 *   check_status  — Check sync status for an order
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

/**
 * Encode a JSON object so the resulting string is HTTP-header-safe (ASCII only).
 * Dropbox-API-Arg header values must be valid ByteStrings — any non-ASCII
 * characters (e.g. em-dashes in folder names) must be \uXXXX escaped.
 */
function headerSafeJson(obj: Record<string, unknown>): string {
  const raw = JSON.stringify(obj);
  let safe = "";
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code > 127) {
      safe += "\\u" + ("0000" + code.toString(16)).slice(-4);
    } else {
      safe += raw[i];
    }
  }
  return safe;
}

// Static folders always created for every order (regardless of workflow)
const STATIC_FOLDERS = [
  "Source Documents",
  "Reference Materials",
  "Drafts",
  "Certified",
  "Final Deliverable",
];

// Map sync triggers to static folders (for files not tied to a specific step)
const TRIGGER_TO_STATIC_FOLDER: Record<string, string> = {
  client_upload: "Source Documents",
  reference_upload: "Reference Materials",
  draft_promoted: "Drafts",
  affidavit_generated: "Certified",
  certified_final: "Final Deliverable",
  final_delivery: "Final Deliverable",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const DROPBOX_APP_KEY = Deno.env.get("DROPBOX_APP_KEY");
    const DROPBOX_APP_SECRET = Deno.env.get("DROPBOX_APP_SECRET");

    if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET) {
      return jsonResponse({ error: "Dropbox credentials not configured" }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if Dropbox is connected
    const { data: connection } = await supabase
      .from("dropbox_connections")
      .select("id, access_token, refresh_token, token_expires_at")
      .limit(1)
      .maybeSingle();

    if (!connection) {
      // Dropbox not connected — silently skip (non-blocking)
      return jsonResponse({ skipped: true, reason: "Dropbox not connected" });
    }

    const accessToken = await getValidAccessToken(
      supabase,
      connection,
      DROPBOX_APP_KEY,
      DROPBOX_APP_SECRET,
    );

    if (!accessToken) {
      return jsonResponse({ error: "Failed to get valid Dropbox token" }, 500);
    }

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "sync_file":
        return await handleSyncFile(supabase, accessToken, body);
      case "sync_batch":
        return await handleSyncBatch(supabase, accessToken, body);
      case "sync_order_file":
        return await handleSyncOrderFile(supabase, accessToken, body);
      case "setup_order":
        return await handleSetupOrder(supabase, accessToken, body);
      case "create_order_folder":
        return await handleCreateOrderFolder(accessToken, body);
      case "share_folder":
        return await handleShareFolder(supabase, accessToken, body);
      case "check_status":
        return await handleCheckStatus(supabase, body);
      default:
        return jsonResponse({ error: "Invalid action" }, 400);
    }
  } catch (err) {
    console.error("dropbox-sync error:", err);
    return jsonResponse({ error: err.message || "Internal server error" }, 500);
  }
});

async function handleSyncFile(
  supabase: any,
  accessToken: string,
  body: {
    source_bucket: string;
    source_path: string;
    dropbox_path: string;
    sync_trigger: string;
    order_id?: string;
    quote_id?: string;
    quote_file_id?: string;
    step_delivery_id?: string;
    vendor_id?: string;
    customer_id?: string;
  },
) {
  const {
    source_bucket,
    source_path,
    dropbox_path,
    sync_trigger,
    order_id,
    quote_id,
    quote_file_id,
    step_delivery_id,
    vendor_id,
    customer_id,
  } = body;

  if (!source_bucket || !source_path || !dropbox_path || !sync_trigger) {
    return jsonResponse(
      { error: "source_bucket, source_path, dropbox_path, sync_trigger are required" },
      400,
    );
  }

  // Create audit record
  const { data: syncRecord, error: insertErr } = await supabase
    .from("dropbox_file_syncs")
    .insert({
      source_bucket,
      source_path,
      dropbox_path,
      sync_trigger,
      order_id,
      quote_id,
      quote_file_id,
      step_delivery_id,
      vendor_id,
      customer_id,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr) {
    // If duplicate (already synced), return success
    if (insertErr.code === "23505") {
      return jsonResponse({ success: true, already_synced: true });
    }
    console.error("Insert error:", insertErr);
    return jsonResponse({ error: "Failed to create sync record" }, 500);
  }

  try {
    // Download from Supabase Storage
    const { data: fileData, error: downloadErr } = await supabase.storage
      .from(source_bucket)
      .download(source_path);

    if (downloadErr || !fileData) {
      throw new Error(`Download failed: ${downloadErr?.message || "no data"}`);
    }

    const fileBytes = new Uint8Array(await fileData.arrayBuffer());

    // Compute SHA-256 hash
    const hashBuffer = await crypto.subtle.digest("SHA-256", fileBytes);
    const sha256Hash = encodeHex(new Uint8Array(hashBuffer));

    // Upload to Dropbox
    // Use headerSafeJson for the Dropbox-API-Arg header — folder names may
    // contain non-ASCII characters (e.g. em-dashes) which are invalid in
    // HTTP headers (ByteString requirement). headerSafeJson escapes them
    // to \\uXXXX sequences that Dropbox accepts.
    const uploadRes = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": headerSafeJson({
          path: dropbox_path,
          mode: "overwrite",
          autorename: false,
          mute: true,
        }),
      },
      body: fileBytes,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Dropbox upload failed: ${errText}`);
    }

    const uploadResult = await uploadRes.json();

    // Update audit record
    await supabase
      .from("dropbox_file_syncs")
      .update({
        status: "synced",
        sha256_hash: sha256Hash,
        file_size_bytes: fileBytes.length,
        dropbox_content_hash: uploadResult.content_hash,
        synced_at: new Date().toISOString(),
      })
      .eq("id", syncRecord.id);

    return jsonResponse({
      success: true,
      sync_id: syncRecord.id,
      sha256_hash: sha256Hash,
      dropbox_content_hash: uploadResult.content_hash,
      file_size_bytes: fileBytes.length,
    });
  } catch (err) {
    // Log failure
    await supabase
      .from("dropbox_file_syncs")
      .update({
        status: "failed",
        error_message: err.message,
        retry_count: 1,
      })
      .eq("id", syncRecord.id);

    console.error("Sync failed:", err);
    return jsonResponse({ error: err.message }, 500);
  }
}

async function handleSyncBatch(
  supabase: any,
  accessToken: string,
  body: { files: Array<Record<string, unknown>> },
) {
  const { files } = body;
  if (!Array.isArray(files) || files.length === 0) {
    return jsonResponse({ error: "files array is required" }, 400);
  }

  const results = [];
  for (const file of files) {
    try {
      const res = await handleSyncFile(supabase, accessToken, file as any);
      const resBody = await res.json();
      results.push({ path: file.source_path, ...resBody });
    } catch (err) {
      results.push({ path: file.source_path, error: err.message });
    }
  }

  const synced = results.filter((r) => r.success).length;
  const failed = results.filter((r) => r.error).length;

  return jsonResponse({ synced, failed, total: files.length, results });
}

async function handleCreateOrderFolder(
  accessToken: string,
  body: {
    base_path: string;
    step_folders?: string[];
  },
) {
  const { base_path, step_folders } = body;
  if (!base_path) {
    return jsonResponse({ error: "base_path is required" }, 400);
  }

  // Build the full list: static folders + dynamic step folders
  const allFolders = [...STATIC_FOLDERS, ...(step_folders ?? [])];

  // Create base folder + subfolders
  const created = [];
  for (const sub of allFolders) {
    const path = `${base_path}/${sub}`;
    await createSingleFolder(accessToken, path);
    created.push(path);
  }

  return jsonResponse({ success: true, base_path, folders_created: created.length });
}

async function handleShareFolder(
  supabase: any,
  accessToken: string,
  body: { dropbox_folder_path: string; order_id?: string },
) {
  const { dropbox_folder_path, order_id } = body;
  if (!dropbox_folder_path) {
    return jsonResponse({ error: "dropbox_folder_path is required" }, 400);
  }

  const res = await fetch(
    "https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: dropbox_folder_path,
        settings: { requested_visibility: "public", audience: "public" },
      }),
    },
  );

  let url: string | null = null;

  if (res.ok) {
    const data = await res.json();
    url = data.url;
  } else {
    const err = await res.json();
    if (err?.error?.[".tag"] === "shared_link_already_exists") {
      const existing = await fetch(
        "https://api.dropboxapi.com/2/sharing/list_shared_links",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ path: dropbox_folder_path, direct_only: true }),
        },
      );
      if (existing.ok) {
        const links = await existing.json();
        url = links.links?.[0]?.url ?? null;
      }
    }
  }

  if (!url) {
    return jsonResponse({ error: "Failed to create shared link" }, 400);
  }

  return jsonResponse({ success: true, url });
}

async function handleCheckStatus(
  supabase: any,
  body: { order_id: string },
) {
  const { order_id } = body;
  if (!order_id) {
    return jsonResponse({ error: "order_id is required" }, 400);
  }

  const { data, error } = await supabase
    .from("dropbox_file_syncs")
    .select("id, source_path, dropbox_path, sync_trigger, status, sha256_hash, synced_at, error_message")
    .eq("order_id", order_id)
    .order("created_at", { ascending: true });

  if (error) {
    return jsonResponse({ error: "Query failed" }, 500);
  }

  const summary = {
    total: data?.length ?? 0,
    synced: data?.filter((r: any) => r.status === "synced").length ?? 0,
    pending: data?.filter((r: any) => r.status === "pending").length ?? 0,
    failed: data?.filter((r: any) => r.status === "failed").length ?? 0,
  };

  return jsonResponse({ summary, files: data });
}

// --- Resolve order → Dropbox base path ---

async function resolveOrderDropboxPath(
  supabase: any,
  order_id: string,
): Promise<{
  basePath: string;
  projectNumber: string | null;
  orderNumber: string;
  customerName: string;
  companyName: string;
  targetLanguage: string;
  orderDate: string;
  hasProject: boolean;
} | null> {
  // order → internal_project + customer + target language
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number, customer_id, internal_project_id, quote_id, created_at")
    .eq("id", order_id)
    .maybeSingle();

  if (!order) return null;

  const orderNumber = order.order_number ?? "";
  if (!orderNumber) return null;

  // Order date (YYYY-MM-DD from created_at)
  const orderDate = order.created_at
    ? new Date(order.created_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  // Project number (if linked)
  let projectNumber: string | null = null;
  if (order.internal_project_id) {
    const { data: project } = await supabase
      .from("internal_projects")
      .select("project_number")
      .eq("id", order.internal_project_id)
      .maybeSingle();
    if (project?.project_number) projectNumber = project.project_number;
  }

  // Customer name + company
  let customerName = "";
  let companyName = "";
  if (order.customer_id) {
    const { data: customer } = await supabase
      .from("customers")
      .select("full_name, company_name")
      .eq("id", order.customer_id)
      .maybeSingle();
    if (customer?.full_name) customerName = customer.full_name;
    if (customer?.company_name) companyName = customer.company_name;
  }

  // Target language from the quote
  let targetLanguage = "";
  if (order.quote_id) {
    const { data: quote } = await supabase
      .from("quotes")
      .select("target_language_id")
      .eq("id", order.quote_id)
      .maybeSingle();
    if (quote?.target_language_id) {
      const { data: lang } = await supabase
        .from("languages")
        .select("name")
        .eq("id", quote.target_language_id)
        .maybeSingle();
      if (lang?.name) targetLanguage = lang.name;
    }
  }

  // Build path:
  //   With project: /Cethos/Projects/{client}/{project_number} — {customer}/{order_number} — {language} — {date}/
  //   Without:      /Cethos/Orders/{order_number} — {customer} — {language} — {date}/
  let basePath: string;
  if (projectNumber) {
    const clientFolder = companyName || customerName || "Unknown Client";
    const projectFolder = [projectNumber, customerName].filter(Boolean).join(" — ");
    const orderFolder = [orderNumber, targetLanguage, orderDate].filter(Boolean).join(" — ");
    basePath = `/Cethos/Projects/${clientFolder}/${projectFolder}/${orderFolder}`;
  } else {
    const orderFolder = [orderNumber, customerName, targetLanguage, orderDate].filter(Boolean).join(" — ");
    basePath = `/Cethos/Orders/${orderFolder}`;
  }

  return {
    basePath,
    projectNumber,
    orderNumber,
    customerName,
    companyName,
    targetLanguage,
    orderDate,
    hasProject: !!projectNumber,
  };
}

// --- sync_order_file: auto-resolve path from order_id ---

async function handleSyncOrderFile(
  supabase: any,
  accessToken: string,
  body: {
    order_id: string;
    source_bucket: string;
    source_path: string;
    sync_trigger: string;
    filename?: string;
    quote_id?: string;
    quote_file_id?: string;
    step_delivery_id?: string;
    step_id?: string;
    delivery_version?: number;
  },
) {
  const { order_id, source_bucket, source_path, sync_trigger, quote_id, quote_file_id, step_delivery_id, step_id, delivery_version } = body;

  if (!order_id || !source_bucket || !source_path || !sync_trigger) {
    return jsonResponse({ error: "order_id, source_bucket, source_path, sync_trigger are required" }, 400);
  }

  // Determine the subfolder: if a step_id is provided, resolve it to
  // "Step NN — StepName"; otherwise fall back to static folder by trigger.
  let subfolder: string | null = null;

  if (step_id) {
    subfolder = await resolveStepFolder(supabase, step_id);
  }

  if (!subfolder) {
    subfolder = TRIGGER_TO_STATIC_FOLDER[sync_trigger] ?? null;
  }

  if (!subfolder) {
    return jsonResponse({ error: `Cannot resolve folder for sync_trigger: ${sync_trigger}` }, 400);
  }

  // When a delivery_version is provided, nest files under a version subfolder
  // so each delivery round gets its own folder (e.g. Step 01 — Translation/v1/).
  if (delivery_version) {
    subfolder = `${subfolder}/v${delivery_version}`;
  }

  const resolved = await resolveOrderDropboxPath(supabase, order_id);
  if (!resolved) {
    return jsonResponse({ skipped: true, reason: "Could not resolve order Dropbox path" });
  }

  // Extract filename from source_path or use provided filename
  const filename = body.filename ?? source_path.split("/").pop() ?? "file";

  // Ensure target folder exists
  await createSingleFolder(accessToken, `${resolved.basePath}/${subfolder}`);

  const dropbox_path = `${resolved.basePath}/${subfolder}/${filename}`;

  // Delegate to the existing sync_file handler
  return await handleSyncFile(supabase, accessToken, {
    source_bucket,
    source_path,
    dropbox_path,
    sync_trigger,
    order_id,
    quote_id,
    quote_file_id,
    step_delivery_id,
  });
}

/**
 * Resolve a workflow step ID to its Dropbox folder name: "Step NN — StepName"
 */
async function resolveStepFolder(supabase: any, step_id: string): Promise<string | null> {
  const { data: step } = await supabase
    .from("order_workflow_steps")
    .select("step_number, name")
    .eq("id", step_id)
    .maybeSingle();

  if (!step) return null;

  const num = String(step.step_number).padStart(2, "0");
  return `Step ${num} — ${step.name}`;
}

/**
 * Create a single Dropbox folder (idempotent — conflict = already exists = ok).
 */
async function createSingleFolder(accessToken: string, path: string): Promise<void> {
  try {
    const res = await fetch("https://api.dropboxapi.com/2/files/create_folder_v2", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path, autorename: false }),
    });
    if (!res.ok) {
      const err = await res.json();
      if (err?.error?.[".tag"] !== "path" || err.error.path?.[".tag"] !== "conflict") {
        console.warn(`[createSingleFolder] unexpected error for ${path}:`, err);
      }
    }
  } catch { /* folder creation failure is non-fatal */ }
}

// --- setup_order: create folders + batch-sync existing source files ---

async function handleSetupOrder(
  supabase: any,
  accessToken: string,
  body: { order_id: string; quote_id?: string },
) {
  const { order_id } = body;
  if (!order_id) {
    return jsonResponse({ error: "order_id is required" }, 400);
  }

  const resolved = await resolveOrderDropboxPath(supabase, order_id);
  if (!resolved) {
    return jsonResponse({ skipped: true, reason: "Could not resolve order Dropbox path" });
  }

  // Query workflow steps for this order to build dynamic folder names
  const { data: workflowSteps } = await supabase
    .from("order_workflow_steps")
    .select("step_number, name")
    .eq("order_id", order_id)
    .order("step_number");

  const stepFolders = (workflowSteps ?? []).map((s: any) => {
    const num = String(s.step_number).padStart(2, "0");
    return `Step ${num} — ${s.name}`;
  });

  // Create the full folder structure (static + dynamic step folders)
  await handleCreateOrderFolder(accessToken, {
    base_path: resolved.basePath,
    step_folders: stepFolders,
  });

  // Find the quote_id from the order if not provided
  let quoteId = body.quote_id;
  if (!quoteId) {
    const { data: order } = await supabase
      .from("orders")
      .select("quote_id")
      .eq("id", order_id)
      .maybeSingle();
    quoteId = order?.quote_id;
  }

  // Batch-sync existing source documents and reference files from the quote
  const synced: string[] = [];
  if (quoteId) {
    const { data: quoteFiles } = await supabase
      .from("quote_files")
      .select("id, storage_path, original_filename, file_category_id")
      .eq("quote_id", quoteId)
      .is("deleted_at", null);

    // Identify source vs reference by category
    const SOURCE_CAT = "45cb02ba-fca5-423a-8cb9-6ad807ad3bbc";
    const REF_CAT = "f1aed462-a25f-4dd0-96c0-f952c3a72950";

    for (const qf of quoteFiles ?? []) {
      if (!qf.storage_path) continue;

      let trigger = "";
      let bucket = "quote-files";
      if (qf.file_category_id === SOURCE_CAT) {
        trigger = "client_upload";
      } else if (qf.file_category_id === REF_CAT) {
        trigger = "reference_upload";
        bucket = "quote-reference-files";
      } else {
        continue; // Skip draft_translation, final_deliverable, etc.
      }

      const subfolder = TRIGGER_TO_STATIC_FOLDER[trigger]!;
      const filename = qf.original_filename ?? qf.storage_path.split("/").pop() ?? "file";
      const dropbox_path = `${resolved.basePath}/${subfolder}/${filename}`;

      try {
        const res = await handleSyncFile(supabase, accessToken, {
          source_bucket: bucket,
          source_path: qf.storage_path,
          dropbox_path,
          sync_trigger: trigger,
          order_id,
          quote_id: quoteId,
          quote_file_id: qf.id,
        });
        const resBody = await res.json();
        if (resBody.success || resBody.already_synced) synced.push(filename);
      } catch (err: any) {
        console.warn(`[setup_order] failed to sync ${filename}:`, err?.message);
      }
    }
  }

  return jsonResponse({
    success: true,
    base_path: resolved.basePath,
    step_folders: stepFolders.length,
    source_files_synced: synced.length,
  });
}

// Ensure the static order subfolder structure exists (idempotent).
// Step-specific folders are created on-demand by createSingleFolder()
// when files are synced to a step.
async function ensureOrderFolders(accessToken: string, basePath: string): Promise<void> {
  for (const sub of STATIC_FOLDERS) {
    await createSingleFolder(accessToken, `${basePath}/${sub}`);
  }
}

// --- Token management ---

async function getValidAccessToken(
  supabase: any,
  connection: any,
  appKey: string,
  appSecret: string,
): Promise<string | null> {
  const expiresAt = connection.token_expires_at
    ? new Date(connection.token_expires_at)
    : null;
  const isExpired = !expiresAt || expiresAt.getTime() < Date.now() + 60_000;

  if (!isExpired) return connection.access_token;

  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: connection.refresh_token,
      client_id: appKey,
      client_secret: appSecret,
    }),
  });

  if (!res.ok) {
    console.error("Token refresh failed:", await res.text());
    return null;
  }

  const tokens = await res.json();
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await supabase
    .from("dropbox_connections")
    .update({
      access_token: tokens.access_token,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  return tokens.access_token;
}
