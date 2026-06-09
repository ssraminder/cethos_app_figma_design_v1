/**
 * Builds: D:\cethos\portal\cethos_app_figma_design_v1\docs\training\guidde-recording-guide.docx
 *
 * Comprehensive step-by-step guide with narration for Cethos staff to record
 * training videos using guidde.ai. Addresses the tab-contamination issue we
 * discovered (guidde records the whole browser window, not a scoped tab).
 *
 * Cethos brand: navy #0C2340, teal #0891B2, Plus Jakarta Sans where possible
 * (Arial fallback). US Letter portrait, 1" margins, Heading levels 1-3 for TOC.
 */
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, PageOrientation, LevelFormat, ExternalHyperlink,
  TabStopType, TabStopPosition, BorderStyle, WidthType, ShadingType,
  PageNumber, PageBreak, HeadingLevel, TableOfContents, Bookmark, InternalHyperlink,
} = require("docx");

const OUTFILE = path.resolve(
  "D:/cethos/portal/cethos_app_figma_design_v1/docs/training/guidde-recording-guide.docx"
);

/* === Brand colors === */
const NAVY = "0C2340";
const TEAL = "0891B2";
const TEAL_LIGHT = "CFFAFE";
const SLATE_50 = "F8FAFC";
const SLATE_200 = "E2E8F0";
const SLATE_400 = "94A3B8";
const SLATE_700 = "334155";
const SLATE_900 = "0F172A";
const RED_500 = "EF4444";
const AMBER_500 = "F59E0B";
const EMERALD_600 = "059669";

/* === Helpers === */
const FONT = "Arial"; // universally supported, falls back gracefully

function p(text, opts = {}) {
  const {
    bold = false, italics = false, color = SLATE_900, size = 22,
    align, spacing, indent, font = FONT, bullets = false, numbered = false,
    spaceAfter, spaceBefore,
  } = opts;
  const para = {
    children: [new TextRun({ text, bold, italics, color, size, font })],
    spacing: spacing || { after: spaceAfter ?? 120, before: spaceBefore ?? 0 },
  };
  if (align) para.alignment = align;
  if (indent) para.indent = indent;
  if (bullets) para.numbering = { reference: "bullets", level: 0 };
  if (numbered) para.numbering = { reference: "steps", level: 0 };
  return new Paragraph(para);
}

function h1(text, anchorId) {
  const children = [new TextRun({ text, bold: true, color: NAVY, size: 36, font: FONT })];
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: anchorId ? [new Bookmark({ id: anchorId, children })] : children,
    spacing: { before: 480, after: 240 },
    pageBreakBefore: true,
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, bold: true, color: TEAL, size: 28, font: FONT })],
    spacing: { before: 320, after: 160 },
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [new TextRun({ text, bold: true, color: SLATE_900, size: 24, font: FONT })],
    spacing: { before: 240, after: 120 },
  });
}

function callout(text, kind = "info") {
  const palette = {
    info:    { bg: TEAL_LIGHT, border: TEAL, label: "TIP",     labelColor: TEAL },
    warn:    { bg: "FEF3C7",   border: AMBER_500, label: "WARNING", labelColor: AMBER_500 },
    danger:  { bg: "FEE2E2",   border: RED_500, label: "CRITICAL",  labelColor: RED_500 },
    success: { bg: "D1FAE5",   border: EMERALD_600, label: "WIN",   labelColor: EMERALD_600 },
  }[kind];
  const border = { style: BorderStyle.SINGLE, size: 4, color: palette.border };
  const cellBorders = { top: border, bottom: border, left: border, right: border };
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [new TableRow({
      children: [new TableCell({
        borders: cellBorders,
        width: { size: 9360, type: WidthType.DXA },
        shading: { fill: palette.bg, type: ShadingType.CLEAR },
        margins: { top: 160, bottom: 160, left: 200, right: 200 },
        children: [
          new Paragraph({
            children: [new TextRun({ text: palette.label, bold: true, color: palette.labelColor, size: 18, font: FONT })],
            spacing: { after: 60 },
          }),
          new Paragraph({
            children: [new TextRun({ text, color: SLATE_900, size: 22, font: FONT })],
          }),
        ],
      })],
    })],
  });
}

function spacer(h = 200) {
  return new Paragraph({ children: [new TextRun("")], spacing: { after: h } });
}

