// Backfill LSP/agency clients (Zab, Trustpoint, The Language Room) into team
// Dropbox 01_Clients via dropbox-team-sync `backfill_order` (files from Storage).
// Usage: node backfill-lsp.mjs [comma-separated indices]   (default: all)
const URL = 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/dropbox-team-sync';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxtem95ZXp2c2pnc3h2ZW9ha2RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NDkzNTIsImV4cCI6MjA4NDQyNTM1Mn0.6XtRrAuganzIb65FbG_NKQ8JuOxoPLSXBYsffZg2Y3c';
const IDS = [
  ["ORD-2026-10297","3f54a4a6-6269-486f-a69c-86fc56cb1cd6"], // The Language Room
  ["ORD-2026-10308","68ef45f3-68cb-4d7b-a03b-194b0c17b972"], // The Language Room
  ["ORD-2026-10274","3a81c737-268c-4989-8caf-dd0e5e579bae"], // Trustpoint (0 quote_files)
  ["ORD-2026-10325","085b0f43-0056-431e-b2ff-bc72a55a733d"], // Trustpoint
  ["ORD-2026-10326","1e4d5e16-b5bf-4ea8-88c8-57998bfd8171"], // Trustpoint
  ["ORD-2026-10342","4f8fb964-9619-4c3f-82b6-8904b0b752cc"], // Trustpoint
  ["ORD-2026-10254","b2f9f295-b0b7-42d6-be8a-cef086162ef5"], // Zab
  ["ORD-2026-10312","6d64f556-968a-4191-a8b5-2993aa48d22b"], // Zab
  ["ORD-2026-10328","aa67b241-6e16-4b96-aaac-2bd202994834"], // Zab
  ["ORD-2026-10338","7f8bd3ae-2b58-4e00-a765-10d775ecb747"], // Zab
  ["ORD-2026-10339","6396a271-4d04-4b88-b0b0-ef32381bc785"], // Zab
  ["ORD-2026-10340","56ecb995-f585-41bf-93a3-e6713dd40d00"], // Zab
  ["ORD-2026-10341","4f5fe4cc-54c4-445d-a227-bf6e6f1ad05e"], // Zab
  ["ORD-2026-10368","a720ed18-3426-40a4-8cfe-aa6f107de26a"], // Zab
  ["ORD-2026-10397","87deaf9c-9c50-4a21-8252-2f2347167802"], // Zab
  ["ORD-2026-10398","f153112a-4376-4821-a8ef-ebf66d49be18"], // Zab
  ["ORD-2026-10484","900b6389-9241-4ddc-8e05-4f1b1d506091"], // Zab
];
const pick = process.argv[2] ? process.argv[2].split(',').map(Number) : IDS.map((_, i) => i);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function backfill(id) {
  for (let a = 1; a <= 3; a++) {
    try {
      const r = await fetch(URL, { method: 'POST', headers: { Authorization: `Bearer ${ANON}`, apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'backfill_order', order_id: id }) });
      const j = await r.json().catch(() => ({}));
      if (j && j.success) return { ok: true, files: j.files_synced ?? 0, base: j.base_path };
      const e = JSON.stringify(j).slice(0, 200);
      if (a < 3 && (r.status === 429 || r.status >= 500)) { await sleep(3000 * a); continue; }
      return { ok: false, error: (j && j.error) || `HTTP ${r.status}: ${e}` };
    } catch (e) { if (a < 3) { await sleep(3000 * a); continue; } return { ok: false, error: String((e && e.message) || e) }; }
  }
}
let ok = 0, files = 0;
for (const i of pick) {
  const [num, id] = IDS[i];
  const r = await backfill(id);
  if (r.ok) { ok++; files += r.files; console.log(`OK  ${num}  ${r.files} files  | ${String(r.base).replace('/Cethos Team Folder/01_Clients/', '')}`); }
  else console.log(`FAIL ${num} -> ${r.error}`);
  await sleep(1200);
}
console.log(`\n==== ${ok}/${pick.length} ok, ${files} files ====`);
