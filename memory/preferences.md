# Preferences

How the user wants you to approach work in this project. Add any time the user corrects your approach OR confirms a non-obvious approach worked. Include the *why* so you can judge edge cases.

## Format
- **Rule** — short statement
  - **Why:** reason given (incident, principle, constraint)
  - **How to apply:** when/where this kicks in

## Code & implementation

- **AI-assisted features: deterministic core + Claude prose** — when an AI feature picks a value (rate, action, score), the value comes from a deterministic formula with documented inputs. Claude is allowed to write the human-readable reasoning paragraph, but never picks the number that bypasses the bounds.
  - **Why:** ISO 17100 auditability — every recommendation must be reproducible from logged inputs. Claude hallucination is unacceptable for billing-impacting decisions.
  - **How to apply:** Store inputs + multipliers + prompt_version in an audit table. Hard bounds enforced server-side regardless of model output. Fall back to template prose when Claude unavailable.

- **Anti-lowball floor on vendor-facing pricing** — when computing a vendor rate, never recommend below 12% of client rate regardless of test score / country COL / experience. "Don't insult with a lowball" is the user's explicit framing.
  - **Why:** Vendor retention. Mediocre test + low-COL country could math out to an offensive number; protect against it.
  - **How to apply:** Hard floor in the deterministic formula. Test by checking that a junior with bad test in a low-COL country still gets a defensible rate.

- **Aggressive counter-back tactic** — when negotiating against a vendor counter, anchor at ~30% of the way from their counter back toward our original (not midpoint). Always cite specific data: pool median, ceiling, vendor history, COL bucket.
  - **Why:** Negotiation theory — meeting in the middle leaves money on the table. 30% anchor signals firm pushback while still moving.
  - **How to apply:** `aggressive_counter_anchor_rate = original + (counter - original) * 0.30` baked into the prompt; deterministic fallback uses the same formula.

- **Edge functions deployed with --no-verify-jwt** — gateway JWT verification is off project-wide. Functions validate session tokens internally (vendor portal uses custom JWT; applicant flows are public; staff JWT arrives as header but isn't gateway-validated).
  - **Why:** Mixed auth contexts (vendor session ≠ Supabase auth, applicant has no auth) make gateway validation impractical.
  - **How to apply:** Always `supabase functions deploy <name> --no-verify-jwt`. Validate inside the function where the auth model demands it.

- **Pricing convention: subtotal = translation only, certification always separate** — since 2026-05-11. Every consumer computes `pre_tax = total − tax_amount` rather than summing components (correct under old + new schemas without backfill).
  - **Why:** Historical inconsistency between `recalculate_quote_totals` (subtotal=translation+cert) and `recalculate_quote_from_groups` (subtotal=translation only) caused certification to double-count on display.
  - **How to apply:** Don't add to the legacy sum-of-components pattern. New display code derives `pre_tax = total - tax`.

## Communication

- **Staircase delivery** — user prefers explicit phases. Ship Phase 1, then Phase 2. "Begin small, and grow."
- **Terse direction; execute on green light** — user gives short answers like "B deploy them in batch" or "1. do recommended" (answering numbered open questions). Don't re-plan after that — execute.
- **Pivot quickly mid-conversation** — user iterates on design. When they clarify intent (e.g. "target = deferred, not flat-amount"), implement the correction in the same session as a follow-up PR, not a long discussion.
- **PR-per-feature workflow** — each phase or fix lands as its own PR. Open + merge in the same session unless the user pauses.

## Tooling & workflow

- **Two repos, one Supabase project** — admin at `D:\cethos\portal\cethos_app_figma_design_v1` (also accessed via temp worktree at `C:\Users\RaminderShah\AppData\Local\Temp\elastic-kapitsa` ↔ `/tmp/elastic-kapitsa`), vendor at `D:\cethos-vendor`. Both deploy edge functions to `lmzoyezvsjgsxveoakdr`.
- **Worktree path quirks** — Grep/Read may not see `/tmp/elastic-kapitsa` directly from Windows; use the `C:\Users\RaminderShah\AppData\Local\Temp\elastic-kapitsa` form for these tools. Bash commands can use `/tmp/` paths fine.
- **Cron via pg_cron + pg_net** — both extensions enabled. Schedule recurring tasks with `cron.schedule(...)` calling `net.http_post(...)` to an edge function URL. Idempotent: `cron.unschedule()` first if re-running.
- **Migrations: apply + commit** — `mcp__supabase__apply_migration` for prod, then write the same SQL to `supabase/migrations/<timestamp>_<name>.sql` for the repo. The migration applies first, the file lands second so the repo reflects what's already in prod.
- **PR review-and-merge in one shot** — user often says "merge" right after a PR opens. Auto mode encourages this. Don't wait for explicit review unless something risky landed.

## Things to avoid

- **Bulk deploys without explicit authorization** — sandbox blocks mass deploys of many functions at once. Either deploy one at a time, or get a "deploy them in batch" green light. (Resolved per-session, but worth remembering when scope creeps.)
- **Force-push to remote branches** — blocked by sandbox. Don't rely on it for cleanup. If a PR branch picked up unrelated files, create a fresh branch off main and re-PR.
- **Hand-rolled `fetch` to Supabase functions from the admin UI** — omits Authorization + apikey headers. Use `supabase.functions.invoke` instead. Pitfall already burned us in `RecruitmentDetail.callEdgeFunction`.
- **Don't relitigate anonymization of customer names to vendors** — user decided 2026-05-05 it's not a goal. Only the PRJ project number is the anonymization layer.
- **Don't assume a function exists just because source is in the repo** — multiple functions had source committed but were never deployed. Test the endpoint or `mcp__supabase__list_edge_functions`.
