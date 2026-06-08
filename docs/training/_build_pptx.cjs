// Build the Cethos PM Workflow training PPT.
// Run with: node _build_pptx.js
// Output: pm-workflow-training.pptx in the same directory.

const pptxgen = require("pptxgenjs");

// ── Brand tokens ───────────────────────────────────────────────
const NAVY = "0C2340";         // cethos.navy — headings + dark surfaces
const TEAL = "0891B2";         // cethos.teal.600 — CTAs + links + Split badge
const TEAL_LIGHT = "06B6D4";   // cethos.teal.500 — hover
const NAVY_INK = "1A365D";     // navy for body text on white
const SLATE_900 = "0F172A";    // body
const SLATE_700 = "334155";    // body muted
const SLATE_500 = "64748B";    // captions
const SLATE_300 = "CBD5E1";    // borders
const SLATE_200 = "E2E8F0";    // separators
const SLATE_100 = "F1F5F9";    // alternate row
const SLATE_50  = "F8FAFC";    // bg alt
const WHITE = "FFFFFF";
const EMERALD = "10B981";
const AMBER = "F59E0B";
const RED = "EF4444";
const BLUE = "3B82F6";
const TEAL_TINT = "E0F2FE";    // tint background
const NAVY_TINT = "DBEAFE";    // navy alt

const FONT_TITLE = "Calibri";
const FONT_BODY = "Calibri Light";
const FONT_MONO = "Consolas";

// ── Setup ──────────────────────────────────────────────────────
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.3 x 7.5"
pres.title = "Cethos PM Workflow Training";
pres.subject = "End-to-End PM Workflow + Step Split Feature";
pres.author = "Cethos / Claude Code";

const W = 13.3;
const H = 7.5;

// ── Helpers ────────────────────────────────────────────────────
function chrome(slide, opts = {}) {
  // White background
  slide.background = { color: WHITE };
  // Teal sidebar accent (left edge) — 0.18" wide, full height
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.18, h: H,
    fill: { color: TEAL }, line: { type: "none" },
  });
  // Footer text — small + muted
  if (!opts.noFooter) {
    slide.addText(
      [
        { text: "Cethos PM Workflow Training", options: { bold: true, color: NAVY } },
        { text: "  ·  2026-06-08", options: { color: SLATE_500 } },
      ],
      { x: 0.5, y: H - 0.4, w: 8, h: 0.3, fontSize: 9, fontFace: FONT_BODY, margin: 0 },
    );
  }
  // Page number — right
  if (opts.page) {
    slide.addText(`${opts.page} / 16`, {
      x: W - 1.0, y: H - 0.4, w: 0.7, h: 0.3,
      fontSize: 9, color: SLATE_500, fontFace: FONT_BODY,
      align: "right", margin: 0,
    });
  }
}

function sectionEyebrow(slide, eyebrow, x = 0.6, y = 0.55) {
  slide.addText(eyebrow.toUpperCase(), {
    x, y, w: 8, h: 0.32,
    fontSize: 11, bold: true, color: TEAL,
    fontFace: FONT_TITLE, charSpacing: 4, margin: 0,
  });
}

function slideTitle(slide, title, x = 0.6, y = 0.85) {
  slide.addText(title, {
    x, y, w: W - 1.2, h: 0.85,
    fontSize: 34, bold: true, color: NAVY,
    fontFace: FONT_TITLE, margin: 0,
  });
}

function slideSubtitle(slide, text, x = 0.6, y = 1.75) {
  slide.addText(text, {
    x, y, w: W - 1.2, h: 0.5,
    fontSize: 14, color: SLATE_700, fontFace: FONT_BODY, margin: 0,
  });
}

// Status pill (rounded with dot)
function statusPill(slide, x, y, w, label, bgColor, textColor, dotColor) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h: 0.32,
    fill: { color: bgColor }, line: { color: textColor, width: 0.5 },
    rectRadius: 0.16,
  });
  slide.addShape(pres.shapes.OVAL, {
    x: x + 0.1, y: y + 0.1, w: 0.12, h: 0.12,
    fill: { color: dotColor }, line: { type: "none" },
  });
  slide.addText(label, {
    x: x + 0.25, y: y, w: w - 0.3, h: 0.32,
    fontSize: 10, color: textColor, bold: true,
    fontFace: FONT_TITLE, valign: "middle", margin: 0,
  });
}

// Solid pill (no dot)
function solidPill(slide, x, y, w, label, bgColor, textColor) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h: 0.3,
    fill: { color: bgColor }, line: { type: "none" },
    rectRadius: 0.15,
  });
  slide.addText(label, {
    x, y, w, h: 0.3,
    fontSize: 10, color: textColor, bold: true,
    fontFace: FONT_TITLE, align: "center", valign: "middle", margin: 0,
  });
}

// Card with optional left accent stripe + shadow
function card(slide, x, y, w, h, opts = {}) {
  const fill = opts.fill || WHITE;
  const accent = opts.accent || null;
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h,
    fill: { color: fill }, line: { color: SLATE_200, width: 0.75 },
    shadow: { type: "outer", color: "000000", opacity: 0.06, blur: 8, offset: 2, angle: 135 },
  });
  if (accent) {
    slide.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 0.08, h,
      fill: { color: accent }, line: { type: "none" },
    });
  }
}

// ── Slide 1: Title ─────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: NAVY };

  // Subtle accent rectangles — large transparent teal "split" motif
  s.addShape(pres.shapes.RECTANGLE, {
    x: W - 4.2, y: -1.2, w: 5, h: H + 2,
    fill: { color: TEAL, transparency: 85 }, line: { type: "none" },
    rotate: 12,
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: W - 3.5, y: -1.5, w: 4.5, h: H + 2,
    fill: { color: TEAL_LIGHT, transparency: 90 }, line: { type: "none" },
    rotate: 12,
  });

  // Eyebrow
  s.addText("CETHOS TRANSLATION SERVICES", {
    x: 0.8, y: 1.5, w: 8, h: 0.32,
    fontSize: 12, bold: true, color: TEAL_LIGHT,
    fontFace: FONT_TITLE, charSpacing: 6, margin: 0,
  });

  // Main title
  s.addText([
    { text: "PM Workflow", options: { color: WHITE, breakLine: true } },
    { text: "Training Guide", options: { color: TEAL_LIGHT } },
  ], {
    x: 0.8, y: 2.0, w: 11, h: 2.5,
    fontSize: 64, bold: true, fontFace: FONT_TITLE, margin: 0,
  });

  // Subtitle
  s.addText("End-to-end project management on portal.cethos.com & vendor.cethos.com — including the new Step Split feature shipped 2026-06-08", {
    x: 0.8, y: 5.0, w: 8.5, h: 1.2,
    fontSize: 16, color: "CBD5E1", fontFace: FONT_BODY, margin: 0,
  });

  // Footer band
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: H - 0.55, w: W, h: 0.55,
    fill: { color: "061528" }, line: { type: "none" },
  });
  s.addText("Authored 2026-06-08  ·  Live walkthrough on ORD-2026-354733  ·  Cethos / Claude Code", {
    x: 0.8, y: H - 0.5, w: W - 1.6, h: 0.45,
    fontSize: 10, color: "94A3B8", fontFace: FONT_BODY,
    valign: "middle", margin: 0,
  });
}

