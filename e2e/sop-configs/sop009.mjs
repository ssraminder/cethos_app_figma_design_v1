export default {
  key: "sop009",
  sopNumber: "SOP-009",
  title: "Clinician Reviews",
  docCode: "CTH-VRF-009",
  versionLine: "v3 active (effective 25 June 2026) — cross-references corrected to SOP-019/SOP-011/SOP-008",
  owner: "Project Management / Operations",
  isoRef: "ISO 17100:2015 §4.4, §5.2, §6.1; ISPOR COA good practices",
  where: "Portal → QUALITY → SOPs;  and a clinician-review order's workflow",
  golden: "**Look only — don't change anything.** You are confirming an existing order's setup, not running the review or editing the order. If something doesn't match, write it in the Notes box.",
  summary: [
    "Validated on the live portal. Clinician review is a **standalone COA validation service** — a qualified clinician reviews a client-provided translated instrument, so the workflow is **Clinician Review → QA Review → Final Deliverable** with **no Translation step** (§3/§9).",
    "Confirmed on real orders: clinician-review orders show exactly those three steps and **zero** translation steps. The independent qualified clinician + internal QA review are the quality controls (§2/§6). **Result: PASS.**",
  ],
  steps: [
    {
      id: "s1", title: "Open SOP-009 and read the runbook",
      url: "/admin/sops/a77c5078-3317-48d9-bf62-7ab3593f3d68",
      ring: "Approved versions are frozen",
      caption: "SOP-009 open — approved version is frozen & controlled",
      say: "Log in to **portal.cethos.com**. Left menu **QUALITY → SOPs**, then in **PRODUCTION** open **SOP-009 — Clinician Reviews**. Read §3/§5: the standalone workflow is **Clinician review → QA review → Final deliverable**, with **no translation step** (the client provides the translated instrument; a qualified physician reviews it for clinical accuracy).",
    },
    {
      id: "s2", title: "A real clinician-review order has the right steps",
      url: "/admin/orders/318d1a75-559e-46a2-9bee-46b6d86144d0",
      ring: "Clinician Review",
      caption: "Workflow: Clinician Review → QA Review → Final Deliverable — no translation step",
      say: "Open a real clinician-review order (here **ORD-2026-10525**). Confirm its workflow steps are **Clinician Review → QA Review → Final Deliverable** — and that there is **no Translation step** (one here would be wrong per §9). The **QA Review** step is the independent internal sign-off before delivery (§6).",
    },
  ],
};