function table2col(rows, headers) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: SLATE_200 };
  const cellBorders = { top: border, bottom: border, left: border, right: border };
  const totalW = 9360;
  const col0 = 3000, col1 = totalW - col0;
  const trs = [];
  if (headers) {
    trs.push(new TableRow({
      tableHeader: true,
      children: headers.map((h, i) => new TableCell({
        borders: cellBorders,
        width: { size: i === 0 ? col0 : col1, type: WidthType.DXA },
        shading: { fill: NAVY, type: ShadingType.CLEAR },
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        children: [new Paragraph({
          children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 22, font: FONT })],
        })],
      })),
    }));
  }
  rows.forEach((row, ri) => {
    const fill = ri % 2 === 0 ? "FFFFFF" : SLATE_50;
    trs.push(new TableRow({
      children: row.map((cell, i) => new TableCell({
        borders: cellBorders,
        width: { size: i === 0 ? col0 : col1, type: WidthType.DXA },
        shading: { fill, type: ShadingType.CLEAR },
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        children: cell.split("\n").map(line => new Paragraph({
          children: [new TextRun({
            text: line,
            bold: i === 0,
            color: i === 0 ? NAVY : SLATE_900,
            size: 22,
            font: FONT,
          })],
        })),
      })),
    }));
  });
  return new Table({
    width: { size: totalW, type: WidthType.DXA },
    columnWidths: [col0, col1],
    rows: trs,
  });
}

function narrationBlock(step, action, narration) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: TEAL };
  const cellBorders = { top: border, bottom: border, left: border, right: border };
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [new TableRow({
      children: [new TableCell({
        borders: cellBorders,
        width: { size: 9360, type: WidthType.DXA },
        shading: { fill: SLATE_50, type: ShadingType.CLEAR },
        margins: { top: 160, bottom: 160, left: 200, right: 200 },
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: `Step ${step}: `, bold: true, color: NAVY, size: 24, font: FONT }),
              new TextRun({ text: action, color: SLATE_900, size: 24, font: FONT }),
            ],
            spacing: { after: 80 },
          }),
          new Paragraph({
            children: [new TextRun({ text: "What to say", bold: true, color: TEAL, size: 18, font: FONT, allCaps: false })],
            spacing: { after: 40 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `“${narration}”`, italics: true, color: SLATE_700, size: 22, font: FONT })],
          }),
        ],
      })],
    })],
  });
}

/* === Document content === */
const children = [];

/* --- Title page --- */
children.push(
  new Paragraph({ children: [new TextRun({ text: "", size: 22 })], spacing: { after: 1200 } }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "CETHOS", bold: true, color: NAVY, size: 36, font: FONT })],
    spacing: { after: 120 },
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Internal Training", color: TEAL, size: 22, font: FONT })],
    spacing: { after: 600 },
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Recording Training Videos with Guidde", bold: true, color: NAVY, size: 56, font: FONT })],
    spacing: { after: 240 },
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "A step-by-step guide with narration scripts for capturing clean,\nprofessional walkthroughs of the Cethos admin and vendor portals.", color: SLATE_700, size: 24, font: FONT })],
    spacing: { after: 800 },
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text: "Audience: ", bold: true, color: SLATE_900, size: 22, font: FONT }),
      new TextRun({ text: "All Cethos employees creating internal training content", color: SLATE_900, size: 22, font: FONT }),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text: "Owner: ", bold: true, color: SLATE_900, size: 22, font: FONT }),
      new TextRun({ text: "Training & Knowledge Management", color: SLATE_900, size: 22, font: FONT }),
    ],
    spacing: { after: 80 },
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text: "Updated: ", bold: true, color: SLATE_900, size: 22, font: FONT }),
      new TextRun({ text: "June 2026", color: SLATE_900, size: 22, font: FONT }),
    ],
    spacing: { after: 80 },
  }),
);

/* --- Table of Contents --- */
children.push(
  new Paragraph({ children: [new PageBreak()] }),
  new Paragraph({
    children: [new TextRun({ text: "Contents", bold: true, color: NAVY, size: 36, font: FONT })],
    spacing: { before: 240, after: 240 },
  }),
  new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }),
);

/* === Section 1: Why this guide exists === */
children.push(h1("Why this guide exists"));

children.push(p(
  "Cethos publishes step-by-step training videos for staff and vendor onboarding through the internal training portal. These videos are recorded using Guidde, a browser-based screen-capture tool that produces interactive walkthroughs you can embed back into the training portal."
));
children.push(p(
  "This guide standardizes how Cethos staff record those videos, so every published walkthrough is high-quality, on-brand, and free of the privacy and contamination issues we ran into during our first round of recording."
));

