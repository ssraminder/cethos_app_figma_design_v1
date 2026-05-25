// =============================================================================
// _shared/ringcentral.ts — RingCentral JWT auth + thin REST client
//
// Auth flow (JWT bearer grant):
//   POST {server}/restapi/oauth/token
//     Authorization: Basic base64(client_id:client_secret)
//     grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
//     assertion=<the long-lived JWT credential we created in RC dashboard>
//   → { access_token, expires_in, refresh_token, ... }
//
// Access tokens last ~1h. We cache the current one in comms.rc_token_cache
// (single-row table) so multiple edge function invocations share it.
//
// Required Supabase secrets:
//   RC_SERVER_URL        e.g. https://platform.ringcentral.com
//   RC_CLIENT_ID
//   RC_CLIENT_SECRET
//   RC_JWT               (the long-lived JWT from /my-credentials)
//   RC_SMS_FROM_NUMBER   E.164 of the business RingCentral number
// =============================================================================

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const TOKEN_REFRESH_SLACK_MS = 60_000; // refresh if expiring within next 60s

export interface RcTokenRow {
  access_token: string;
  refresh_token: string | null;
  token_type: string | null;
  scope: string | null;
  owner_id: string | null;
  expires_at: string;
  refresh_expires_at: string | null;
}

export interface RcConfig {
  serverUrl: string;
  clientId: string;
  clientSecret: string;
  jwt: string;
  smsFromNumber: string;
}

export function getRcConfig(): RcConfig {
  const serverUrl = (Deno.env.get("RC_SERVER_URL") || "https://platform.ringcentral.com").replace(/\/+$/, "");
  const clientId = Deno.env.get("RC_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("RC_CLIENT_SECRET") || "";
  const jwt = Deno.env.get("RC_JWT") || "";
  const smsFromNumber = Deno.env.get("RC_SMS_FROM_NUMBER") || "";
  if (!clientId || !clientSecret || !jwt) {
    throw new Error("RingCentral env missing: RC_CLIENT_ID, RC_CLIENT_SECRET, RC_JWT required");
  }
  return { serverUrl, clientId, clientSecret, jwt, smsFromNumber };
}

export function getAdminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  // Default-schema deliberately left as public. Every rc-* function calls
  // `admin.rpc("comms_*", …)` against SECURITY DEFINER wrappers that live
  // in public — pointing the client at `comms` made PostgREST refuse with
  // PGRST106 ("Invalid schema: comms"), which silently killed every
  // upsert and forced the token cache to miss on every call (→ RC OAuth
  // 429 storm). Token + log writes both go through public wrappers; no
  // call site touches comms.* directly.
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getPublicAdminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchNewAccessToken(cfg: RcConfig): Promise<RcTokenRow> {
  const url = `${cfg.serverUrl}/restapi/oauth/token`;
  const basic = btoa(`${cfg.clientId}:${cfg.clientSecret}`);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: cfg.jwt,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`rc_token_exchange_failed: ${res.status} ${text}`);
  }
  const json = JSON.parse(text);
  const now = Date.now();
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? null,
    token_type: json.token_type ?? "bearer",
    scope: json.scope ?? null,
    owner_id: json.owner_id ?? null,
    expires_at: new Date(now + (json.expires_in ?? 3600) * 1000).toISOString(),
    refresh_expires_at: json.refresh_token_expires_in
      ? new Date(now + json.refresh_token_expires_in * 1000).toISOString()
      : null,
  };
}

export async function getAccessToken(
  admin: SupabaseClient,
  cfg: RcConfig,
): Promise<string> {
  // comms schema isn't exposed to PostgREST; use security-definer RPC proxies in public.
  const { data: cached } = await admin.rpc("comms_get_rc_token");
  const row = Array.isArray(cached) ? cached[0] : cached;

  if (row && row.access_token && new Date(row.expires_at).getTime() - Date.now() > TOKEN_REFRESH_SLACK_MS) {
    return row.access_token as string;
  }

  const fresh = await fetchNewAccessToken(cfg);
  const { error: upsertErr } = await admin.rpc("comms_upsert_rc_token", {
    p_access_token: fresh.access_token,
    p_refresh_token: fresh.refresh_token,
    p_token_type: fresh.token_type,
    p_scope: fresh.scope,
    p_owner_id: fresh.owner_id,
    p_expires_at: fresh.expires_at,
    p_refresh_expires_at: fresh.refresh_expires_at,
  });
  if (upsertErr) {
    console.error("rc_token_cache_upsert_failed", upsertErr);
  }
  return fresh.access_token;
}

export interface RcRequestOpts {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Send as application/x-www-form-urlencoded instead of JSON */
  form?: Record<string, string>;
}

export async function rcRequest(
  admin: SupabaseClient,
  cfg: RcConfig,
  path: string,
  opts: RcRequestOpts = {},
): Promise<{ status: number; body: unknown }> {
  const token = await getAccessToken(admin, cfg);
  const url = new URL(`${cfg.serverUrl}${path.startsWith("/") ? path : `/${path}`}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  let body: BodyInit | undefined;
  if (opts.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(opts.form).toString();
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(url.toString(), {
    method: opts.method ?? "GET",
    headers,
    body,
  });
  const text = await res.text();
  let parsed: unknown = text;
  if (text && text.trim().startsWith("{") || text.trim().startsWith("[")) {
    try { parsed = JSON.parse(text); } catch { /* leave as text */ }
  }
  return { status: res.status, body: parsed };
}

/**
 * E.164 normalize. Mirrors the SQL comms.normalize_phone() so we can match locally.
 */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (!digits) return null;
  if (hasPlus) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

export function jsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
