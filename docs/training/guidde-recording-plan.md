# Guidde recording plan — Vendor Management training

> **Status:** Awaiting your free-browser session. When ready, message me with one of the triggers below (e.g. `"go session 1"` or `"go all sessions"`) and I'll run end-to-end — capture, finalize in guidde dashboard, embed back into the training lessons, smoke-check the live portal — with no further input from you.
>
> **Default mode is continuous-per-session.** One guidde recording per session, then I split into N component videos in the editor. If your guidde plan has a per-recording length cap, mention it in your `go` reply and I'll switch to per-recording sub-blocks instead.

---

## Before you start any recording

1. **Free the browser.** Don't touch mouse / keyboard / tab while guidde is recording. Even hover events show up in the timeline.
2. **Use the connected Chrome window** ("work 1" — Chrome MCP is wired to it). If you open a different window guidde won't sync with my driving.
3. **Make sure you're logged in** as a Super Admin (e.g. Raminder). I can't log in for you; guidde would just record a login prompt.
4. **Tell me when guidde says recording is active** by replying `"go <recording-name>"`. I'll wait for the explicit signal so the opening shot isn't a half-captured page.
5. **If guidde captures stray cursor moves**, you can trim them in the guidde editor afterward. Better to flag now than re-record.

---

## Pre-recording state prep (I do this on signal)

| State | What I do | Order affected |
|---|---|---|
| **Fresh split demo** | DELETE the 3 children + flip `is_split=false` on parent | ORD-2026-354733 |
| **Pending delivery demo** | Verify Marie Dubois delivery on ORD-2026-834732 is still in `pending_review` | ORD-2026-834732 |
| **Vendor impersonation** | Run `admin-impersonate-vendor` against vendor with active portal | A specific vendor with `status='active'` + `portal_access` |

I'll always state the cleanup before signaling ready. Nothing happens behind your back.

---

## Recording roster

### Set A — PM Workflow core (covers lessons 12-16 + 23)

#### A1. `split` — Step Split end-to-end *(THE headliner)*
- **Lesson:** §14 Splitting a step + §15 Modal walkthrough + §16 Post-split
- **Target duration:** 6 min
- **Order:** ORD-2026-354733 (Dropbox Test User, 3 files)
- **Pre-state:** reset to pre-split (I do this on signal)
- **Sequence:**
  1. Navigate to order detail
  2. Scroll to Workflow section — narrate "this is the standard 4-step workflow"
  3. Click `⤴ Split…` on Step 1 — modal opens
  4. Click `+ Add file` on Partition 1 → pick file 1
  5. Pick vendor A King (representing an external vendor)
  6. Click `+ Add another partition`
  7. Click `+ Add file` on Partition 2 → pick file 2
  8. Click `In-house staff` radio (highlight that rate fields disappear)
  9. Pick Bobby Rawat
  10. Click `+ Add another partition`
  11. Click `+ Add file` on Partition 3 → pick file 3
  12. Pick vendor Adam Lengyel
  13. **Pause 2s** on green validation footer
  14. Click `Save split (3)`
  15. Wait for toast + workflow reload
  16. Scroll to show the parent + 3 indented children with `Split 0/3` badge
- **Post-state:** Order is split — leave it for A2 if you want a continuous tour
- **Guidde caption ideas:** "Open the Split Step modal", "Add file to Partition 1", "Pick the vendor", "Switch this partition to in-house", "Save the split"

#### A2. `split-explore` — Reading the post-split pipeline
- **Lesson:** §16 Post-split + §10 Visual cues
- **Target duration:** 3 min
- **Order:** ORD-2026-354733 (must be split from A1, or pre-state for this run)
- **Sequence:**
  1. Hover (without clicking) on the teal `⤴ Split 0/3` badge — narrate "this counts approved children"
  2. Walk down the 3 indented children — narrate the parts: sub-step number, assignee, file count, status pill
  3. Point at the `IN-HOUSE` mini-pill on Bobby's row
  4. Click the parent step row to expand
  5. Show that parent has **no** Manage Payable / Find Vendor / Unassign controls
  6. Click on a child to expand
  7. Show the child step has its own assignment + status + actions
