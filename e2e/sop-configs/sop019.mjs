export default {
  key: "sop019",
  sopNumber: "SOP-019",
  title: "Qualification of Linguists for COA Linguistic Validation",
  docCode: "CTH-VRF-019",
  versionLine: "v3 active (effective 25 June 2026) — cross-references corrected: §1 SOP-003 (vendor qualification), §5 SOP-014 (data security)",
  owner: "Acting Quality Manager / Managing Director",
  isoRef: "ISO 17100:2015 §3.1.4, §6.1; ISPOR COA Linguistic Validation guidelines; ICH GCP",
  where: "Portal → QUALITY → SOPs;  and a vendor's QUALITY tab in Admin → Vendors",
  golden: "**Look only.** You are confirming that the qualification requirements are published and that a real COA-qualified vendor shows the correct status on their QUALITY tab. If something doesn't match, write it in the Notes box.",
  summary: [
    "Validated on the live portal. SOP-019 defines the five cumulative gates a linguist must meet before being assigned to any COA Linguistic Validation workflow: (1) role qualification with ISO §3.1.4 basis + Tier-2 verified evidence; (2) subject-matter qualification in Life Sciences / clinical area; (3) active NDA; (4) COA LV training on record; (5) competence assessed at ≥90% + graded sample translation. All five gates are enforced by the portal QMS assignment gate. Cross-references verified: §1 references SOP-003 (Vendor Qualification), §5 references SOP-014 (Data Security).",
    "Confirmed on a real vendor record: a COA-qualified vendor shows a green **COA Linguistic Validation Status** panel on their QUALITY tab in the admin portal. **Result: PASS.**",
  ],
  steps: [
    {
      id: "s1", title: "Open SOP-019 and read the five qualification gates (§2)",
      url: "/admin/sops/712859cc-1a6f-473a-8e8e-db20bf58c711",
      ring: "Qualified",
      caption: "SOP-019 — COA LV Qualification — v3 active (25 Jun 2026)",
      say: "Log in to **portal.cethos.com**. Left menu **QUALITY → SOPs**, open **SOP-019 — COA Linguistic Validation Qualification**. Confirm it is **active v3 (25 Jun 2026)**. Read §2 — five gates must ALL be met: (1) role qualification (ISO §3.1.4, Tier-2 evidence); (2) subject-matter qualification (Life Sciences or clinical sub-area); (3) active NDA; (4) COA LV training on record; (5) competence assessed (≥90% pass, graded sample). Also verify §1 cross-references SOP-003 and §5 references SOP-014.",
    },
    {
      id: "s2", title: "Confirm a COA-qualified vendor shows the correct portal status",
      url: "/admin/vendors",
      ring: "COA Linguistic Validation",
      caption: "Vendor QUALITY tab — COA Linguistic Validation Status panel (green = fully qualified)",
      say: "In the admin portal, search for a COA-qualified vendor (e.g. from the IQVIA COA roster). Open their profile → **QUALITY** tab. Confirm the **COA Linguistic Validation Status** panel appears near the top: a **green** panel confirms an active COA-qualifying role or subject-matter qualification in the QMS. **Amber** = qualifications under review. **Grey** = none. The panel lists the qualifying qualification(s) and language pair.",
    },
  ],
};
