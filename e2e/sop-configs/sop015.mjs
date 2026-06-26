export default {
  key: "sop015",
  sopNumber: "SOP-015",
  title: "Risk Management",
  docCode: "CTH-VRF-015",
  versionLine: "v1 active (effective 24 June 2026)",
  owner: "Acting Quality Manager",
  isoRef: "ISO 9001 §6.1; GAMP 5; ICH E6(R3)",
  where: "Portal → QUALITY → SOPs (the risk register lives in SOP-015 §8)",
  golden: "**Look only.** You are reading the controlled risk register, not editing it. If a listed risk looks wrong or out of date, write it in the Notes box.",
  summary: [
    "Validated on the live portal. SOP-015 is a controlled, version-frozen document whose **§8 risk register** lists the organisation's current key risks, each with a cross-reference to the SOP/control that manages it (data residency → SOP-014; single qualification approver → QA oversight; sub-processor dependency → SOP-018; legacy data migration).",
    "The register is reviewed annually. The risks and cross-references match the real state of the system. **Result: PASS.**",
  ],
  steps: [
    {
      id: "s1", title: "Open SOP-015 and read the control block",
      url: "/admin/sops/0c61e6c6-2400-4314-85e5-6a6a8e3072f4",
      ring: "Approved versions are frozen",
      caption: "SOP-015 open — approved version is frozen & controlled",
      say: "Log in. Left menu **QUALITY → SOPs**, open **SOP-015 — Risk Management**. Confirm the control block (number, version, owner, approver) and that the approved version is frozen.",
    },
    {
      id: "s2", title: "The current risk register is present",
      url: "/admin/sops/0c61e6c6-2400-4314-85e5-6a6a8e3072f4",
      ring: "key risks",
      caption: "§8 — current key risks, each cross-referenced to its controlling SOP",
      say: "Scroll to **§8 Current key risks**. Confirm it lists the real current risks, each pointing to the control that manages it — data residency → SOP-014, single approver → QA oversight, sub-processor dependency → SOP-018, legacy migration. This is the live risk register, reviewed annually.",
    },
  ],
};
