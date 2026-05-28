-- Training content refresh for 2026-04-28 changes.
--
-- This migration updates body_markdown, key_rules, and screenshot_paths for
-- lessons in three training modules affected by changes shipped 2026-04-28:
--
--   1. Editor / CAT workflow  (slug: editor-and-tm or editor-workflow)
--   2. Vendor portal & auth   (slug: vendor-portal or vendor-management)
--   3. Recruitment (CVP)      (slug: recruitment or cvp-pipeline)
--
-- IMPORTANT BEFORE APPLYING:
--   Run the following query against the live Supabase database to confirm the
--   exact training slugs and lesson slugs, then adjust the WHERE clauses below
--   before applying this migration:
--
--   SELECT t.slug AS training_slug, l.slug AS lesson_slug, l.title
--   FROM cvp_trainings t
--   JOIN cvp_training_lessons l ON l.training_id = t.id
--   ORDER BY t.slug, l.order_index;
--
-- Each UPDATE uses (training_slug, lesson_slug) as the key. Rows that do not
-- match are skipped silently (UPDATE affects 0 rows), so this migration is safe
-- to apply even with stale slug guesses — it simply won't touch unmatched rows.
--
-- Physical screenshot uploads are tracked separately in
-- docs/training-screenshot-punchlist-2026-04-28.md and must be done locally
-- (the CI sandbox has no browser access).

-- ============================================================
-- MODULE 1 — Editor / CAT workflow
-- ============================================================

-- Lesson: Segment editor overview / editor layout
-- Affects: layout restructured from bottom split-screen to XTM-style horizontal
--          split; left search aside removed; language-name column headers.
UPDATE cvp_training_lessons AS l
SET
  body_markdown = $MD$
## Editor layout (updated 2026-04-28)

The Cethos TM editor now uses an XTM-style **horizontal split**:

- **Left panel — segments grid**
  Every segment row in the document is listed here. Each row shows the source
  text, the editable target field, and a status icon on the left.

- **Right panel — tabbed pane**
  Four tabs live here:
  | Tab | Contents |
  |---|---|
  | Matches | TM hits (100% and fuzzy) for the active segment |
  | Termbase | Termbase lookups for terms detected in the source |
  | TM search | Free-text search across the whole TM |
  | Glossary | Approved glossary entries for the language pair |

  Switch tabs with one click; the pane stays open as you move between segments.

### What was removed

The **bottom split-screen** panel and the **left search aside** were removed in
this update. All TM/TB/glossary functionality is now consolidated in the right
pane tabs.

### Column headers

Source and target columns are now labelled with the **full language name**
(e.g., "English", "French") rather than the generic "Source" / "Target" labels.
This makes it easier to orient on multi-step workflows with non-obvious language
pairs.

### Status icon

The status column (leftmost in each segment row) shows an **icon only** — the
old "T" (translated) and "D" (draft) text labels are gone. Hover over the icon
to see a tooltip with the status name.
$MD$,
  key_rules = '[
    {
      "rule": "All TM/TB/glossary panels are in the right pane tabs — do not look for a bottom or left panel.",
      "reason": "The bottom split-screen and left search aside were removed 2026-04-28. Only the right pane tabs exist."
    },
    {
      "rule": "Column headers show full language names, not ''Source''/''Target''.",
      "reason": "Avoids confusion on multi-step and non-obvious language pair jobs."
    }
  ]'::jsonb,
  screenshot_paths = ARRAY[
    '/training-screenshots/editor-overview/editor-horizontal-split.png',
    '/training-screenshots/editor-overview/right-pane-tabs.png'
  ]
FROM cvp_trainings AS t
WHERE l.training_id = t.id
  AND t.slug IN ('editor-and-tm', 'editor-workflow', 'cat-tool-editor')
  AND l.slug IN ('editor-overview', 'segment-editor-overview', 'editor-layout');

-- Lesson: Working with TM and MT suggestions
-- Affects: 100% TM auto-insert on mount; fuzzy matches stay as suggestions;
--          target_origin tracking with visual icons; Copy source button.
UPDATE cvp_training_lessons AS l
SET
  body_markdown = $MD$
