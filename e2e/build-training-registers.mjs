// Build the two live Training Registers from real portal data:
//   • REG-TRN-V-001  Vendor Training Register  (audience=staff; contains vendor PII)
//   • REG-TRN-S-001  Staff Training Register
// These supersede the old combined REG-TRN-001 (archived). Output HTML is NOT
// committed (it carries per-person completion records / PII) — it's generated
// then uploaded to Documents & Manuals and lives in storage.
//
// ── 1) EXPORT live data to JSON (run each in the Supabase SQL editor / MCP, save
//       the single text cell to the input files below) ──────────────────────────
//   Vendor: SELECT jsonb_build_object(
//     'catalog',(SELECT jsonb_agg(jsonb_build_object('title',t.title,'category',t.category,
//        'scope',t.applies_to->>'scope','seq',t.sequence_order,
//        'lessons',(SELECT count(*) FROM cvp_training_lessons l WHERE l.training_id=t.id),
//        'assigned',(SELECT count(*) FROM cvp_training_assignments a WHERE a.training_id=t.id AND a.vendor_id IS NOT NULL),
//        'completed',(SELECT count(*) FROM cvp_training_completions c WHERE c.training_id=t.id AND c.status='completed'))
//        ORDER BY t.sequence_order NULLS LAST,t.title) FROM cvp_trainings t WHERE t.audience='linguist' AND t.is_active),
//     'records',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',v.full_name,'email',v.email,'training',t.title,
//        'completed_at',to_char(c.completed_at,'YYYY-MM-DD'),'method',c.method) ORDER BY c.completed_at DESC),'[]')
//        FROM cvp_training_completions c JOIN vendors v ON v.id=c.vendor_id JOIN cvp_trainings t ON t.id=c.training_id WHERE c.status='completed'));
//   Staff: same shape, audience='staff', completions from cvp_training_assignments (staff_user_id, completed_at)
//          joined to staff_users.
//
// ── 2) GENERATE ──  node e2e/build-training-registers.mjs <staff.json> <vendor.json> [outDir]
//
// ── 3) UPLOAD (per file) ── multipart create on manage-portal-documents (service role,
//       staff validated via staff_id; no JWT needed, anon key as gateway apikey):
//   curl -X POST $FUNCTIONS/manage-portal-documents -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
//     -F action=create -F staff_id=$STAFF -F title="Vendor Training Register" -F doc_code=REG-TRN-V-001 \
//     -F audience=staff -F category="QMS Core" -F version=1.0 -F "file=@Cethos-Vendor-Training-Register.html;type=text/html"
//   then publish: action=update_meta {id, is_published:true}.

import fs from "fs";
const [, , staffPath = "e2e/output/training-registers/staff-data.json",
        vendorPath = "e2e/output/training-registers/vendor-data.json",
        outDir = "e2e/output/training-registers"] = process.argv;

const LOGO = "https://lmzoyezvsjgsxveoakdr.supabase.co/storage/v1/object/public/web-assets/png_logo_cethos_light_bg.png";
const DATE = new Date().toISOString().slice(0, 10);
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const scopeLabel = (sc, who) => sc === "universal" ? `All ${who}` : sc === "subject_matter" ? "Clinical / COA" : sc === "assigned" ? "By assignment" : (sc || "—");

