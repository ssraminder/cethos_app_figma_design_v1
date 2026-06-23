# Training screenshot punch-list — 2026-04-28

Generated: 2026-04-29.  
Reason: Editor restructure, vendor OTP-only auth, recruitment test-panel improvements shipped 2026-04-28.

**How to use this list**

1. Open the app locally (or on a staging/prod instance).
2. For each item below, navigate to the listed route, set the viewport, and capture the screenshot.
3. Save the file to the path shown under `replacement_path` (relative to the storage bucket or public asset root that the training system uses — check `cvp_training_lessons.screenshot_paths` in Supabase for the exact base URL pattern).
4. Upload the file and update the `screenshot_paths` array on the affected lesson row via the Supabase dashboard or a follow-up migration.

Screenshots are served from the training lesson viewer at `/admin/trainings/:slug/:lessonSlug`.

---

## (a) MUST RETAKE — content changed substantially

---

### 1. Editor horizontal split — full layout

| Field | Value |
|---|---|
| **Lesson slug** | `editor-overview` (or `segment-editor-overview`, `editor-layout`) |
| **Training slug** | `editor-and-tm` (or `editor-workflow`, `cat-tool-editor`) |
| **Section heading** | "Editor layout (updated 2026-04-28)" |
| **Route to open** | Open a job in the cethos-tm editor (separate app: cethos-tm repo) |
| **Exact UI element** | Full editor window showing the left segments grid and the right tabbed pane (Matches tab active). Must show at least 3 segment rows and the tab bar (Matches / Termbase / TM search / Glossary). |
| **Viewport** | 1440 × 900 |
| **replacement_path** | `/training-screenshots/editor-overview/editor-horizontal-split.png` |

**Why MUST:** The entire editor layout changed from bottom-split-screen to XTM-style horizontal split. Any prior screenshot shows a completely different layout.

---

### 2. Right pane — tabs visible

| Field | Value |
|---|---|
| **Lesson slug** | `editor-overview` (or `segment-editor-overview`, `editor-layout`) |
| **Training slug** | `editor-and-tm` (or `editor-workflow`, `cat-tool-editor`) |
| **Section heading** | "Editor layout (updated 2026-04-28)" — right panel description |
| **Route to open** | cethos-tm editor, a job with TM hits |
| **Exact UI element** | Close-up of the right pane showing all four tabs: Matches, Termbase, TM search, Glossary. Active tab (Matches) highlighted. |
| **Viewport** | 800 × 600 cropped to right pane |
| **replacement_path** | `/training-screenshots/editor-overview/right-pane-tabs.png` |

**Why MUST:** Old screenshots show the bottom panel or left aside, which no longer exists.

---

### 3. Language-name column headers

| Field | Value |
|---|---|
| **Lesson slug** | `editor-overview` (or `segment-editor-overview`, `editor-layout`) |
| **Training slug** | `editor-and-tm` (or `editor-workflow`, `cat-tool-editor`) |
| **Section heading** | "Column headers" |
| **Route to open** | cethos-tm editor, any job with a non-English/French pair to make the change obvious |
| **Exact UI element** | Segment grid header row showing full language names (e.g., "Spanish" and "English (CA)") in place of "Source" / "Target". |
| **Viewport** | 1200 × 300 cropped to header row only |
| **replacement_path** | `/training-screenshots/editor-overview/language-name-column-headers.png` |

**Why MUST:** Column labels changed from generic "Source"/"Target" to actual language names.

---

### 4. Status icon — icon-only column

| Field | Value |
|---|---|
| **Lesson slug** | `editor-overview` (or `segment-editor-overview`, `editor-layout`) |
| **Training slug** | `editor-and-tm` (or `editor-workflow`, `cat-tool-editor`) |
| **Section heading** | "Status icon" |
| **Route to open** | cethos-tm editor, a job with at least one confirmed and one unconfirmed segment |
| **Exact UI element** | Status column showing icon-only for confirmed segment (no "T" or "D" text) plus tooltip visible on hover. Include one unconfirmed segment for contrast. |
| **Viewport** | 400 × 200 cropped to status column |
| **replacement_path** | `/training-screenshots/editor-overview/status-icon-only.png` |

**Why MUST:** Status column previously showed T/D text labels; now icon-only.

---

### 5. Copy source button on segment row

| Field | Value |
|---|---|
| **Lesson slug** | `tm-mt-suggestions` (or `working-with-tm`, `tm-and-mt`, `tm-workflow`) |
| **Training slug** | `editor-and-tm` (or `editor-workflow`, `cat-tool-editor`) |
| **Section heading** | "Copy source button" |
| **Route to open** | cethos-tm editor, hover over any segment row |
| **Exact UI element** | A single segment row with the clipboard/copy icon highlighted or in its normal visible state. Empty target field preferred so the purpose is clear. |
| **Viewport** | 1200 × 120 cropped to segment row |
| **replacement_path** | `/training-screenshots/tm-mt-workflow/copy-source-button.png` |