children.push(h2("What you will learn"));
[
  "Configure Guidde correctly before you ever click the Record button, so the only thing captured is the portal tab you intend to demonstrate.",
  "Drive a complete recording end-to-end — from extension setup, to the click sequence, to the stop signal.",
  "Use the suggested narration scripts to make the walkthrough actually teach something rather than show silent clicks.",
  "Edit, rename, and brand the captured playbook in Guidde Studio so it matches Cethos style.",
  "Configure workspace visibility so videos never leak outside the company.",
  "Embed the finished video back into the training portal lesson.",
  "Troubleshoot the common failure modes (and learn from the ones we hit first).",
].forEach(t => children.push(p(t, { bullets: true })));

children.push(spacer());
children.push(callout(
  "Before you record, read sections 2 (Pre-recording setup) and 5 (Walkthrough narration). Most of the quality issues with our first round of recordings came from skipping these.",
  "info"
));

/* === Section 2: Before you record === */
children.push(h1("Before you record — critical setup"));

children.push(callout(
  "Guidde records your entire active browser window, not just the tab you think you're demonstrating. If you have other tabs or apps in the same window, anything you alt-tab, hover, or accidentally show on screen ends up in the video. Always set up a clean browser session before recording — see the checklist below.",
  "danger"
));

children.push(h2("The five-point pre-flight checklist"));

children.push(p(
  "Run through every item below before you click Record. It takes ninety seconds and will save you the embarrassment of a finished video with LinkedIn, Perplexity, or a private email visible mid-shot.",
  { spaceAfter: 200 }
));

children.push(table2col([
  ["1. Open a dedicated browser window",
    "Open a new Chrome window (Ctrl + N) that you will use only for recording. Drag the tab you plan to demonstrate into that window."],
  ["2. Close every other tab in that window",
    "The recording window should contain exactly one tab: the Cethos portal page you'll demonstrate. No LinkedIn, no email, no AI assistants, no draft documents."],
  ["3. Sign in to the portal as a Super Admin",
    "Make sure you're logged in as a real staff Super Admin (e.g. yourself). Don't record from a customer or vendor view unless that is exactly what the lesson covers."],
  ["4. Pin the recording window to a single monitor",
    "If you have multiple monitors, drop the recording window onto the monitor that does not have your chat, email, or Slack visible. Anything covered by the window stays out of the recording."],
  ["5. Clear or hide notifications",
    "Set your OS Do Not Disturb. Pause Slack and Outlook. A notification that pops mid-recording becomes a permanent part of the video."],
], ["Step", "What to do"]));

children.push(spacer());
children.push(h2("If you don't have a dedicated recording browser"));
children.push(p(
  "The cleanest option is a separate Chrome profile that lives only for training recordings. To create one: click your account avatar in the top-right of Chrome → Add → Continue without an account. Pin Cethos Portal as a bookmark, install Guidde in that profile, and use that profile every time you record. Your work-day tabs stay in your normal profile and never collide with the recording."
));

children.push(spacer());
children.push(callout(
  "If Guidde offers a “Record this tab only” or “Chrome Tab” capture mode in its settings panel, switch to it. As of the last review, the default mode still captured the full window. Verify the mode before every recording.",
  "warn"
));

/* === Section 3: Installing and configuring Guidde === */
children.push(h1("Installing and configuring Guidde"));

children.push(h2("Step 1: Install the Guidde Chrome extension"));
[
  "Open Chrome and go to chrome.google.com/webstore.",
  "Search for “Guidde — Screen Recorder & Documentation”.",
  "Click Add to Chrome and confirm Add extension.",
  "Pin the Guidde icon to the Chrome toolbar (puzzle-piece icon → Pin next to Guidde).",
].forEach(t => children.push(p(t, { numbered: true })));

children.push(h2("Step 2: Create or join the Cethos workspace"));
[
  "Click the Guidde extension icon → Sign up with Google using your @cethoscorp.com or @cethos.com address.",
  "When prompted for a workspace, search for “Cethos Solutions Inc.” and request to join. The training team will approve.",
  "Once approved, confirm in the top-left corner that the workspace says “Cethos Solutions Inc.”. If it says “Personal,” switch workspaces — personal workspace videos are not visible to the team.",
].forEach(t => children.push(p(t, { numbered: true })));

children.push(h2("Step 3: Configure default capture settings (one time)"));
[
  "Open the Guidde icon → Capture → Settings.",
  "Set Source to Current Tab if available, otherwise Window (never Screen).",
  "Set Microphone to your headset or laptop mic (we will narrate later, not during the capture).",
  "Set Camera to Off.",
  "Set Countdown to 3 seconds so you have time to ready the mouse.",
  "Set Quality to HD (1080p) if your account supports it.",
].forEach(t => children.push(p(t, { numbered: true })));