// ── Slide 2: Concepts & state machine ──────────────────────────
{
  const s = pres.addSlide();
  chrome(s, { page: 2 });

  sectionEyebrow(s, "§ 0  Concepts & vocabulary");
  slideTitle(s, "The step state machine drives everything");
  slideSubtitle(s, "Every workflow step moves through a sequence of states. Triggers keep the order's work_status in sync.");

  // State machine: pill row
  const states = [
    { label: "pending",     bg: SLATE_100, text: SLATE_700, dot: "94A3B8" },
    { label: "offered",     bg: "FEF3C7", text: "92400E",   dot: AMBER },
    { label: "accepted",    bg: TEAL_TINT, text: "075985", dot: BLUE },
    { label: "in_progress", bg: TEAL_TINT, text: "075985", dot: BLUE },
    { label: "delivered",   bg: "D1FAE5", text: "065F46",   dot: EMERALD },
    { label: "approved",    bg: "D1FAE5", text: "065F46",   dot: EMERALD },
  ];
  let x = 0.65;
  const y = 2.85;
  const pillW = 1.85;
  const gap = 0.1;
  states.forEach((st, i) => {
    statusPill(s, x, y, pillW, st.label, st.bg, st.text, st.dot);
    if (i < states.length - 1) {
      // arrow
      s.addShape(pres.shapes.RIGHT_TRIANGLE, {
        x: x + pillW + 0.005, y: y + 0.08, w: 0.12, h: 0.16,
        fill: { color: SLATE_500 }, line: { type: "none" }, rotate: 90,
      });
    }
    x += pillW + gap + 0.12;
  });

  // Branch labels
  s.addText("vendor declines  →  cancelled", {
    x: 0.65, y: 3.35, w: 5, h: 0.3,
    fontSize: 10, color: SLATE_500, italic: true, fontFace: FONT_BODY, margin: 0,
  });
  s.addText("revision requested  →  back to in_progress", {
    x: 5.5, y: 3.35, w: 6, h: 0.3,
    fontSize: 10, color: SLATE_500, italic: true, fontFace: FONT_BODY, margin: 0,
  });

  // Two cards: data model + rollup
  card(s, 0.65, 4.0, 6.0, 2.8, { accent: TEAL });
  s.addText("KEY DATA OBJECTS", {
    x: 0.95, y: 4.15, w: 5.5, h: 0.3,
    fontSize: 10, bold: true, color: TEAL, charSpacing: 3, fontFace: FONT_TITLE, margin: 0,
  });
  s.addText([
    { text: "Quote", options: { bold: true, color: NAVY } },
    { text: " — pre-order pricing artifact",                  options: { color: SLATE_700, breakLine: true } },
    { text: "Order", options: { bold: true, color: NAVY } },
    { text: " — the committed translation job",                options: { color: SLATE_700, breakLine: true } },
    { text: "Workflow + Steps", options: { bold: true, color: NAVY } },
    { text: " — picked from template at order creation",       options: { color: SLATE_700, breakLine: true } },
    { text: "Actor type", options: { bold: true, color: NAVY } },
    { text: " — external_vendor / internal_work / customer",   options: { color: SLATE_700, breakLine: true } },
    { text: "Split parent + children", options: { bold: true, color: NAVY } },
    { text: " — new 2026-06-08 (see § 3)",                     options: { color: SLATE_700 } },
  ], {
    x: 0.95, y: 4.5, w: 5.4, h: 2.2,
    fontSize: 12, fontFace: FONT_BODY, paraSpaceAfter: 4, margin: 0,
  });

  card(s, 6.85, 4.0, 5.85, 2.8, { accent: NAVY });
  s.addText("WORK STATUS TRIGGER", {
    x: 7.15, y: 4.15, w: 5.4, h: 0.3,
    fontSize: 10, bold: true, color: NAVY, charSpacing: 3, fontFace: FONT_TITLE, margin: 0,
  });
  s.addText([
    { text: "recompute_order_work_status", options: { fontFace: FONT_MONO, color: NAVY, bold: true, breakLine: true } },
    { text: "fires on every step status change. Maps:", options: { color: SLATE_700, breakLine: true } },
    { text: " ", options: { breakLine: true } },
    { text: "All approved", options: { bold: true, color: EMERALD } },
    { text: "  →  completed", options: { color: SLATE_700, breakLine: true } },
    { text: "Any active",    options: { bold: true, color: BLUE } },
    { text: "    →  in_progress", options: { color: SLATE_700, breakLine: true } },
    { text: "All pending",   options: { bold: true, color: SLATE_500 } },
    { text: "   →  pending", options: { color: SLATE_700, breakLine: true } },
    { text: " ", options: { breakLine: true } },
    { text: "Staff override (on_hold / cancelled) is respected — trigger no-ops on those states.",
      options: { italic: true, color: SLATE_500, fontSize: 11 } },
  ], {
    x: 7.15, y: 4.5, w: 5.35, h: 2.2,
    fontSize: 12, fontFace: FONT_BODY, paraSpaceAfter: 2, margin: 0,
  });
}

// ── Slide 3: Order detail + workflow pipeline ──────────────────
{
  const s = pres.addSlide();
  chrome(s, { page: 3 });

  sectionEyebrow(s, "§ 1 + § 2  Order detail & Workflow pipeline");
  slideTitle(s, "Where you spend most of your day");
  slideSubtitle(s, "An order page bundles customer info, files, workflow steps, finance, and activity into one view.");

  // 3-column layout describing key zones
  const colY = 2.85;
  const colH = 4.0;
  const zones = [
    {
      title: "HEADER + CUSTOMER",
      accent: TEAL,
      items: [
        "Order number & status dropdowns",
        "Customer Information card",
        "Translation Details (langs, intended use, certification)",
        "Documents (source / reference / drafts / completed)",
      ],
    },
    {
      title: "WORKFLOW",
      accent: NAVY,
      items: [
        "Certified Translation template",
        "Per-step cards with actor pill",
        "Status badges + actions",
        "⤴ Split… on eligible steps",
        "Financial roll-up at bottom",
      ],
    },
    {
      title: "RIGHT COLUMN",
      accent: TEAL,
      items: [
        "Messages (customer thread)",
        "Delivery card (turnaround, deadlines)",
        "Live Activity feed",
        "Manual payment events",
      ],
    },
  ];
  const colW = (W - 1.2 - 0.4) / 3;
  zones.forEach((z, i) => {
    const x = 0.6 + i * (colW + 0.2);
    card(s, x, colY, colW, colH, { accent: z.accent });
    s.addText(z.title, {
      x: x + 0.3, y: colY + 0.2, w: colW - 0.5, h: 0.3,
      fontSize: 10, bold: true, color: z.accent, charSpacing: 3, fontFace: FONT_TITLE, margin: 0,
    });
    const lines = z.items.map((it, j) => ({
      text: it,
      options: { color: SLATE_700, bullet: { code: "25CF" }, breakLine: j < z.items.length - 1 },
    }));
    s.addText(lines, {
      x: x + 0.3, y: colY + 0.65, w: colW - 0.5, h: colH - 0.85,
      fontSize: 12, fontFace: FONT_BODY, paraSpaceAfter: 6, margin: 0,
    });
  });

  // Bottom callout — when to use Split (raised above footer band)
  card(s, 0.6, 6.5, W - 1.2, 0.45, { accent: TEAL, fill: TEAL_TINT });
  s.addText([
    { text: "Split eligibility:  ", options: { bold: true, color: TEAL } },
    { text: "no deliveries · no vendor · no live payable · not already split · external_vendor or internal_work · status pending/offered",
      options: { color: NAVY_INK } },
  ], {
    x: 0.85, y: 6.5, w: W - 1.4, h: 0.45,
    fontSize: 11, fontFace: FONT_BODY, valign: "middle", margin: 0,
  });
}