- **Post-state:** Split intact — A3 cleans up
- **Guidde caption ideas:** "Reading the Split badge", "What's on each child card", "Why the parent has no payable"

#### A3. `troubleshooting-409` — Server gates in action
- **Lesson:** §11 Troubleshooting
- **Target duration:** 3 min
- **Order:** ORD-2026-354733 (still split) → ORD-2026-834732 (has vendor)
- **Sequence:**
  1. On ORD-2026-354733 (still split) — try clicking `⤴ Split…` on a child step (button is hidden — narrate "the button hides itself on children")
  2. Try clicking it on the parent (also hidden — narrate "parent is already split")
  3. Open `/admin/orders/7a0a8153-62d9-4ae0-8ef4-0469c94880f1` (ORD-2026-834732, has Marie Dubois on Step 1)
  4. Try clicking Split on Step 1 — narrate "this step has a vendor so the button isn't there"
  5. Open SQL Editor or admin DB tool, run a fake `INSERT vendor_payables ... WHERE workflow_step_id = {split parent}` — show the 409 from `manage-vendor-payables` guard
- **Cleanup after A3:** I clean up ORD-2026-354733 (delete children + flip is_split=false) so it's reset for next time
- **Skip if uncertain about the SQL demo** — the first 4 steps still make a usable troubleshooting recording

---

### Set B — Vendor sourcing & finance (lessons 17-18, 21-22)

#### B1. `find-vendor` — Find Vendor + Assign + Offer modals
- **Lesson:** §4 + §17
- **Target duration:** 5 min
- **Order:** ORD-2026-354733 (after cleanup, Step 2 will show Find Vendor) — *or* ORD-2026-834732 Step 2
- **Sequence:**
  1. Navigate to order detail with a pending step
  2. Click `Find Vendor` on Step 2
  3. **Pause 2s** on filter bar — narrate Source/Target/Native/Country/Rating/Rate
  4. Sort by Match Score (default) — point at vendor cards
  5. Click the search box, type a partial name to demo filtering
  6. Clear the search
  7. Click `Assign` on the top vendor — Assign Vendor modal opens
  8. Pause on Rate × Units vs Target toggle — narrate
  9. Note the auto-computed Total + step margin badge
  10. Click `Cancel` (do NOT actually assign)
  11. Click `Offer` on the same vendor — Offer modal opens
  12. Highlight the extra `Offer expires in` field
  13. Click `Cancel`
  14. Check 2-3 vendor rows + click `Offer to Selected (N)` to show the batch flow
  15. Cancel out
- **Post-state:** No changes (all cancels)
- **Guidde caption ideas:** "Open Find Vendor", "Filter the candidate list", "Direct Assign vs Offer", "Batch offer to multiple vendors"

#### B2. `manage-payable` — Five pricing modes
- **Lesson:** §5 + §18
- **Target duration:** 4 min
- **Order:** ORD-2026-834732 (Marie Dubois assigned, $12/word existing payable)
- **Sequence:**
  1. Navigate to order detail
  2. Scroll to Step 1 (Marie Dubois)
  3. Click the inline `Adjust` link next to `$12/per_word`
  4. **Pause** on the Adjust mini-form — narrate New rate / New total / Reason
  5. Click `Cancel`
  6. Click the full `Manage Payable (12.00 CAD)` button
  7. **Pause** on the modal opening
  8. Click each tab in order: Flat → Per word → Per hour → Per page → CAT analysis
  9. On CAT analysis tab, pause for 3s on the explanatory text + Upload file area
  10. Click `Cancel`
