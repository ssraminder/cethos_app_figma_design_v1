/**
 * Aggregate staff verdicts on past AI flags into a "STAFF GUIDANCE" block
 * prepended to the prescreen system prompt. This is the global-learning loop:
 * every verdict you save makes every future prescreen smarter.
 *
 * Phase 1 scope:
 *   - Only suppresses red_flags marked `invalid` by staff (the highest-signal
 *     improvement — stops AI from repeating known-noise flags).
 *   - Aggregates by exact `flag_text` (paraphrase clustering can come later
 *     via pg_trgm if we see Claude rewording its own flags often).
 *   - Trigger threshold: a flag must have ≥2 staff verdicts AND ≥70% of those
 *     verdicts must be `invalid` to count as guidance. Keeps single-staff
 *     opinions from steering the model.
 *
 * Gracefully degrades — if cvp_prescreen_flag_feedback doesn't exist yet
 * (migration 015 not applied), returns empty guidance and the prescreener
 * falls back to baseline behaviour.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const MIN_VERDICTS = 2;
const MIN_INVALID_RATE = 0.7;
const MAX_GUIDANCE_ITEMS = 25;

interface FeedbackRow {
  flag_text: string;
  verdict: string;
  staff_notes: string | null;
}

export interface GuidanceResult {
  guidanceText: string;
  patternCount: number;
  totalFeedbackRows: number;
  error: string | null;
}

interface PatternStats {
  flagText: string;
  total: number;
  invalid: number;
  notes: string[]; // staff notes from invalid verdicts (for the "why")
}

/**
 * Build the staff-guidance section for the prescreen system prompt.
 * Returns empty string if there's nothing actionable yet.
 */
export async function buildPrescreenGuidance(
  supabase: SupabaseClient,
): Promise<GuidanceResult> {
  let rows: FeedbackRow[] = [];
  try {
    const { data, error } = await supabase
      .from("cvp_prescreen_flag_feedback")
      .select("flag_text, verdict, staff_notes")
      .eq("flag_kind", "red_flag")
      .limit(2000);
    if (error) {
      // Most likely: table doesn't exist yet (migration 015 not applied).
      return {
        guidanceText: "",
        patternCount: 0,
        totalFeedbackRows: 0,
        error: error.message,
      };
    }
    rows = (data ?? []) as FeedbackRow[];
  } catch (err) {
    return {
      guidanceText: "",
      patternCount: 0,
      totalFeedbackRows: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (rows.length === 0) {
    return {
      guidanceText: "",
      patternCount: 0,
      totalFeedbackRows: 0,
      error: null,
    };
  }

  // Aggregate by exact flag text.
  const byText = new Map<string, PatternStats>();
  for (const r of rows) {
    const key = (r.flag_text ?? "").trim();
    if (!key) continue;
    let p = byText.get(key);
    if (!p) {
      p = { flagText: key, total: 0, invalid: 0, notes: [] };
      byText.set(key, p);
    }
    p.total += 1;
    if (r.verdict === "invalid") {
      p.invalid += 1;
      if (r.staff_notes && r.staff_notes.trim().length > 0) {
        p.notes.push(r.staff_notes.trim());
      }
    }
  }

  // Filter to actionable patterns + sort by signal strength.
  const patterns = Array.from(byText.values())
    .filter(
      (p) =>
        p.total >= MIN_VERDICTS && p.invalid / p.total >= MIN_INVALID_RATE,
    )
    .sort((a, b) => {
      // Higher invalid count first; then higher invalid rate
      if (b.invalid !== a.invalid) return b.invalid - a.invalid;
      return b.invalid / b.total - a.invalid / a.total;
    })
    .slice(0, MAX_GUIDANCE_ITEMS);

  if (patterns.length === 0) {
    return {
      guidanceText: "",
      patternCount: 0,
      totalFeedbackRows: rows.length,
      error: null,
    };
  }

  // Format guidance section. Keep tight — every token costs.
  const lines = patterns.map((p, i) => {
    // Pick the most informative staff note (longest, deduplicated).
    const uniqueNotes = Array.from(new Set(p.notes));
    uniqueNotes.sort((a, b) => b.length - a.length);
    const reason = uniqueNotes[0]?.slice(0, 240) ?? "";
    const reasonSuffix = reason ? `\n   Why: ${reason}` : "";
    return `${i + 1}. "${p.flagText}" — staff marked invalid ${p.invalid}/${p.total} times.${reasonSuffix}`;
  });

  const guidanceText = `STAFF GUIDANCE — DO NOT REPEAT THESE FLAGS

The following red-flag patterns have been reviewed by senior staff on prior applications and explicitly marked as INVALID signals. Do not include them in red_flags. If the underlying observation is still relevant, you may mention it in notes (without flagging) or skip entirely.

${lines.join("\n\n")}

When evaluating the current application, weigh these guidance items above your default heuristics. The staff's reasoning supersedes generic concerns about lack of certifications, lack of Canadian-market presence, age/youth, volunteer experience, or other patterns explicitly suppressed above.`;

  return {
    guidanceText,
    patternCount: patterns.length,
    totalFeedbackRows: rows.length,
    error: null,
  };
}