// ── Slide 4: NEW — Splitting a step (overview) ─────────────────
{
  const s = pres.addSlide();
  chrome(s, { page: 4 });

  // "NEW" pill instead of eyebrow
  solidPill(s, 0.6, 0.55, 0.75, "NEW", TEAL, WHITE);
  s.addText("Shipped 2026-06-08", {
    x: 1.45, y: 0.58, w: 4, h: 0.3,
    fontSize: 10, color: SLATE_500, italic: true, fontFace: FONT_BODY, margin: 0,
  });

  slideTitle(s, "Splitting a step across multiple assignees", 0.6, 1.0);
  slideSubtitle(s, "One Translate step. Three files. Two external vendors + one in-house staff. Each sees only their files.", 0.6, 1.85);

  // Use case card
  card(s, 0.6, 2.55, 5.7, 4.2, { accent: TEAL });
  s.addText("USE CASE", {
    x: 0.9, y: 2.7, w: 5.3, h: 0.3,
    fontSize: 10, bold: true, color: TEAL, charSpacing: 3, fontFace: FONT_TITLE, margin: 0,
  });
  s.addText("\"Translate step has 3 files. Two need different vendor language coverage; one is short + urgent so we'll do it in-house.\"", {
    x: 0.9, y: 3.05, w: 5.3, h: 1.0,
    fontSize: 14, italic: true, color: SLATE_700, fontFace: FONT_BODY, margin: 0,
  });

  // Show 3 partition mini-cards
  const partitions = [
    { num: "P1", file: "cert_birth.pdf", who: "A King", kind: "Vendor", color: TEAL },
    { num: "P2", file: "cert_marriage.pdf", who: "Bobby Rawat", kind: "IN-HOUSE", color: NAVY },
    { num: "P3", file: "diploma.pdf", who: "Adam Lengyel", kind: "Vendor", color: TEAL },
  ];
  partitions.forEach((p, i) => {
    const yp = 4.2 + i * 0.78;
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.9, y: yp, w: 5.0, h: 0.68,
      fill: { color: SLATE_50 }, line: { color: SLATE_200, width: 0.5 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.9, y: yp, w: 0.06, h: 0.68,
      fill: { color: p.color }, line: { type: "none" },
    });
    s.addText(p.num, {
      x: 1.05, y: yp + 0.05, w: 0.4, h: 0.3,
      fontSize: 10, bold: true, color: SLATE_500, fontFace: FONT_TITLE, margin: 0,
    });
    s.addText(p.file, {
      x: 1.05, y: yp + 0.3, w: 2.3, h: 0.3,
      fontSize: 10, color: NAVY, fontFace: FONT_MONO, margin: 0,
    });
    s.addText(p.who, {
      x: 3.4, y: yp + 0.05, w: 2.0, h: 0.3,
      fontSize: 11, bold: true, color: NAVY_INK, fontFace: FONT_TITLE, margin: 0,
    });
    solidPill(s, 3.4, yp + 0.35, 1.0, p.kind, p.color, WHITE);
  });

  // Right column: what happens server-side
  card(s, 6.5, 2.55, 6.2, 4.2, { accent: NAVY });
  s.addText("SERVER FLOW ON SAVE", {
    x: 6.8, y: 2.7, w: 5.8, h: 0.3,
    fontSize: 10, bold: true, color: NAVY, charSpacing: 3, fontFace: FONT_TITLE, margin: 0,
  });

  const steps = [
    { n: "1", text: "Validates: no deliveries, no vendor, no live payable, no nested split, every file covered exactly once" },
    { n: "2", text: "Re-checks revisor independence (walks parent_step_id of constrained prior steps)" },
    { n: "3", text: "Sets parent.is_split = true; inserts N child rows at workflow tail (step_number = max+i)" },
    { n: "4", text: "Inserts step_files rows mapping each child to its quote files" },
    { n: "5", text: "Optional vendor_payables rows for vendor partitions with a rate" },
    { n: "6", text: "qms.assignment_eligibility_events audit rows (call_site='split-step')" },
    { n: "7", text: "Calls recompute_parent_step_status → parent → in_progress" },
  ];
  steps.forEach((st, i) => {
    const yi = 3.1 + i * 0.51;
    s.addShape(pres.shapes.OVAL, {
      x: 6.8, y: yi, w: 0.32, h: 0.32,
      fill: { color: NAVY }, line: { type: "none" },
    });
    s.addText(st.n, {
      x: 6.8, y: yi, w: 0.32, h: 0.32,
      fontSize: 11, bold: true, color: WHITE, fontFace: FONT_TITLE,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(st.text, {
      x: 7.2, y: yi, w: 5.4, h: 0.42,
      fontSize: 11, color: SLATE_700, fontFace: FONT_BODY, valign: "top", margin: 0,
    });
  });

  // Bottom result (raised above footer band)
  card(s, 0.6, 6.5, W - 1.2, 0.45, { accent: EMERALD, fill: "ECFDF5" });
  s.addText([
    { text: "Result:  ", options: { bold: true, color: EMERALD } },
    { text: 'parent step wears teal ', options: { color: NAVY_INK } },
    { text: '"⤴ Split N/M"', options: { color: TEAL, bold: true, fontFace: FONT_MONO } },
    { text: ' badge; children stack inside cethos-teal left rail with IN-HOUSE pill on staff partitions', options: { color: NAVY_INK } },
  ], {
    x: 0.85, y: 6.5, w: W - 1.4, h: 0.45,
    fontSize: 11, fontFace: FONT_BODY, valign: "middle", margin: 0,
  });
}

// ── Slide 5: Split modal anatomy ───────────────────────────────
{
  const s = pres.addSlide();
  chrome(s, { page: 5 });

  sectionEyebrow(s, "§ 3  Splitting a step");
  slideTitle(s, "Split Step modal — the two-pane builder");
  slideSubtitle(s, "Left pane: every quote_file. Right pane: stack of partition cards. Validation footer tracks coverage live.");

  // Mock modal frame
  const mx = 0.6, my = 2.55, mw = W - 1.2, mh = 4.4;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: mx, y: my, w: mw, h: mh,
    fill: { color: WHITE }, line: { color: SLATE_200, width: 0.75 },
    rectRadius: 0.08,
    shadow: { type: "outer", color: "000000", opacity: 0.1, blur: 12, offset: 3, angle: 135 },
  });

  // Header band
  s.addText("Split step across multiple assignees", {
    x: mx + 0.3, y: my + 0.18, w: 8, h: 0.35,
    fontSize: 16, bold: true, color: NAVY, fontFace: FONT_TITLE, margin: 0,
  });
  s.addText("Step 1 · Translation · Spanish (Spain) → English · 3 files", {
    x: mx + 0.3, y: my + 0.55, w: 8, h: 0.3,
    fontSize: 11, color: SLATE_500, fontFace: FONT_BODY, margin: 0,
  });
  s.addText("×", {
    x: mx + mw - 0.4, y: my + 0.15, w: 0.3, h: 0.3,
    fontSize: 18, color: SLATE_500, fontFace: FONT_TITLE, align: "right", margin: 0,
  });
  // Divider
  s.addShape(pres.shapes.LINE, {
    x: mx + 0.2, y: my + 0.95, w: mw - 0.4, h: 0,
    line: { color: SLATE_200, width: 0.5 },
  });

  // Left pane — order files
  s.addText("ORDER FILES", {
    x: mx + 0.3, y: my + 1.1, w: 2.8, h: 0.25,
    fontSize: 9, bold: true, color: SLATE_500, charSpacing: 3, fontFace: FONT_TITLE, margin: 0,
  });
  const filesL = [
    { name: "cert_birth.pdf", meta: "2 pp · 312 w", p: "P1" },
    { name: "cert_marriage.pdf", meta: "3 pp · 488 w", p: "P2" },
    { name: "diploma_transcript.pdf", meta: "8 pp · 2,304 w", p: "P3" },
  ];
  filesL.forEach((f, i) => {
    const fy = my + 1.45 + i * 0.55;
    s.addShape(pres.shapes.RECTANGLE, {
      x: mx + 0.3, y: fy, w: 3.0, h: 0.48,
      fill: { color: SLATE_100 }, line: { color: SLATE_200, width: 0.5 },
    });
    s.addText(f.name, {
      x: mx + 0.45, y: fy + 0.05, w: 2.0, h: 0.25,
      fontSize: 9.5, color: NAVY, fontFace: FONT_MONO, margin: 0,
    });
    s.addText(f.meta, {
      x: mx + 0.45, y: fy + 0.25, w: 2.0, h: 0.2,
      fontSize: 8, color: SLATE_500, fontFace: FONT_BODY, margin: 0,
    });
    solidPill(s, mx + 2.6, fy + 0.13, 0.6, f.p, TEAL, WHITE);
  });

  // Divider between panes
  s.addShape(pres.shapes.LINE, {
    x: mx + 3.6, y: my + 1.05, w: 0, h: mh - 1.2,
    line: { color: SLATE_200, width: 0.5 },
  });

  // Right pane — partitions
  s.addText("PARTITIONS", {
    x: mx + 3.8, y: my + 1.1, w: 5, h: 0.25,
    fontSize: 9, bold: true, color: SLATE_500, charSpacing: 3, fontFace: FONT_TITLE, margin: 0,
  });

  const parts = [
    { idx: "Partition 1", assignee: "External vendor: A King", note: "$0.10/word · CAD · Jun 12" },
    { idx: "Partition 2", assignee: "In-house staff: Bobby Rawat", note: "no payable · Jun 12" },
    { idx: "Partition 3", assignee: "External vendor: Adam Lengyel", note: "$0.12/word · CAD · Jun 13" },
  ];
  parts.forEach((p, i) => {
    const py = my + 1.45 + i * 0.65;
    s.addShape(pres.shapes.RECTANGLE, {
      x: mx + 3.8, y: py, w: 4.6, h: 0.58,
      fill: { color: WHITE }, line: { color: SLATE_200, width: 0.5 },
    });
    s.addText(p.idx, {
      x: mx + 3.95, y: py + 0.05, w: 1.4, h: 0.22,
      fontSize: 9, bold: true, color: SLATE_500, fontFace: FONT_TITLE, margin: 0,
    });
    s.addText(p.assignee, {
      x: mx + 3.95, y: py + 0.22, w: 4.3, h: 0.2,
      fontSize: 10, color: NAVY, bold: true, fontFace: FONT_TITLE, margin: 0,
    });
    s.addText(p.note, {
      x: mx + 3.95, y: py + 0.4, w: 4.3, h: 0.18,
      fontSize: 9, color: SLATE_500, fontFace: FONT_BODY, margin: 0,
    });
  });

  // Field reference (right column)
  s.addText("PER PARTITION", {
    x: mx + 8.7, y: my + 1.1, w: 4, h: 0.25,
    fontSize: 9, bold: true, color: SLATE_500, charSpacing: 3, fontFace: FONT_TITLE, margin: 0,
  });
  s.addText([
    { text: "Files",            options: { bold: true, color: NAVY } },
    { text: " — chip list, click + Add file",   options: { color: SLATE_700, breakLine: true } },
    { text: "Assignee radio",     options: { bold: true, color: NAVY } },
    { text: " — External vendor | In-house staff", options: { color: SLATE_700, breakLine: true } },
    { text: "Vendor / Staff",  options: { bold: true, color: NAVY } },
    { text: " — search dropdown, active only",     options: { color: SLATE_700, breakLine: true } },
    { text: "Rate (vendor)",   options: { bold: true, color: NAVY } },
    { text: " — optional; per_word default",        options: { color: SLATE_700, breakLine: true } },
    { text: "Deadline",        options: { bold: true, color: NAVY } },
    { text: " — defaults to parent deadline",       options: { color: SLATE_700 } },
  ], {
    x: mx + 8.7, y: my + 1.45, w: mw - 9.0, h: 2.8,
    fontSize: 10, fontFace: FONT_BODY, paraSpaceAfter: 4, margin: 0,
  });

  // Footer band — validation + save
  s.addShape(pres.shapes.LINE, {
    x: mx + 0.2, y: my + mh - 0.7, w: mw - 0.4, h: 0,
    line: { color: SLATE_200, width: 0.5 },
  });
  s.addText([
    { text: "✓ ", options: { color: EMERALD, bold: true } },
    { text: "All 3 files assigned", options: { color: EMERALD, bold: true } },
  ], {
    x: mx + 0.3, y: my + mh - 0.55, w: 4, h: 0.35,
    fontSize: 11, fontFace: FONT_BODY, margin: 0,
  });
  solidPill(s, mx + mw - 2.6, my + mh - 0.55, 1.4, "Save split (3)", TEAL, WHITE);
  solidPill(s, mx + mw - 4.1, my + mh - 0.55, 1.2, "Cancel", WHITE, SLATE_500);
  s.addShape(pres.shapes.RECTANGLE, {
    x: mx + mw - 4.1, y: my + mh - 0.55, w: 1.2, h: 0.3,
    line: { color: SLATE_300, width: 0.5 }, fill: { type: "none" },
  });

  // Bottom validation note (raised above footer band)
  s.addText("Validation footer flips amber → green only when every file is placed AND every partition has an assignee. Save button is disabled until green.", {
    x: 0.6, y: 6.6, w: W - 1.2, h: 0.4,
    fontSize: 11, italic: true, color: SLATE_500, fontFace: FONT_BODY, align: "center", margin: 0,
  });
}

