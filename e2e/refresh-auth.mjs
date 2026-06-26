/*
 * Refresh the saved admin Playwright session (e2e/.auth/admin.json).
 * The Supabase access token lasts ~1h, so re-run this whenever a capture
 * script lands on the login page.
 *
 *   node e2e/refresh-auth.mjs
 *
 * A real Chromium window opens on portal.cethos.com/admin. Log in the way you
 * normally do. Once the admin app shell renders, the session is saved and the
 * window closes automatically. (Headed — must run in your own terminal.)
 */
import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, ".auth", "admin.json");
fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

const b = await chromium.launch({ headless: false });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto("https://portal.cethos.com/admin", { waitUntil: "domcontentloaded" });

console.log("\n────────────────────────────────────────────────────────");
console.log(" Log in in the Chromium window that just opened.");
console.log(" Waiting until you reach the admin area (up to 10 min)…");
console.log("────────────────────────────────────────────────────────\n");

const deadline = Date.now() + 10 * 60 * 1000;
let ok = false;
while (Date.now() < deadline) {
  const onAdmin = /\/admin(\/|$)/.test(new URL(page.url()).pathname);
  const hasShell = (await page.locator("nav, aside, [data-admin-shell]").count()) > 0;
  const hasLogin = (await page.getByRole("button", { name: /sign in|log ?in/i }).count()) > 0;
  if (onAdmin && hasShell && !hasLogin) { ok = true; break; }
  await page.waitForTimeout(2000);
}
if (!ok) { console.error("Timed out waiting for login."); await b.close(); process.exit(2); }

await ctx.storageState({ path: AUTH_FILE });
console.log("✓ Saved fresh admin session ->", AUTH_FILE);
await b.close();
