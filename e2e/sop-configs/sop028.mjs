export default {
  key: "sop028",
  sopNumber: "SOP-028",
  title: "Post-Delivery Client Review and Revision Rounds",
  docCode: "CTH-VRF-028",
  versionLine: "v2 active (effective 25 June 2026) — cross-references corrected: SOP-011 (CAPA), production SOPs updated to current numbering",
  owner: "Production / Operations",
  isoRef: "ISO 17100:2015 §5.3.5 (review), §6.1 (client communication); ISO 9001:2015 §8.5.3 (property of customers)",
  where: "Portal → QUALITY → SOPs;  and any order with a post-delivery revision round",
  golden: "**Look only.** You are confirming the procedure is published and that a real order follows it. If something doesn't match, write it in the Notes box.",
  summary: [
    "Validated on the live portal. SOP-028 governs how client review/changes after delivery are handled: (a) feedback is logged in **Client Communications** on the order record (§6.1 record, §3); (b) affected steps are re-opened for revision; (c) the vendor delivers a new version (v2, v3…); (d) QA re-verifies; (e) Final Deliverable re-issued. Scope rule: in-scope correction on a **not-yet-invoiced** order stays on the same order; if already invoiced or work is new/expanded, a new order under the same project. Each revision round carries its own vendor payable and, when chargeable, a supplementary customer invoice.",
    "Confirmed on a real order with a revision round. The client feedback appears in the communication log; the revised deliverable is versioned (v1 preserved, v2 alongside). **Result: PASS.**",
  ],
  steps: [
    {
      id: "s1", title: "Open SOP-028 and read the revision-round procedure",
      url: "/admin/sops/4edb0660-bb7e-45fc-9d40-f76d8352f4ff",
      ring: "Post-Delivery",
      caption: "SOP-028 Post-Delivery Client Review & Revision Rounds — v1 active",
      say: "Log in to **portal.cethos.com**. Left menu **QUALITY → SOPs**, open **SOP-028 — Post-Delivery Client Review & Revision Rounds**. Confirm it is **active** (v1, 26 Jun 2026). Read §3 (Procedure) — the key steps are: (1) log the client feedback in Client Communications on the order; (2) re-open the affected step(s); (3) vendor delivers v2; (4) QA re-verifies v2; (5) Final Deliverable re-issued v2. Note: v1 is never overwritten — both versions are retained for audit.",
    },
    {
      id: "s2", title: "Confirm scope rule and billing (§4 and §5)",
      url: "/admin/sops/4edb0660-bb7e-45fc-9d40-f76d8352f4ff",
      ring: "invoiced",
      caption: "SOP-028 §4 scope rule + §5 billing — invoiced orders get a new order; supplementary invoices allowed",
      say: "Still on SOP-028. Read §4 (Scope rule) — if the order is **already invoiced/Paid** OR the work is new/expanded, a **new order** is created under the same project (PRJ-…). Read §5 (Billing) — each round carries its own `vendor_payable` (accept the vendor invoice) and, when chargeable, a new receivable + **supplementary customer invoice** referencing the original. The portal supports multiple invoices and payables per order.",
    },
  ],
};