// ── Slide 6: Post-split rendering + parent rollup ──────────────
{
  const s = pres.addSlide();
  chrome(s, { page: 6 });

  sectionEyebrow(s, "§ 3  Splitting a step");
  slideTitle(s, "After save — parent + indented children");
  slideSubtitle(s, "Parent wears the Split N/M badge. Children stack inside a cethos-teal left rail.");

  // Mock workflow card — Step 1 (split parent) with 3 children
  const cardX = 0.6, cardY = 2.55, cardW = 7.5, cardH = 4.3;
  card(s, cardX, cardY, cardW, cardH);

  // Parent header
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: cardX + 0.3, y: cardY + 0.25, w: 0.45, h: 0.45,
    fill: { color: SLATE_50 }, line: { color: SLATE_300, width: 1 },
    rectRadius: 0.06,
  });
  s.addText("2", {
    x: cardX + 0.3, y: cardY + 0.25, w: 0.45, h: 0.45,
    fontSize: 14, bold: true, color: SLATE_700, fontFace: FONT_TITLE,
    align: "center", valign: "middle", margin: 0,
  });
  s.addText("Step 1: Translation", {
    x: cardX + 0.85, y: cardY + 0.28, w: 4, h: 0.32,
    fontSize: 13, bold: true, color: NAVY, fontFace: FONT_TITLE, margin: 0,
  });
  s.addText("split into 3", {
    x: cardX + 2.9, y: cardY + 0.32, w: 1.3, h: 0.28,
    fontSize: 10, color: SLATE_500, italic: true, fontFace: FONT_BODY, margin: 0,
  });
  s.addText("Certified Translation · ES → EN", {
    x: cardX + 0.85, y: cardY + 0.6, w: 4, h: 0.28,
    fontSize: 10, color: SLATE_500, fontFace: FONT_BODY, margin: 0,
  });
  // Status pills upper right
  statusPill(s, cardX + cardW - 2.7, cardY + 0.32, 1.3, "In progress", TEAL_TINT, "075985", BLUE);
  statusPill(s, cardX + cardW - 1.3, cardY + 0.32, 1.05, "Split 0/3", TEAL_TINT, TEAL, TEAL);

  // Meta line
  s.addText("📎 3 files split across 3 assignees · Deadline (latest): Jun 12, 4:00 PM", {
    x: cardX + 0.85, y: cardY + 0.95, w: cardW - 1.4, h: 0.3,
    fontSize: 10, color: SLATE_500, fontFace: FONT_BODY, margin: 0,
  });

  // Left rail
  s.addShape(pres.shapes.RECTANGLE, {
    x: cardX + 0.55, y: cardY + 1.4, w: 0.025, h: 2.7,
    fill: { color: TEAL, transparency: 50 }, line: { type: "none" },
  });

  // Children
  const children = [
    { idx: "2.1", who: "A King (external)", status: "Delivered", statusBg: "D1FAE5", statusText: "065F46", statusDot: EMERALD, money: "CAD $0.12/word · $96.00", dates: "Delivered Jun 10 · Deadline Jun 11" },
    { idx: "2.2", who: "Fayza Elbezzari (in-house)", status: "In progress", statusBg: TEAL_TINT, statusText: "075985", statusDot: BLUE, money: "in-house · no payable", dates: "Accepted 1 day ago · Deadline Jun 12", inhouse: true },
    { idx: "2.3", who: "CCJK (external)", status: "Offered", statusBg: "FEF3C7", statusText: "92400E", statusDot: AMBER, money: "CAD $0.10/word · $230.00 (proposed)", dates: "Offered 4 hrs ago · awaits response" },
  ];
  children.forEach((c, i) => {
    const cy = cardY + 1.4 + i * 0.9;
    s.addShape(pres.shapes.RECTANGLE, {
      x: cardX + 0.85, y: cy, w: cardW - 1.4, h: 0.78,
      fill: { color: WHITE }, line: { color: SLATE_200, width: 0.5 },
    });
    s.addText(c.idx, {
      x: cardX + 1.0, y: cy + 0.08, w: 0.4, h: 0.25,
      fontSize: 10, bold: true, color: SLATE_500, fontFace: FONT_TITLE, margin: 0,
    });
    s.addText(c.who, {
      x: cardX + 1.4, y: cy + 0.08, w: 3.3, h: 0.25,
      fontSize: 11, bold: true, color: NAVY, fontFace: FONT_TITLE, margin: 0,
    });
    if (c.inhouse) {
      solidPill(s, cardX + 4.0, cy + 0.08, 0.85, "IN-HOUSE", NAVY, WHITE);
    }
    statusPill(s, cardX + cardW - 2.4, cy + 0.08, 1.2, c.status, c.statusBg, c.statusText, c.statusDot);
    s.addText(c.money, {
      x: cardX + 1.4, y: cy + 0.35, w: cardW - 2.4, h: 0.22,
      fontSize: 9.5, color: SLATE_700, fontFace: FONT_BODY, margin: 0,
    });
    s.addText(c.dates, {
      x: cardX + 1.4, y: cy + 0.55, w: cardW - 2.4, h: 0.2,
      fontSize: 9, color: SLATE_500, fontFace: FONT_BODY, margin: 0,
    });
  });

  // Right side — rollup rules table
  card(s, 8.4, cardY, 4.3, 4.3, { accent: NAVY });
  s.addText("PARENT ROLLUP", {
    x: 8.7, y: cardY + 0.2, w: 3.8, h: 0.3,
    fontSize: 10, bold: true, color: NAVY, charSpacing: 3, fontFace: FONT_TITLE, margin: 0,
  });
  s.addText("recompute_parent_step_status fires on any child status change.", {
    x: 8.7, y: cardY + 0.55, w: 3.8, h: 0.5,
    fontSize: 10, color: SLATE_700, fontFace: FONT_BODY, margin: 0,
  });

  const rollup = [
    ["All approved",        "approved",    EMERALD],
    ["All delivered/approved", "delivered", EMERALD],
    ["Any active child",    "in_progress", BLUE],
    ["All pending/offered", "pending",     SLATE_500],
  ];
  rollup.forEach((row, i) => {
    const ry = cardY + 1.4 + i * 0.6;
    s.addText(row[0], {
      x: 8.7, y: ry, w: 2.4, h: 0.3,
      fontSize: 10, color: SLATE_700, fontFace: FONT_BODY, valign: "middle", margin: 0,
    });
    s.addShape(pres.shapes.RIGHT_TRIANGLE, {
      x: 11.1, y: ry + 0.1, w: 0.12, h: 0.14,
      fill: { color: SLATE_500 }, line: { type: "none" }, rotate: 90,
    });
    s.addText(row[1], {
      x: 11.35, y: ry, w: 1.25, h: 0.3,
      fontSize: 10, bold: true, color: row[2], fontFace: FONT_MONO, valign: "middle", margin: 0,
    });
  });

  // Bottom: no payable on parent (raised above footer band)
  card(s, 0.6, 6.65, W - 1.2, 0.35, { accent: AMBER, fill: "FFFBEB" });
  s.addText([
    { text: "Parent has no payable —", options: { bold: true, color: "92400E" } },
    { text: " children carry the vendor_payables. Manage Payable against a split parent returns ", options: { color: NAVY_INK } },
    { text: "409 step_is_split_parent.", options: { color: "92400E", fontFace: FONT_MONO } },
  ], {
    x: 0.85, y: 6.65, w: W - 1.4, h: 0.35,
    fontSize: 10, fontFace: FONT_BODY, valign: "middle", margin: 0,
  });
}

// ── Slide 7: Find Vendor + Assign matrix ───────────────────────
{
  const s = pres.addSlide();
  chrome(s, { page: 7 });

  sectionEyebrow(s, "§ 4  Find Vendor & Assign Vendor");
  slideTitle(s, "Three ways to put a vendor on a step");
  slideSubtitle(s, "Pick by deadline pressure + how much negotiation has already happened.");

  // 3 columns — Direct Assign / Offer / Offer to Multiple
  const cols = [
    {
      title: "Direct Assign",
      color: TEAL,
      bullets: [
        "Sets vendor_id immediately",
        "Vendor sees 'Assigned', clicks Accept to start",
        "Use when: already negotiated · tight deadline · pre-agreed retainer",
        "vendor_payables → 'pending' (becomes 'approved' on accept)",
      ],
    },
    {
      title: "Offer to Vendor",
      color: NAVY,
      bullets: [
        "Creates vendor_step_offers row with expires_at",
        "Vendor sees Accept / Decline / Counter-offer buttons",
        "Use when: new vendor relationship · price negotiation expected",
        "Step status: 'offered' until accept or expiry",
      ],
    },
    {
      title: "Offer to Multiple",
      color: TEAL,
      bullets: [
        "Batch invite — first accept wins, rest auto-retracted",
        "Tick 'Select all' or individuals + 'Offer to Selected (N)'",
        "Use when: vendors compete on rate or speed",
        "Sibling offers flip to 'retracted'; sibling payables flip to 'cancelled'",
      ],
    },
  ];
  const colW = (W - 1.2 - 0.4) / 3;
  cols.forEach((c, i) => {
    const x = 0.6 + i * (colW + 0.2);
    card(s, x, 2.6, colW, 4.0, { accent: c.color });
    s.addText(c.title, {
      x: x + 0.3, y: 2.8, w: colW - 0.5, h: 0.35,
      fontSize: 16, bold: true, color: c.color, fontFace: FONT_TITLE, margin: 0,
    });
    const lines = c.bullets.map((b, j) => ({
      text: b,
      options: { color: SLATE_700, bullet: { code: "25CF" }, breakLine: j < c.bullets.length - 1 },
    }));
    s.addText(lines, {
      x: x + 0.3, y: 3.3, w: colW - 0.5, h: 3.3,
      fontSize: 11, fontFace: FONT_BODY, paraSpaceAfter: 8, margin: 0,
    });
  });

  // Bottom: revisor independence (raised above footer band)
  card(s, 0.6, 6.5, W - 1.2, 0.45, { accent: AMBER, fill: "FFFBEB" });
  s.addText([
    { text: "ISO 17100 §5.3.5 revisor independence:  ", options: { bold: true, color: "92400E" } },
    { text: "the server checks ", options: { color: NAVY_INK } },
    { text: "requires_different_vendor_from_step", options: { color: "92400E", fontFace: FONT_MONO } },
    { text: " against children of any prior split. A reviser can never slip past via a sibling partition.", options: { color: NAVY_INK } },
  ], {
    x: 0.85, y: 6.5, w: W - 1.4, h: 0.45,
    fontSize: 10, fontFace: FONT_BODY, valign: "middle", margin: 0,
  });
}

