export default {
  key: "sop008",
  sopNumber: "SOP-008",
  title: "Cognitive Debriefing",
  docCode: "CTH-VRF-008",
  versionLine: "v3 active (effective 25 June 2026) — cross-references corrected to SOP-019/SOP-011",
  owner: "Project Management / Operations",
  isoRef: "ISO 17100:2015 §4.4, §5.2, §6.1; ISPOR COA good practices",
  where: "Portal → QUALITY → SOPs;  and a cognitive-debriefing order's workflow",
  golden: "**Look only — don't change anything.** You are confirming an existing order's setup, not running interviews or editing the order. If something doesn't match, write it in the Notes box.",
  summary: [
    "Validated on the live portal. Cognitive debriefing is a **standalone COA validation service** — the client provides the translation, so the workflow is **Cognitive Debriefing → QA Review → Final Deliverable** with **no Translation step** (§3/§9).",
    "Confirmed on real orders: every cognitive-debriefing order in the system shows exactly those three steps and **zero** translation steps. The independent interviewer + internal QA review are the quality controls (§2/§6). **Result: PASS.**",
  ],
  steps: [
    {
      id: "s1", title: "Open SOP-008 and read the runbook",
      url: "/admin/sops/03fa7cb7-f4b1-4f5d-92ce-e5835dc89927",
      ring: "Approved versions are frozen",
      caption: "SOP-008 open — approved version is frozen & controlled",
      say: "Log in to **portal.cethos.com**. Left menu **QUALITY → SOPs**, then in **PRODUCTION** open **SOP-008 — Cognitive Debriefing**. Read §3/§5: the standalone workflow is **Cognitive debriefing → QA review → Final deliverable**, with **no translation step** (the client provides the already-translated instrument).",
    },
    {
      id: "s2", title: "A real cognitive-debriefing order has the right steps",
      url: "/admin/orders/0cb8ffdd-3b67-4cfb-8873-09f764a1186a",
      ring: "Cognitive Debriefing",
      caption: "Workflow: Cognitive Debriefing → QA Review → Final Deliverable — no translation step",
      say: "Open a real cognitive-debriefing order (here **ORD-2026-10488**). Confirm its workflow steps are **Cognitive Debriefing → QA Review → Final Deliverable** — and that there is **no Translation step** (a translation step on a standalone CD order would be wrong per §9). The **QA Review** step is the independent internal sign-off before delivery (§6).",
    },
  ],
};
