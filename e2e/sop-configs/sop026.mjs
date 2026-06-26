export default {
  key: "sop026",
  sopNumber: "SOP-026",
  title: "Software Development Lifecycle and Defect Management",
  docCode: "CTH-VRF-026",
  versionLine: "v1 active (effective 25 June 2026)",
  owner: "IT / Systems",
  isoRef: "21 CFR Part 11; FDA General Principles of Software Validation (2002); GAMP 5; ISO 9001:2015 §8.3",
  where: "Portal → QUALITY → SOPs;  and the portal bug-report system",
  golden: "**Look only.** You are confirming the procedure is published and active. If something doesn't match, write it in the Notes box.",
  summary: [
    "Validated on the live portal. SOP-026 controls how the Cethos portal (the GxP-supporting platform) is **specified, built, tested, released and corrected** (§5). GxP-relevant changes are validated per the CSV programme and approved per SOP-027 (§6). Defects are captured via in-app bug reports and Sentry exception monitoring (§7).",
    "Development is performed by Cital Enterprises under Cethos System Owner; all changes are version-controlled (Git + migrations). **Result: PASS.**",
  ],
  steps: [
    {
      id: "s1", title: "Open SOP-026 and confirm the SDLC controls",
      url: "/admin/sops/c793afc2-3e63-4f46-96c4-6afd5d46234f",
      ring: "SDLC",
      caption: "SOP-026 SDLC and Defect Management — v1 active, version-controlled + defect capture",
      say: "Log in to **portal.cethos.com**. Left menu **QUALITY → SOPs**, open **SOP-026 — Software Development Lifecycle and Defect Management**. Confirm it is **active** (v1, 25 Jun 2026). Read §5 (Development lifecycle) — every change goes: Requirement → Build → Test → Review → Release; DB changes are applied as migrations that are then committed to version control. Read §7 (Defect management) — defects captured via in-app bug reports (`bug_reports` table) + Sentry; data-integrity defects handled via CAPA (SOP-011).",
    },
    {
      id: "s2", title: "Confirm defect-capture is live in the portal",
      url: "/admin/sops/c793afc2-3e63-4f46-96c4-6afd5d46234f",
      ring: "Bug reports",
      caption: "SOP-026 §7 defect management — in-app bug reports + Sentry per the procedure",
      say: "Still on SOP-026. Note §7 states the defect audit trail includes the Git/migration history, deployed edge-function versions, the `bug_reports` log, and the Sentry exception log. The session-start review of open bug reports is part of the operating procedure. These records are retained per STMT-001 (§8).",
    },
  ],
};
