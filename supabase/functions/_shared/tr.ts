// Shared utilities for tr-* edge functions.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// Caller's authenticated session (used to identify staff_users actor when writing audit log).
export async function actorFromRequest(req: Request, sb: SupabaseClient): Promise<{ id: string | null; email: string | null }> {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return { id: null, email: null };
  const token = auth.replace(/^Bearer\s+/i, "");
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return { id: null, email: null };
  return { id: data.user.id, email: data.user.email ?? null };
}

export async function writeAudit(
  sb: SupabaseClient,
  args: {
    job_id: string;
    action: string;
    actor_id?: string | null;
    actor_email?: string | null;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await sb.from("audit_log").insert({
    job_id: args.job_id,
    action: args.action,
    actor_id: args.actor_id ?? null,
    actor_email: args.actor_email ?? null,
    payload: args.payload ?? {},
  });
  if (error) {
    console.error("[tr] audit_log write failed:", error);
  }
}

// Convenience for cross-schema selects/inserts: the supabase-js client defaults
// to the `public` schema. Switch via `.schema('tr')`.
export function tr(sb: SupabaseClient) {
  // @ts-ignore — schema() is available on the v2 client.
  return sb.schema("tr");
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