## Working with TM, MT, and the Copy source button (updated 2026-04-28)

### 100 % TM matches — auto-insert

When you open a segment that has a **100 % TM match**, the target field is
**pre-filled automatically** as soon as the segment loads. You do not need to
click "Insert" — the match is already there. Confirm the segment normally once
you have reviewed it.

Fuzzy matches (below 100 %) are shown as **suggestions in the Matches tab** but
are not auto-inserted. Click a suggestion to insert it, then edit as needed.

### Copy source button

Each segment row now has a **Copy source** button (clipboard icon on the row).
Clicking it copies the source text verbatim into the target field. Use this as
a starting point when you intend to make minimal changes, or when the source
and target text should be identical (e.g., product codes, URLs).

### Target-origin tracking and save-confirmation icons

Every time a segment is confirmed, the system records **how the target text was
produced** (`target_origin`). This shows up as a small icon on the row after
saving:

| Icon | Meaning |
|---|---|
| MT chip (blue) | Target came from machine translation, untouched |
| MT-edited chip (purple) | MT output that was edited before confirming |
| TM chip (green) | Inserted from a TM match, untouched |
| TM-edited chip (teal) | TM match that was edited before confirming |
| Copy-source chip (grey) | Source was copied verbatim using Copy source |
| Human chip (orange) | Target typed or pasted manually without any MT/TM seed |

These icons are **visual save confirmations** — they appear immediately after
a successful confirm. If you see no icon, the segment has not been confirmed yet.

### Default TM — auto-attach and auto-write

A **default TM is automatically attached** to every new job at creation time.
Every Confirm writes the confirmed segment back to that TM with full provenance
metadata (source, target, origin, confirmed-by, job ID). If you re-confirm a
segment, the existing TM entry is overwritten with the latest version.
$MD$,
  key_rules = '[
    {
      "rule": "100 % TM matches are auto-inserted when a segment loads — review and confirm, do not re-insert.",
      "reason": "Auto-insert prevents double-insertion and keeps the workflow smooth. Fuzzy matches still require a manual click."
    },
    {
      "rule": "Use Copy source only when the target should start from the source text. The origin is recorded as ''copied_source''.",
      "reason": "Target-origin tracking is used for QA and TM quality reporting. Misusing Copy source inflates the copied_source count."
    },
    {
      "rule": "The save-confirmation icon is your receipt — if it is missing, the confirm did not go through.",
      "reason": "Segments without icons are not written to the TM and will not count toward job completion."
    }
  ]'::jsonb,
  screenshot_paths = ARRAY[
    '/training-screenshots/tm-mt-workflow/auto-insert-100pct-match.png',
    '/training-screenshots/tm-mt-workflow/copy-source-button.png',
    '/training-screenshots/tm-mt-workflow/target-origin-icons.png'
  ]
FROM cvp_trainings AS t
WHERE l.training_id = t.id
  AND t.slug IN ('editor-and-tm', 'editor-workflow', 'cat-tool-editor')
  AND l.slug IN ('tm-mt-suggestions', 'working-with-tm', 'tm-and-mt', 'tm-workflow');

-- ============================================================
-- MODULE 2 — Vendor portal & auth
-- ============================================================

-- Lesson: Vendor portal access and invitations
-- Affects: OTP-only auth replaces password; magic-link flow; /t/[token]; ?email=
UPDATE cvp_training_lessons AS l
SET
  body_markdown = $MD$
## Vendor portal access and invitations (updated 2026-04-28)

### How vendors log in (OTP-only, no password)

As of 2026-04-28, the vendor portal uses **OTP-only authentication** via
Mailgun. Vendors **do not set or use a password**. Every login session starts
with a 6-digit one-time code sent to their registered email.

The login flow:
1. Vendor visits the portal login page and enters their email.
2. They receive a 6-digit OTP by email (valid for 10 minutes).
3. They enter the code on the verify page to start their session.

The verify page at `/verify` accepts an `?email=` query parameter. If you send
a vendor a direct link with their email pre-filled (e.g., from a support
workflow), the email field is auto-populated.