// ── Slide 8: Manage Payable 5 modes ────────────────────────────
{
  const s = pres.addSlide();
  chrome(s, { page: 8 });

  sectionEyebrow(s, "§ 5  Manage Payable");
  slideTitle(s, "Five pricing modes, one source of truth");
  slideSubtitle(s, "Pick the mode that matches your agreement with the vendor. Math is deterministic, audit-friendly.");

  // Tab bar
  const modes = ["Flat", "Per word", "Per hour", "Per page", "CAT analysis"];
  let mx = 0.6;
  modes.forEach((m, i) => {
    const active = i === 4;
    const mw = 1.6;
    if (active) {
      s.addShape(pres.shapes.RECTANGLE, {
        x: mx, y: 2.55, w: mw, h: 0.4,
        fill: { color: WHITE }, line: { type: "none" },
      });
      s.addShape(pres.shapes.RECTANGLE, {
        x: mx, y: 2.92, w: mw, h: 0.03,
        fill: { color: TEAL }, line: { type: "none" },
      });
      s.addText(m, {
        x: mx, y: 2.55, w: mw, h: 0.4,
        fontSize: 12, bold: true, color: TEAL,
        fontFace: FONT_TITLE, align: "center", valign: "middle", margin: 0,
      });
    } else {
      s.addText(m, {
        x: mx, y: 2.55, w: mw, h: 0.4,
        fontSize: 12, color: SLATE_500,
        fontFace: FONT_TITLE, align: "center", valign: "middle", margin: 0,
      });
    }
    mx += mw;
  });
  s.addShape(pres.shapes.LINE, {
    x: 0.6, y: 2.96, w: W - 1.2, h: 0,
    line: { color: SLATE_200, width: 0.5 },
  });

  // Mode cards (5 cards in a row)
  const modeCards = [
    { name: "Flat",        formula: "amount",                use: "Single agreed price for the whole step", color: NAVY },
    { name: "Per word",    formula: "rate × words",          use: "Most common; words come from OCR analysis", color: TEAL },
    { name: "Per hour",    formula: "rate × hours",          use: "Hourly-billed work (DTP, complex review)", color: NAVY },
    { name: "Per page",    formula: "rate × pages",          use: "Short certified docs charged per page", color: TEAL },
    { name: "CAT analysis", formula: "Σ (tier_words × tier_pct × base)", use: "TM-discount workflows", color: TEAL_LIGHT },
  ];
  const mcW = (W - 1.2 - 0.4) / 5;
  modeCards.forEach((m, i) => {
    const x = 0.6 + i * (mcW + 0.1);
    card(s, x, 3.4, mcW, 3.0, { accent: m.color });
    s.addText(m.name, {
      x: x + 0.2, y: 3.55, w: mcW - 0.3, h: 0.35,
      fontSize: 13, bold: true, color: NAVY, fontFace: FONT_TITLE, margin: 0,
    });
    s.addText("FORMULA", {
      x: x + 0.2, y: 4.0, w: mcW - 0.3, h: 0.22,
      fontSize: 8, bold: true, color: SLATE_500, charSpacing: 3, fontFace: FONT_TITLE, margin: 0,
    });
    s.addText(m.formula, {
      x: x + 0.2, y: 4.22, w: mcW - 0.3, h: 0.35,
      fontSize: 11, color: m.color, bold: true, fontFace: FONT_MONO, margin: 0,
    });
    s.addText("USE WHEN", {
      x: x + 0.2, y: 4.85, w: mcW - 0.3, h: 0.22,
      fontSize: 8, bold: true, color: SLATE_500, charSpacing: 3, fontFace: FONT_TITLE, margin: 0,
    });
    s.addText(m.use, {
      x: x + 0.2, y: 5.07, w: mcW - 0.3, h: 1.3,
      fontSize: 10, color: SLATE_700, fontFace: FONT_BODY, margin: 0,
    });
  });

  // CAT highlight (raised above footer band; row arrangement of label + body)
  card(s, 0.6, 6.5, W - 1.2, 0.5, { accent: TEAL_LIGHT, fill: TEAL_TINT });
  s.addText([
    { text: "CAT ANALYSIS DETAIL  ", options: { bold: true, color: TEAL, charSpacing: 2, fontFace: FONT_TITLE, fontSize: 9 } },
    { text: "Paste the Trados / memoQ / XTM / Phrase export → parse-cat-analysis uses Claude to extract tier word counts → vendor's saved CAT grid converts to a payable. Claude never picks the final number; the arithmetic is server-side.", options: { color: NAVY_INK, fontSize: 10 } },
  ], {
    x: 0.85, y: 6.5, w: W - 1.4, h: 0.5,
    fontFace: FONT_BODY, valign: "middle", margin: 0,
  });
}

