// Backfill certified-individual orders into team Dropbox 02_Certified-Individuals.
// Files come from Supabase Storage via dropbox-team-sync `backfill_order`.
// Usage: node backfill-certified.mjs [comma-separated indices]   (default: all)
const URL = 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/dropbox-team-sync';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxtem95ZXp2c2pnc3h2ZW9ha2RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NDkzNTIsImV4cCI6MjA4NDQyNTM1Mn0.6XtRrAuganzIb65FbG_NKQ8JuOxoPLSXBYsffZg2Y3c';
const IDS = [
  ["ORD-2026-10406","a0747e48-9b53-47b1-b531-9bcbc084f6b3"],  // Ana Deutsch
  ["ORD-2026-10405","399cddc8-8db2-4ef8-9f2b-ee0119968e12"],  // Harkaran Singh Sidhu
  ["ORD-2026-10402","bfef055c-f1fe-4ec0-af0b-bab4f761940a"],  // Marcos Inuzuka
  ["ORD-2026-970478","d9356b6d-cc6f-4cfd-8176-30eecc795f91"], // Stan Cristi
  ["ORD-2026-945973","09031aff-a239-407d-8ef4-f4b36fc10995"], // Tarika Engidayehu
  ["ORD-2026-10370","6a964406-515c-4e50-8ff7-d50d7b71cbf6"],  // Benjamin Libuy
  ["ORD-2026-896727","6d60582c-ce7d-495e-bf98-3e21417380f9"], // Scott King
  ["ORD-2026-10366","327c30db-0275-47be-9ec6-ff5450cc56da"],  // Rajni
  ["ORD-2026-10363","17f058fc-c187-4ccf-b555-49727287ef8e"],  // Tom Berlin
  ["ORD-2026-10362","6f515659-7812-456b-b30f-a1009a6bf60f"],  // Marcos Inuzuka
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
  if (r.ok) { ok++; files += r.files; console.log(`OK  ${num}  ${r.files} files  | ${String(r.base).replace('/Cethos Team Folder/', '')}`); }
  else console.log(`FAIL ${num} -> ${r.error}`);
  await sleep(1200);
}
console.log(`\n==== ${ok}/${pick.length} ok, ${files} files ====`);
