// Shared helper for token-auth edge functions on TR share links.
// Resolves a token string → { token_id, job_id, recipient_email, ... } or
// returns a reason ('not_found' | 'expired' | 'revoked'). Idempotent —
// callers stamp use_count + last_used_at via touchToken().

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { tr } from "./tr.ts";

export type ResolvedToken = {
  token_id: string;
  job_id: string;
  recipient_email: string;
  recipient_name: string | null;
  recipient_kind: string;
  expires_at: string;
  revoked_at: string | null;
};

export async function resolveToken(
  sb: SupabaseClient,
  token: string,
): Promise<{ ok: true; data: ResolvedToken } | { ok: false; reason: "not_found" | "expired" | "revoked"; status: number }> {
  if (!token || typeof token !== "string") return { ok: false, reason: "not_found", status: 404 };
  const { data, error } = await tr(sb)
    .from("job_share_tokens")
    .select(
      "id, job_id, recipient_email, recipient_name, recipient_kind, expires_at, revoked_at",
    )
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return { ok: false, reason: "not_found", status: 404 };
  if (data.revoked_at) return { ok: false, reason: "revoked", status: 410 };
  if (new Date(data.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired", status: 410 };
  return {
    ok: true,
    data: {
      token_id: data.id,
      job_id: data.job_id,
      recipient_email: data.recipient_email,
      recipient_name: data.recipient_name ?? null,
      recipient_kind: data.recipient_kind,
      expires_at: data.expires_at,
      revoked_at: data.revoked_at,
    },
  };
}

export async function touchToken(sb: SupabaseClient, token_id: string): Promise<void> {
  try {
    // Read current count, then write incremented.
    const { data } = await tr(sb)
      .from("job_share_tokens")
      .select("use_count")
      .eq("id", token_id)
      .maybeSingle();
    const next = ((data?.use_count as number | undefined) ?? 0) + 1;
    await tr(sb)
      .from("job_share_tokens")
      .update({ use_count: next, last_used_at: new Date().toISOString() })
      .eq("id", token_id);
  } catch (e: any) {
    console.error("touchToken failed:", e?.message || e);
  }
}
