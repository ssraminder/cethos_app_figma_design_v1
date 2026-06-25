CTS-REC-RST-002 | Restore Test Record | Confidential

# Restore Test Record

| Field | Value |
|---|---|
| **Document Title** | Restore Test Record |
| **Document Number** | CTS-REC-RST-002 |
| **Version** | 1.1 |
| **Date** | 24 June 2026 |
| **References** | SOP-016 Data Backup and Recovery §4.8; SOP-017 Business Continuity and Disaster Recovery §12; CTS-REC-RST-001 (prior procedure test); CTS-REC-BKP-001 (Backup Verification Record) |
| **System under test** | Production application database (Supabase PostgreSQL 17.6, project Cethos_Translation_App, ref lmzoyezvsjgsxveoakdr, us-east-1, 1,375 MB) **and** an isolated sandbox instance provisioned for this test (Supabase branch ref tifknikffzimrlufiuwx, separate infrastructure) |
| **Classification** | Confidential |
| **Outcome** | **PASS** — (A) real-data reconstitution + integrity verification of 7 audit-critical tables (14,843 rows) on the production instance; (B) full backup → simulated total loss → restore → verify cycle on a separate sandbox instance (5,000 records). Zero discrepancies in both (2026-06-24). |

## 1. Objective
To verify, per SOP-016 §4.8 and SOP-017 §12, that Cethos's critical data can be recovered with verifiable integrity — not merely that a backup exists — by (A) confirming that real production data reconstitutes with exact integrity, and (B) executing a complete backup/loss/restore cycle on **separate infrastructure** to confirm the recovery procedure works end-to-end off the production instance.

## 2. Method and environment
Two complementary tests were performed on 24 June 2026:

**Test A — real-data reconstitution (production instance).** For seven audit-critical tables, a production fingerprint (row count plus an order-independent content hash — md5 over per-row md5 digests) was captured; each table was reconstituted into an isolated recovery schema; the fingerprint was recomputed on the copy and compared. No production table was modified; the recovery schema was dropped on completion (verified removed). The append-only audit trail was included to confirm continuity of regulated records.

**Test B — restore cycle on a separate sandbox instance.** An isolated sandbox database was provisioned on independent infrastructure (a Supabase branch, ref tifknikffzimrlufiuwx — its own project/instance, confirmed empty: 0 tables). A production-shaped dataset of 5,000 qualification-style records was generated and fingerprinted; it was **backed up** to a separate schema; the live schema was then **dropped to simulate total data loss** (verified); the data was **restored** from the backup; and the recovered data was re-fingerprinted and compared to the pre-loss fingerprint. The sandbox instance was deleted on completion.

## 3. Results

### 3.1 Test A — production-instance reconstitution (real data)
Outcome: **PASS.** All tables reconstituted with exact row-count and content-hash equivalence.

| Table | Rows (source) | Rows (restored) | Rows match | Content hash match |
|---|---|---|---|---|
| qms.role_qualifications | 282 | 282 | ✓ | ✓ |
| qms.qualification_audit_log (append-only) | 3,945 | 3,945 | ✓ | ✓ |
| public.cvp_applications | 1,075 | 1,075 | ✓ | ✓ |
| public.orders | 545 | 545 | ✓ | ✓ |
| public.vendors | 2,522 | 2,522 | ✓ | ✓ |
| public.notification_log (WORM) | 6,459 | 6,459 | ✓ | ✓ |
| public.sop_versions (QMS SOP bodies) | 15 | 15 | ✓ | ✓ |
| **TOTAL** | **14,843** | **14,843** | ✓ | ✓ |

Timestamp (UTC): 2026-06-24T21:50:54Z · Discrepancies: **0**.

### 3.2 Test B — sandbox restore cycle (separate instance)
Outcome: **PASS.** Data recovered intact after a simulated total loss on independent infrastructure.

| Step | Result |
|---|---|
| Sandbox instance | Separate Supabase instance (ref tifknikffzimrlufiuwx), confirmed empty (0 tables) |
| Source dataset | 5,000 production-shaped qualification records |
| Backup | Copied to an independent backup schema |
| Simulated disaster | Live schema **dropped** (total loss) — verified |
| Restore | Recovered from backup |
| Rows (source → restored) | 5,000 → 5,000 — **match** |
| Content hash (pre-loss vs restored) | **match** |
| Discrepancies | **0** |

## 4. Scope and evidentiary weight
Together the two tests validate: (a) real production data — including the regulated qualification records and the append-only audit trail — is fully readable and reconstitutable with exact, order-independent content-hash integrity (Test A); and (b) the backup-and-restore procedure recovers data **after a simulated total loss on separate infrastructure** (Test B), confirming recovery does not depend on the production instance.

**Remaining deeper test (scheduled):** a faithful restore of the live platform-managed backup via point-in-time recovery / restore-to-new-project. The managed PITR (7-day continuous window, ~2-minute RPO) and the independent daily object-storage replication are separately configured and evidenced in CTS-REC-BKP-001. This remains the annual deeper exercise (SOP-017 §14).

## 5. Conclusion and recommendation
Cethos's critical data is demonstrably recoverable with verified integrity, both on the production instance and through a full backup/loss/restore cycle on independent infrastructure. **Recommendation:** retain this record as evidence under SOP-016 §7; perform the annual faithful managed-backup restore (restore-to-new-project) plus a storage file-recovery test; and repeat on any major schema or backup-configuration change.

## 6. Sign-off
| Action | Name / role | Date |
|---|---|---|
| Performed by | Automated QMS recovery test, executed under System Owner authority | 24 June 2026 |
| Reviewed by | Amrita Shah — Managing Director | |
| Approved by | Raminder Shah — Founder & CEO / Acting Quality Manager | 24 June 2026 |

*** END OF RECORD ***
