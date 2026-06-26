// Build REG-TRN-001 "Training Register" — trainings classified into STAFF vs VENDOR.
//   node e2e/build-training-register.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO = path.join(__dirname, "..", "tmp", "doc-build", "img", "cethos-logo.png");
const OUT = path.join(__dirname, "..", "docs", "guides", "Cethos-Training-Register.html");
const DOC = { title: "Training Register", code: "REG-TRN-001", version: "1.1", date: "26 June 2026" };
const TEAL = "0F9DA0", SLATE = "334155", GREY = "64748B";
const logo = `data:image/png;base64,${fs.readFileSync(LOGO).toString("base64")}`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// audience='staff' interactive modules (taken at /admin/trainings)
const staffModules = [
  ["CAPA & Complaint Handling", "Quality", "5", "5 Q", "Closed-loop complaint → NC → root cause → CAPA → closure, via a real worked example. <strong>New.</strong>"],
  ["Vendor Management", "Vendor management", "23", "—", "Applicant-to-active pipeline + the full PM workflow (assign, payables, invoicing)."],
];
// audience='linguist' interactive modules (taken by vendors in the vendor portal)
const vendorModules = [
  ["COA Linguistic Validation", "COA / clinical", "4", "—", "ISPOR/FDA-aligned LV workflow, cognitive debriefing, documentation."],
  ["Confidentiality & Data Protection", "Compliance", "4", "—", "NDA, PHI/PII, GDPR, incident reporting. Required for all vendors."],
  ["GCP for Clinical Linguists", "GCP", "3", "—", "ICH E6 essentials: data integrity, trial-data confidentiality, responsibilities."],
  ["ISO 17100 Process & QA", "Quality", "4", "—", "Translate-edit-proofread, reviser independence, QA, handling feedback."],
];
// controlled staff training guides (Documents & Manuals)
const guides = [
  ["TRN-COA-001", "Logging COA Jobs & Client Review Rounds", "HTML guide", "2.0"],
  ["TRN-RWS-001", "Onboarding an RWS Linguistic-Validation PO", ".docx guide", "1.0"],
];

