/**
 * Red-flag severity classifier for prescreen results.
 *
 * The prescreen AI returns red_flags as an unweighted string array. For
 * auto-send-test logic we need to know which flags are blocking (critical)
 * vs. advisory (low/medium). Staff retains the final decision in the admin
 * UI either way; this only gates whether a General test goes out without
 * staff intervention.
 *
 * Severity buckets:
 *   - critical:  hard-block auto-send. Real signal of fraud, contradiction,
 *                or fundamental ineligibility. Staff must review.
 *   - medium:    notable concern but not auto-blocking. Test still goes out;
 *                staff sees the flag in the admin queue.
 *   - low:       advisory only — common, often noisy. Doesn't block anything.
 *
 * CV-vs-application mismatches are LOW by policy (per the April 2026 review:
 * most are minor numeric drift in years claimed, not deception). Staff can
 * still escalate them via the existing flag-feedback loop.
 *
 * Classification is pattern-based — case-insensitive substring match against
 * the flag string. Order matters: critical > medium > low. First match wins.
 */

export type FlagSeverity = "critical" | "medium" | "low";

interface PatternRule {
  patterns: string[];
  severity: FlagSeverity;
}

// Order matters: more specific / severe rules go first.
const RULES: PatternRule[] = [
  // ---- CRITICAL: hard signals of fraud, contradiction, or fundamental ineligibility ----
  {
    severity: "critical",
    patterns: [
      "fraudulent",
      "fraud",
      "fabricated",
      "plagiarised",
      "plagiarized",
      "fake credential",
      "fake certificate",
      "forged",
      "duplicate application",
      "previously rejected",
      "blocked applicant",
      "do not contact",
    ],
  },
  // CV directly contradicts the application form — distinct from "partial mismatch"
  {
    severity: "critical",
    patterns: [
      "cv contradicts",
      "cv directly contradicts",
      "resume contradicts",
      "resume directly contradicts",
      "cv shows opposite",
    ],
  },

  // ---- LOW: CV vs. application mismatches that aren't direct contradictions ----
  // These are usually numeric drift in years/dates and rarely worth blocking
  // a General test on. Per April 2026 policy decision.
  {
    severity: "low",
    patterns: [
      "cv vs application",
      "cv mismatch",
      "resume mismatch",
      "claimed years",
      "years experience but cv",
      "cv shows only",
      "discrepancy in years",
      "form claims more than cv",
      "form claims less than cv",
      "cv lists fewer",
      "cv lists less",
    ],
  },

  // ---- MEDIUM: notable concerns that should be visible but not blocking ----
  {
    severity: "medium",
    patterns: [
      "missing certification",
      "no proof of",
      "unverified credential",
      "limited evidence",
      "thin portfolio",
      "no portfolio",
      "no work samples",
      "outdated certification",
      "expired certification",
      "rate above market",
      "rate below market",
    ],
  },
];

/**
 * Classify a single red-flag string into a severity bucket.
 * Defaults to "medium" if no pattern matches — unrecognised flags are
 * treated as notable but not auto-blocking.
 */
export function classifyFlag(flag: string): FlagSeverity {
  const lower = flag.toLowerCase();
  for (const rule of RULES) {
    if (rule.patterns.some((p) => lower.includes(p))) {
      return rule.severity;
    }
  }
  return "medium";
}

export interface FlagBreakdown {
  critical: string[];
  medium: string[];
  low: string[];
}

export function classifyFlags(flags: string[] | null | undefined): FlagBreakdown {
  const out: FlagBreakdown = { critical: [], medium: [], low: [] };
  for (const f of flags ?? []) {
    out[classifyFlag(f)].push(f);
  }
  return out;
}

/**
 * Should auto-send-test fire for this prescreen result?
 *
 * Inputs:
 *   - score: ai_prescreening_score (0–100)
 *   - cvCorroborates: ai_prescreening_result.cv_corroborates_form
 *   - flags: ai_prescreening_result.red_flags
 *   - safeMode: don't auto-send when safe mode is active
 *
 * Auto-send rules (April 2026):
 *   - safe mode active                      → no
 *   - score < 40                            → no (truly failing)
 *   - cv_corroborates_form === "contradicts" → no (hard CV contradiction)
 *   - any critical-severity flag             → no
 *   - otherwise                              → yes
 */
export function shouldAutoSendTest(args: {
  score: number;
  cvCorroborates?: string | null;
  flags?: string[] | null;
  safeMode: boolean;
}): { allowed: boolean; reason: string; breakdown: FlagBreakdown } {
  const breakdown = classifyFlags(args.flags ?? []);
  if (args.safeMode) {
    return { allowed: false, reason: "safe_mode_active", breakdown };
  }
  if (args.score < 40) {
    return { allowed: false, reason: "score_below_40", breakdown };
  }
  if (args.cvCorroborates === "contradicts") {
    return { allowed: false, reason: "cv_contradicts", breakdown };
  }
  if (breakdown.critical.length > 0) {
    return {
      allowed: false,
      reason: `critical_flag: ${breakdown.critical[0].slice(0, 80)}`,
      breakdown,
    };
  }
  return { allowed: true, reason: "ok", breakdown };
}