- **Post-state:** No changes
- **Guidde caption ideas:** "Quick adjustment via the inline form", "Full Manage Payable modal", "Five pricing modes", "CAT analysis for TM-discounted work"

#### B3. `customer-invoices` — Customer invoicing & AR tour
- **Lesson:** §8 + §21
- **Target duration:** 4 min
- **Order:** N/A (page-level navigation)
- **Sequence:**
  1. Click `Customer Invoices` in sidebar
  2. **Pause** on KPI bar — narrate Total / Drafts / Issued / Paid / Outstanding
  3. Demo Search field with a partial customer name
  4. Demo Status filter dropdown — pick `Paid`, then back to All
  5. Demo Date range
  6. Hover on a Multi-order badge row
  7. Click into one invoice row (read-only view)
  8. Back to list
  9. Click `+ Create Invoice` — show the modal
  10. Click Cancel
  11. Navigate to `Accounts Receivable` sidebar link
  12. Show the aged view (Current / 1-30 / 31-60 / 61-90 / 90+)
- **Post-state:** No changes
- **Guidde caption ideas:** "Customer Invoices KPI bar", "Filtering and searching", "Issue a manual invoice", "AR aging view"

#### B4. `vendor-invoices` — Vendor invoicing & AP tour
- **Lesson:** §9 + §22
- **Target duration:** 5 min
- **Order:** N/A (page-level navigation)
- **Sequence:**
  1. Click `Vendor Invoices` in sidebar (`/admin/invoices/vendor`)
  2. **Pause** showing the list, narrate Internal No. / Invoice No. / Status / Payment
  3. Click into one invoice row — show vendor + linked payables
  4. Back to list
  5. Click `Summary` button (top right) → show summary panel
  6. Close summary
  7. Navigate to `Accounts Payable` (`/admin/ap`)
  8. **Pause** on KPI bar — narrate Total open / aging buckets
  9. Toggle `By vendor` ↔ `By invoice`
  10. Click the open-detail arrow on the top vendor row
  11. Show vendor's invoice list
  12. Navigate to `Quick Payment` (sidebar)
  13. Show the Quick Payment form (don't actually submit)
  14. Cancel
- **Post-state:** No changes
- **Guidde caption ideas:** "Vendor Invoices list", "AP aged view", "Quick Payment vs Bulk Payment"

---

### Set C — Vendor-facing flows (lessons 6 + 19-20)

> Requires an **active** vendor with portal access. I'll prep `admin-impersonate-vendor` before recording.

#### C1. `vendor-portal` — Vendor portal job detail & accept
- **Lesson:** §6 + §19
- **Target duration:** 5 min
- **Order:** ORD-2026-354733 after the split (one of the children belongs to A King; impersonate A King)
- **Pre-state:** I run `admin-impersonate-vendor` with vendor_id of one of the child step assignees
- **Sequence:**
  1. Land on vendor.cethos.com `My Jobs`
  2. Show the offers / assigned jobs list
  3. Click into the job detail
  4. **Pause** on Source Files — narrate "only the files scoped to this step"
  5. Highlight rate + deadline
  6. Click `Accept` (or `Decline` + confirm dialog) — for a recording, *don't* finalize unless you want the state change
  7. Show the post-accept screen (acknowledgment)
- **Cleanup:** Either undo the accept via SQL or move on — won't affect future recordings if accepted
- **Guidde caption ideas:** "Vendor lands on My Jobs", "Job detail shows only assigned files", "Accept the offer"

#### C2. `vendor-deliver` — Deliver flow
- **Lesson:** §6 + §20
- **Target duration:** 4 min
- **Order:** The same vendor session from C1, now with an accepted step
- **Sequence:**
  1. From My Jobs, click into the accepted step
  2. Click `Deliver` button — modal opens
  3. Highlight the Vendor Identifier field (required for agencies)
  4. Click Upload Files (don't actually upload unless you have a small test PNG ready)
  5. Type notes
  6. **Pause** on the Deliver button
  7. Click `Deliver` (or `Cancel` to skip the state change)
- **Cleanup:** If you delivered, I can roll back the `step_deliveries` row + flip step back to `accepted`
- **Guidde caption ideas:** "Open the Deliver modal", "Vendor identifier field for agencies", "Submit the delivery"

#### C3. `delivery-review` — PM reviews the delivery
- **Lesson:** §7 + §20
- **Target duration:** 4 min
- **Order:** ORD-2026-834732 (has a pending review draft already)
- **Sequence:**
  1. Navigate to order detail
  2. Scroll to Translations & Other Files
  3. **Pause** on the Pending Review draft — narrate the 4 actions (Approve / Changes / Remind / Override)
  4. Click `Approve` (or `Cancel` if you want to keep the state) — show the confirmation
  5. Show the delivery transition + the auto-generated next step indicator
  6. Click `Promote to customer draft` (if visible)
  7. Show the resulting watermarked PDF in Draft Translations
- **Cleanup:** Test order so changes are fine; or roll back via SQL if you want to repeat
- **Guidde caption ideas:** "Four ways to review a delivery", "Approve and cascade", "Promote to customer draft"

---

### Set D — Page-level orientation (lessons 12-13)

> Light-touch tours, no modals, no state changes. Good as opening/landing recordings.

#### D1. `order-detail-tour` — The order page
- **Lesson:** §1 + §12
- **Target duration:** 3 min
- **Order:** ORD-2026-354733
- **Sequence:**
  1. Land on order detail header
  2. Hover on each header band element: Open in Dropbox, Sync, View Quote, Edit / Cancel, Order Status, Work Status, Unbilled badge
  3. Walk down: Customer Information card → highlight "View as customer" link
  4. Project Reference card
  5. Translation Details card
  6. Documents section
  7. Right column: Messages → Delivery → Activity
  8. Scroll down to the Workflow / Client Communications / Finance tab strip
- **Post-state:** No changes
- **Guidde caption ideas:** "Order detail page tour", "Each card and what it carries"

#### D2. `workflow-pipeline-tour` — Workflow tab
- **Lesson:** §2 + §13
- **Target duration:** 3 min
- **Order:** ORD-2026-354733 (after cleanup, all 4 steps visible)
- **Sequence:**
  1. Land on the Workflow tab
  2. **Pause** on template header — narrate `0/4 steps` + financial roll-up
  3. Walk through each step card
  4. **Pause** on Step 1's `⤴ Split…` button — narrate the 6 eligibility gates
  5. **Pause** on Step 2 (customer actor) — show NO Split button — narrate why
  6. Hover the margin pill at the bottom — narrate green vs amber threshold
- **Post-state:** No changes
- **Guidde caption ideas:** "The workflow pipeline at a glance", "Step eligibility for Split", "Reading the margin pill"

---

## Recording-by-recording readiness checklist

| ID | Title | Requires Reset? | Read-Only? | Order |
|---|---|---|---|---|
| A1 | `split` | Yes (pre-state) | ❌ creates children | 354733 |
| A2 | `split-explore` | No (uses A1's result) | ✅ inspection only | 354733 (split) |
| A3 | `troubleshooting-409` | No | ✅ tries hidden buttons | 354733 + 834732 |
| B1 | `find-vendor` | No | ✅ cancels everything | 354733 or 834732 |
| B2 | `manage-payable` | No | ✅ cancels modal | 834732 |
| B3 | `customer-invoices` | No | ✅ navigation | n/a |
| B4 | `vendor-invoices` | No | ✅ navigation | n/a |
| C1 | `vendor-portal` | Vendor impersonation | ❌ creates accept event | 354733 child |
| C2 | `vendor-deliver` | After C1 | ❌ creates delivery | Same |
| C3 | `delivery-review` | No (uses existing draft) | ❌ approves | 834732 |
| D1 | `order-detail-tour` | No | ✅ hover-only | 354733 |
| D2 | `workflow-pipeline-tour` | No | ✅ hover-only | 354733 |

---

## Suggested run order

Three pragmatic sessions, ~15-25 minutes each. Stop guidde between every recording.

**Session 1 — Step Split core (~20 min)**
1. `D1` order-detail-tour
2. `D2` workflow-pipeline-tour
3. `A1` split  ← I reset state, you start guidde
4. `A2` split-explore  ← reuses A1 state
5. `A3` troubleshooting-409  ← I clean up afterward

**Session 2 — Sourcing + Finance (~15 min)**
1. `B1` find-vendor
2. `B2` manage-payable
3. `B3` customer-invoices
4. `B4` vendor-invoices

**Session 3 — Vendor-facing (~15 min)**
1. `C1` vendor-portal  ← I prep impersonation
2. `C2` vendor-deliver
3. `C3` delivery-review (on a different order, doesn't need impersonation)

You don't have to run them in this order, but the dependencies (A1→A2, C1→C2) chain best when adjacent.

---

## Post-recording — guidde dashboard cleanup (per video)

> **Important:** the guidde dashboard is opened **in the same Chrome window connected to MCP** so I can drive the cleanup actions. After you stop a recording, the guidde sidebar/extension typically prompts you with an "Edit" button or auto-opens the new video in the dashboard. Confirm the URL is `app.guidde.com` (or whichever guidde domain your team uses) and reply `"go finalize <recording-id>"` once it's loaded.

For each recording, I'll drive the following cleanup loop in the guidde editor:

### Standard cleanup steps (default per video)

1. **Trim pre-roll** — drop frames before the first meaningful action (page load, blank states)
2. **Trim post-roll** — drop frames after the success state is shown for ~2 seconds
3. **Drop dead frames** — remove any captured cursor moves I didn't intend (you mid-cursor flick, browser zoom changes, accidental scrolls)
4. **Rename each step** from guidde's default (`Click element`, `Click button`) to the pedagogical caption from the per-recording **"Guidde caption ideas"** list
5. **Set the video title** to match the lesson — format: `Lesson NN — {Lesson title}` (e.g. `Lesson 14 — Splitting a step across multiple assignees`)
6. **Set the cover slide** — use the lesson title as the cover heading, with a short subtitle line (I'll suggest one from the lesson's body_markdown opener)
7. **Set the end / CTA slide** — `Try it yourself` linking to the `route_reference` from the lesson (e.g. `/admin/orders`)
8. **Tag the video** with `vendor-management`, `lesson-NN`, and the relevant feature tag (e.g. `step-split`, `payable`, `invoice`, `vendor-portal`)
9. **Set visibility** — workspace-only (do NOT publish to anything public; this is internal training)
10. **Copy the share URL** — I'll paste it into a worklog so you can wire it into the lesson afterwards

### Optional polish (skip if time-constrained)

- **Add written captions per step** where the click target name isn't obvious (e.g. on the modal's `+ Add file…` button, caption it "Pick which files this partition will translate")
- **Add a soft pause** (1-2s) before mode switches so the viewer can re-orient (Partition 1 done → focus shifts to Partition 2)
- **Add a chapter marker** at each major transition (e.g. inside `split`: "Open modal", "Build P1", "Build P2 in-house", "Build P3", "Save")
- **Adjust narration voice / pace** if you're using guidde's TTS narration
- **Blur sensitive data** — for this training the test customer email & vendor emails are visible; if you want them blurred, point them out and I'll apply the blur tool

### Embed back into the training

Once a video has a final share URL:

11. **Update the lesson** — I'll run an SQL UPDATE on `cvp_training_lessons.body_markdown` to embed the video at the top of the lesson:

    ```markdown
    [Watch the walkthrough on guidde →](https://app.guidde.com/playbooks/{video-id})

    ![Video thumbnail](path-to-the-PPT-slide-already-there.png)
    ```

    Keeping the existing PPT-slide screenshot as the visual anchor + adding a deep-link to the guidde video gives both the static reference and the interactive walkthrough.

12. **Smoke check** the live lesson page in the admin portal to confirm the video link is clickable + opens in the right place.

### Autonomous mode — single `go` signal runs the entire session

**Operative rule:** once you reply `"go session N"` (or `"go all sessions"`), I drive everything through to completion with **zero further input from you**. No mid-flow confirmations, no per-recording `finalize` handshake, no "ready for next?" gates.

#### What "autonomous" means in practice

For each session, when you say go:

1. **One-time pre-flight check** — I verify Chrome MCP is connected to the right browser group, the admin (and vendor, if needed) tabs are loaded, and the state-prep for the FIRST recording in the session is in place. Anything off, I report once and stop. Otherwise I proceed silently.
2. **Guidde recording mode** — assume the session is captured as **one continuous guidde recording** that we split in the editor afterwards. Before driving, I confirm the `recording` indicator is visible in the guidde UI (you start guidde once at session start, stop it once at session end — those are your only two physical actions).
3. **Drive all click sequences back-to-back** for every recording in the session. Between recordings, I insert a **2-second frozen scene-break** (no clicks, no scrolls, no cursor movement) on a clean state — this gives a natural cut point for splitting in the editor and visually signals "topic change" if you decide not to split.
4. **State transitions between recordings handled silently** — if recording B requires me to navigate to a different page than recording A ended on, or impersonate a different vendor, I do it without asking. Each per-recording entry already lists its `Pre-state` requirements; I chain them.
5. **End-of-session signal** — when the last click sequence of the session ends, I display a clear `=== SESSION N CLICKS DONE — STOP GUIDDE RECORDING ===` line in chat. You press stop in guidde once. No other action from you.
6. **Auto-finalize all videos in the session** — I navigate to the guidde dashboard tab, find the new recording, split it into the N component videos using the scene-breaks as cut points, then for each split video run the full cleanup loop (rename, title, cover slide, end CTA, tags, visibility, share URL).
7. **Auto-embed all share URLs** — I run one SQL UPDATE per lesson with the new guidde deep-link, then load each affected lesson on portal.cethos.com via Chrome MCP and screenshot it to prove the embed renders.
8. **Single end-of-session report** — only at the very end, I post one summary message with: which recordings were captured, which share URLs were generated, which lessons were embedded, and any anomalies that need your attention (e.g. "guidde couldn't auto-detect cut at scene-break #2; I split manually at the timestamp 04:17"). No interim updates.

#### Decisions I make without asking

Every judgment call below is pre-committed so I don't need to ping you mid-flow:

| Situation | What I do silently |
|---|---|
| guidde rendering an editor control I don't recognize | Best-guess from screenshot context + standard SaaS-editor patterns. Note in end-of-session report. |
| Cut-point ambiguous (e.g. extra cursor jitter at scene-break) | Cut at the closest stationary frame; if none clean, cut at the timestamp I logged while driving. |
| guidde renames a step to something nonsensical | Override with the caption from the per-recording "Guidde caption ideas" list. |
| Video title would collide with an existing one | Append ` (v2)` and note it. |
| Lesson SQL UPDATE finds a prior `Watch the walkthrough on guidde →` line | Replace it (assume re-recording supersedes the old link). |
| Smoke-check fails on a lesson | Hard reload once; if still failing, note in end-of-session report and continue. |
| State-prep error during session (e.g. test order missing) | Report once and **stop the session**. Do not skip to the next recording silently — partial output would corrupt the lesson set. |
| guidde split tool not present in the editor | Fall back to: download MP4 → ffmpeg cut by timestamp → re-upload as N separate videos. Slow but lossless. |
| Edge case I can't categorize | Log it, do the most conservative thing (no destructive write), continue. |

#### What I will NOT do silently

- **Stop guidde recording on your behalf** — the start/stop buttons are physical UI on your machine; I cannot reach them. Hence the explicit `STOP GUIDDE` signal at end-of-session.
- **Publish a video to a public URL** — workspace-only visibility is always the default; public requires your explicit ask.
- **Delete an existing guidde video** — even when re-recording. Old videos get untouched; the lesson embed simply points to the new one.
- **Skip a state-prep error** — if a precondition for recording N fails, I stop and report. Skipping risks rendering N+1, N+2 against the wrong state and producing misleading training content.

#### If a single guidde recording can't span a full session

If your guidde plan caps individual recordings (e.g. 10-minute hard limit), session 1 (~20 min) and session 2 (~15 min) overflow. Fallback:

- I drive in **per-recording sub-blocks** instead — for each recording I display `=== START GUIDDE FOR <recording-id> ===` before driving and `=== STOP GUIDDE — RECORDING <recording-id> CAPTURED ===` when its sequence ends.
- You press start/stop per recording (12 presses total instead of 3) but still don't make any decisions.
- Cleanup still runs autonomously at session end against all N captured videos.
- Tell me your guidde plan's per-recording limit in your first `go` reply and I'll pick continuous vs sub-block automatically. If you don't mention it, I default to **continuous** and fall back to sub-blocks only if guidde stops me mid-driving.

#### Caveats — things I genuinely cannot do alone

- I can't see the guidde control panel (it's a browser extension popup that lives outside the MCP-readable DOM). I can only observe `recording` indicator pixels in the captured tab if guidde paints one. If guidde silently fails to record, I won't notice — I'll drive happily and you'll find no video at the end. Mitigation: at the start of each session I'll display `=== START GUIDDE NOW — confirm red dot or timer is visible before I proceed ===` and wait 8 seconds. That gives you time to abort if guidde didn't start cleanly. (This is the **only** input I'll wait on after `go`.)
- I can't influence guidde's caption auto-generation, narration TTS settings, or any account-level guidde preferences — those are pre-session config on your side.
- If guidde's editor requires drag-and-drop for splitting (some video editors do), I'll need to use computer-use mouse tools instead of Chrome MCP DOM clicks — but Chrome is a tier-"read" app for computer-use, so I genuinely cannot. In that case I'd fall back to ffmpeg download/cut/upload as noted above.

---

## When you're ready

Reply with one of:
- `"go session 1"` — drives D1 → D2 → A1 → A2 → A3, autonomously through capture + finalize + embed + smoke-check
- `"go session 2"` — drives B1 → B2 → B3 → B4, autonomously
- `"go session 3"` — drives C1 → C2 → C3, autonomously (vendor impersonation prepped first)
- `"go all sessions"` — runs sessions 1 → 2 → 3 back-to-back. Between sessions I display `=== SESSION N DONE — STOP GUIDDE / START SESSION N+1 ===`; you press stop, then start once, then I continue. **One initial `go` covers all 12 recordings end-to-end** — three physical button presses on your side for the whole training set.
- `"go <single recording-id>"` (e.g. `"go split"` for just A1) — autonomous capture + finalize + embed of that single video
- `"prep <recording-id>"` (I do the state prep but don't drive — useful if you want to skim a screen before recording)

**One mandatory pause point** — at the start of every session I display `=== START GUIDDE NOW — confirm red dot / timer ===` and wait 8 seconds before driving. That's so a silent guidde failure doesn't waste a full session of driving. No reply needed if guidde is recording cleanly; if it isn't, hit Ctrl+C to abort and restart.

I'll always state the cleanup / pre-state action explicitly before starting any session. After that, no further input from you until end-of-session report.

---

*Generated 2026-06-08 by Claude Code. Save this doc and bring it back when you're ready to record — I can re-read it and execute any session on signal.*
