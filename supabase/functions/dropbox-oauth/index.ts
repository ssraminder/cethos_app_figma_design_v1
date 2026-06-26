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

// Connection slots, keyed by `purpose` (migration
// 20260625_team_dropbox_sync_foundation):
//   legacy = the original personal Dropbox (raminder.shah@wordsmith.in) the old
//            dropbox-sync writes to.
//   team   = the Cethos team Dropbox that dropbox-team-sync writes to.
function normalizePurpose(p: unknown): "legacy" | "team" {
  return p === "team" ? "team" : "legacy";
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
    const body = await req.json();
    const { action } = body;

    if (action === "exchange") {
      return await handleExchange(body, supabase, DROPBOX_APP_KEY, DROPBOX_APP_SECRET);
    }

    if (action === "status") {
      return await handleStatus(body, supabase);
    }

    if (action === "disconnect") {
      return await handleDisconnect(body, supabase, DROPBOX_APP_KEY);
    }

    return jsonResponse({ error: "Invalid action. Use: exchange, status, disconnect" }, 400);
  } catch (err) {
    console.error("dropbox-oauth error:", err);
    return jsonResponse({ error: err.message || "Internal server error" }, 500);
  }
});

async function handleExchange(
  body: { code: string; redirect_uri: string; purpose?: string },
  supabase: any,
  appKey: string,
  appSecret: string,
) {
  const { code, redirect_uri } = body;
  const purpose = normalizePurpose(body.purpose);

  if (!code || !redirect_uri) {
    return jsonResponse({ error: "code and redirect_uri are required" }, 400);
  }

  const tokenRes = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: appKey,
      client_secret: appSecret,
      redirect_uri,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("Dropbox token exchange failed:", tokenRes.status, errText);
    // Surface the actual Dropbox error so admin can diagnose (redirect_uri
    // mismatch, bad secret, expired code, etc.)
    let detail = "";
    try {
      const parsed = JSON.parse(errText);
      detail = parsed.error_description || parsed.error || errText;
    } catch {
      detail = errText;
    }
    return jsonResponse({
      error: `Token exchange failed: ${detail}`,
      dropbox_status: tokenRes.status,
    }, 400);
  }

  const tokens = await tokenRes.json();

  // Fetch account info for display + the team-space root namespace (returned for
  // info; dropbox-team-sync re-fetches it at runtime to set Dropbox-API-Path-Root).
  const accountRes = await fetch(
    "https://api.dropboxapi.com/2/users/get_current_account",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    },
  );

  let accountEmail = null;
  let accountId = null;
  let rootNamespaceId = null;
  if (accountRes.ok) {
    const account = await accountRes.json();
    accountEmail = account.email;
    accountId = account.account_id;
    rootNamespaceId = account?.root_info?.root_namespace_id ?? null;
  }

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  const row = {
    purpose,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    account_id: accountId,
    account_email: accountEmail,
    token_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  };

  // Upsert on `purpose` — one connection per slot. (Was a hard singleton.)
  const { error: dbError } = await supabase
    .from("dropbox_connections")
    .upsert(row, { onConflict: "purpose" });

  if (dbError) {
    console.error("DB upsert error:", dbError);
    // Fallback: delete only the SAME-purpose row, then insert. Never touches
    // the other slot.
    await supabase.from("dropbox_connections").delete().eq("purpose", purpose);
    const { error: insertError } = await supabase
      .from("dropbox_connections")
      .insert(row);
    if (insertError) {
      console.error("DB insert error:", insertError);
      return jsonResponse({ error: "Failed to save connection" }, 500);
    }
  }

  return jsonResponse({
    success: true,
    purpose,
    account_email: accountEmail,
    account_id: accountId,
    root_namespace_id: rootNamespaceId,
  });
}

async function handleStatus(body: { purpose?: string }, supabase: any) {
  // Specific purpose -> just that slot. Otherwise return every slot (the new
  // settings UI shows both) PLUS back-compat top-level fields for the legacy
  // slot so the current UI keeps working until it's updated.
  const wantPurpose = body?.purpose ? normalizePurpose(body.purpose) : null;

  const { data, error } = await supabase
    .from("dropbox_connections")
    .select("purpose, account_email, account_id, token_expires_at, created_at, updated_at")
    .order("purpose");

  if (error) {
    console.error("Status query error:", error);
    return jsonResponse({ error: "Failed to check status" }, 500);
  }

  const connections = (data ?? []).map((c: any) => ({
    purpose: c.purpose,
    connected: true,
    account_email: c.account_email ?? null,
    account_id: c.account_id ?? null,
    connected_at: c.created_at ?? null,
  }));

  if (wantPurpose) {
    const one = connections.find((c: any) => c.purpose === wantPurpose) ?? null;
    return jsonResponse({
      connected: !!one,
      purpose: wantPurpose,
      account_email: one?.account_email ?? null,
      account_id: one?.account_id ?? null,
      connected_at: one?.connected_at ?? null,
    });
  }

  // Back-compat: top-level reflects the legacy slot (what the current UI reads).
  const legacy = connections.find((c: any) => c.purpose === "legacy") ?? null;
  return jsonResponse({
    connected: !!legacy,
    account_email: legacy?.account_email ?? null,
    account_id: legacy?.account_id ?? null,
    connected_at: legacy?.connected_at ?? null,
    connections,
  });
}

async function handleDisconnect(
  body: { purpose?: string },
  supabase: any,
  _appKey: string,
) {
  const purpose = normalizePurpose(body?.purpose);

  const { data } = await supabase
    .from("dropbox_connections")
    .select("access_token")
    .eq("purpose", purpose)
    .maybeSingle();

  // Revoke token at Dropbox
  if (data?.access_token) {
    try {
      await fetch("https://api.dropboxapi.com/2/auth/token/revoke", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
    } catch (e) {
      console.warn("Token revoke failed (non-fatal):", e);
    }
  }

  await supabase.from("dropbox_connections").delete().eq("purpose", purpose);

  return jsonResponse({ success: true, connected: false, purpose });
}
