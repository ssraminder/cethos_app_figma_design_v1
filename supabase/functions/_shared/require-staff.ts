/**
 * requireStaff() — authentication helper for staff-only edge functions.
 *
 * Pattern: the function is deployed with verify_jwt=false (project
 * convention, see admin repo memory note 2026-05-11). The gateway does
 * NOT validate the Authorization header — we do it inside the function
 * by passing the bearer token to supabase.auth.getUser() and then
 * resolving the staff_users row.
 *
 * Callers must invoke via `supabase.functions.invoke(...)` from a
 * signed-in admin session (the SDK attaches the Supabase auth JWT as
 * Authorization: Bearer ...). Hand-rolled fetch without the header
 * will fail with 401.
 *
 * Returns the verified staff_users.id so callers must STOP trusting
 * `body.staffId` for attribution — audit-log columns
 * (approved_by, staff_reviewed_by, acknowledged_by, etc.) should use
 * the returned staffId instead.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export interface StaffContext {
  staffId: string;
  authUserId: string;
  email: string;
  fullName: string | null;
  role: string;
}

export type RequireStaffResult =
  | { ok: true; staff: StaffContext }
  | { ok: false; status: 401 | 403; error: string };

export async function requireStaff(req: Request): Promise<RequireStaffResult> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return { ok: false, status: 401, error: "missing_bearer_token" };
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return { ok: false, status: 401, error: "empty_bearer_token" };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, status: 401, error: "auth_env_missing" };
  }

  // Verify the JWT by passing it explicitly to auth.getUser(token). Two
  // important details fixed here vs. the previous implementation:
  //   1) getUser() with no arg uses the client's stored session — but we
  //      run with persistSession:false, so there's no session and the
  //      auth library sends no Authorization header, causing the call to
  //      /auth/v1/user to return invalid_token. Passing the JWT
  //      explicitly is the supported supabase-js v2 pattern.
  //   2) We construct the validator client with the service_role key as
  //      `apikey`. The anon key used previously is now ambiguous (legacy
  //      JWT vs new sb_publishable_* format) per the 2026-05-14 key-format
  //      rollout, and a mismatched apikey causes /auth/v1/user to return
  //      "Invalid API key" 401. service_role is universally accepted.
  const userClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) {
    return { ok: false, status: 401, error: "invalid_token" };
  }

  // Resolve staff_users by auth_user_id. Use service role to bypass RLS
  // and avoid the possibility of an RLS policy referencing requireStaff()
  // recursively.
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: staff, error: staffErr } = await adminClient
    .from("staff_users")
    .select("id, auth_user_id, email, full_name, role, is_active")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (staffErr || !staff) {
    return { ok: false, status: 403, error: "not_staff" };
  }
  if (!staff.is_active) {
    return { ok: false, status: 403, error: "staff_inactive" };
  }

  return {
    ok: true,
    staff: {
      staffId: staff.id,
      authUserId: staff.auth_user_id,
      email: staff.email,
      fullName: staff.full_name,
      role: staff.role,
    },
  };
}
