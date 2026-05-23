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
    const body = await req.json();
    const { action } = body;

    if (action === "exchange") {
      return await handleExchange(body, supabase, DROPBOX_APP_KEY, DROPBOX_APP_SECRET);
    }

    if (action === "status") {
      return await handleStatus(supabase);
    }

    if (action === "disconnect") {
      return await handleDisconnect(supabase, DROPBOX_APP_KEY);
    }

    return jsonResponse({ error: "Invalid action. Use: exchange, status, disconnect" }, 400);
  } catch (err) {
    console.error("dropbox-oauth error:", err);
    return jsonResponse({ error: err.message || "Internal server error" }, 500);
  }
});

async function handleExchange(
  body: { code: string; redirect_uri: string },
  supabase: any,
  appKey: string,
  appSecret: string,
) {
  const { code, redirect_uri } = body;

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

  // Fetch account info for display
  const accountRes = await fetch(
    "https://api.dropboxapi.com/2/users/get_current_account",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    },
  );

  let accountEmail = null;
  let accountId = null;
  if (accountRes.ok) {
    const account = await accountRes.json();
    accountEmail = account.email;
    accountId = account.account_id;
  }

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  // Upsert — singleton row via the unique index on (true)
  const { error: dbError } = await supabase.from("dropbox_connections").upsert(
    {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      account_id: accountId,
      account_email: accountEmail,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "((true))" },
  );

  if (dbError) {
    console.error("DB upsert error:", dbError);
    // Fall back to delete + insert if the onConflict expression doesn't work
    await supabase.from("dropbox_connections").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const { error: insertError } = await supabase.from("dropbox_connections").insert({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      account_id: accountId,
      account_email: accountEmail,
      token_expires_at: expiresAt,
    });
    if (insertError) {
      console.error("DB insert error:", insertError);
      return jsonResponse({ error: "Failed to save connection" }, 500);
    }
  }

  return jsonResponse({
    success: true,
    account_email: accountEmail,
    account_id: accountId,
  });
}

async function handleStatus(supabase: any) {
  const { data, error } = await supabase
    .from("dropbox_connections")
    .select("account_email, account_id, token_expires_at, created_at, updated_at")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Status query error:", error);
    return jsonResponse({ error: "Failed to check status" }, 500);
  }

  return jsonResponse({
    connected: !!data,
    account_email: data?.account_email ?? null,
    account_id: data?.account_id ?? null,
    connected_at: data?.created_at ?? null,
  });
}

async function handleDisconnect(supabase: any, appKey: string) {
  const { data } = await supabase
    .from("dropbox_connections")
    .select("access_token")
    .limit(1)
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

  await supabase
    .from("dropbox_connections")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  return jsonResponse({ success: true, connected: false });
}
