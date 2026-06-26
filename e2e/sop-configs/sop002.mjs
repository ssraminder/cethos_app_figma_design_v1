export default {
  key: "sop002",
  sopNumber: "SOP-002",
  title: "Staff Training and Competence",
  docCode: "CTH-VRF-002",
  versionLine: "v1 active (effective 25 June 2026)",
  owner: "Human Resources",
  isoRef: "ISO 17100:2015 §3.1.5; ISO 9001:2015 §7.2; 21 CFR Part 11 §11.10(i)",
  where: "Portal → QUALITY → SOPs;  HR / Quality category",
  golden: "**Look only.** You are confirming the procedure is published and active. If something doesn't match, write it in the Notes box.",
  summary: [
    "Validated on the live portal. SOP-002 governs **staff training and competence** — each staff member's role profile, onboarding curriculum, training records, and annual competence sign-off by the Acting Quality Manager (§4–§9). Records are retained in the portal training system and on FORM-TR-001 (§8).",
    "SOP-002 is **v1 active** — initial issue that closes gap G1 (IA-2026-002). **Result: PASS.**",
  ],
  steps: [
    {
      id: "s1", title: "Open SOP-002 and confirm it is active",
      url: "/admin/sops/c85394ad-a822-4560-9777-14201c001ffb",
      ring: "Staff Training",
      caption: "SOP-002 Staff Training and Competence — v1 active, controlled",
      say: "Log in to **portal.cethos.com**. Left menu **QUALITY → SOPs**, open **SOP-002 — Staff Training and Competence**. Confirm it is marked **active** (v1, 25 Jun 2026). Read §4 (Responsibilities) — the Acting Quality Manager owns training records and verifies competence — and §8 (Training records) — training is recorded in the portal training system with FORM-TR-001 as the controlled paper record.",
    },
    {
      id: "s2", title: "Confirm the competence sign-off scope (§5 and §9)",
      url: "/admin/sops/c85394ad-a822-4560-9777-14201c001ffb",
      ring: "Competence",
      caption: "SOP-002 §5 role profiles + §9 competence sign-off — no unsupervised COA work until sign-off",
      say: "Still on SOP-002. Read §5 (Competence requirements) — every role has a documented profile listing required SOPs, systems and credentials. Read §9 (Competence assessment) — a person is **not assigned unsupervised in-scope (COA / clinical) work until competence is signed off** by the Acting Quality Manager. This is the staff-side control that complements the vendor-side SOP-019 COA qualification.",
    },
  ],
};
