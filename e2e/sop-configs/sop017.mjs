export default {
  key: "sop017",
  sopNumber: "SOP-017",
  title: "Business Continuity and Disaster Recovery",
  docCode: "CTH-VRF-017",
  versionLine: "v2 active (effective 24 June 2026)",
  owner: "IT / Systems",
  isoRef: "ISO 22301 / ISO/IEC 27001 A.17; ICH E6(R3); 21 CFR Part 11 §11.10",
  where: "Portal → QUALITY → SOPs;  and Documents & Manuals → Quality Records",
  golden: "**Look only.** You are confirming the BCDR evidence records exist. If a record is missing or unpublished, write it in the Notes box.",
  summary: [
    "Validated on the live portal. SOP-017 defines business-continuity and disaster-recovery procedures, supported by a documented call-tree and a tested recovery capability.",
    "The evidence is on file as controlled records: the **BCDR Call-Tree & Emergency Contacts (SOP-017-A)** and the **Restore Test Record (CTS-REC-RST-002)**, both Published. **Result: PASS.**",
  ],
  steps: [
    {
      id: "s1", title: "Open SOP-017 and read it",
      url: "/admin/sops/b4309681-2856-45bc-a1fe-d4bfd2518e8d",
      ring: "Approved versions are frozen",
      caption: "SOP-017 open — approved version is frozen & controlled",
      say: "Log in. Left menu **QUALITY → SOPs**, open **SOP-017 — Business Continuity and Disaster Recovery**. Read the recovery objectives and the call-tree / continuity procedures.",
    },
    {
      id: "s2", title: "The BCDR call-tree and restore test are on file",
      url: "/admin/documents",
      ring: "BCDR Call-Tree",
      caption: "SOP-017-A BCDR Call-Tree + CTS-REC-RST-002 restore test — Published Quality Records",
      say: "Left menu **QUALITY → Documents & Manuals**, scroll to **QUALITY RECORDS**. Confirm the **BCDR Call-Tree & Emergency Contacts (SOP-017-A)** and a **Restore Test Record (CTS-REC-RST-002)** are present and **Published**.",
    },
  ],
};
