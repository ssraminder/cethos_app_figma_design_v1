# Draft email — compulsory Vendor Management training

> **Status:** DRAFT awaiting review.
> **Reviewer:** Raminder
> **To send after:** review of the training content at https://portal.cethos.com/admin/trainings/vendor-management
> **Training scope (just expanded):** 23 lessons total — 11 existing (recruitment / onboarding) + 12 new (PM workflow, Step Split, payables, invoicing). Estimated **~2h 20m** to complete.

---

## Option A — Friendly + firm (recommended)

**Subject:** Action required by Friday — Vendor Management training (includes the new Step Split feature)

---

Team,

Please complete the **Vendor Management** training in the admin portal by **end of day Friday this week**:

🔗 https://portal.cethos.com/admin/trainings/vendor-management

This is **compulsory for everyone** — PMs, ops, finance, and anyone touching an order or a vendor.

### Why now

We shipped a major feature on 2026-06-08 — the **Step Split** capability that lets us partition one workflow step across multiple vendors and in-house staff with per-vendor file scope. It changes how the workflow pipeline looks and behaves on orders that use it, and a few rules (revisor independence, payable handling on split parents, the new validation gates) are easy to get wrong without seeing them once.

The training also consolidates the standard PM lifecycle end-to-end, so this is the right moment for everyone to refresh.

### What it covers (23 lessons, ~2h 20m)

1. Vendor recruitment + onboarding (lessons 1–11, already there)
2. **PM Workflow** — order detail, workflow pipeline, eligibility gates *(new)*
3. **Step Split** — the modal, partition rules, post-split rendering, parent rollup *(new)*
4. Find Vendor & Assign / Offer flows *(new)*
5. Manage Payable in 5 pricing modes including CAT analysis *(new)*
6. Vendor portal + delivery review *(new)*
7. Customer invoicing & AR *(new)*
8. Vendor invoicing & AP *(new)*
9. Troubleshooting + FAQ + visual cues cheat sheet *(new)*

You can complete it in one sitting or break it across the week — the platform tracks your progress per lesson.

### How to start

1. Open the link above
2. Click into the first incomplete lesson
3. Read the content, click **I've read this** at the bottom to acknowledge
4. When all 23 lessons are acknowledged, the training auto-marks complete

### Tracking + accountability

I'll be able to see who has finished. If you have a hard scheduling conflict that pushes you past Friday, message me directly — but the default expectation is **completion by EOD Friday**.

### Questions

If anything is unclear in the content, message me or reply to this email. The full reference doc lives at `docs/training/pm-workflow-training.md` in the admin repo (and the PPT companion at `docs/training/pm-workflow-training.pptx`) if you want to skim before clicking in.

Thanks for prioritizing this — getting everyone on the same page on the Step Split rollout matters for ISO 17100 compliance heading into our Stage 2 audit.

— Raminder

---

## Option B — Short + direct (use if you prefer brevity)

**Subject:** Compulsory training this week — Vendor Management + Step Split

---

Team,

Please complete the **Vendor Management** training by **EOD Friday**:

🔗 https://portal.cethos.com/admin/trainings/vendor-management

It covers the standard PM workflow plus the new **Step Split** feature we shipped this week. ~2h 20m, 23 short lessons, click "I've read this" at the bottom of each to mark complete.

Compulsory for everyone touching orders or vendors. I'll be tracking completion.

Message me if you hit a blocker.

— Raminder

---

## Option C — Lead with the why (use for a wider audience or first-time training cadence)

**Subject:** Required this week — get up to speed on Step Split + the full PM workflow

---

Hi everyone,

On 2026-06-08 we shipped one of the bigger workflow features of the year — the ability to **split a single workflow step across multiple vendors and in-house staff**, each seeing only their files. It changes how the workflow pipeline renders and introduces a handful of new rules (parent vs child payables, revisor independence walking through splits, the new validation gates).

To make sure nobody learns this the hard way, I've extended the Vendor Management training in the admin portal with 12 new lessons covering:

- The PM workflow end-to-end (order detail → workflow → assignment → payable → delivery → invoicing)
- The new Step Split flow specifically — when to use it, what the modal does server-side, what the pipeline looks like after, how the parent rollup works
- Troubleshooting + FAQ for the issues you're statistically most likely to hit

🔗 **Start here:** https://portal.cethos.com/admin/trainings/vendor-management

**Compulsory for everyone — PMs, ops, finance, and anyone who touches an order or a vendor.** Total: 23 lessons, about 2h 20m. You can do it in one sitting or break it across the week, but please be **done by EOD Friday**.

The platform tracks progress per lesson; I'll be checking. Message me if you hit a content question or a scheduling conflict.

This isn't busywork — getting everyone aligned matters for our ISO 17100 Stage 2 audit and for the day-to-day quality of how we serve customers and pay vendors.

Thanks,
Raminder

---

## Notes for the reviewer

- All three options point to the **same URL**. The training is the same.
- Option A is the balanced default.
- Option B is shorter — useful if the audience is small and already used to short internal emails.
- Option C leads with the why — useful if this is the first time you're rolling out a compulsory training to the team, or if the audience includes people who don't follow shipping cadence closely.
- Change "**EOD Friday**" to a specific date (e.g., *EOD Friday June 12, 2026*) when you send to avoid any "which Friday" ambiguity.
- Recommended distribution: send via Brevo (so the open + click data lands in the email log you already trust) to all `staff_users.email` rows with `is_active = true`.
- If you want this to also fire as an in-app notification, the admin Training page already shows an incomplete-count badge in the sidebar; that nudge happens automatically as soon as a user has any assigned-but-incomplete training.
- If you want to formally **assign** the training (creates `cvp_training_assignments` rows so the badge fires for everyone), do that from `/admin/trainings/vendor-management/assign` after you've reviewed the content.

---

*Drafted 2026-06-08 by Claude Code. Awaiting your review of the training content before send.*
