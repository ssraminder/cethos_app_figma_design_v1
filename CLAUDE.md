# CLAUDE.md — Claude Code Project Instructions

This is the **Cethos portal reference app** (Figma-exported v1) — an internal-tooling React/Vite codebase covering the staff admin portal, customer portal, and quote/order/HITL workflows. Treated as a working reference for the production portal at portal.cethos.com.

## Project memory (read at session start, update before commit)

This repository has a project-local memory system at `/memory/`:

- `memory/user.md` — primary user profile (role, context, working style)
- `memory/people.md` — team, stakeholders, vendors, clients referenced in conversations
- `memory/preferences.md` — captured preferences for code, communication, tooling
- `memory/decisions.md` — architectural, product, and business decisions with rationale

**At the start of every session:** read all four files before doing substantive work. They carry context from prior sessions that won't be in your conversation history.

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