// ── Slide 9: Vendor portal + step_files scoping ────────────────
{
  const s = pres.addSlide();
  chrome(s, { page: 9 });

  sectionEyebrow(s, "§ 6  Vendor portal");
  slideTitle(s, "Each vendor sees only their files");
  slideSubtitle(s, "get-job-detail intersects quote_files with step_files when scope rows exist. Zero regression for unsplit steps.");

  // Left: flow
  card(s, 0.6, 2.55, 6.5, 3.85, { accent: TEAL });
  s.addText("VENDOR JOB DETAIL FLOW", {
    x: 0.9, y: 2.7, w: 5.7, h: 0.3,
    fontSize: 10, bold: true, color: TEAL, charSpacing: 3, fontFace: FONT_TITLE, margin: 0,
  });

  const flow = [
    { n: "1", text: "Vendor opens job detail at vendor.cethos.com/jobs/{step_id}" },
    { n: "2", text: "Backend resolves step + auth (vendor_id === session.vendor_id, or pending offer)" },
    { n: "3", text: "Loads all quote_files for the order's quote" },
    { n: "4", text: "Intersects with step_files when EXISTS — narrows to assigned subset" },
    { n: "5", text: "Returns sourceFiles[] + word/page totals scoped to the subset" },
    { n: "6", text: "Vendor sees Accept / Decline / Counter (offers) or Deliver (assigned)" },
  ];
  flow.forEach((st, i) => {
    const yi = 3.1 + i * 0.5;
    s.addShape(pres.shapes.OVAL, {
      x: 0.9, y: yi, w: 0.32, h: 0.32,
      fill: { color: TEAL }, line: { type: "none" },
    });
    s.addText(st.n, {
      x: 0.9, y: yi, w: 0.32, h: 0.32,
      fontSize: 11, bold: true, color: WHITE, fontFace: FONT_TITLE,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(st.text, {
      x: 1.3, y: yi - 0.02, w: 5.6, h: 0.45,
      fontSize: 10.5, color: SLATE_700, fontFace: FONT_BODY, valign: "top", margin: 0,
    });
  });

  // Right: SQL snippet
  card(s, 7.3, 2.55, W - 7.9, 3.85, { accent: NAVY });
  s.addText("THE SCOPING SQL", {
    x: 7.6, y: 2.7, w: 5, h: 0.3,
    fontSize: 10, bold: true, color: NAVY, charSpacing: 3, fontFace: FONT_TITLE, margin: 0,
  });

  // SQL block on dark navy background
  s.addShape(pres.shapes.RECTANGLE, {
    x: 7.6, y: 3.1, w: W - 8.2, h: 2.6,
    fill: { color: "061528" }, line: { type: "none" },
  });
  s.addText([
    { text: "SELECT", options: { color: TEAL_LIGHT, bold: true } },
    { text: " qf.*\n", options: { color: WHITE } },
    { text: "FROM", options: { color: TEAL_LIGHT, bold: true } },
    { text: " quote_files qf\n", options: { color: WHITE } },
    { text: "WHERE", options: { color: TEAL_LIGHT, bold: true } },
    { text: " qf.quote_id = $1\n", options: { color: WHITE } },
    { text: "  AND qf.deleted_at IS NULL\n", options: { color: WHITE } },
    { text: "  AND (\n", options: { color: WHITE } },
    { text: "    ", options: { color: WHITE } },
    { text: "NOT EXISTS", options: { color: TEAL_LIGHT, bold: true } },
    { text: " (SELECT 1 FROM step_files\n             WHERE step_id = $2)\n", options: { color: WHITE } },
    { text: "    OR ", options: { color: WHITE } },
    { text: "EXISTS", options: { color: TEAL_LIGHT, bold: true } },
    { text: " (SELECT 1 FROM step_files sf\n             WHERE sf.step_id = $2\n               AND sf.quote_file_id = qf.id)\n", options: { color: WHITE } },
    { text: "  )", options: { color: WHITE } },
  ], {
    x: 7.75, y: 3.2, w: W - 8.5, h: 2.45,
    fontSize: 9, fontFace: FONT_MONO, paraSpaceAfter: 0, margin: 0,
  });

  s.addText("Vendor A → only A's files. Vendor B → only B's. Unsplit step → full quote.", {
    x: 7.6, y: 5.85, w: W - 8.2, h: 0.45,
    fontSize: 9, italic: true, color: SLATE_700, fontFace: FONT_BODY, valign: "top", margin: 0,
  });

  // Bottom callout: PM notification (raised above footer band)
  card(s, 0.6, 6.65, W - 1.2, 0.3, { accent: EMERALD, fill: "ECFDF5" });
  s.addText([
    { text: "When the vendor accepts:  ", options: { bold: true, color: "065F46" } },
    { text: "notify-step-accept fires → Brevo emails to step.assigned_staff_id (the PM) and pm@cethoscorp.com. notification_log rows audit each delivery.", options: { color: NAVY_INK } },
  ], {
    x: 0.85, y: 6.65, w: W - 1.4, h: 0.3,
    fontSize: 9.5, fontFace: FONT_BODY, valign: "middle", margin: 0,
  });
}

// ── Slide 10: Delivery review actions ──────────────────────────
{
  const s = pres.addSlide();
  chrome(s, { page: 10 });

  sectionEyebrow(s, "§ 7  Reviewing the vendor's delivery");
  slideTitle(s, "Four actions on every delivery");
  slideSubtitle(s, "PM reviews each version. Approval cascades to parent (if split) and order work_status.");

  // 4 action cards in a row
  const actions = [
    { label: "Approve",  color: EMERALD, desc: "Delivery → approved · Step → approved · Cascades to parent + order. Vendor receives 'step approved' email." },
    { label: "Changes",  color: AMBER, desc: "Inline form for reason → Vendor receives revision-requested email with your note. Next upload becomes version+1." },
    { label: "Remind",   color: SLATE_500, desc: "Polite nudge email · No state change · Use while waiting for the next delivery version." },
    { label: "Override", color: TEAL, desc: "Admin force-approves without further vendor revision. Reason captured in audit_log for QMS." },
  ];
  const aW = (W - 1.2 - 0.6) / 4;
  actions.forEach((a, i) => {
    const x = 0.6 + i * (aW + 0.2);
    card(s, x, 2.6, aW, 2.6, { accent: a.color });
    // Pill at top
    solidPill(s, x + 0.3, 2.8, aW - 0.6, a.label, a.color, WHITE);
    s.addText(a.desc, {
      x: x + 0.3, y: 3.3, w: aW - 0.6, h: 1.8,
      fontSize: 11, color: SLATE_700, fontFace: FONT_BODY, margin: 0,
    });
  });

  // Versioning + send to customer (shorter cards, room for footer caption)
  card(s, 0.6, 5.35, 6.0, 1.1, { accent: NAVY });
  s.addText("DELIVERY VERSIONING", {
    x: 0.9, y: 5.45, w: 5, h: 0.28,
    fontSize: 9, bold: true, color: NAVY, charSpacing: 3, fontFace: FONT_TITLE, margin: 0,
  });
  s.addText("Each upload becomes a step_deliveries row keyed by (step_id, version). Cards show 'Latest v1', 'v2' chips. Promote-step-delivery-to-draft reuses the draft_group_id.", {
    x: 0.9, y: 5.7, w: 5.5, h: 0.7,
    fontSize: 10, color: SLATE_700, fontFace: FONT_BODY, margin: 0,
  });

  card(s, 6.8, 5.35, W - 7.4, 1.1, { accent: TEAL });
  s.addText("SEND TO CUSTOMER", {
    x: 7.1, y: 5.45, w: 5.4, h: 0.28,
    fontSize: 9, bold: true, color: TEAL, charSpacing: 3, fontFace: FONT_TITLE, margin: 0,
  });
  s.addText("Promote-to-draft watermarks the file → quote_files as Draft Translation → customer-portal Draft Translations section for Approve / Request changes.", {
    x: 7.1, y: 5.7, w: W - 7.8, h: 0.7,
    fontSize: 10, color: SLATE_700, fontFace: FONT_BODY, margin: 0,
  });

  // Bottom: parent split rollup (raised above footer band)
  s.addText("Parent step approves only when EVERY child is approved. recompute_parent_step_status is idempotent — re-run if stuck.", {
    x: 0.6, y: 6.65, w: W - 1.2, h: 0.35,
    fontSize: 11, italic: true, color: SLATE_500, fontFace: FONT_BODY, align: "center", margin: 0,
  });
}

// ── Slide 11: Customer invoicing & AR ──────────────────────────
{
  const s = pres.addSlide();
  chrome(s, { page: 11 });

  sectionEyebrow(s, "§ 8  Customer invoicing & Accounts Receivable");
  slideTitle(s, "Two paths to a customer invoice");
  slideSubtitle(s, "Stripe-paid orders auto-invoice. Business + Net-N customers go through manual issue.");

  // KPI mock
  const kpiY = 2.6;
  const kpis = [
    { label: "TOTAL",       value: "1,000",       color: NAVY },
    { label: "DRAFTS",      value: "0",           color: SLATE_500 },
    { label: "ISSUED",      value: "134",         color: BLUE },
    { label: "PAID",        value: "853",         color: EMERALD },
    { label: "OUTSTANDING", value: "$25,621.83",  color: RED },
  ];
  const kW = (W - 1.2 - 0.8) / 5;
  kpis.forEach((k, i) => {
    const x = 0.6 + i * (kW + 0.2);
    card(s, x, kpiY, kW, 1.3);
    s.addText(k.label, {
      x: x + 0.2, y: kpiY + 0.18, w: kW - 0.4, h: 0.3,
      fontSize: 10, bold: true, color: SLATE_500, charSpacing: 3, fontFace: FONT_TITLE, margin: 0,
    });
    s.addText(k.value, {
      x: x + 0.2, y: kpiY + 0.5, w: kW - 0.4, h: 0.6,
      fontSize: 26, bold: true, color: k.color, fontFace: FONT_TITLE, margin: 0,
    });
  });

  // Two paths
  card(s, 0.6, 4.2, 6.05, 3.0, { accent: TEAL });
  s.addText("AUTO-INVOICE (STRIPE)", {
    x: 0.9, y: 4.35, w: 5.5, h: 0.3,
    fontSize: 10, bold: true, color: TEAL, charSpacing: 3, fontFace: FONT_TITLE, margin: 0,
  });
  s.addText([
    { text: "Customer pays via Stripe checkout on quote acceptance.", options: { color: SLATE_700, breakLine: true } },
    { text: " ", options: { breakLine: true } },
    { text: "1. Stripe webhook hits handle-stripe-invoice-payment", options: { color: SLATE_700, fontFace: FONT_MONO, fontSize: 10, breakLine: true } },
    { text: "2. generate-invoice-pdf builds the PDF", options: { color: SLATE_700, fontFace: FONT_MONO, fontSize: 10, breakLine: true } },
    { text: "3. Brevo emails the customer", options: { color: SLATE_700, fontFace: FONT_MONO, fontSize: 10, breakLine: true } },
    { text: "4. customer_invoices row → 'paid'", options: { color: SLATE_700, fontFace: FONT_MONO, fontSize: 10 } },
  ], {
    x: 0.9, y: 4.7, w: 5.5, h: 2.4,
    fontSize: 11, fontFace: FONT_BODY, paraSpaceAfter: 4, margin: 0,
  });

  card(s, 6.85, 4.2, W - 7.45, 3.0, { accent: NAVY });
  s.addText("MANUAL INVOICE", {
    x: 7.15, y: 4.35, w: 5.5, h: 0.3,
    fontSize: 10, bold: true, color: NAVY, charSpacing: 3, fontFace: FONT_TITLE, margin: 0,
  });
  s.addText([
    { text: "+ Create Invoice on the Customer Invoices page.", options: { color: SLATE_700, breakLine: true } },
    { text: " ", options: { breakLine: true } },
    { text: "Use for:", options: { bold: true, color: NAVY, breakLine: true } },
    { text: "• Multi-order invoices (one bill, several completed orders)", options: { color: SLATE_700, breakLine: true } },
    { text: "• Net-15 / Net-30 business customers paying by e-transfer / cheque", options: { color: SLATE_700, breakLine: true } },
    { text: "• Adjustments + credit notes", options: { color: SLATE_700, breakLine: true } },
    { text: " ", options: { breakLine: true } },
    { text: "Business customers get the Cethos Design System layout with AR-approved Net terms.", options: { italic: true, color: SLATE_500, fontSize: 10 } },
  ], {
    x: 7.15, y: 4.7, w: W - 7.75, h: 2.4,
    fontSize: 11, fontFace: FONT_BODY, paraSpaceAfter: 4, margin: 0,
  });
}

// ── Slide 12: Vendor invoicing & AP ────────────────────────────
{
  const s = pres.addSlide();
  chrome(s, { page: 12 });

  sectionEyebrow(s, "§ 9  Vendor invoicing & Accounts Payable");
  slideTitle(s, "Vendors invoice you. You pay them.");
  slideSubtitle(s, "Vendors create invoices on their portal. Admin reviews, matches, and pays via Quick Payment or Bulk Payment.");

  // 4-stage process
  const stages = [
    { title: "1. Vendor creates invoice", desc: "Portal Invoices view → tick approved payables → invoice number + date → submit. cvp_payments row + linked payables." },
    { title: "2. Admin Vendor Invoices",  desc: "Status: Submitted → Confirmed (verified) → Disputed if needed. Filter by Final Date · Branch · Status." },
    { title: "3. Accounts Payable",       desc: "By vendor view: aged buckets (Current · 1-30 · 31-60 · 61-90 · 90+). Click in for detail." },
    { title: "4. Pay → reconcile",        desc: "Quick Payment or Bulk: pick method + reference + date → vendor_payments + allocations. Payables → 'paid' → step cache reconciles." },
  ];
  const sW = (W - 1.2 - 0.6) / 4;
  stages.forEach((st, i) => {
    const x = 0.6 + i * (sW + 0.2);
    // Numbered circle on top
    s.addShape(pres.shapes.OVAL, {
      x: x + sW / 2 - 0.32, y: 2.6, w: 0.64, h: 0.64,
      fill: { color: TEAL }, line: { type: "none" },
    });
    s.addText(String(i + 1), {
      x: x + sW / 2 - 0.32, y: 2.6, w: 0.64, h: 0.64,
      fontSize: 22, bold: true, color: WHITE, fontFace: FONT_TITLE,
      align: "center", valign: "middle", margin: 0,
    });
    card(s, x, 3.4, sW, 2.4, { accent: TEAL });
    s.addText(st.title.replace(/^\d+\.\s*/, ""), {
      x: x + 0.2, y: 3.55, w: sW - 0.4, h: 0.5,
      fontSize: 13, bold: true, color: NAVY, fontFace: FONT_TITLE, margin: 0,
    });
    s.addText(st.desc, {
      x: x + 0.2, y: 4.1, w: sW - 0.4, h: 1.7,
      fontSize: 10, color: SLATE_700, fontFace: FONT_BODY, margin: 0,
    });
    // Arrow to next
    if (i < stages.length - 1) {
      s.addShape(pres.shapes.RIGHT_TRIANGLE, {
        x: x + sW + 0.04, y: 4.3, w: 0.16, h: 0.18,
        fill: { color: SLATE_300 }, line: { type: "none" }, rotate: 90,
      });
    }
  });

  // KPI mock for AP
  const kpiY = 6.05;
  const kpis = [
    { label: "TOTAL OPEN",  value: "$168K", color: NAVY,    sub: "859 invoices" },
    { label: "CURRENT",     value: "$31.8K", color: EMERALD, sub: "" },
    { label: "1-30 DAYS",   value: "$30.4K", color: AMBER,  sub: "" },
    { label: "31-60 DAYS",  value: "$29.3K", color: AMBER,  sub: "" },
    { label: "61+ DAYS",    value: "$77.0K", color: RED,    sub: "follow up" },
  ];
  const kW = (W - 1.2 - 0.8) / 5;
  kpis.forEach((k, i) => {
    const x = 0.6 + i * (kW + 0.2);
    card(s, x, kpiY, kW, 1.3);
    s.addText(k.label, {
      x: x + 0.2, y: kpiY + 0.15, w: kW - 0.4, h: 0.3,
      fontSize: 9, bold: true, color: SLATE_500, charSpacing: 3, fontFace: FONT_TITLE, margin: 0,
    });
    s.addText(k.value, {
      x: x + 0.2, y: kpiY + 0.45, w: kW - 0.4, h: 0.55,
      fontSize: 22, bold: true, color: k.color, fontFace: FONT_TITLE, margin: 0,
    });
    if (k.sub) {
      s.addText(k.sub, {
        x: x + 0.2, y: kpiY + 0.98, w: kW - 0.4, h: 0.25,
        fontSize: 9, color: SLATE_500, italic: true, fontFace: FONT_BODY, margin: 0,
      });
    }
  });
}

// ── Slide 13: Visual cues reference ────────────────────────────
{
  const s = pres.addSlide();
  chrome(s, { page: 13 });

  sectionEyebrow(s, "§ 10  Visual cues");
  slideTitle(s, "Quick reference — what every pill means");
  slideSubtitle(s, "Read the workflow at a glance.");

  // Status pills column
  const statusY = 2.7;
  const pillSpecs = [
    ["pending",     SLATE_100, SLATE_700, "94A3B8", "Step not started"],
    ["offered",     "FEF3C7",  "92400E",  AMBER,    "Vendor offer pending"],
    ["accepted",    TEAL_TINT, "075985",  BLUE,     "Vendor said yes"],
    ["in_progress", TEAL_TINT, "075985",  BLUE,     "Vendor working"],
    ["delivered",   "D1FAE5",  "065F46",  EMERALD,  "Vendor uploaded · awaiting approval"],
    ["approved",    "D1FAE5",  "065F46",  EMERALD,  "PM approved · cascades to parent / order"],
    ["revision_requested", "FFEDD5", "9A3412", "F97316", "PM rejected version, sent reason to vendor"],
    ["declined",    "FEE2E2", "991B1B",  RED,       "Vendor declined offer"],
    ["cancelled",   "FEE2E2", "991B1B",  RED,       "Terminal: never executed"],
    ["skipped",     "F1F5F9", SLATE_700, "94A3B8",  "Not applicable for this order"],
  ];

  // Headings
  s.addText("STATUS PILLS (step + delivery state)", {
    x: 0.6, y: 2.55, w: 7, h: 0.25,
    fontSize: 10, bold: true, color: SLATE_500, charSpacing: 3, fontFace: FONT_TITLE, margin: 0,
  });
  pillSpecs.forEach((p, i) => {
    const py = 2.9 + i * 0.42;
    statusPill(s, 0.65, py, 1.85, p[0], p[1], p[2], p[3]);
    s.addText(p[4], {
      x: 2.7, y: py - 0.02, w: 4.5, h: 0.35,
      fontSize: 10, color: SLATE_700, fontFace: FONT_BODY, valign: "middle", margin: 0,
    });
  });

  // Special markers / badges (right column)
  s.addText("SPECIAL MARKERS", {
    x: 7.6, y: 2.55, w: 5, h: 0.25,
    fontSize: 10, bold: true, color: SLATE_500, charSpacing: 3, fontFace: FONT_TITLE, margin: 0,
  });
  const markers = [
    { pill: ["Split 0/3", TEAL_TINT, TEAL, TEAL], desc: "Split parent — N children done of M" },
    { pill: ["Split…",    WHITE,     TEAL, TEAL], desc: "Step is eligible to be split", outline: true },
    { pill: ["IN-HOUSE",  NAVY,      WHITE,WHITE], desc: "Child step assigned to staff_user", solid: true },
    { pill: ["Multi-order","E9D5FF", "6B21A8","9333EA"], desc: "Invoice covers multiple orders" },
    { pill: ["Latest v2", "F1F5F9",  SLATE_700,SLATE_500], desc: "Delivery version chip" },
  ];
  markers.forEach((m, i) => {
    const py = 2.9 + i * 0.42;
    if (m.solid) {
      solidPill(s, 7.65, py, 1.4, m.pill[0], m.pill[1], m.pill[2]);
    } else if (m.outline) {
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 7.65, y: py, w: 1.4, h: 0.32,
        fill: { color: WHITE }, line: { color: m.pill[2], width: 0.75 },
        rectRadius: 0.16,
      });
      s.addText(m.pill[0], {
        x: 7.65, y: py, w: 1.4, h: 0.32,
        fontSize: 10, color: m.pill[2], bold: true,
        fontFace: FONT_TITLE, align: "center", valign: "middle", margin: 0,
      });
    } else {
      statusPill(s, 7.65, py, 1.4, m.pill[0], m.pill[1], m.pill[2], m.pill[3]);
    }
    s.addText(m.desc, {
      x: 9.2, y: py - 0.02, w: W - 9.7, h: 0.35,
      fontSize: 10, color: SLATE_700, fontFace: FONT_BODY, valign: "middle", margin: 0,
    });
  });

  // Icons row at bottom right
  s.addText("ACTOR ICONS", {
    x: 7.6, y: 5.2, w: 5, h: 0.25,
    fontSize: 10, bold: true, color: SLATE_500, charSpacing: 3, fontFace: FONT_TITLE, margin: 0,
  });
  s.addText("👤  External vendor", {
    x: 7.65, y: 5.5, w: 4, h: 0.35,
    fontSize: 12, color: SLATE_700, fontFace: FONT_BODY, margin: 0,
  });
  s.addText("🏢  In-house staff", {
    x: 7.65, y: 5.85, w: 4, h: 0.35,
    fontSize: 12, color: SLATE_700, fontFace: FONT_BODY, margin: 0,
  });
  s.addText("📦  Delivery card", {
    x: 7.65, y: 6.2, w: 4, h: 0.35,
    fontSize: 12, color: SLATE_700, fontFace: FONT_BODY, margin: 0,
  });
  s.addText("💰  Payable / invoice card", {
    x: 7.65, y: 6.55, w: 4, h: 0.35,
    fontSize: 12, color: SLATE_700, fontFace: FONT_BODY, margin: 0,
  });
}

