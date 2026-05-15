/**
 * requireCronSecret() — authentication helper for cron-only edge functions.
 *
 * Mirrors cethosvendorportal's `supabase/functions/_shared/require-cron-secret.ts`.
 * Keep the algorithms identical — pg_cron sends one secret in the
 * `x-cron-secret` header; either repo's cron edge functions verify it the
 * same way. Audit finding H-5.
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
