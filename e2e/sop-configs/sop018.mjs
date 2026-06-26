export default {
  key: "sop018",
  sopNumber: "SOP-018",
  title: "IT and Service Sub-processor Management",
  docCode: "CTH-VRF-018",
  versionLine: "v2 active (effective 24 June 2026)",
  owner: "Supplier Management / IT",
  isoRef: "IQVIA Supplier Management; 21 CFR Part 11; GDPR; ICH GCP; ISO 17100 §4.3",
  where: "Portal → QUALITY → SOPs;  and Documents & Manuals → Quality Records",
  golden: "**Look only.** You are confirming the sub-processor register exists and is current. If it's missing or unpublished, write it in the Notes box.",
  summary: [
    "Validated on the live portal. SOP-018 governs how IT / service sub-processors (the third parties in the data path) are assessed, approved and tracked, with data-residency recorded.",
    "The evidence is on file as a controlled record: the **Sub-processor & Data-Residency Register (REG-SP-001)**, Published. **Result: PASS.**",
  ],
  steps: [
    {
      id: "s1", title: "Open SOP-018 and read it",
      url: "/admin/sops/ba338c1f-ba47-4841-893a-b52ce38142e5",
      ring: "Approved versions are frozen",
      caption: "SOP-018 open — approved version is frozen & controlled",
      say: "Log in. Left menu **QUALITY → SOPs**, open **SOP-018 — IT / Service Sub-processor Management**. It covers how sub-processors are assessed/approved and how data residency is recorded.",
    },
    {
      id: "s2", title: "The sub-processor register is on file",
      url: "/admin/documents",
      ring: "Sub-processor",
      caption: "REG-SP-001 Sub-processor & Data-Residency Register — Published Quality Record",
      say: "Left menu **QUALITY → Documents & Manuals**. Confirm the **Sub-processor & Data-Residency Register (REG-SP-001)** is present and **Published** — the list of approved sub-processors and where each stores data.",
    },
  ],
};