### First-time access — magic-link invitation

When a vendor has never accessed the portal, the **Send Invitation** button in
the Auth tab sends a **magic-link** email. The link is at
`/t/[token]` on the vendor portal. Clicking it:
1. Validates the token (72-hour expiry).
2. Logs the vendor in and redirects them to their profile setup.

After the vendor completes profile setup, subsequent logins use OTP — the
magic-link is single-use.

### Staff actions in the Auth tab

| Action | When to use |
|---|---|
| **Send Invitation** | Vendor has never accessed the portal. Sends magic-link. |
| **Resend Invitation** | Link expired or not received. Resets the 72-hour window. |
| **Send Reminder** | Invitation sent but not accepted within expected time. |
| **Terminate All Sessions** | Security concern; forces vendor to re-authenticate. |
| **Revoke Portal Access** | Remove portal access entirely (offboarding). |

> **Note:** The "Force Password Reset" button is shown only for legacy accounts
> that previously set a password. For all new accounts created after 2026-04-28
> this button does not appear because there is no password to reset.

### "Has Password" indicator

The Auth tab still shows a "Has Password" field. For vendors onboarded after
2026-04-28 this will always show **No** — that is expected and correct. The
OTP flow does not require a password.
$MD$,
  key_rules = '[
    {
      "rule": "Never ask a vendor for their password or try to reset it for accounts created after 2026-04-28.",
      "reason": "OTP-only auth means there is no password. Asking for one will confuse vendors and produce support tickets."
    },
    {
      "rule": "Always use Send Invitation for first-time access, not a manual OTP trigger.",
      "reason": "The invitation flow sends the magic-link token needed for first-time profile setup. OTP login only works after the account is established."
    },
    {
      "rule": "Magic-link tokens expire after 72 hours. Use Resend Invitation if the vendor did not click in time.",
      "reason": "Expired tokens return an error page. Do not ask the vendor to retry the same link — always resend."
    }
  ]'::jsonb,
  screenshot_paths = ARRAY[
    '/training-screenshots/vendor-auth/auth-tab-no-password.png',
    '/training-screenshots/vendor-auth/otp-email-example.png',
    '/training-screenshots/vendor-auth/send-invitation-button.png'
  ]
FROM cvp_trainings AS t
WHERE l.training_id = t.id
  AND t.slug IN ('vendor-portal', 'vendor-management', 'vendor-onboarding')
  AND l.slug IN (
    'vendor-portal-access', 'portal-access', 'vendor-auth',
    'vendor-invitations', 'inviting-vendors', 'vendor-login'
  );

-- ============================================================
-- MODULE 3 — Recruitment (CVP pipeline)
-- ============================================================

-- Lesson: Test assignment and sending
-- Affects: select-all/unselect-all controls; auto-send for score >=40.
UPDATE cvp_training_lessons AS l
SET
  body_markdown = $MD$
## Assigning and sending tests (updated 2026-04-28)

### The test-combinations panel

When an application reaches **Prescreened** (or **Staff Review**) status,
the test-combinations panel appears on the application detail page. It lists
every pending language-pair × domain × service-type combination that needs a
test.

#### Select-all and Unselect-all

Two new controls above the combinations list (2026-04-28):

- **Select all** — selects every pending combination at once. Disabled when all
  are already selected.
- **Unselect all** — clears all selections. Disabled when nothing is selected.

These controls make it faster to handle applicants with many combinations.
The default state when the panel opens is **all combinations pre-selected**.

#### Sending tests

1. Adjust the combination selection if needed (deselect combos to defer).
2. Check the AI-suggested difficulty level. Override if needed.
3. Click **Preview tests** to see exactly which test from the library will be
   sent for each combination. Review source text and instructions.
4. Optionally swap to a different test per combination if alternatives exist.
5. Click **Send** to dispatch the invitation email.

### Auto-send: General test fires automatically at score ≥ 40

If the AI prescreening score is **40 or above** and there is **no critical
CV-mismatch flag**, the General test combination is sent automatically — you
do not need to open the panel and click Send. You will see the combination
move to `test_sent` status without manual action.

