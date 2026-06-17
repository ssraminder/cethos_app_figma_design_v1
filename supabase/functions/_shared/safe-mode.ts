/**
 * Safe-mode gate for CVP pipeline.
 *
 * When active, blocks automated vendor-facing decisive emails and auto-status
 * advances — everything decisive routes through an explicit staff approval
 * action instead. Designed to stay active for the first 30 days OR first 200
 * approved applications, whichever comes first, unless an admin manually
 * toggles it off via cvp_system_config.safe_mode.manual_override.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export interface SafeModeStatus {
  active: boolean;
  reason: string;
  startedAt: string | null;
  targetDays: number;
  targetApps: number;
  daysElapsed: number | null;
  daysRemaining: number | null;
  approvedApps: number | null;
  appsRemaining: number | null;
  manualOverride: "on" | "off" | null;
}

export async function getSafeModeStatus(
  supabase: SupabaseClient,
): Promise<SafeModeStatus> {
  // 1) Load config row. If absent (migration not applied), fail CLOSED = safe.
  const { data: cfgRow, error: cfgErr } = await supabase
    .from("cvp_system_config")
    .select("value")
    .eq("key", "safe_mode")
    .maybeSingle();

  if (cfgErr || !cfgRow) {
    return {
      active: true,
      reason: cfgErr
        ? `config_unreachable (${cfgErr.message ?? "unknown"}); defaulting to SAFE`
        : "config_missing; defaulting to SAFE",
      startedAt: null,
      targetDays: 30,
      targetApps: 200,
      daysElapsed: null,
      daysRemaining: null,
      approvedApps: null,
      appsRemaining: null,
      manualOverride: null,
    };
  }

  const cfg = (cfgRow.value ?? {}) as {
    manual_override?: "on" | "off" | null;
    started_at?: string;
    target_days?: number;
    target_apps?: number;
  };
  const manualOverride = (cfg.manual_override ?? null) as "on" | "off" | null;
  const targetDays = typeof cfg.target_days === "number" ? cfg.target_days : 30;
  const targetApps = typeof cfg.target_apps === "number" ? cfg.target_apps : 200;
  const startedAt = cfg.started_at ?? null;

  if (manualOverride === "off") {
    return {
      active: false,
      reason: "manual_override=off",
      startedAt,
      targetDays,
      targetApps,
      daysElapsed: null,
      daysRemaining: null,
      approvedApps: null,
      appsRemaining: null,
      manualOverride,
    };
  }

  if (manualOverride === "on") {
    return {
      active: true,
      reason: "manual_override=on",
      startedAt,
      targetDays,
      targetApps,
      daysElapsed: null,
      daysRemaining: null,
      approvedApps: null,
      appsRemaining: null,
      manualOverride,
    };
  }

  // 2) Auto evaluation: compute time elapsed + approved count.
  let daysElapsed: number | null = null;
  if (startedAt) {
    const start = Date.parse(startedAt);
    if (Number.isFinite(start)) {
      daysElapsed = Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24));
    }
  }

  const { count: approvedCount } = await supabase
    .from("cvp_applications")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved");
  const approvedApps = approvedCount ?? 0;

  const daysRemaining =
    daysElapsed !== null ? Math.max(0, targetDays - daysElapsed) : null;
  const appsRemaining = Math.max(0, targetApps - approvedApps);

  const daysDone = daysElapsed !== null && daysElapsed >= targetDays;
  const appsDone = approvedApps >= targetApps;

  // Lifts when EITHER threshold reached.
  const active = !daysDone && !appsDone;

  const reason = active
    ? `auto (days=${daysElapsed}/${targetDays}, apps=${approvedApps}/${targetApps})`
    : daysDone && appsDone
    ? "auto (both thresholds reached)"
    : daysDone
    ? `auto (${targetDays}-day window elapsed)`
    : `auto (${targetApps}-app threshold reached)`;

  return {
    active,
    reason,
    startedAt,
    targetDays,
    targetApps,
    daysElapsed,
    daysRemaining,
    approvedApps,
    appsRemaining,
    manualOverride,
  };
}

/** Shorthand when callers only need the boolean. */
export async function isSafeModeActive(
  supabase: SupabaseClient,
): Promise<boolean> {
  const s = await getSafeModeStatus(supabase);
  return s.active;
}