children.push(callout(
  "Guidde now records your sequence as a series of “click steps” rather than continuous video. That means most narration happens after recording, as either typed captions or AI text-to-speech. You don't have to talk while you click.",
  "info"
));

/* === Section 4: Starting your first recording === */
children.push(h1("Starting your first recording"));

children.push(h2("Step 1: Verify your setup"));
children.push(p(
  "Click the Guidde icon. Confirm the workspace at the top-left says “Cethos Solutions Inc.” and the source is set to Current Tab. If either is wrong, fix it before continuing."
));

children.push(h2("Step 2: Open the page where the walkthrough begins"));
children.push(p(
  "Navigate the active tab to the exact page where your walkthrough starts. For the Step Split walkthrough, that's the Order Detail page of a test order with at least three files. The recording captures the screen as it appears the moment you click Record — nothing earlier."
));

children.push(h2("Step 3: Click Record"));
[
  "Click the Guidde icon → Capture.",
  "Pick Current Tab.",
  "Watch the 3-second countdown.",
  "Begin the click sequence (Section 5 below) the moment recording starts.",
].forEach(t => children.push(p(t, { numbered: true })));

children.push(callout(
  "From the moment you click Record until you click Stop, treat the keyboard and mouse as if they are on a stage. Move slowly. Pause a beat before each click. Avoid stray cursor movement. Guidde uses the cursor position to caption each step — wild cursor moves become wild step descriptions.",
  "warn"
));

children.push(h2("Step 4: Click Stop when you finish"));
children.push(p(
  "When the walkthrough ends, click the floating Guidde control (usually a small red circle near the bottom-left of the tab) to stop recording. Guidde uploads, processes, and opens a new tab with your playbook in Guidde Studio."
));

children.push(callout(
  "Do not forget to click Stop. A recording that is never stopped silently accumulates dead time, then makes you trim a fifteen-minute video down to thirty seconds in the editor. Click Stop the moment the demo ends.",
  "danger"
));

/* === Section 5: Walkthrough with narration === */
children.push(h1("Walkthrough — the Step Split feature"));

children.push(p(
  "This section shows the recommended click sequence for the Step Split walkthrough — the headline feature for PM training. Use the same template structure when you record other features."
));

children.push(h2("Setup before you click Record"));
[
  "Open a test order on the admin portal at /admin/orders/{order-id}. Pick an order that has at least three source files and no vendor assigned to any step yet.",
  "Verify the workflow shows Step 1: Translation in the “Pending” state with no Split badge.",
  "Scroll to the top of the page.",
  "Confirm Guidde is set to Current Tab.",
  "Click Record.",
].forEach(t => children.push(p(t, { numbered: true })));

children.push(spacer());
children.push(h2("The click sequence with narration"));
children.push(p(
  "Each box below is one Guidde step. After recording, you'll paste the “What to say” text into Guidde Studio's step caption or feed it to the AI voiceover so the playbook narrates itself.",
  { spaceAfter: 200 }
));