This applies **only to the General test combination**. Domain-specific or
service-type-specific combinations still require manual dispatch.

If you want to intervene before the auto-send fires, open the application
immediately after prescreening completes and either adjust the selection or
use the Skip testing path.
$MD$,
  key_rules = '[
    {
      "rule": "General test at score ≥ 40 auto-sends — do not manually resend it.",
      "reason": "Double-sending the same combination dispatches duplicate invitation emails to the applicant."
    },
    {
      "rule": "Use Select all / Unselect all to manage combinations in bulk; the per-combination checkboxes remain for fine-grained control.",
      "reason": "Applicants with many language pairs would otherwise require many individual clicks."
    },
    {
      "rule": "Always review the Preview step before confirming Send — check source text and instructions match the intended test.",
      "reason": "Once sent, the test invitation email cannot be recalled. Mistakes require a support workflow to the applicant."
    }
  ]'::jsonb,
  screenshot_paths = ARRAY[
    '/training-screenshots/recruitment/test-combinations-select-all.png',
    '/training-screenshots/recruitment/test-assignment-panel.png',
    '/training-screenshots/recruitment/preview-step.png'
  ]
FROM cvp_trainings AS t
WHERE l.training_id = t.id
  AND t.slug IN ('recruitment', 'cvp-pipeline', 'vendor-recruitment')
  AND l.slug IN (
    'test-assignment', 'sending-tests', 'test-combinations',
    'assigning-tests', 'test-assignment-and-sending'
  );

-- Lesson: Application decisions — Certified Translation cascade
-- Affects: Certified Translation domain auto-approves when General test passes.
UPDATE cvp_training_lessons AS l
SET
  body_markdown = $MD$
## Application decisions (updated 2026-04-28)

### Approve, Reject, Waitlist

The decision modal on an application lets you:
- **Approve** — moves status to `approved`, triggers the V11 welcome email,
  and creates a `cvp_translators` record.
- **Reject** — moves status to `rejected`, optionally queues a rejection email.
- **Waitlist** — holds the applicant for a specific language pair or date.

### Certified Translation domain — cascade auto-approve

**As of 2026-04-28**, when you approve an application that includes a
**Certified Translation** domain combination, that combination is
**automatically approved** without running a test. You will see it show as
`skip_manual_review` in the panel and then flip to `approved` when you click
the main Approve button on the application.

This cascade fires only when the General test has already passed. The logic:
1. Applicant's General test combination reaches `approved`.
2. The system checks for any Certified Translation combinations on the same
   application.
3. Those combinations are marked `skip_manual_review` → auto-approved on
   application approval.

The test-combinations panel displays a notice:
> "N certified combination(s) — auto-approved"

You do not need to manually approve or send a test for these combinations.

### Skip testing — approve based on experience

For applicants where testing is inappropriate (e.g., senior specialists with
verified portfolios), use the **Skip testing** mode in the test assignment
panel. Provide at least 10 characters of justification. The application moves
directly to `approved` and the V11 welcome email is sent.
$MD$,
  key_rules = '[
    {
      "rule": "Do not send a test for Certified Translation combinations when the General test has passed — they auto-approve.",
      "reason": "Certified Translation direction and formatting are not in scope for CETHOS testing. Sending a test wastes applicant time and creates spurious test records."
    },
    {
      "rule": "The skip-testing justification must be at least 10 characters and explain why testing is waived.",
      "reason": "The justification is stored in staff_review_notes and may be reviewed during QMS audits (ISO 17100 §3.1.4 competence path)."
    }
  ]'::jsonb,
  screenshot_paths = ARRAY[
    '/training-screenshots/recruitment/certified-translation-auto-approve.png',
    '/training-screenshots/recruitment/decision-modal.png'
  ]
FROM cvp_trainings AS t
WHERE l.training_id = t.id
  AND t.slug IN ('recruitment', 'cvp-pipeline', 'vendor-recruitment')
  AND l.slug IN (
    'application-decisions', 'approve-reject-waitlist',
    'application-approval', 'decisions'
  );
