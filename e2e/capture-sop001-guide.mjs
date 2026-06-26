/*
 * Capture REAL annotated screenshots for Fayza's SOP-001 (Document Control &
 * Records Management) verification guide. Drives live portal.cethos.com as the
 * saved admin session, writing highlighted PNGs + steps.json into
 *   e2e/output/sop-verify/sop001/screenshots/
 *
 * SAFETY: navigation + opening menus/dialogs that are then DISMISSED only.
 * It opens Export, Edit (new version) and New SOP purely to screenshot them,
 * then Escapes / navigates away. It NEVER clicks Save draft / Create draft /
 * Activate / Archive / Download — no state is changed.
 *
 *   node e2e/capture-sop001-guide.mjs
 */
import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = "https://portal.cethos.com";
const OUT = path.join(__dirname, "output", "sop-verify", "sop001");
const SHOTS = path.join(OUT, "screenshots");
fs.mkdirSync(SHOTS, { recursive: true });

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({
  storageState: path.join(__dirname, ".auth", "admin.json"),
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();
page.setDefaultTimeout(15000);

const steps = [];
const T = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function ring(locator, caption) {
  try {
    await locator.scrollIntoViewIfNeeded({ timeout: 4000 });
    const box = await locator.boundingBox();
    if (!box) return;
    await page.evaluate(({ box, caption }) => {
      document.querySelectorAll(".__r__").forEach((e) => e.remove());
      const d = document.createElement("div");
      d.className = "__r__";
      Object.assign(d.style, {
        position: "fixed", left: box.x - 6 + "px", top: box.y - 6 + "px",
        width: box.width + 12 + "px", height: box.height + 12 + "px",
        border: "3px solid #ef4444", borderRadius: "10px", zIndex: 2147483647,
        pointerEvents: "none", boxShadow: "0 0 0 3px rgba(239,68,68,.35)",
      });
      document.body.appendChild(d);
      if (caption) {
        const c = document.createElement("div");
        c.className = "__r__";
        c.textContent = caption;
        Object.assign(c.style, {
          position: "fixed", left: box.x - 6 + "px",
          top: Math.max(4, box.y - 30) + "px",
          background: "#ef4444", color: "#fff", font: "600 13px Arial",
          padding: "3px 8px", borderRadius: "6px", zIndex: 2147483647,
          pointerEvents: "none", maxWidth: "600px",
        });
        document.body.appendChild(c);
      }
    }, { box, caption });
  } catch {}
}
async function clearRing() {
  await page.evaluate(() => document.querySelectorAll(".__r__").forEach((e) => e.remove()));
}
async function shoot(id, title, explanation, target, caption) {
  if (target) await ring(target, caption || title);
  const file = `${id}-${T(title)}.png`;
  await page.screenshot({ path: path.join(SHOTS, file) }).catch(() => {});
  if (target) await clearRing();
  steps.push({ id, title, explanation, screenshot: file });
  console.log(`  [${id}] ${title}`);
}
async function guard(where) {
  if (await page.getByText(/Unauthorized|Sign in to your account|Invalid login|401|Session expired/i).count()) {
    console.log(`SESSION STALE at ${where} — re-run: npm run e2e:auth`);
    await b.close();
    process.exit(2);
  }
}

// ════════ PART 1 — read what SOP-001 requires ════════
console.log("PART 1 — the SOP");
await page.goto(`${BASE}/admin/sops`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);
await guard("/admin/sops");
await shoot("s1", "Open the SOPs registry",
  "Log in to portal.cethos.com with your own account. In the left menu, under QUALITY, click SOPs. Every Standard Operating Procedure is listed here, grouped by department, with its version, ISO reference, status and effective date.",
  page.getByRole("heading", { name: /Standard Operating Procedures/i }).first(),
  "Left menu -> QUALITY -> SOPs");

await shoot("s2", "Find SOP-001 Document Control",
  "Scroll down to the QUALITY ASSURANCE group and find SOP-001 - Document Control and Records Management. Confirm it shows a version badge (v1 active) and an effective date.",
  page.getByText(/Document Control and Records Management/i).first(),
  "SOP-001 - Document Control and Records Management");

await page.getByText(/Document Control and Records Management/i).first().click().catch(() => {});
await page.waitForTimeout(2500);
await shoot("s3", "Read the SOP and its control block",
  "Click the row to open the SOP. At the top is its control block - document number, version, effective date, owner, and the Prepared / Reviewed / Approved signatures. On the right, the version panel says the approved version is frozen - the database refuses edits.",
  page.getByText(/Approved versions are frozen/i).first(),
  "Approved versions are frozen - version-controlled");

// Export menu (open -> screenshot -> Escape; nothing downloaded)
await page.getByRole("button", { name: /Export/i }).first().click({ timeout: 6000 }).catch(() => {});
await page.waitForTimeout(900);
await shoot("s4", "Controlled export",
  "Click Export to see the controlled output formats - Word (.docx) and PDF. (You do not need to download anything - just confirm the option exists.)",
  page.getByText(/Word \(\.docx\)/i).first(),
  "Export -> Word (.docx) / PDF");
await page.keyboard.press("Escape").catch(() => {});
await page.waitForTimeout(400);

// Edit (new version): open -> screenshot -> navigate away (NO save)
await page.getByRole("button", { name: /Edit \(new version\)/i }).first().click({ timeout: 6000 }).catch(() => {});
await page.waitForTimeout(1200);
await shoot("s5", "A change makes a NEW version",
  "If a procedure ever changes, you click Edit (new version). It opens an editor with a 'What changed and why' box and a Save draft button - it creates a NEW version, it never edits the approved one. (For this check we just look, then leave without saving.)",
  page.getByPlaceholder(/What changed and why/i).first(),
  "New version + change note - never edits the approved one");
await page.goto(`${BASE}/admin/sops`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);

// ════════ PART 2 — superseded versions are clearly marked (the fix) ════════
console.log("PART 2 — superseded marking + the library");
await page.getByText(/Corrective and Preventive Actions/i).first().click().catch(() => {});
await page.waitForTimeout(2500);
await guard("SOP-011");
await shoot("s6", "Old versions are marked superseded",
  "Open any SOP that has a version 2 - here SOP-011. In the Version history panel, the current version shows active (green) and the previous version shows superseded (grey). Only the current, approved version is ever in use - older ones are kept but clearly marked.",
  page.getByText(/^superseded$/i).first(),
  "v2 active (green) - v1 superseded (grey)");

await page.goto(`${BASE}/admin/documents`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);
await guard("/admin/documents");
await shoot("d1", "Open Documents and Manuals",
  "Back in the left menu under QUALITY, click Documents & Manuals - the controlled library where manuals, policies and records live. Each is tagged with an audience and Published to the matching portal.",
  page.getByRole("heading", { name: /Documents & Manuals/i }).first(),
  "Left menu -> QUALITY -> Documents & Manuals");

await shoot("d2", "Superseded documents are clearly marked",
  "Scroll to the POLICIES group. The old Data Backup policy is titled [SUPERSEDED -> SOP-016] and is NOT published - proof that obsolete documents are kept for history but clearly marked and withdrawn from use.",
  page.getByText(/SUPERSEDED/i).first(),
  "Marked [SUPERSEDED -> SOP-016], not published");

// New SOP dialog: open -> screenshot -> Escape (nothing created)
await page.goto(`${BASE}/admin/sops`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);
await page.getByRole("button", { name: /New SOP/i }).first().click({ timeout: 6000 }).catch(() => {});
await page.waitForTimeout(1200);
await shoot("s7", "New procedures start as a draft",
  "A brand-new procedure is created with New SOP. Notice there is no box to type a number - the system assigns SOP-### automatically. It starts as a draft and only becomes official when it is approved and activated. (We just look, then close with Cancel.)",
  page.getByText(/Create draft/i).first(),
  "Starts as a draft - number assigned automatically");
await page.keyboard.press("Escape").catch(() => {});

fs.writeFileSync(path.join(OUT, "steps.json"),
  JSON.stringify({ label: "sop001", steps }, null, 2));
console.log(`\n done: ${steps.length} screenshots -> ${SHOTS}`);
await b.close();
