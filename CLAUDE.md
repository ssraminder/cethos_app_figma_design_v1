# CLAUDE.md — Claude Code Project Instructions

This is the **Cethos portal reference app** (Figma-exported v1) — an internal-tooling React/Vite codebase covering the staff admin portal, customer portal, and quote/order/HITL workflows. Treated as a working reference for the production portal at portal.cethos.com.

## Project memory (read at session start, update before commit)

This repository has a project-local memory system at `/memory/`:

- `memory/user.md` — primary user profile (role, context, working style)
- `memory/people.md` — team, stakeholders, vendors, clients referenced in conversations
- `memory/preferences.md` — captured preferences for code, communication, tooling
- `memory/decisions.md` — architectural, product, and business decisions with rationale

**At the start of every session:** read all four files before doing substantive work. They carry context from prior sessions that won't be in your conversation history.

**Bug reports & Sentry check (session start):** After reading memory files, check for open bug reports and Sentry errors by calling the `check-open-issues` edge function via `supabase.functions.invoke("check-open-issues", { body: {} })`. If there are new bug reports or unresolved Sentry issues, summarize them for the user before starting other work. Bug reports live in the `bug_reports` table (NOT GitHub Issues or Sentry) — both vendor and admin staff file them in-app. Sentry captures unhandled exceptions separately. The edge function queries both sources and returns a combined report.

**Before every `git commit`:** update the relevant memory file(s) with anything new from this session — new decisions, preferences confirmed, people introduced, or shifts in the user's context. Stage the memory updates as part of the same commit so context is version-controlled with the code.

If a memory file is stale or contradicts current reality, fix it rather than just appending.

## Working conventions you must follow

These come from accumulated session experience — full rationale in `memory/preferences.md` and `memory/decisions.md`. Highlights:

- **AI features:** deterministic value + Claude prose. Bounds enforced server-side. Audit every input + output for ISO 17100 reproducibility.
- **Vendor pricing:** 20% margin ceiling on client per-page rate, 12% anti-lowball floor — never recommend below this even for low-COL / weak-test applicants.
- **Edge functions:** deploy with `--no-verify-jwt`. Use `supabase.functions.invoke` from the admin UI (never hand-rolled `fetch` — it omits auth headers).
- **Migrations:** apply to prod via MCP, then commit the SQL file to `supabase/migrations/` so the repo reflects prod.
- **Two repos:** admin (`cethos_app_figma_design_v1` — temp worktree at `C:\Users\…\Temp\elastic-kapitsa`) + vendor (`D:\cethos-vendor`). Both deploy to Supabase project `lmzoyezvsjgsxveoakdr`. Some features cross both repos in the same PR cycle.
- **Pricing convention:** `subtotal = translation only`, certification always carried separately. Display code: `pre_tax = total − tax_amount`.
- **PR cadence:** per phase / per fix. Open + merge in the same session unless the user pauses.

## Per-change loop (admin + vendor portal changes)

When the user is sending a series of portal changes (admin at `D:\cethos\portal\cethos_app_figma_design_v1`, vendor at `D:\cethos-vendor`), run this loop for **each** change before moving to the next one:

1. **Plan first.** Explore the relevant code, propose the approach, and confirm with the user before editing. Skip only for trivial one-line fixes.
2. **Implement** in the affected repo(s). Some changes cross both — same Supabase project (`lmzoyezvsjgsxveoakdr`).
3. **Open a PR** in each affected repo via `gh pr create`.
4. **Merge the PR(s)** in the same session unless the user pauses.
5. **Verify on the live production site using Chrome MCP** (`mcp__Claude_in_Chrome__*`) — admin → `https://portal.cethos.com`, vendor → `https://vendor.cethos.com`. Not local dev, not preview. Drive the actual flow that was changed and observe the result. If verification fails, file a follow-up fix in the same loop.
6. **Update memory** (`memory/decisions.md` or a dedicated feedback/feature file) describing what shipped and what the live-site verification showed, then signal ready for the next change.

If a change spans both repos, verify both live sites before declaring done. See `feedback_per_change_loop_2026_06_02.md` in user memory for the durable form of this rule.