const steps = [
  ["1", "Scroll slowly from the top of the Order Detail page to the workflow section.",
    "Every order in Cethos starts on this Order Detail page. The header shows the order number, the customer card lists who placed the order, and Translation Details captures the languages and certification type. Scroll down to find the Workflow section — that's where the action happens."],
  ["2", "Pause on the Workflow card so the four steps are fully visible.",
    "Every order has a four-step workflow by default — Translate, Customer Draft Review, PM Review, and Final Deliverable. Today we'll focus on Step 1, the Translate step, and show how to split it across multiple assignees."],
  ["3", "Click the Split this step across multiple assignees button on Step 1.",
    "Click the Split button on Step 1 to open the Split Modal. This is the new feature — it lets you partition the files of a single workflow step across more than one assignee."],
  ["4", "Wait for the modal to render. Highlight the left pane with the file list.",
    "On the left we see all three source files of this order. Each one can be assigned to exactly one partition. The right pane is where you build those partitions."],
  ["5", "Click + Add file on Partition 1 and pick the first file.",
    "Add the first file to Partition 1. Notice the file in the left pane dims out and gets a P1 badge — once a file is assigned it can't go to a second partition."],
  ["6", "In the External Vendor block of Partition 1, search and select a vendor.",
    "Choose an external vendor for Partition 1. The vendor list is pre-filtered to those with the right language pair and service — in this case Spanish to English Certified Translation."],
  ["7", "Click + Add another partition.",
    "Click Add another partition to set up the second assignee. Partition 2 appears below Partition 1, ready to configure."],
  ["8", "Click + Add file on Partition 2 and pick the second file.",
    "Add the second file to Partition 2."],
  ["9", "In Partition 2, switch the Assignee radio button from External Vendor to In-house Staff.",
    "Watch what happens when we pick In-house staff — the vendor search field is replaced by a staff member picker. In-house steps are tracked separately because they don't generate a vendor payable."],
  ["10", "Pick a specific staff member from the dropdown.",
    "Assign Partition 2 to a specific in-house staff member. This is how Cethos tracks who translated which file for the ISO 17100 audit trail."],
  ["11", "Click + Add another partition.",
    "Add Partition 3 to cover the last file."],
  ["12", "Click + Add file on Partition 3 and pick the third file.",
    "Add the final file to Partition 3."],
  ["13", "Pick a different external vendor for Partition 3.",
    "Assign Partition 3 to a second external vendor. Notice that Cethos enforces revisor independence at the workflow level — the vendor we pick here cannot also be the reviser of the same file downstream."],
  ["14", "Pause on the green validation bar that reads “All 3 files assigned.”",
    "The validation bar at the bottom turns green when every file is covered. The Save button enables only when all files have a home."],
  ["15", "Click Save split (3).",
    "Click Save split. The modal closes, the workflow refreshes, and Step 1 now wears the new Split 0/3 badge in teal."],
  ["16", "Scroll down to show the three child steps under the parent.",
    "Below the parent step, the three children appear, indented under a left rail. Each child has its own assignee, its own file scope, and its own deadline. The parent acts as an umbrella — it doesn't get a vendor payable of its own."],
  ["17", "Pause on the children rail.",
    "When all three children are completed, the parent will automatically roll up to Completed. That's the contract that keeps the rest of the workflow logic unchanged for split steps."],
  ["18", "Click Stop in Guidde.",
    "And that's a split step end-to-end. The same pattern works for the Translate, Revise, and Internal Work steps. The next lesson covers the Manage Payable flow on each child."],
];

steps.forEach(([n, act, nar]) => {
  children.push(narrationBlock(n, act, nar));
  children.push(spacer(100));
});

children.push(callout(
  "If you fumble a step mid-recording — click the wrong vendor, accidentally close the modal, etc. — do not start over. Guidde Studio has a Trim and Re-record this step feature that lets you fix the bad step without re-recording everything else.",
  "info"
));

/* === Section 6: Post-recording editing === */
children.push(h1("Post-recording editing in Guidde Studio"));

children.push(p(
  "When you click Stop, Guidde uploads the recording and opens it in Guidde Studio for editing. Your job in Studio is to take the auto-generated playbook — which often has nonsense titles and AI-invented step descriptions — and turn it into a Cethos-quality training video."
));

children.push(h2("Step 1: Rename the playbook"));
children.push(p(
  "Guidde will name your playbook something like “Manage LinkedIn Profile Skills” — it auto-generates titles from visual cues and they are almost always wrong. Click the title at the top-left and rename it to something descriptive."
));
children.push(p("Naming convention: “Lesson NN — {Lesson title}”, for example “Lesson 14 — Splitting a step across multiple assignees.”", { italics: true }));

children.push(h2("Step 2: Review each step caption"));
children.push(p(
  "In the left panel, each numbered step shows its auto-generated title and a body description. Both are almost always wrong. Click on a step, then replace the title and body with your own — use the narration text from Section 5 above as the body."
));

children.push(h2("Step 3: Trim unwanted steps"));
children.push(p(
  "Guidde sometimes captures extra steps from cursor twitches or popup dismissals. To delete a step: click the step in the timeline → click the three-dot menu → Delete step. Confirm by checking the duration shrunk."
));

children.push(h2("Step 4: Reorder steps if needed"));
children.push(p(
  "Drag the step thumbnails in the bottom timeline to reorder. Don't reorder unless absolutely necessary — the click animations Guidde generates are tied to specific page states and will look out of place if you reorder around a click."
));

children.push(h2("Step 5: Add cover and end slides"));
children.push(p(
  "Click the Cover button at the bottom of the timeline. Pick a Cethos-branded template if available, otherwise use the plain navy template. Set the cover title to your playbook title."
));
children.push(p(
  "Click Add step → End slide. Add a call-to-action like “Try this on the test order ORD-TEST-001” or “Read Lesson 14 in the Training Portal for the full reference.”"
));