const CSS = `
 :root{--teal:#0F9DA0;--slate:#334155;--grey:#64748B;--line:#E2E8F0;--soft:#F8FAFC;}
 *{box-sizing:border-box} body{margin:0;background:#EEF2F5;color:var(--slate);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;}
 .page{max-width:1040px;margin:24px auto;background:#fff;padding:48px 56px;border-radius:12px;box-shadow:0 1px 3px rgba(15,23,42,.08),0 8px 24px rgba(15,23,42,.06);}
 .logo{height:34px;display:block;margin-bottom:18px}
 h1{font-size:30px;color:var(--teal);margin:0 0 6px;font-weight:800}
 .subtitle{color:var(--grey);margin:0 0 4px;font-size:15px}
 .meta{color:var(--grey);font-size:13px;font-weight:700;margin:0;letter-spacing:.02em}
 .cover{border-bottom:3px solid var(--teal);padding-bottom:18px;margin-bottom:24px}
 h2{color:var(--teal);font-size:20px;margin:34px 0 4px;padding-top:14px;border-top:1px solid var(--line);font-weight:800}
 p{margin:0 0 12px}
 table{border-collapse:collapse;width:100%;margin:8px 0 14px;font-size:13.5px}
 th,td{border:1px solid #CBD5E1;padding:7px 10px;text-align:left;vertical-align:top}
 thead th{background:#E2F3F3;color:#0B5e60;font-weight:700}
 tbody tr:nth-child(even){background:var(--soft)}
 td.num,th.num{text-align:center}
 .mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;color:#475569}
 .stats{display:flex;gap:14px;flex-wrap:wrap;margin:8px 0 18px}
 .stat{flex:1;min-width:150px;background:var(--soft);border:1px solid var(--line);border-top:3px solid var(--teal);border-radius:10px;padding:14px 16px}
 .stat .n{font-size:28px;font-weight:800;color:var(--teal);line-height:1.1}
 .stat .l{font-size:12px;color:var(--grey);text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-top:4px}
 .callout{background:var(--soft);border:1px solid var(--line);border-left:5px solid var(--teal);border-radius:8px;padding:14px 18px;margin:16px 0}
 .callout b{color:var(--teal)}
 .pill{display:inline-block;font-size:11px;font-weight:700;border-radius:6px;padding:1px 7px;background:#E2F3F3;color:#0B5e60}
 .footnote{color:var(--grey);font-size:13px;font-style:italic;margin-top:26px;border-top:1px solid var(--line);padding-top:14px}
 @media print{body{background:#fff}.page{box-shadow:none;margin:0;max-width:none;border-radius:0;padding:0}}
`;
const catalogTable = (catalog, who) => `<table><thead><tr><th>Training</th><th>Topic</th><th class="num">Lessons</th><th>Availability</th><th class="num">Assigned</th><th class="num">Completed</th></tr></thead><tbody>${catalog.map((t) => `<tr><td><strong>${esc(t.title)}</strong>${t.seq ? ` <span class="pill">Step ${t.seq}</span>` : ""}</td><td>${esc(t.category)}</td><td class="num">${t.lessons}</td><td>${scopeLabel(t.scope, who)}</td><td class="num">${t.assigned}</td><td class="num">${t.completed}</td></tr>`).join("")}</tbody></table>`;
const recordsTable = (records, withMethod) => !records.length ? `<p class="footnote">No completions recorded yet.</p>` : `<table><thead><tr><th class="num">#</th><th>Linguist / Staff</th><th>Email</th><th>Training</th><th class="num">Completed</th>${withMethod ? "<th>Method</th>" : ""}</tr></thead><tbody>${records.map((r, i) => `<tr><td class="num">${i + 1}</td><td>${esc(r.name) || "—"}</td><td class="mono">${esc(r.email)}</td><td>${esc(r.training)}</td><td class="num">${esc(r.completed_at)}</td>${withMethod ? `<td>${esc(r.method)}</td>` : ""}</tr>`).join("")}</tbody></table>`;

function register({ code, title, who, data, withMethod }) {
  const distinct = new Set(data.records.map((r) => r.email)).size;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Cethos (${code})</title><style>${CSS}</style></head><body><main class="page">
<header class="cover"><img class="logo" src="${LOGO}" alt="Cethos"><h1>${esc(title)}</h1>
<p class="subtitle">Controlled record of ${who} trainings and per-person completion evidence (ISO 17100 / IQVIA audit).</p>
<p class="meta">Version 1.0 &nbsp;·&nbsp; ${DATE} &nbsp;·&nbsp; Doc ${code} &nbsp;·&nbsp; live data from the portal</p></header>
<div class="stats"><div class="stat"><div class="n">${data.catalog.length}</div><div class="l">Active trainings</div></div>
<div class="stat"><div class="n">${data.records.length}</div><div class="l">Completions recorded</div></div>
<div class="stat"><div class="n">${distinct}</div><div class="l">Distinct ${who} completed</div></div></div>
<div class="callout"><b>Completion = evidence.</b> Each learner works through every lesson; the record below is stamped per person at completion. Generated from live portal data — re-generate to refresh.</div>
<h2>1. Training catalog</h2>${catalogTable(data.catalog, who)}
<h2>2. Completion records (${data.records.length})</h2>${recordsTable(data.records, withMethod)}
<p class="footnote">Live snapshot as of ${DATE}. Controlled document — supersedes the combined REG-TRN-001. Source of truth: the portal database.</p>
</main></body></html>`;
}

fs.mkdirSync(outDir, { recursive: true });
const staff = JSON.parse(fs.readFileSync(staffPath, "utf8"));
const vendor = JSON.parse(fs.readFileSync(vendorPath, "utf8"));
fs.writeFileSync(`${outDir}/Cethos-Vendor-Training-Register.html`, register({ code: "REG-TRN-V-001", title: "Vendor Training Register", who: "vendor", data: vendor, withMethod: true }));
fs.writeFileSync(`${outDir}/Cethos-Staff-Training-Register.html`, register({ code: "REG-TRN-S-001", title: "Staff Training Register", who: "staff", data: staff, withMethod: false }));
console.log(`vendor: ${vendor.catalog.length} trainings, ${vendor.records.length} records · staff: ${staff.catalog.length} trainings, ${staff.records.length} records`);
