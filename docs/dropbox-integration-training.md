# Dropbox Integration — Staff Training Guide

**Version**: 1.0
**Date**: 2026-05-22
**Audience**: All Cethos staff (PMs, admins, management)

---

## What This Integration Does

The portal now mirrors project files to a shared Dropbox account automatically. Every file that moves through the translation lifecycle — from client upload to certified final delivery — gets a copy in Dropbox with a consistent folder structure.

**Why it matters:**

- **Off-platform backup** — files exist independently of Supabase, protecting against data loss
- **ISO 17100 compliance** — every sync is logged with a SHA-256 hash so auditors can verify file integrity
- **Customer/vendor file sharing** — share specific folders via Dropbox links instead of emailing attachments
- **Auditor access** — ISO auditors can browse order files in a familiar interface without needing portal access

**Important:** Supabase Storage remains the source of truth. Dropbox is a mirror and sharing layer. You continue to use the portal for all daily work — Dropbox syncing happens in the background.

---

## Dropbox Folder Structure

Every order gets a folder named with the project number, customer name, and target language:

```
/Cethos/
  /Orders/
    /PRJ-2026-00042 — Jane Smith — French/
      /01-Source-Documents/       Client's original files
      /02-Reference-Materials/    Glossaries, style guides, context docs
      /03-Vendor-Deliveries/      Vendor translations (v1, v2, etc.)
      /04-Drafts/                 Watermarked DRAFT PDFs sent for review
      /05-Affidavits/             Generated affidavit .docx files
      /06-Certified-Final/        Scanned signed certified PDFs

  /Vendor-Evidence/
    /Maria Garcia - abc123/
      /ISO-17100/                 Degrees, certs, experience evidence

  /Customer-Files/
    /Jane Smith - cust789/        Portal uploads from this customer
```

**You don't need to create these folders manually.** The system creates them automatically when a workflow is assigned.

---

## What Syncs Automatically

| When This Happens in the Portal | What Gets Synced | Where in Dropbox |
|--------------------------------|------------------|-----------------|
| Customer submits files for a quote | Source documents | `01-Source-Documents/` |
| Customer provides reference files | Glossaries, style guides | `02-Reference-Materials/` |
| Vendor or staff delivers a translation | Delivery files (each version) | `03-Vendor-Deliveries/` |
| Admin promotes a delivery to draft | Watermarked DRAFT PDF | `04-Drafts/` |
| System generates an affidavit | Affidavit .docx | `05-Affidavits/` |
| PM uploads scanned certified final | Signed/stamped PDF | `06-Certified-Final/` |
| Vendor uploads evidence docs | ISO qualification files | `Vendor-Evidence/` |

**Nothing changes about your workflow.** You continue to upload, review, and deliver files through the portal exactly as before. The sync happens automatically in the background after each action completes.

---

## How to Share Files with Customers

When an order is complete and the certified final is ready for the customer:

1. Go to the order detail page in the admin portal
2. Look for the **Dropbox** section (coming in a future update)
3. Click **Share Certified Files** to generate a Dropbox shared link
4. The link gives read-only access to the `/06-Certified-Final/` folder only
5. Include the link in the customer delivery email

**What customers see:** Only the final certified documents. They cannot see drafts, vendor deliveries, or internal files.

---

## How to Check Sync Status

The portal tracks every file sync. To check if an order's files are properly mirrored:

1. Go to the order detail page
2. Look for the **Dropbox Sync** status indicator (coming in a future update)
3. You'll see a summary: e.g., "6/6 files synced" with green checkmarks

**If a sync fails:** The system logs the error and a red indicator appears. Common causes:
- Dropbox storage full
- Dropbox connection expired (needs re-authorization in Settings)
- File too large (>150 MB single file limit in Dropbox API)

Failed syncs can be retried from the order detail page.

---

## Dropbox Connection Management

The Dropbox connection is org-wide (one shared account for all of Cethos).

### To connect or reconnect Dropbox:

1. Go to **Admin > Settings > Dropbox Integration**
2. Click **Connect Dropbox**
3. Authorize the Cethos app on Dropbox
4. You'll see the connected account email and status

### When to reconnect:

- If the green status dot turns red/gray on the settings page
- If sync errors mention "token expired" or "unauthorized"
- After changing the Dropbox account password

**Only super admins can connect/disconnect Dropbox.** The connection is used by all staff — there's no per-user setup.

---

## ISO Audit Trail

Every file synced to Dropbox is logged in the `dropbox_file_syncs` table with:

| Field | Purpose |
|-------|---------|
| SHA-256 hash | Proves the file wasn't modified after sync |
| Dropbox content hash | Dropbox's own hash — cross-verified against ours |
| Sync trigger | Which lifecycle stage triggered the sync |
| Timestamps | When the sync was requested and completed |
| Source path | Where the file lives in Supabase Storage |
| Dropbox path | Where the copy lives in Dropbox |

**For ISO auditors:** This table provides a complete chain of custody. An auditor can:
1. Pick any order
2. See every file that was synced, when, and by which process
3. Verify file integrity by comparing the stored hash against the current file
4. Browse the files directly in Dropbox without needing portal credentials

---

## What Does NOT Sync to Dropbox

The following are intentionally excluded:

- **PDF-to-Word working files** — temporary conversion artifacts (auto-purged after 120 days)
- **OCR processing inputs** — intermediate processing files
- **Quarantined files** — files that failed virus scanning
- **Internal PDF manager files** — staff-only document organization tool
- **Project assets/templates** — internal resources, not order-specific

---

## Frequently Asked Questions

**Q: Do I need a personal Dropbox account?**
No. The portal uses one shared Cethos Dropbox account. You don't need to install Dropbox or sign in.

**Q: What happens if I edit a file in Dropbox?**
Don't. The portal is the source of truth. If you edit a file in Dropbox, it will be overwritten the next time the portal syncs that file. Always make changes through the portal.

**Q: Can customers see our internal notes or vendor deliveries?**
No. Shared links point to specific subfolders (usually `/06-Certified-Final/`). Customers only see what you explicitly share.

**Q: How long are files kept in Dropbox?**
Order files (source docs, deliveries, certified finals) are kept indefinitely, matching the portal's retention policy. Customer portal uploads follow the 365-day retention policy.

**Q: What if Dropbox goes down?**
Nothing changes. The portal continues to work normally using Supabase Storage. Files will sync to Dropbox once it's back online (failed syncs are retried).

**Q: Does this replace emailing files to customers?**
Not yet. For now, you can use Dropbox links as an alternative to email attachments for large files. The system will eventually integrate shared links directly into the customer delivery email workflow.

---

## Quick Reference

| Task | Where |
|------|-------|
| Connect Dropbox | Admin > Settings > Dropbox Integration |
| Check sync status for an order | Order detail page > Dropbox Sync section |
| Share files with customer | Order detail page > Share Certified Files |
| View sync audit log | Database: `dropbox_file_syncs` table |
| Browse files in Dropbox | dropbox.com > Cethos > Orders > [PRJ number] |
