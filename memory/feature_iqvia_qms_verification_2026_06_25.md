# IQVIA Audit Prep — SOP Verification Phase (2026-06-25)

**Full handover:** `docs/audits/2026-06-iqvia/SESSION-HANDOVER-2026-06-25.md` (read it first).

## What this is
Preparing Cethos for the **IQVIA remote vendor-qualification audit, 29–30 Jun 2026** (scope = COA Linguistic Validation). The QMS document set is built and in the portal; we are now **verifying each SOP is accurate to how the system actually works** before the audit, because the portal is new and may have bugs. Human verifier = **Fayza El Bezzari** (Account Manager).

## Approach (user-chosen)
Per SOP: (1) **walk the live flow via Chrome MCP** on `admin.cethos.com`; (2) write a **screen-accurate verified guide** as a **Google Doc** (Drive MCP `mcp__3f920822`, account ss.raminder@gmail.com, `create_file` HTML→Doc); (3) **Fayza re-walks** with `ZZ-TEST` dummy data + signs off; (4) fix issues.
**Safety:** irreversible flows (qualification — `qms.qualification_audit_log` append-only) and the append-only CAPA log are **LOOK-ONLY / inspect real records, never dummy-create**. Never feed clinical data to AI (only Supabase/Dropbox/SharePoint/AWS S3).

## Done (4 guides in Drive, My Drive root)
- **SOP-001** Document Control — ✅ verified (`/admin/sops` + `/admin/documents`). docId `1Sy6hJ_Y-FS0C-FUjpUy_yh-fWas-Tt_ifhwx6wNjA6E`
- **SOP-011** CAPA — ✅ verified (`/admin/quality` + NC detail). docId `1LeMRjzwxc5j28UpnJftcoKw5mAiCVbpIW5N_-wTrN8I`
- **SOP-003** Vendor Qualification — ✅ verified (vendor **QMS tab** `?tab=qms`; worked example **Omotola** vendor `994fb211-a35b-44ff-a37c-0368a16b0ce5`: NDA + basis + 6 verified evidence + lang pairs). docId `1ahfIq-FFJkiCMkuyhiNLDwsLHtszeaLk_M3xF1s2-qQ`
- **SOP-019** COA Qualification — ⚠️ reviewed w/ finding (COA lives in recruitment layer `cvp_translator_domains`→`cvp_translators`, NOT on vendor QMS tab). docId `1A0Wf_IjrzWmHW4qGSeOQpRXMrMyp6Bx4UU1DlRIYrnI`

## Findings
1. **RETRACTED** earlier "QMS pages not in left menu" — WRONG; they ARE under the **QUALITY** nav section (long nav; first `read_page` truncated it). The 4 guides' "not in the menu — type the URL" line needs correcting (URLs still work; Drive MCP can't edit Docs, so fix by hand or re-create).
2. **Vendor search may not filter** (typing a name didn't filter the list) — confirm; possible bug.
3. **COA qual not surfaced on the vendor QMS tab** — recommend surfacing before the audit.

## Remaining
Verify SOP-012/014/015/016/017/018/020 (mostly `/admin/documents` + portal checks) + refer-out 008/009/013/021. Then Pass-2 = `/admin/documents` verification guide. Then process Fayza's results.

## Git note
This session committed: the `docs/audits/2026-06-iqvia/` docs + handover + this memory file + 3 reviewed source tweaks. **Held for review (not committed):** `supabase/migrations/*` (8), new edge functions `cvp-inbox-backlog-sweep`/`cvp-recruitment-pulse`, `e2e/` (possible auth secret), `docs/training/`, `docs/sops/sharepoint-export/`, `tmp/`, `~$*` lock files. See handover §11.