children.push(h2("Step 6: Hit Done"));
children.push(p(
  "The Done button in the top-right saves your edits and exits Studio. You can come back any time — edits are non-destructive and version-tracked."
));

/* === Section 7: Adding AI voiceover narration === */
children.push(h1("Adding AI voiceover narration"));

children.push(p(
  "Guidde supports two narration modes: record yourself, or use AI text-to-speech. Cethos defaults to AI voiceover for consistency — every training video sounds the same regardless of who recorded it."
));

children.push(h2("Picking a voice"));
children.push(p(
  "In Guidde Studio, click the Speaker panel on the left. Guidde shows a roster of voices. The Cethos house voice is currently Ethan (warm, mid-Atlantic, clear pace). Use it for all internal training unless your lesson covers content that requires a different tone."
));

children.push(table2col([
  ["Ethan (default)", "Warm, mid-Atlantic English. Suitable for all PM, finance, and operations content."],
  ["Carrie", "Professional female voice. Use when alternating across a multi-video series so back-to-back videos don't feel monotonous."],
  ["Other voices", "Reserved for content in non-English languages or specialty roles. Check with the training team first."],
], ["Voice", "When to use"]));

children.push(spacer());
children.push(h2("Adding narration text"));
[
  "Click on the first step in the left panel.",
  "Click Generate AI Voice at the bottom of the left panel.",
  "Paste the narration text from Section 5 (or your own).",
  "Click Generate. Guidde converts the text to audio for that step.",
  "Repeat for every step. Use the Bulk-fill feature in the top toolbar if you have all narration text ready as a single block.",
].forEach(t => children.push(p(t, { numbered: true })));

children.push(h2("Reviewing the audio"));
children.push(p(
  "Play through the entire video once with audio on. Check for: speed (Ethan tends to rush — use a comma to add a beat), pronunciation (proper nouns like CCJK or names may need phonetic spelling), and tone (sounds natural? if not, rephrase)."
));

children.push(callout(
  "If a name comes out wrong — e.g. “CCJK” as “seesee jay kay” — spell it phonetically in the narration text: “C-C-J-K”. Then regenerate that step.",
  "info"
));

/* === Section 8: Cover slide and branding === */
children.push(h1("Cover slide and branding"));

children.push(h2("Cover slide content"));
children.push(table2col([
  ["Title", "Same as the playbook title (e.g. “Lesson 14 — Splitting a step across multiple assignees”)."],
  ["Subtitle", "One sentence describing what the viewer will learn (e.g. “How to partition one workflow step across multiple vendors and in-house staff.”)."],
  ["Logo", "Cethos logo, top-left or centered. The training team's brand kit has a transparent PNG."],
  ["Background", "Navy (#0C2340) with the teal (#0891B2) accent. Avoid white — it makes Guidde's branding watermark blend in."],
  ["Speaker", "Optional photo + name of the staff member who recorded the playbook. Helps newcomers know who to ask for follow-up questions."],
], ["Field", "What goes here"]));

children.push(h2("End slide content"));
children.push(table2col([
  ["Headline", "“Try it yourself” or “What's next.”"],
  ["Call to action", "Link to the related training portal lesson, e.g. https://portal.cethos.com/admin/trainings/vendor-management/splitting-step-overview."],
  ["Test resource", "An order or quote ID the viewer can use to practice without affecting real customer work — always pick one from the ORD-TEST-* or QT-TEST-* range."],
  ["Owner contact", "Email of the staff member who recorded the playbook, in case the viewer has questions."],
], ["Field", "What goes here"]));

/* === Section 9: Workspace visibility === */
children.push(h1("Workspace visibility"));

children.push(callout(
  "Cethos training videos contain real customer order numbers, vendor emails, and internal pricing rules. They are workspace-only. Never publish a training video to a public link, even by accident.",
  "danger"
));

children.push(h2("Setting visibility"));
[
  "In Guidde Studio or on the playbook page, click Share at the top-right.",
  "In the Sharing panel, set Who can view to Workspace only.",
  "Confirm the globe icon next to the playbook in your dashboard shows the Workspace shield, not the Public globe.",
  "Do not check Allow comments unless your team specifically asks for feedback on the playbook.",
].forEach(t => children.push(p(t, { numbered: true })));

children.push(h2("Channel publishing"));
children.push(p(
  "Guidde has a Channels feature that groups playbooks into curated lists. The training team publishes all employee training to the Cethos Internal Training channel. After you finalize a playbook:"
));
[
  "Open the playbook → click More → Add to channel.",
  "Pick Cethos Internal Training.",
  "Set the playbook order in the channel — if it's a new lesson in an existing series, slot it after the previous lesson.",
].forEach(t => children.push(p(t, { numbered: true })));

