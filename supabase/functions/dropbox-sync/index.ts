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

// Folder structure per order
const ORDER_SUBFOLDERS = [
  "01-Source-Documents",
  "02-Reference-Materials",
  "03-Vendor-Deliveries",
  "04-Drafts",
  "05-Affidavits",
  "06-Certified-Final",
];

// Map sync triggers to Dropbox subfolders
const TRIGGER_TO_SUBFOLDER: Record<string, string> = {
  client_upload: "01-Source-Documents",
  reference_upload: "02-Reference-Materials",
  vendor_delivery: "03-Vendor-Deliveries",
  staff_delivery: "03-Vendor-Deliveries",
  draft_promoted: "04-Drafts",
  affidavit_generated: "05-Affidavits",
  certified_final: "06-Certified-Final",
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
    const uploadRes = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
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
  body: { project_number: string; customer_name: string; target_language: string },
) {
  const { project_number, customer_name, target_language } = body;
  if (!project_number) {
    return jsonResponse({ error: "project_number is required" }, 400);
  }

  const folderName = [project_number, customer_name, target_language]
    .filter(Boolean)
    .join(" — ");

  const basePath = `/Cethos/Orders/${folderName}`;

  // Create base folder + subfolders
  const created = [];
  for (const sub of ORDER_SUBFOLDERS) {
    const path = `${basePath}/${sub}`;
    try {
      const res = await fetch("https://api.dropboxapi.com/2/files/create_folder_v2", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path, autorename: false }),
      });

      if (res.ok) {
        created.push(path);
      } else {
        const err = await res.json();
        if (err?.error?.[".tag"] === "path" && err.error.path?.[".tag"] === "conflict") {
          created.push(path); // Already exists
        } else {
          console.error(`Failed to create ${path}:`, err);
        }
      }
    } catch (e) {
      console.error(`Error creating ${path}:`, e);
    }
  }

  return jsonResponse({ success: true, base_path: basePath, folders_created: created.length });
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

  const res = await fetch("https://api.dropboxapi.com/2/oauth2/token", {
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
