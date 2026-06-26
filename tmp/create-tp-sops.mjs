import fs from 'node:fs';
const URL = 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/manage-sops';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxtem95ZXp2c2pnc3h2ZW9ha2RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NDkzNTIsImV4cCI6MjA4NDQyNTM1Mn0.6XtRrAuganzIb65FbG_NKQ8JuOxoPLSXBYsffZg2Y3c';
const STAFF = 'a8b2d97e-4832-41d4-9334-4d6a58558154'; // Raminder Shah (approver)
const BASE = 'D:/cethos/portal/cethos_app_figma_design_v1/docs/sops';
const SOPS = [
  { sop_number: 'SOP-041', title: 'Screenshot Review (In-Context Linguistic Review)', iso: 'ISO 17100 §5.3.6, §5.4', file: 'SOP-041-screenshot-review.md' },
  { sop_number: 'SOP-042', title: 'Post-Editing (Machine Translation Post-Editing, MTPE)', iso: 'ISO 17100 §5.4; ISO 18587', file: 'SOP-042-post-editing-mtpe.md' },
  { sop_number: 'SOP-043', title: 'Quality Management (QM) Check', iso: 'ISO 17100 §5.3.6, §5.4', file: 'SOP-043-quality-management.md' },
];
async function call(body) {
  const r = await fetch(URL, { method: 'POST', headers: { Authorization: `Bearer ${ANON}`, apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}
for (const s of SOPS) {
  const content_md = fs.readFileSync(`${BASE}/${s.file}`, 'utf8');
  const c = await call({ action: 'create_sop', title: s.title, category: 'Production', iso_clause_reference: s.iso, content_md, staff_id: STAFF, sop_number: s.sop_number });
  if (!c.j?.success) { console.log(`FAIL create ${s.sop_number} -> HTTP ${c.status}: ${JSON.stringify(c.j).slice(0,200)}`); continue; }
  const versionId = c.j.version?.id;
  const a = await call({ action: 'activate', version_id: versionId, staff_id: STAFF });
  console.log(`${a.j?.success ? 'OK  ' : 'CREATED-NOT-ACTIVATED '} ${s.sop_number}  sop=${c.j.sop?.id}  v=${versionId}  activate=${a.j?.success ? 'yes' : 'HTTP '+a.status+' '+JSON.stringify(a.j).slice(0,150)}`);
}