/* === Section 10: Embedding in the training portal === */
children.push(h1("Embedding back into the training portal"));

children.push(p(
  "The Cethos training portal renders Markdown lessons at /admin/trainings/{training-slug}/{lesson-slug}. To embed your finalized playbook back into the matching lesson:"
));

children.push(h2("Step 1: Copy the playbook share URL"));
children.push(p(
  "From your playbook page in Guidde, click Share → Copy link. The URL looks like https://app.guidde.com/playbooks/abc123."
));

children.push(h2("Step 2: Identify the matching lesson"));
children.push(p(
  "Open the training portal at /admin/trainings and find the lesson the playbook corresponds to. Note the lesson's id from the URL bar (a UUID)."
));

children.push(h2("Step 3: Send the URL and lesson id to the training team"));
children.push(p(
  "Email training@cethoscorp.com with the playbook URL, the lesson id, and a one-sentence description of what the playbook covers. The training team runs a SQL update against cvp_training_lessons to embed the video at the top of the lesson body."
));

children.push(callout(
  "Do not edit cvp_training_lessons directly even if you have Super Admin access. The training team batches embeds, syncs the recording-plan document, and runs smoke-checks against portal.cethos.com to confirm the video renders before declaring the lesson updated.",
  "info"
));

/* === Section 11: Troubleshooting === */
children.push(h1("Troubleshooting and known issues"));

children.push(h2("My recording captured my LinkedIn / personal email / Slack"));
children.push(p(
  "Guidde captured the whole browser window, not just the tab you intended. This happens because either (a) you didn't switch the Source to Current Tab in Guidde's settings, or (b) Guidde's Current Tab mode silently fell back to Window mode. The fix is the pre-flight checklist in Section 2 — close every other tab in the recording window before clicking Record."
));

children.push(h2("My playbook was titled “Manage LinkedIn Profile Skills” — I never opened LinkedIn"));
children.push(p(
  "Guidde uses an AI model to guess the title of every recording from visual cues. The model has a strong prior toward LinkedIn UI patterns (because it has seen a lot of LinkedIn training videos in its training data). The fix is to manually rename the playbook the moment Guidde Studio opens — don't let the auto-title persist for even a minute."
));

children.push(h2("Step descriptions are completely wrong"));
children.push(p(
  "Same root cause as the title issue. Guidde's AI invents step descriptions from visual cues. They are wrong about 80 percent of the time. Treat every auto-generated description as placeholder and rewrite it using your narration text."
));

children.push(h2("The recording is much longer than I expected"));
children.push(p(
  "You forgot to click Stop, or you clicked Stop on the wrong floating control (Guidde shows multiple controls when other extensions are active). The cleanest fix is to re-record — trimming a fifteen-minute recording down to ninety seconds inside Guidde Studio is harder than starting over."
));

children.push(h2("The Guidde extension popup is blocking my page"));
children.push(p(
  "Press Escape to dismiss it, or click outside the popup. If a popup keeps appearing mid-recording, pause the recording, dismiss the popup, then resume."
));

children.push(h2("My audio sounds robotic"));
children.push(p(
  "Default AI voices on Guidde Free are limited. Cethos Guidde Pro accounts include premium voices — if you don't have access to them, contact the training team."
));

children.push(h2("My playbook has the wrong workspace"));
children.push(p(
  "Open the Guidde dashboard. In the top-left workspace selector, switch to Cethos Solutions Inc. If your playbook is in your Personal workspace, click the three-dot menu on the playbook → Move to workspace → Cethos Solutions Inc."
));

children.push(h2("How do I delete a recording I don't want to keep?"));
children.push(p(
  "On your Guidde dashboard, hover the playbook tile → three-dot menu → Move to Trash. Then open Trash from the left sidebar and click Empty trash. Deleted playbooks are unrecoverable after 30 days."
));

/* === Appendix A: Cheat sheet === */
children.push(h1("Appendix A — Quick reference"));

children.push(h2("Before every recording"));
[
  "Open a clean Chrome window with only the portal tab.",
  "Close LinkedIn, Slack, email, AI assistants, and any draft documents in that window.",
  "Confirm you're signed in as a Super Admin.",
  "Set OS Do Not Disturb.",
  "Verify Guidde workspace is Cethos Solutions Inc.",
  "Verify Guidde source is Current Tab.",
  "Navigate to the exact starting page.",
].forEach(t => children.push(p(t, { bullets: true })));

