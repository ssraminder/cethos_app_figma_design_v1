/**
 * requireCronSecret() — authentication helper for cron-only edge functions.
 *
 * Audit finding H-5. The cron-only edge functions (cvp-*-send,
 * cvp-*-followups, cvp-*-recruitment-status, vendor-*-cron, etc.)
 * were deployed with verify_jwt=false and had no internal auth gate —
 * anyone with the URL could POST and force-flush queued sends.
 *
 * Pattern: caller (pg_cron via net.http_post) sends the shared secret
 * in the `x-cron-secret` header. The secret lives in vault.secrets
 * (name: cron_shared_secret); the edge function fetches it through a
 * SECURITY DEFINER RPC and timing-safe compares.
 *
 * Returns 401 on missing/wrong header. Returns 503 if the secret
 * isn't configured (loud failure so we notice during deploy).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function requireCronSecret(req: Request): Promise<CronAuthResult> {
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!provided) {
    return { ok: false, status: 401, error: "missing_cron_secret" };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, status: 503, error: "service_env_missing" };
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc("get_cron_shared_secret");
  if (error || typeof data !== "string" || !data) {
    return { ok: false, status: 503, error: "cron_secret_unavailable" };
  }

  if (!timingSafeEqual(provided, data)) {
    return { ok: false, status: 401, error: "invalid_cron_secret" };
  }
  return { ok: true };
}
