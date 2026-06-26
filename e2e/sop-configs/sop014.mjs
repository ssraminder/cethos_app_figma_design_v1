export default {
  key: "sop014",
  sopNumber: "SOP-014",
  title: "Data Security and Confidentiality",
  docCode: "CTH-VRF-014",
  versionLine: "v1 active (effective 24 June 2026)",
  owner: "IT / Systems",
  isoRef: "ISO/IEC 27001; 21 CFR Part 11 §11.10; GDPR/PIPEDA",
  where: "Portal → QUALITY → SOPs;  and Management → Staff (/admin/staff)",
  golden: "**Look only — don't change anything.** You are confirming access controls exist, not editing staff accounts. If something doesn't match, write it in the Notes box.",
  summary: [
    "Validated the **access-control** parts on the live portal: staff have **individual, named logins** (no shared accounts), each with its **own email, role, Active/Inactive state and last-login** — role-based access (§ access control).",
    "Encryption-at-rest, system audit trails and network controls are **enforced at the infrastructure layer (IT / Cital)** — those are confirmed by IT, not from this screen. **Result: PASS for the portal-confirmable controls.**",
  ],
  steps: [
    {
      id: "s1", title: "Open SOP-014 and read it",
      url: "/admin/sops/1e5c76c7-ce23-4a74-866e-d7d508659f84",
      ring: "Approved versions are frozen",
      caption: "SOP-014 open — approved version is frozen & controlled",
      say: "Log in. Left menu **QUALITY → SOPs**, open **SOP-014 — Data Security and Confidentiality**. It covers individual logins, role-based access, confidentiality/NDAs, and data protection (encryption + audit trails, IT-enforced).",
    },
    {
      id: "s2", title: "Individual named logins, role-based",
      url: "/admin/staff",
      ring: "Reviewer",
      caption: "Each person has their own login, role, Active/Inactive state and last-login — no shared accounts",
      say: "Left menu **Management → Staff**. Confirm each staff member has an **individual account** with their **own email**, a **role** (Admin / Reviewer / Super Admin), an **Active/Inactive** state, and a **last-login** — i.e. individual, role-based access, not shared accounts. (Fayza's own **Reviewer** login appears here.)",
    },
  ],
};
