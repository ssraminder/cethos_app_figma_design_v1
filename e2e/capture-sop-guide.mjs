/*
 * Generic, config-driven capture of REAL annotated screenshots for a SOP
 * verification guide. Read-only: navigation + scroll + ring highlight only.
 * NEVER clicks side-effectful controls.
 *
 *   node e2e/capture-sop-guide.mjs <key>      e.g. sop008
 * Reads  e2e/sop-configs/<key>.mjs  (default export with { key, steps:[...] }).
 * Writes e2e/output/sop-verify/<key>/screenshots/*.png + steps.json
 */
import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const key = process.argv[2];
if (!key) { console.error("usage: node e2e/capture-sop-guide.mjs <key>"); process.exit(1); }
const cfg = (await import(pathToFileURL(path.join(__dirname, "sop-configs", `${key}.mjs`)).href)).default;

const BASE = "https://portal.cethos.com";
const OUT = path.join(__dirname, "output", "sop-verify", cfg.key);
const SHOTS = path.join(OUT, "screenshots");
fs.mkdirSync(SHOTS, { recursive: true });

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({
  storageState: path.join(__dirname, ".auth", "admin.json"),
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
const T = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function ring(loc, caption) {
  try {
    await loc.scrollIntoViewIfNeeded({ timeout: 4000 });
    const box = await loc.boundingBox();
    if (!box) return false;
    await page.evaluate(({ box, caption }) => {
      document.querySelectorAll(".__r__").forEach((e) => e.remove());
      const d = document.createElement("div"); d.className = "__r__";
      Object.assign(d.style, { position: "fixed", left: box.x - 6 + "px", top: box.y - 6 + "px",
        width: box.width + 12 + "px", height: box.height + 12 + "px", border: "3px solid #ef4444",
        borderRadius: "10px", zIndex: 2147483647, pointerEvents: "none", boxShadow: "0 0 0 3px rgba(239,68,68,.35)" });
      document.body.appendChild(d);
      if (caption) {
        const c = document.createElement("div"); c.className = "__r__"; c.textContent = caption;
        Object.assign(c.style, { position: "fixed", left: box.x - 6 + "px", top: Math.max(4, box.y - 30) + "px",
          background: "#ef4444", color: "#fff", font: "600 13px Arial", padding: "3px 8px", borderRadius: "6px",
          zIndex: 2147483647, pointerEvents: "none", maxWidth: "640px" });
        document.body.appendChild(c);
      }
    }, { box, caption });
    return true;
  } catch { return false; }
}
const clearRing = () => page.evaluate(() => document.querySelectorAll(".__r__").forEach((e) => e.remove()));

const steps = [];
let curUrl = null;
let stale = false;
for (const s of cfg.steps) {
  if (s.url && s.url !== curUrl) {
    await page.goto(`${BASE}${s.url}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(s.wait ?? 4200);
    curUrl = s.url;
    if (await page.getByText(/Sign in to access the admin panel|Invalid login|Session expired/i).count()) {
      stale = true; break;
    }
  }
  let ringed = false;
  if (s.ring) {
    const loc = page.getByText(new RegExp(s.ring, "i")).first();
    // wait for the target text to actually render (guards against blank/slow SPA paints)
    await loc.waitFor({ state: "visible", timeout: 9000 }).catch(() => {});
    ringed = await ring(loc, s.caption || s.title);
  }
  const file = `${s.id}-${T(s.title)}.png`;
  await page.screenshot({ path: path.join(SHOTS, file) }).catch(() => {});
  if (ringed) await clearRing();
  steps.push({ id: s.id, title: s.title, explanation: s.say, screenshot: file, ring_found: ringed });
  console.log(`  [${s.id}] ${s.title}${s.ring && !ringed ? "  (ring text not found — plain shot)" : ""}`);
}

if (stale) {
  console.error("\n!!! SESSION STALE — screenshots are the login page. Refresh: node e2e/refresh-auth.mjs");
  await b.close(); process.exit(2);
}
fs.writeFileSync(path.join(OUT, "steps.json"), JSON.stringify({ label: cfg.key, steps }, null, 2));
console.log(`\n done: ${steps.length} screenshots -> ${SHOTS}`);
await b.close();
