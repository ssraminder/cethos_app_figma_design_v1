export default {
  key: "sop020",
  sopNumber: "SOP-020",
  title: "Vendor Inbox and AI Front-Desk",
  docCode: "CTH-VRF-020",
  versionLine: "v2 active (effective 24 June 2026)",
  owner: "IT / Systems",
  isoRef: "Mail infrastructure (operational)",
  where: "Portal → QUALITY → SOPs;  and Vendor Communication inbox (/admin/vendors/communication)",
  golden: "**Look only.** You are confirming the inbox works, not replying to mail. If something doesn't match, write it in the Notes box.",
  summary: [
    "Validated on the live portal. The unified **Vendor Communication inbox** shows ALL inbound mail with **filter chips (All / Vendors / Applicants / Other)** and per-message **type badges + threading**, auto-refreshing.",
    "The AI front-desk triages inbound mail (apply/portal links, forward-to-office, drop spam) per the SOP. **Result: PASS.**",
  ],
  steps: [
    {
      id: "s1", title: "Open SOP-020 and read it",
      url: "/admin/sops/5e927074-2cf4-4eb1-b774-edbabb1fe89b",
      ring: "Approved versions are frozen",
      caption: "SOP-020 open — approved version is frozen & controlled",
      say: "Log in. Left menu **QUALITY → SOPs**, open **SOP-020 — Vendor Inbox and AI Front-Desk**. It describes the shared mailbox + AI front-desk that triages incoming mail.",
    },
    {
      id: "s2", title: "The unified inbox with filter chips",
      url: "/admin/vendors/communication",
      ring: "Applicants",
      caption: "Inbox — All / Vendors / Applicants / Other chips, type badges, threading, auto-refresh",
      say: "Open the **Vendor Communication** inbox. Confirm it lists all inbound mail with **filter chips (All / Vendors / Applicants / Other)** and counts, **type badges**, and threaded conversations. Clicking a chip filters the list.",
    },
  ],
};
