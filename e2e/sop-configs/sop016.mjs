export default {
  key: "sop016",
  sopNumber: "SOP-016",
  title: "Data Backup and Recovery",
  docCode: "CTH-VRF-016",
  versionLine: "v2 active (effective 24 June 2026)",
  owner: "IT / Systems",
  isoRef: "ISO/IEC 27001 A.8.13; ICH E6(R3); 21 CFR Part 11 §11.10(c)",
  where: "Portal → QUALITY → SOPs;  and Documents & Manuals → Quality Records",
  golden: "**Look only.** You are confirming the backup/restore evidence records exist, not running backups. If a record is missing or unpublished, write it in the Notes box.",
  summary: [
    "Validated on the live portal. SOP-016 covers database backups + point-in-time recovery and independent object-storage replication, with documented recovery procedures (§5).",
    "The evidence is on file as controlled Quality Records: a **Backup Verification Record (CTS-REC-BKP-001)** and **Restore Test Records (CTS-REC-RST-002 database, CTS-REC-RST-003 storage)**, all Published. **Result: PASS.**",
  ],
  steps: [
    {
      id: "s1", title: "Open SOP-016 and read it",
      url: "/admin/sops/0df4f9ea-4a74-436f-8aad-cbc0a2e31db7",
      ring: "Approved versions are frozen",
      caption: "SOP-016 open — approved version is frozen & controlled",
      say: "Log in. Left menu **QUALITY → SOPs**, open **SOP-016 — Data Backup and Recovery**. Read §5 (recovery procedures) and §7 (records). It requires backup verification and restore tests to be recorded.",
    },
    {
      id: "s2", title: "Backup verification + restore-test records are on file",
      url: "/admin/documents",
      ring: "Backup Verification Record",
      caption: "CTS-REC-BKP-001 (backup verification) + CTS-REC-RST-002/003 (restore tests) — Published Quality Records",
      say: "Left menu **QUALITY → Documents & Manuals**, scroll to **QUALITY RECORDS**. Confirm the **Backup Verification Record (CTS-REC-BKP-001)** and the **Restore Test Records (CTS-REC-RST-002, CTS-REC-RST-003)** are present and **Published** — this is the evidence SOP-016 §7 requires.",
    },
  ],
};