// ── Slide 14: Troubleshooting ─────────────────────────────────
{
  const s = pres.addSlide();
  chrome(s, { page: 14 });

  sectionEyebrow(s, "§ 11  Troubleshooting");
  slideTitle(s, "If something looks wrong");
  slideSubtitle(s, "These are the real issues you'll hit. Each has a clear cause + fix.");

  const issues = [
    {
      symptom: "'No files on this order' in Split modal",
      cause: "Modal column drift (pre-PR-#903)",
      fix: "Update the admin client deploy. The hotfix splits the quote_files query from ai_analysis_results.",
    },
    {
      symptom: "Children appear as siblings (Steps 5/6/7)",
      cause: "get-order-workflow not redeployed after PR #902",
      fix: "Redeploy via Supabase MCP with verify_jwt=false. Hard-reload the order page.",
    },
    {
      symptom: "Target vendor missing from Split dropdown",
      cause: "List capped at 500 alphabetical for perf",
      fix: "Use the standard Find Vendor flow on the parent before splitting.",
    },
    {
      symptom: "409 reviser_separation_violation",
      cause: "Vendor used on a constrained prior step",
      fix: "Pick a different vendor, or supply force_override_reason with a real business justification.",
    },
    {
      symptom: "409 parent_already_assigned / has_active_payable",
      cause: "Split gates: unassign + cancel payable first",
      fix: "Unassign vendor on the parent step, cancel any pending payable, then retry split.",
    },
    {
      symptom: "Files show '— pp · — w' in modal",
      cause: "ai_analysis_results has no per-file rows",
      fix: "Run Preprocess & OCR on the order. Counts appear next time the modal opens.",
    },
    {
      symptom: "Brevo email didn't arrive",
      cause: "Various — bounced, blocked, spam",
      fix: "Brevo Email Logs modal shows delivery status. Resend if needed (logs the new attempt).",
    },
    {
      symptom: "Split parent stuck at 'in_progress'",
      cause: "Rare rollup miss",
      fix: "SELECT recompute_parent_step_status('{parent_step_id}'); — function is idempotent.",
    },
    {
      symptom: "Margin pill is amber",
      cause: "Step margin below threshold (default 30%)",
      fix: "Renegotiate vendor rate OR raise customer price (with consent). Don't hide the badge.",
    },
  ];

  // 3x3 grid (compact so bottom caption has room)
  const gridW = W - 1.2;
  const gridH = 3.95;
  const cellW = (gridW - 0.4) / 3;
  const cellH = (gridH - 0.4) / 3;
  issues.forEach((iss, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.6 + col * (cellW + 0.2);
    const y = 2.55 + row * (cellH + 0.2);
    card(s, x, y, cellW, cellH, { accent: RED });
    s.addText(iss.symptom, {
      x: x + 0.18, y: y + 0.1, w: cellW - 0.36, h: 0.42,
      fontSize: 10, bold: true, color: NAVY, fontFace: FONT_TITLE, margin: 0,
    });
    s.addText([
      { text: "CAUSE  ", options: { fontSize: 7, bold: true, color: SLATE_500, charSpacing: 2 } },
      { text: iss.cause, options: { fontSize: 8.5, color: SLATE_700, breakLine: true } },
      { text: " ", options: { fontSize: 3, breakLine: true } },
      { text: "FIX  ", options: { fontSize: 7, bold: true, color: SLATE_500, charSpacing: 2 } },
      { text: iss.fix, options: { fontSize: 8.5, color: NAVY_INK } },
    ], {
      x: x + 0.18, y: y + 0.52, w: cellW - 0.36, h: cellH - 0.6,
      fontFace: FONT_BODY, valign: "top", margin: 0,
    });
  });

  // Bottom: doc reference (raised above footer band)
  s.addText("Full 9-scenario list with all cause / fix detail: docs/training/pm-workflow-training.md § 11", {
    x: 0.6, y: 6.65, w: W - 1.2, h: 0.35,
    fontSize: 10, italic: true, color: SLATE_500, fontFace: FONT_BODY, align: "center", margin: 0,
  });
}

