export default {
  key: "sop027",
  sopNumber: "SOP-027",
  title: "Infrastructure and Application Change Control",
  docCode: "CTH-VRF-027",
  versionLine: "v1 active (effective 25 June 2026)",
  owner: "IT / Systems",
  isoRef: "21 CFR Part 11; GAMP 5; ISO/IEC 27001 A.8.32; ISO 9001:2015 §8.5.6",
  where: "Portal → QUALITY → SOPs;  IT / Systems category",
  golden: "**Look only.** You are confirming the procedure is published and active. If something doesn't match, write it in the Notes box.",
  summary: [
    "Validated on the live portal. SOP-027 controls how changes to the production infrastructure and application are **assessed, approved, implemented and recorded** (§5). It covers: DB schema/migrations, edge functions, environment configuration, hosting platform, third-party integrations, and the backup configuration (§2). Emergency changes are allowed with retrospective documentation (§6).",
    "Companion to SOP-026 (SDLC): 026 governs development practice; 027 governs production-environment approval. References CSV-001/CSV-002 for validation impact. **Result: PASS.**",
  ],
  steps: [
    {
      id: "s1", title: "Open SOP-027 and confirm the change-control procedure",
      url: "/admin/sops/95874df4-3844-403f-bfe9-2ee3f2e6b78c",
      ring: "Change Control",
      caption: "SOP-027 Infrastructure and Application Change Control — v1 active, 6-step change procedure",
      say: "Log in to **portal.cethos.com**. Left menu **QUALITY → SOPs**, open **SOP-027 — Infrastructure and Application Change Control**. Confirm it is **active** (v1, 25 Jun 2026). Read §5 — the 6-step procedure: Request → Impact/risk assessment → Approval (System Owner + QM for GxP) → Implementation (migrations committed to version control) → Test/verify → Record. Read §7 — changes to backup configuration (PITR, AWS S3 replication) follow this procedure and are re-evidenced in CTS-REC-BKP-001.",
    },
    {
      id: "s2", title: "Confirm the change-control scope includes GxP-relevant systems",
      url: "/admin/sops/95874df4-3844-403f-bfe9-2ee3f2e6b78c",
      ring: "GxP approval",
      caption: "SOP-027 §5 — GxP-relevant changes require System Owner + QM approval before production",
      say: "Still on SOP-027. Note §5 step (3): GxP-relevant changes (those touching qualification records, quality records, audit trails, e-records/e-signatures, or in-scope COA workflows) require approval from both the System Owner **and** the Acting Quality Manager before implementation. The Git history, migration history and deploy records form the change audit trail (§8), retained per STMT-001.",
    },
  ],
};
