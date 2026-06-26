/*
 * Capture REAL annotated screenshots for Fayza's SOP-003 (Vendor Qualification
 * and Management) verification guide. Drives live portal.cethos.com as the saved
 * admin session, writing highlighted PNGs + steps.json into
 *   e2e/output/sop-verify/sop003/screenshots/
 *
 * SAFETY: navigation + scroll only on a SOP page and on ONE already-qualified
 * vendor's read-only QMS tab. It NEVER opens the qualification queue's Apply,
 * never approves/qualifies anyone, never clicks Add qualification / Add document.
 * Qualification is irreversible — this guide only LOOKS at an existing record.
 *
 *   node e2e/capture-sop003-guide.mjs
 */
import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = "https://portal.cethos.com";
const SOP_ID = "46d69698-d8a8-47d4-b27f-5b5824a8a667";       // SOP-003
const VENDOR = "994fb211-a35b-44ff-a37c-0368a16b0ce5";        // Omotola (already qualified)
const OUT = path.join(__dirname, "output", "sop-verify", "sop003");
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
          pointerEvents: "none", maxWidth: "620px",
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

// ════════ PART 1 — read what SOP-003 requires ════════
console.log("PART 1 — the SOP");
await page.goto(`${BASE}/admin/sops/${SOP_ID}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
await guard("SOP-003");
await shoot("s1", "Open SOP-003 and read the control block",
  "Log in to portal.cethos.com. In the left menu under QUALITY, open SOPs, then in the HUMAN RESOURCES group open SOP-003 - Vendor Qualification and Management. Read the control block (number, version, owner, approver) and the §3.1.4 competence rules. On the right, the version panel shows the approved version is frozen - document control working.",
  page.getByText(/Approved versions are frozen/i).first(),
  "Approved versions are frozen - version-controlled");

// ════════ PART 2 — confirm a REAL qualified vendor ════════
console.log("PART 2 — a real qualified vendor (read-only)");
await page.goto(`${BASE}/admin/vendors/${VENDOR}?tab=qms`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4500);
await guard("vendor QMS tab");
await shoot("s2", "An NDA is on file before any work",
  "Open an already-qualified vendor and click the QMS tab. First confirm the NDA - it must be Active and signed before any materials are shared (SOP-003 §9). Here: Active, signed, version v3.0.",
  page.getByText(/signed\s+\d/i).first(),
  "NDA on file - Active + signed (§9)");

await shoot("s3", "The qualification records the §3.1.4 basis",
  "Now the role qualification. Confirm it shows the role (Translator), the §3.1.4 competence basis (here 'Recognized degree in translation'), a Verified badge, the qualified date, and a 12-month re-qualification due date (SOP-003 §4, §6, §7). The language pairs the vendor is qualified for are listed underneath.",
  page.getByText(/re-qualification due/i).first(),
  "Qualified · §3.1.4 basis · Verified · re-qualification due (§4/§6/§7)");

await shoot("s4", "Every piece of evidence is documented and verified",
  "Scroll to Evidence / proof. SOP-003 §4/§5/§11 require documented evidence, not self-report. Confirm each item shows a Verified badge, a sha-256 file hash (tamper-evident), and View document. This is the documented, on-file proof behind the qualification.",
  page.getByText(/sha-256/i).first(),
  "Each evidence item: Verified + sha-256 hash + View document (§4/§5/§11)");

fs.writeFileSync(path.join(OUT, "steps.json"),
  JSON.stringify({ label: "sop003", steps }, null, 2));
console.log(`\n done: ${steps.length} screenshots -> ${SHOTS}`);
await b.close();
