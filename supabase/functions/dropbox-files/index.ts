import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
    const accessToken = await getValidAccessToken(supabase, DROPBOX_APP_KEY, DROPBOX_APP_SECRET);

    if (!accessToken) {
      return jsonResponse({ error: "No Dropbox connection. Connect via Settings first." }, 401);
    }

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "create_folder":
        return await createFolder(accessToken, body.path);
      case "upload":
        return await uploadFile(accessToken, body.path, body.content_base64);
      case "list_folder":
        return await listFolder(accessToken, body.path);
      case "create_shared_link":
        return await createSharedLink(accessToken, body.path);
      case "get_metadata":
        return await getMetadata(accessToken, body.path);
      default:
        return jsonResponse({
          error: "Invalid action. Use: create_folder, upload, list_folder, create_shared_link, get_metadata",
        }, 400);
    }
  } catch (err) {
    console.error("dropbox-files error:", err);
    return jsonResponse({ error: err.message || "Internal server error" }, 500);
  }
});

async function getValidAccessToken(
  supabase: any,
  appKey: string,
  appSecret: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("dropbox_connections")
    .select("id, access_token, refresh_token, token_expires_at")
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const expiresAt = data.token_expires_at ? new Date(data.token_expires_at) : null;
  const isExpired = !expiresAt || expiresAt.getTime() < Date.now() + 60_000;

  if (!isExpired) return data.access_token;

  // Refresh the token
  const res = await fetch("https://api.dropboxapi.com/2/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: data.refresh_token,
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
    .eq("id", data.id);

  return tokens.access_token;
}

async function createFolder(token: string, path: string) {
  if (!path) return jsonResponse({ error: "path is required" }, 400);

  const res = await fetch("https://api.dropboxapi.com/2/files/create_folder_v2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path, autorename: false }),
  });

  if (!res.ok) {
    const err = await res.json();
    if (err?.error?.[".tag"] === "path" && err.error.path?.[".tag"] === "conflict") {
      return jsonResponse({ success: true, already_exists: true, path });
    }
    return jsonResponse({ error: "Failed to create folder", detail: err }, 400);
  }

  const data = await res.json();
  return jsonResponse({ success: true, metadata: data.metadata });
}

async function uploadFile(token: string, path: string, contentBase64: string) {
  if (!path || !contentBase64) {
    return jsonResponse({ error: "path and content_base64 are required" }, 400);
  }

  const fileBytes = Uint8Array.from(atob(contentBase64), (c) => c.charCodeAt(0));

  const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path,
        mode: "overwrite",
        autorename: false,
        mute: true,
      }),
    },
    body: fileBytes,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Upload failed:", err);
    return jsonResponse({ error: "Upload failed" }, 400);
  }

  const data = await res.json();
  return jsonResponse({ success: true, metadata: data });
}

async function listFolder(token: string, path: string) {
  const res = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path: path || "", recursive: false }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("List folder failed:", err);
    return jsonResponse({ error: "Failed to list folder" }, 400);
  }

  const data = await res.json();
  return jsonResponse({
    entries: data.entries.map((e: any) => ({
      name: e.name,
      path: e.path_display,
      type: e[".tag"],
      size: e.size ?? null,
      modified: e.server_modified ?? null,
    })),
    has_more: data.has_more,
  });
}

async function createSharedLink(token: string, path: string) {
  if (!path) return jsonResponse({ error: "path is required" }, 400);

  const res = await fetch(
    "https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path,
        settings: { requested_visibility: "public", audience: "public" },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.json();
    // If link already exists, fetch it
    if (err?.error?.[".tag"] === "shared_link_already_exists") {
      const existing = await fetch(
        "https://api.dropboxapi.com/2/sharing/list_shared_links",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ path, direct_only: true }),
        },
      );
      if (existing.ok) {
        const links = await existing.json();
        if (links.links?.length > 0) {
          return jsonResponse({ success: true, url: links.links[0].url });
        }
      }
    }
    return jsonResponse({ error: "Failed to create shared link", detail: err }, 400);
  }

  const data = await res.json();
  return jsonResponse({ success: true, url: data.url });
}

async function getMetadata(token: string, path: string) {
  if (!path) return jsonResponse({ error: "path is required" }, 400);

  const res = await fetch("https://api.dropboxapi.com/2/files/get_metadata", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path }),
  });

  if (!res.ok) {
    const err = await res.text();
    return jsonResponse({ error: "Failed to get metadata" }, 400);
  }

  const data = await res.json();
  return jsonResponse({
    name: data.name,
    path: data.path_display,
    type: data[".tag"],
    size: data.size ?? null,
    modified: data.server_modified ?? null,
  });
}