**Why MUST:** This is a new button that did not exist before 2026-04-28.

---

### 6. 100 % TM match auto-inserted

| Field | Value |
|---|---|
| **Lesson slug** | `tm-mt-suggestions` (or `working-with-tm`, `tm-and-mt`, `tm-workflow`) |
| **Training slug** | `editor-and-tm` (or `editor-workflow`, `cat-tool-editor`) |
| **Section heading** | "100 % TM matches — auto-insert" |
| **Route to open** | cethos-tm editor, open a job where a segment has a 100 % TM match |
| **Exact UI element** | Segment with target field pre-populated and the Matches tab showing the 100 % hit. Callout or annotation showing the target was auto-filled. |
| **Viewport** | 1440 × 500 |
| **replacement_path** | `/training-screenshots/tm-mt-workflow/auto-insert-100pct-match.png` |

**Why MUST:** Auto-insert on mount is new behaviour; old training may describe manual insertion.

---

### 7. Target-origin icons (save-confirmation icons)

| Field | Value |
|---|---|
| **Lesson slug** | `tm-mt-suggestions` (or `working-with-tm`, `tm-and-mt`, `tm-workflow`) |
| **Training slug** | `editor-and-tm` (or `editor-workflow`, `cat-tool-editor`) |
| **Section heading** | "Target-origin tracking and save-confirmation icons" |
| **Route to open** | cethos-tm editor, a job with confirmed segments of mixed origin |
| **Exact UI element** | At least 4 confirmed segments showing different target-origin icons (mt, tm, copied_source, human). Icons should be clearly visible. A legend or annotation is recommended. |
| **Viewport** | 1200 × 600 |
| **replacement_path** | `/training-screenshots/tm-mt-workflow/target-origin-icons.png` |

**Why MUST:** Target-origin tracking and save-confirmation icons are entirely new features.

---

### 8. Vendor Auth tab — OTP-only (no password shown)

| Field | Value |
|---|---|
| **Lesson slug** | `vendor-portal-access` (or `portal-access`, `vendor-auth`, `vendor-invitations`, `vendor-login`) |
| **Training slug** | `vendor-portal` (or `vendor-management`, `vendor-onboarding`) |
| **Section heading** | "Staff actions in the Auth tab" |
| **Route to open** | `/admin/vendors/[any-vendor-id]` → Auth tab (for a vendor created after 2026-04-28) |
| **Exact UI element** | Full Auth tab card showing "Has Password: No" status, no "Force Password Reset" button visible, and the Send Invitation / Terminate Sessions buttons. |
| **Viewport** | 1200 × 800 |
| **replacement_path** | `/training-screenshots/vendor-auth/auth-tab-no-password.png` |

**Why MUST:** The "Has Password" field now shows No for all new accounts; Force Password Reset is absent. Old screenshots show the password-based auth state.

---

### 9. Send Invitation button — OTP invite flow initiated

| Field | Value |
|---|---|
| **Lesson slug** | `vendor-portal-access` (or `portal-access`, `vendor-auth`, `vendor-invitations`, `vendor-login`) |
| **Training slug** | `vendor-portal` (or `vendor-management`, `vendor-onboarding`) |
| **Section heading** | "First-time access — magic-link invitation" |
| **Route to open** | `/admin/vendors/[vendor-id-never-invited]` → Auth tab |
| **Exact UI element** | Auth tab showing the teal "Send Invitation" button (not "Resend"). Capture before clicking to show the uninvited state. |
| **Viewport** | 1200 × 400 cropped to Actions card |
| **replacement_path** | `/training-screenshots/vendor-auth/send-invitation-button.png` |

**Why MUST:** The invitation model changed — previously created a password-setup link; now creates a magic-link OTP token.

---

### 10. Test-combinations panel — Select all / Unselect all controls

| Field | Value |
|---|---|
| **Lesson slug** | `test-assignment` (or `sending-tests`, `test-combinations`, `assigning-tests`, `test-assignment-and-sending`) |
| **Training slug** | `recruitment` (or `cvp-pipeline`, `vendor-recruitment`) |
| **Section heading** | "Select-all and Unselect-all" |
| **Route to open** | `/admin/recruitment/[application-id]` for a prescreened application with ≥ 3 pending combinations |
| **Exact UI element** | Test-combinations panel in "compose" step with the "Select all" and "Unselect all" links visible above the checkboxes list. All combinations checked (default state). |
| **Viewport** | 900 × 600 |
| **replacement_path** | `/training-screenshots/recruitment/test-combinations-select-all.png` |

**Why MUST:** Select all / Unselect all are new controls (added in commit 8c4d428). No prior screenshot exists.