const modRow = (m) => `<tr><td><strong>${esc(m[0])}</strong></td><td>${m[1]}</td><td style="text-align:center">${m[2]}</td><td style="text-align:center">${m[3]}</td><td>${m[4]}</td></tr>`;
const modTable = (rows) => `<table><thead><tr><th>Training</th><th>Topic</th><th>Lessons</th><th>Quiz</th><th>Covers</th></tr></thead><tbody>${rows.map(modRow).join("\n")}</tbody></table>`;
const guideRows = guides.map((g) => `<tr><td class="mono">${esc(g[0])}</td><td><strong>${esc(g[1])}</strong></td><td>${g[2]}</td><td style="text-align:center">${g[3]}</td></tr>`).join("\n");

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(DOC.title)} — Cethos (${esc(DOC.code)})</title>
<style>
 :root{--teal:#${TEAL};--slate:#${SLATE};--grey:#${GREY};--line:#E2E8F0;--soft:#F8FAFC;}
 *{box-sizing:border-box} body{margin:0;background:#EEF2F5;color:var(--slate);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;}
 .page{max-width:980px;margin:24px auto;background:#fff;padding:48px 56px;border-radius:12px;box-shadow:0 1px 3px rgba(15,23,42,.08),0 8px 24px rgba(15,23,42,.06);}
 .logo{height:34px;display:block;margin-bottom:18px}
 h1{font-size:30px;color:var(--teal);margin:0 0 6px;font-weight:800}
 .subtitle{color:var(--grey);margin:0 0 4px;font-size:15px}
 .meta{color:var(--grey);font-size:13px;font-weight:700;margin:0;letter-spacing:.02em}
 .cover{border-bottom:3px solid var(--teal);padding-bottom:18px;margin-bottom:24px}
 h2{color:var(--teal);font-size:20px;margin:34px 0 4px;padding-top:14px;border-top:1px solid var(--line);font-weight:800}
 .grouptag{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#0B5e60;background:#E2F3F3;border-radius:6px;padding:2px 9px;margin:2px 0 8px}
 p{margin:0 0 12px} ul{margin:0 0 12px;padding-left:22px} li{margin:0 0 6px}
 table{border-collapse:collapse;width:100%;margin:8px 0 14px;font-size:14px}
 th,td{border:1px solid #CBD5E1;padding:8px 11px;text-align:left;vertical-align:top}
 thead th{background:#E2F3F3;color:#0B5e60;font-weight:700}
 tbody tr:nth-child(even){background:var(--soft)}
 .mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;color:#475569}
 .callout{background:var(--soft);border:1px solid var(--line);border-left:5px solid var(--teal);border-radius:8px;padding:14px 18px;margin:16px 0}
 .callout b{color:var(--teal)}
 .note{font-size:13px;color:var(--grey)}
 .footnote{color:var(--grey);font-size:13px;font-style:italic;margin-top:26px;border-top:1px solid var(--line);padding-top:14px}
 @media print{body{background:#fff}.page{box-shadow:none;margin:0;max-width:none;border-radius:0;padding:0}}
</style></head><body><main class="page">
<header class="cover">
 <img class="logo" src="${logo}" alt="Cethos">
 <h1>Training Register</h1>
 <p class="subtitle">Index of all Cethos trainings, classified by audience — Staff and Vendor</p>
 <p class="meta">Version ${DOC.version} &nbsp;·&nbsp; ${DOC.date} &nbsp;·&nbsp; Doc ${DOC.code}</p>
</header>

<p>This register lists every active Cethos training, <strong>classified into two audiences</strong>. Trainings provide the competence and training-record evidence required by ISO 17100 and the IQVIA audit.</p>
<ul>
 <li><strong>Staff trainings</strong> — for internal Cethos staff; taken in the admin portal at <span class="mono">/admin/trainings</span>.</li>
 <li><strong>Vendor trainings</strong> — for vendors/linguists; taken in the vendor portal.</li>
</ul>
<div class="callout"><b>Completion = evidence.</b> For interactive modules, each learner acknowledges every lesson; the assignment is stamped complete and recorded per person. For guides, completion is recorded on <span class="mono">FORM-TR-001</span> (Staff Training &amp; Competence Record).</div>

<h2>1. Staff trainings</h2>
<span class="grouptag">Audience: Staff</span>
${modTable(staffModules)}

<h3 style="font-size:15px;color:var(--slate);margin:14px 0 4px">Staff training guides (Documents &amp; Manuals)</h3>
<table><thead><tr><th>Code</th><th>Title</th><th>Format</th><th>Ver.</th></tr></thead><tbody>${guideRows}</tbody></table>

<h2>2. Vendor trainings</h2>
<span class="grouptag">Audience: Vendor / linguist</span>
${modTable(vendorModules)}
<p class="note">Taken by vendors in the vendor portal. Pass threshold 80% where a quiz is enabled.</p>

<h2>3. Records &amp; control</h2>
<ul>
 <li><strong>Training records</strong> — <span class="mono">FORM-TR-001</span> Staff Training &amp; Competence Record captures who completed what, when, and the evidence.</li>
 <li><strong>This register is controlled</strong> — re-version it whenever a training is added, retired, re-classified, or materially changed.</li>
 <li><strong>Related QMS registers</strong> — <span class="mono">QM-002</span> List of SOPs; <span class="mono">REG-SP-001</span> Sub-processor Register.</li>
</ul>

<p class="footnote">Reflects active trainings as of ${DOC.date}. Source of truth: the portal (cvp_trainings, audience = staff | linguist) + Documents &amp; Manuals.</p>
</main></body></html>`;

fs.writeFileSync(OUT, html);
console.log("wrote", OUT, (Buffer.byteLength(html) / 1024).toFixed(0), "KB");