// ── Slide 15: FAQ highlights ──────────────────────────────────
{
  const s = pres.addSlide();
  chrome(s, { page: 15 });

  sectionEyebrow(s, "§ 12  FAQ");
  slideTitle(s, "Questions every PM eventually asks");
  slideSubtitle(s, "Top 6. Full list of 10 in the training markdown.");

  const faqs = [
    {
      q: "Can I split a step already assigned to a vendor?",
      a: "No. Unassign the vendor + cancel any pending payable first. This protects the existing vendor's audit trail.",
    },
    {
      q: "Will vendors see each other's files in a split?",
      a: "No. get-job-detail intersects quote_files with step_files server-side. Each vendor sees only their assigned subset.",
    },
    {
      q: "Can a child step itself be split?",
      a: "No — CHECK constraint forbids nested splits. If you want this, the original partition structure is probably wrong.",
    },
    {
      q: "What happens to the parent's vendor cost?",
      a: "Children carry the payables. Parent contributes $0 to the order finance line. Grand total identical to one-vendor scenario.",
    },
    {
      q: "Why is the vendor list capped at 500 in the Split modal?",
      a: "Performance — full vendor list (~1500 rows) creates dropdown jank. Use Find Vendor on the parent first if you need a Z-name vendor.",
    },
    {
      q: "Can I undo a split?",
      a: "No one-click undo. Cancel each child, set parent.is_split = false, re-assign parent. Document the reason in audit_log.",
    },
  ];

  // 2-column FAQ grid
  const fW = (W - 1.2 - 0.4) / 2;
  const fH = 1.15;
  faqs.forEach((f, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.6 + col * (fW + 0.4);
    const y = 2.55 + row * (fH + 0.2);
    card(s, x, y, fW, fH, { accent: TEAL });
    s.addText([
      { text: "Q  ", options: { color: TEAL, bold: true, fontFace: FONT_MONO } },
      { text: f.q, options: { color: NAVY, bold: true } },
    ], {
      x: x + 0.25, y: y + 0.15, w: fW - 0.5, h: 0.45,
      fontSize: 11, fontFace: FONT_TITLE, margin: 0,
    });
    s.addText(f.a, {
      x: x + 0.25, y: y + 0.65, w: fW - 0.5, h: fH - 0.75,
      fontSize: 10, color: SLATE_700, fontFace: FONT_BODY, margin: 0,
    });
  });

  s.addText("4 more questions in the training markdown — including counter-offers, customer draft review, late accept, multiple PMs.", {
    x: 0.6, y: 6.6, w: W - 1.2, h: 0.4,
    fontSize: 11, italic: true, color: SLATE_500, fontFace: FONT_BODY, align: "center", margin: 0,
  });
}

// ── Slide 16: Closing — resources ─────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: NAVY };

  // Decorative
  s.addShape(pres.shapes.RECTANGLE, {
    x: -2, y: 4, w: 7, h: 7,
    fill: { color: TEAL, transparency: 88 }, line: { type: "none" }, rotate: -8,
  });

  // Title
  s.addText("Where to go from here", {
    x: 0.8, y: 0.8, w: 11, h: 0.6,
    fontSize: 36, bold: true, color: WHITE, fontFace: FONT_TITLE, margin: 0,
  });
  s.addText("Resources, related features, and the architectural plan that drove the new Step Split work.", {
    x: 0.8, y: 1.55, w: 11, h: 0.5,
    fontSize: 14, color: "CBD5E1", fontFace: FONT_BODY, margin: 0,
  });

  // 4 resource cards
  const resources = [
    {
      head: "TRAINING DOC",
      title: "Full PM Workflow reference",
      sub: "14 sections, 22 screenshot anchors",
      path: "docs/training/pm-workflow-training.md",
    },
    {
      head: "DESIGN SYSTEM",
      title: "Workflow Step Split prototype",
      sub: "Pixel spec for the Split modal + post-split card",
      path: "design-system/project/Workflow Step Split.html",
    },
    {
      head: "ARCHITECTURE PLAN",
      title: "Step split architectural plan",
      sub: "Why child-step over multi-assignment + ISO implications",
      path: "Users/RaminderShah/.claude/plans/2nd-issue-can-be-lucky-sprout.md",
    },
    {
      head: "FEATURE MEMORY",
      title: "feature_step_split_2026_06_08.md",
      sub: "Schema · edge fn · UI · vendor portal · in 1 page",
      path: "memory/feature_step_split_2026_06_08.md",
    },
  ];
  const rW = 5.7;
  const rH = 1.7;
  resources.forEach((r, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.8 + col * (rW + 0.5);
    const y = 2.4 + row * (rH + 0.3);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: rW, h: rH,
      fill: { color: "1A365D" }, line: { color: TEAL, width: 0.5 },
    });
    s.addText(r.head, {
      x: x + 0.3, y: y + 0.2, w: rW - 0.6, h: 0.25,
      fontSize: 10, bold: true, color: TEAL_LIGHT, charSpacing: 3, fontFace: FONT_TITLE, margin: 0,
    });
    s.addText(r.title, {
      x: x + 0.3, y: y + 0.45, w: rW - 0.6, h: 0.35,
      fontSize: 16, bold: true, color: WHITE, fontFace: FONT_TITLE, margin: 0,
    });
    s.addText(r.sub, {
      x: x + 0.3, y: y + 0.85, w: rW - 0.6, h: 0.3,
      fontSize: 11, color: "94A3B8", fontFace: FONT_BODY, margin: 0,
    });
    s.addText(r.path, {
      x: x + 0.3, y: y + 1.2, w: rW - 0.6, h: 0.35,
      fontSize: 10, color: TEAL_LIGHT, fontFace: FONT_MONO, margin: 0,
    });
  });

  // Footer
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: H - 0.5, w: W, h: 0.5,
    fill: { color: "061528" }, line: { type: "none" },
  });
  s.addText([
    { text: "Cethos Translation Services", options: { bold: true, color: WHITE } },
    { text: "  ·  PM Workflow Training  ·  2026-06-08  ·  Live walkthrough on ORD-2026-354733", options: { color: "94A3B8" } },
  ], {
    x: 0.8, y: H - 0.45, w: W - 1.6, h: 0.4,
    fontSize: 11, fontFace: FONT_BODY, valign: "middle", margin: 0,
  });
}

// ── Write ──────────────────────────────────────────────────────
pres.writeFile({ fileName: "pm-workflow-training.pptx" }).then((fn) => {
  console.log("Wrote:", fn);
}).catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
