/**
 * Central registry of Anthropic model names used across CVP edge functions.
 *
 * Two tiers:
 *   MODEL_BASELINE — routine prescreen passes, inbound classification, any
 *                    high-volume or low-stakes call. Cheap + fast.
 *   MODEL_QUALITY  — staff-triggered, decision-quality work where accuracy
 *                    dominates cost. Reassessment with staff context, all
 *                    decision-AI rewrites (reject reason / waitlist / request
 *                    info / approval welcome), future reference-email
 *                    drafting + response analysis, future test grading.
 *
 * Override at runtime via env vars CVP_MODEL_BASELINE / CVP_MODEL_QUALITY so
 * model upgrades don't require redeploys (set in Supabase dashboard →
 * Edge Functions → Manage secrets).
 */

export const MODEL_BASELINE: string =
  Deno.env.get("CVP_MODEL_BASELINE") ?? "claude-sonnet-4-5";

export const MODEL_QUALITY: string =
  Deno.env.get("CVP_MODEL_QUALITY") ?? "claude-opus-4-7";

/**
 * Fast + small model for trivial classification (e.g. "is this inbound an
 * unsubscribe?"). Used only where accuracy at the tail is negligible.
 */
export const MODEL_CLASSIFY: string =
  Deno.env.get("CVP_MODEL_CLASSIFY") ?? "claude-haiku-4-5";