---

### 11. Test-combinations panel — Certified Translation auto-approve notice

| Field | Value |
|---|---|
| **Lesson slug** | `application-decisions` (or `approve-reject-waitlist`, `application-approval`, `decisions`) |
| **Training slug** | `recruitment` (or `cvp-pipeline`, `vendor-recruitment`) |
| **Section heading** | "Certified Translation domain — cascade auto-approve" |
| **Route to open** | `/admin/recruitment/[application-id]` for an application that has Certified Translation combinations and whose General test has passed |
| **Exact UI element** | Test-combinations panel showing the sky-blue "N certified combination(s) — auto-approved" notice box, listing the language pairs. |
| **Viewport** | 900 × 400 |
| **replacement_path** | `/training-screenshots/recruitment/certified-translation-auto-approve.png` |

**Why MUST:** The cascade is new behaviour; no prior screenshot documents the auto-approve notice.

---

### 12. Application decision modal

| Field | Value |
|---|---|
| **Lesson slug** | `application-decisions` (or `approve-reject-waitlist`, `application-approval`, `decisions`) |
| **Training slug** | `recruitment` (or `cvp-pipeline`, `vendor-recruitment`) |
| **Section heading** | "Approve, Reject, Waitlist" |
| **Route to open** | `/admin/recruitment/[application-id]` for an application with approved General test |
| **Exact UI element** | The decision modal open, showing Approve / Reject / Waitlist options. |
| **Viewport** | 700 × 500 |
| **replacement_path** | `/training-screenshots/recruitment/decision-modal.png` |

**Why MUST:** Decision modal context changed because Certified Translation combinations now auto-approve within it.

---

## (b) NICE TO RETAKE — surface tweaked but content still accurate

---

### 13. OTP email example

| Field | Value |
|---|---|
| **Lesson slug** | `vendor-portal-access` (or any vendor-auth lesson) |
| **Training slug** | `vendor-portal` (or `vendor-management`, `vendor-onboarding`) |
| **Section heading** | "How vendors log in (OTP-only, no password)" |
| **Route to open** | Trigger a test OTP send via the Auth tab and capture the received email (in a test inbox) |
| **Exact UI element** | The 6-digit OTP email from Mailgun showing Cethos branding, code, and 10-minute expiry notice. |
| **Viewport** | 600 × 800 (email client) |
| **replacement_path** | `/training-screenshots/vendor-auth/otp-email-example.png` |

**Why NICE:** Old training may show the password-setup email. The new email has a different template (OTP code vs link).

---

### 14. Test-assignment panel — full compose step

| Field | Value |
|---|---|
| **Lesson slug** | `test-assignment` (or `sending-tests`, `test-combinations`) |
| **Training slug** | `recruitment` (or `cvp-pipeline`, `vendor-recruitment`) |
| **Section heading** | "Sending tests" |
| **Route to open** | `/admin/recruitment/[application-id]` for a prescreened application |
| **Exact UI element** | Full test-assignment panel in compose step showing difficulty selector, combinations list with checkboxes, and Preview tests button. |
| **Viewport** | 900 × 700 |
| **replacement_path** | `/training-screenshots/recruitment/test-assignment-panel.png` |

**Why NICE:** Panel layout unchanged but Select all/Unselect all controls are new additions that should appear in context.

---

### 15. Preview step with wildcard-fallback badge

| Field | Value |
|---|---|
| **Lesson slug** | `test-assignment` (or `sending-tests`, `test-combinations`) |
| **Training slug** | `recruitment` (or `cvp-pipeline`, `vendor-recruitment`) |
| **Section heading** | "Sending tests" — Preview step |
| **Route to open** | `/admin/recruitment/[application-id]` → open panel → click Preview tests for combinations that produce wildcard-fallback matches |
| **Exact UI element** | Preview step cards showing at least one combination with a sky-blue "wildcard-fallback" badge (any-target fallback). |
| **Viewport** | 900 × 600 |
| **replacement_path** | `/training-screenshots/recruitment/preview-step.png` |

**Why NICE:** Wildcard-fallback badge is a related recent change (commit 8c4d428) that improves test selection transparency.

---

## Notes for screenshot taker

- **cethos-tm editor** screenshots must be taken in the **cethos-tm** repository's app, not this portal. Coordinate with the cethos-tm owner for access to a staging instance with test jobs loaded.
- For training screenshot storage, check `SELECT screenshot_paths FROM cvp_training_lessons LIMIT 5` against the live Supabase to confirm the URL base pattern (bucket name, path prefix).
- After uploading screenshots, update `screenshot_paths` on each lesson row. You can use the Supabase dashboard's table editor or a follow-up `UPDATE` migration.
- Items 1–12 block the training from being re-assigned until done — training screenshots that show old UI will confuse staff. Items 13–15 can be deferred.
