export default {
  key: "sop011",
  sopNumber: "SOP-011",
  title: "Corrective and Preventive Actions",
  docCode: "CTH-VRF-011",
  versionLine: "v2 active (effective 24 June 2026)",
  owner: "Acting Quality Manager",
  isoRef: "ISO 17100:2015 §4.6; ISO 9001 §10.2",
  where: "Portal → QUALITY → Quality & Performance  (/admin/quality)",
  golden: "**Look only — don't change anything.** You are confirming the quality system holds real records, not creating or editing complaints/CAPAs. If something doesn't match, write it in the Notes box.",
  summary: [
    "Validated on the live portal. The closed-loop quality system is live: a **complaint or quality issue → nonconformity → root cause → corrective/preventive action → verification → close** (§4.6 / ISO 9001 §10.2).",
    "Real records are present (nonconformities NC-2026-00004 … 00007, each with a CAPA in progress), and the underlying quality event log is **append-only + hash-chained** (tamper-evident — confirmed at the database). **Result: PASS.**",
  ],
  steps: [
    {
      id: "s1", title: "Open SOP-011 and read it",
      url: "/admin/sops/7ae3a202-4ea3-4e79-841c-b8261caa66ae",
      ring: "Approved versions are frozen",
      caption: "SOP-011 open — approved version is frozen & controlled",
      say: "Log in. Left menu **QUALITY → SOPs**, open **SOP-011 — Corrective and Preventive Actions**. It defines how complaints and quality issues become a tracked **CAPA**: root cause → corrective & preventive action → verification of effectiveness → close.",
    },
    {
      id: "s2", title: "The closed-loop quality system holds real records",
      url: "/admin/quality",
      ring: "NC-2026-00007",
      caption: "Real nonconformities, each driving a CAPA — the closed-loop quality system",
      say: "Left menu **QUALITY → Quality & Performance**. Confirm the system lists real **complaints, nonconformities and CAPAs** (e.g. **NC-2026-00007**), each tracked through root cause → action → verification → close. Open one to see its CAPA trail.",
    },
  ],
};
