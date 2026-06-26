export default {
  key: "sop004",
  sopNumber: "SOP-004",
  title: "Project Management and Customer Support",
  docCode: "CTH-VRF-004",
  versionLine: "v1 active (effective 25 June 2026)",
  owner: "Operations / Customer Support",
  isoRef: "ISO 17100:2015 §4.4, §5; ISO 9001:2015 §8.2, §8.5",
  where: "Portal → QUALITY → SOPs;  and any live COA order",
  golden: "**Look only.** You are confirming the procedure and verifying a real order follows its lifecycle. If something doesn't match, write it in the Notes box.",
  summary: [
    "Validated on the live portal. SOP-004 covers the **full project lifecycle** — enquiry/quote, order set-up, resource assignment (qualified linguists only per SOP-003/019), production, quality review, delivery, client feedback rounds (logged on the order), and invoicing (§4). SLAs and escalation paths are documented in §5.",
    "Every client feedback or revision round is **logged on the order record** (append-only communication log) — confirmed on real COA orders. **Result: PASS.**",
  ],
  steps: [
    {
      id: "s1", title: "Open SOP-004 and read the project lifecycle",
      url: "/admin/sops/adfe56d4-cd00-40eb-a3b6-afd8c1c36351",
      ring: "Project lifecycle",
      caption: "SOP-004 Project Management — v1 active, 8-step lifecycle including client-feedback logging",
      say: "Log in to **portal.cethos.com**. Left menu **QUALITY → SOPs**, open **SOP-004 — Project Management and Customer Support**. Confirm it is **active** (v1, 25 Jun 2026). Read §4 — the 8-step lifecycle from enquiry to invoicing; in step (7) every client feedback round is logged on the order record. Read §5 — SLAs include: enquiry acknowledged within one business day and SLA breaches flagged automatically.",
    },
    {
      id: "s2", title: "A real COA order shows §4 lifecycle in action",
      url: "/admin/orders",
      ring: "Client feedback logged",
      caption: "Orders list — COA orders show workflow steps + communication log per §4",
      say: "Open any active COA order (filter by 'COA' or 'Linguistic Validation' in the orders list). Confirm it has: (a) workflow steps assigned to named linguists, (b) a delivery date, and (c) a client-communication section or feedback log. This proves §4 step (7) is being followed — feedback is captured on the order, not just in email.",
    },
  ],
};