children.push(h2("During recording"));
[
  "Move slowly. Pause before each click.",
  "Avoid stray cursor moves.",
  "If you fumble, finish the recording anyway — re-record only the bad steps in Studio.",
  "Click Stop the moment the demo ends.",
].forEach(t => children.push(p(t, { bullets: true })));

children.push(h2("After recording"));
[
  "Rename the playbook with the lesson number and title.",
  "Replace every auto-generated step description with your narration text.",
  "Trim stray steps from cursor twitches.",
  "Add a cover slide with the lesson title and a Cethos navy background.",
  "Add an end slide with a CTA link to the training portal lesson.",
  "Add AI voiceover using the Ethan voice (Cethos house default).",
  "Set visibility to Workspace only.",
  "Add to the Cethos Internal Training channel.",
  "Email training@cethoscorp.com with the playbook URL and matching lesson id.",
].forEach(t => children.push(p(t, { bullets: true })));

/* === Appendix B: Pre-flight pre-recording confirmation === */
children.push(h1("Appendix B — Pre-flight confirmation"));

children.push(p(
  "Print or copy this checklist. Tick every box before you click Record. If any item is unchecked, do not start the recording."
));

const preflight = [
  "I have opened a new Chrome window dedicated to this recording.",
  "The recording window has exactly one tab: the Cethos portal page I plan to demonstrate.",
  "I have closed LinkedIn, Slack, email, AI assistants, and draft documents in this window.",
  "I am signed in to the portal as a Super Admin.",
  "OS Do Not Disturb is on.",
  "Slack and Outlook notifications are paused.",
  "The Guidde extension shows workspace = Cethos Solutions Inc. (not Personal).",
  "The Guidde extension is set to Source = Current Tab.",
  "I have the narration script open in a separate window or printed copy.",
  "I have practiced the click sequence once without recording so I know what to click.",
  "I am on the exact starting page of the walkthrough, scrolled to the top.",
  "I am ready to click Stop the moment the demo ends.",
];

preflight.forEach((item, i) => {
  children.push(new Paragraph({
    children: [
      new TextRun({ text: "[ ]  ", bold: true, color: SLATE_400, size: 22, font: FONT }),
      new TextRun({ text: item, color: SLATE_900, size: 22, font: FONT }),
    ],
    spacing: { after: 100 },
  }));
});

children.push(spacer(400));
children.push(callout(
  "If you skip the pre-flight, the most common outcome is that your finished video shows your private email, a Claude or Perplexity tab, or a LinkedIn page in the middle of the recording. That video can't be cleaned up after the fact — you have to re-record. The pre-flight takes ninety seconds. Always do it.",
  "danger"
));

/* === Closing === */
children.push(h1("Questions, feedback, and revisions"));

children.push(p(
  "This guide is a living document. The training team revises it as Guidde, the Cethos portal, and our training conventions evolve. If you spot something out of date, find a step that doesn't work, or want to suggest an improvement, email training@cethoscorp.com with the section number and your suggestion."
));

children.push(p(
  "The current revision is dated June 2026. The next planned revision adds sections on the Loom and OBS recording paths once those tools are in use for internal training."
));

children.push(spacer(400));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: "— End of guide —", color: SLATE_400, italics: true, size: 22, font: FONT })],
}));

/* === Build the document === */
const doc = new Document({
  creator: "Cethos Translation Services",
  title: "Recording Training Videos with Guidde",
  description: "Step-by-step guide with narration for Cethos staff recording training videos using Guidde.ai.",
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: FONT, color: NAVY },
        paragraph: { spacing: { before: 480, after: 240 }, outlineLevel: 0 },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: FONT, color: TEAL },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 1 },
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: FONT, color: SLATE_900 },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 2 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
      {
        reference: "steps",
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: "Cethos — Internal Training", color: SLATE_400, size: 18, font: FONT }),
          ],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          children: [
            new TextRun({ text: "Recording Training Videos with Guidde", color: SLATE_400, size: 18, font: FONT }),
            new TextRun({ text: "\t", color: SLATE_400, size: 18, font: FONT }),
            new TextRun({ text: "Page ", color: SLATE_400, size: 18, font: FONT }),
            new TextRun({ children: [PageNumber.CURRENT], color: SLATE_400, size: 18, font: FONT }),
          ],
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        })],
      }),
    },
    children,
  }],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(OUTFILE, buffer);
  console.log(`Wrote ${OUTFILE} (${buffer.length} bytes)`);
});
