// Translation Review job detail with 6 tabs: Preflight, Plan, Findings, Audit,
// Deliverables, plus a header summary. The Intake tab in the spec is folded
// into the New Job page (AdminReviewJobNew); after creation, the user lands
// on this page in the Preflight tab.

import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  getReviewJob,
  listJobFiles,
  listFilePairs,
  listFindings,
  listJobPlans,
  listAuditLog,
  listLanguages,
  trApi,
  type TRReviewJob,
  type TRJobFile,
  type TRFilePair,
  type TRFinding,
  type TRJobPlan,
  type TRAuditLogRow,
  type LanguageRow,
} from "@/lib/tr";
import StructuredDiff, { type DiffRow } from "@/components/admin/StructuredDiff";

type TabKey = "preflight" | "plan" | "findings" | "audit" | "deliverables";

const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-red-200 text-red-900",
  major: "bg-orange-200 text-orange-900",
  minor: "bg-yellow-100 text-yellow-800",
  info: "bg-blue-100 text-blue-800",
};

export default function AdminReviewJobDetail() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<TabKey>("preflight");
  const [job, setJob] = useState<TRReviewJob | null>(null);
  const [files, setFiles] = useState<TRJobFile[]>([]);
  const [pairs, setPairs] = useState<TRFilePair[]>([]);
  const [findings, setFindings] = useState<TRFinding[]>([]);
  const [plans, setPlans] = useState<TRJobPlan[]>([]);
  const [audit, setAudit] = useState<TRAuditLogRow[]>([]);
  const [langs, setLangs] = useState<Record<string, LanguageRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [clientEmailDraft, setClientEmailDraft] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [confirmationChecks, setConfirmationChecks] = useState<Record<string, boolean>>({});

  async function refresh() {
    if (!id) return;
    setLoading(true);
    try {
      const [j, f, p, fin, pl, au, ls] = await Promise.all([
        getReviewJob(id), listJobFiles(id), listFilePairs(id), listFindings(id),
        listJobPlans(id), listAuditLog(id), listLanguages(),
      ]);
      setJob(j);
      setFiles(f);
      setPairs(p);
      setFindings(fin);
      setPlans(pl);
      setAudit(au);
      setLangs(Object.fromEntries(ls.map((x) => [x.id, x])));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, [id]);

  const latestPlan = useMemo(() => plans[0] ?? null, [plans]);

  async function doPreflight() {
    if (!id) return;
    setBusy("preflight");
    try {
      const r = await trApi.preflight({ job_id: id });
      if (r.status === "preflight_blocked") {
        alert(`Pre-flight blocked: ${r.warnings.map((w) => (w as Record<string, unknown>).message).join("; ")}`);
      }
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function doGeneratePlan() {
    if (!id) return;
    setBusy("plan");
    try {
      const text = clientEmailDraft || files.filter((f) => f.role === "client_email")[0]?.original_filename ? clientEmailDraft || "" : null;
      await trApi.generateJobPlan({ job_id: id, client_email_text: text || null });
      await refresh();
      setTab("plan");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function doApprovePlan() {
    if (!id || !latestPlan) return;
    const checks = normalizedChecks;
    const missing = checks.filter((c) => !confirmationChecks[c.id]);
    if (missing.length) {
      alert(`Tick all confirmation checkboxes (${missing.length} remaining).`);
      return;
    }
    setBusy("approve");
    try {
      await trApi.approveJobPlan({ job_id: id, plan_id: latestPlan.id, confirmation_checks: confirmationChecks });
      await refresh();
      setTab("findings");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function doReview() {
    if (!id) return;
    setBusy("review");
    try {
      const r = await trApi.review({ job_id: id, user_message: reviewMessage || null });
      alert(`Claude returned ${r.findings_count} findings (outcome=${r.outcome}).`);
      setReviewMessage("");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function doApply() {
    if (!id) return;
    setBusy("apply");
    try {
      const r = await trApi.applyFindings({ job_id: id });
      alert(`Applied ${r.applied} findings across ${r.output_files.length} pair(s).`);
      await refresh();
      setTab("deliverables");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function downloadFile(file_id: string) {
    const { url } = await trApi.getSignedUrl({ file_id });
    window.open(url, "_blank");
  }

  if (!id) return <div className="p-6">Missing job id.</div>;
  if (loading && !job) return <div className="p-6 text-gray-500">Loading...</div>;
  if (!job) return <div className="p-6 text-red-700">Job not found.</div>;

  const emailRows: DiffRow[] = (latestPlan?.email_alignment_jsonb as { rows?: DiffRow[] } | null)?.rows ?? [];
  const emailSummary = (latestPlan?.email_alignment_jsonb as { summary?: string } | null)?.summary ?? null;
  // Claude may emit required_confirmation_checks as bare strings OR as
  // {id, label} objects. Normalize both into {id, label} so the renderer
  // and the doApprovePlan validator can rely on a single shape.
  const rawChecks =
    (latestPlan?.plan_jsonb as { required_confirmation_checks?: unknown } | null)
      ?.required_confirmation_checks ?? [];
  const normalizedChecks: Array<{ id: string; label: string }> = Array.isArray(rawChecks)
    ? rawChecks.map((c, i) => {
        if (typeof c === "string") {
          return { id: `check_${i + 1}`, label: c };
        }
        if (c && typeof c === "object") {
          const obj = c as { id?: string; label?: string; text?: string; description?: string };
          const label = obj.label ?? obj.text ?? obj.description ?? obj.id ?? `Check ${i + 1}`;
          const id = obj.id ?? `check_${i + 1}`;
          return { id, label };
        }
        return { id: `check_${i + 1}`, label: String(c) };
      })
    : [];
  const requiredChecks = normalizedChecks;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Link to="/admin/tr/jobs" className="text-sm text-blue-700 hover:underline">← Back to jobs</Link>
          <h1 className="text-2xl font-semibold mt-1">{job.title || job.client_name || job.id.slice(0, 8)}</h1>
          <div className="text-sm text-gray-600 flex gap-3 mt-1">
            <span>Kind: <Badge variant="outline">{job.job_kind}</Badge></span>
            <span>Round: {job.review_round}
              {job.round_color_hex && <span className="inline-block w-3 h-3 rounded ml-1 align-middle" style={{ backgroundColor: job.round_color_hex }} />}
            </span>
            <span>Lang: {langs[job.source_language_id]?.code ?? "?"} → {langs[job.target_language_id]?.code ?? "?"}</span>
            <span>Status: <Badge>{job.status.replace(/_/g, " ")}</Badge></span>
          </div>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded mb-3">{error}</div>}

      {/* Tabs */}
      <div className="border-b mb-4 flex gap-1">
        {(["preflight", "plan", "findings", "audit", "deliverables"] as TabKey[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === t ? "border-blue-600 text-blue-700" : "border-transparent text-gray-600 hover:text-gray-900"}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Preflight tab */}
      {tab === "preflight" && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Pre-flight verification</h2>
            <Button onClick={doPreflight} disabled={busy === "preflight"}>
              {busy === "preflight" ? "Running..." : "Run pre-flight"}
            </Button>
          </div>
          <div className="border rounded bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-2">File</th>
                  <th className="text-left p-2">Role</th>
                  <th className="text-left p-2">Expected marker</th>
                  <th className="text-left p-2">Actual marker</th>
                  <th className="text-left p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id} className="border-b last:border-b-0">
                    <td className="p-2">{f.original_filename}
                      <div className="text-xs text-gray-500">{f.source_kind === "uploaded" ? "uploaded" : `linked: ${f.source_kind.replace("linked_", "")}`}</div>
                    </td>
                    <td className="p-2 text-xs">{f.role}</td>
                    <td className="p-2 text-xs font-mono">{f.expected_marker ?? "—"}</td>
                    <td className="p-2 text-xs font-mono">{f.actual_marker ?? "—"}</td>
                    <td className="p-2">
                      {f.verified
                        ? <Badge className="bg-green-100 text-green-800">Verified</Badge>
                        : <Badge variant="outline">Unverified</Badge>}
                    </td>
                  </tr>
                ))}
                {files.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-gray-500 italic">No files attached.</td></tr>}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="font-semibold mt-4 mb-2">Generate Job Plan</h3>
            <Textarea
              placeholder="(Optional) Paste client email content here to drive the email-vs-plan alignment check."
              value={clientEmailDraft}
              onChange={(e) => setClientEmailDraft(e.target.value)}
              rows={4}
            />
            <Button className="mt-2" onClick={doGeneratePlan} disabled={busy === "plan"}>
              {busy === "plan" ? "Calling Claude..." : "Generate Job Plan"}
            </Button>
          </div>
        </section>
      )}

      {/* Plan tab */}
      {tab === "plan" && (
        <section className="space-y-4">
          <h2 className="font-semibold">Job Plan {latestPlan ? `v${latestPlan.version}` : ""}</h2>
          {!latestPlan && <div className="text-gray-500 italic">No plan generated yet — run pre-flight then Generate Job Plan.</div>}
          {latestPlan && (
            <>
              {emailRows.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-1">Email vs. Plan alignment</h3>
                  <StructuredDiff leftLabel="Client email says" rightLabel="Job plan says" rows={emailRows} summary={emailSummary} />
                </div>
              )}
              <details className="border rounded p-3 bg-white">
                <summary className="cursor-pointer font-medium">Plan JSON (raw)</summary>
                <pre className="text-xs overflow-auto mt-2">{JSON.stringify(latestPlan.plan_jsonb, null, 2)}</pre>
              </details>
              {latestPlan.approval_status !== "approved" ? (
                <div className="border rounded p-3 bg-yellow-50">
                  <h3 className="font-semibold mb-2">Approval — tick every box, then approve</h3>
                  <div className="space-y-2">
                    {requiredChecks.length === 0 && <div className="text-sm text-gray-600 italic">Plan declared no required confirmations.</div>}
                    {requiredChecks.map((c) => (
                      <label key={c.id} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!!confirmationChecks[c.id]}
                          onChange={(e) => setConfirmationChecks((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                          className="mt-0.5"
                        />
                        <span>{c.label ?? c.id}</span>
                      </label>
                    ))}
                  </div>
                  <Button className="mt-3" onClick={doApprovePlan} disabled={busy === "approve"}>
                    {busy === "approve" ? "Approving..." : "Approve Job Plan"}
                  </Button>
                </div>
              ) : (
                <div className="border rounded p-3 bg-green-50 text-sm">
                  Approved by {latestPlan.approved_by} at {latestPlan.approved_at}.
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Findings tab */}
      {tab === "findings" && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Findings</h2>
            <div className="flex gap-2">
              <Button variant="outline" onClick={doApply} disabled={busy === "apply" || findings.filter((f) => f.application_status === "pending").length === 0}>
                {busy === "apply" ? "Applying..." : "Apply pending to .docx"}
              </Button>
              <Button onClick={doReview} disabled={busy === "review"}>
                {busy === "review" ? "Calling Claude..." : "Run review"}
              </Button>
            </div>
          </div>
          <Textarea placeholder="(Optional) Extra instructions for this Claude call — e.g. 'we got new files from the PM'" value={reviewMessage} onChange={(e) => setReviewMessage(e.target.value)} rows={2} />
          <div className="border rounded bg-white">
            {findings.length === 0 && <div className="p-4 text-gray-500 italic text-center">No findings yet — click "Run review" to produce them.</div>}
            {findings.map((f) => (
              <div key={f.id} className="border-b last:border-b-0 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs">#{f.finding_number}</span>
                  <Badge className={`uppercase text-[10px] ${SEVERITY_TONE[f.severity] ?? ""}`}>{f.severity}</Badge>
                  <Badge variant="outline" className="text-[10px]">{f.category}</Badge>
                  <Badge variant="outline" className="text-[10px]">{f.confidence}</Badge>
                  <Badge variant="outline" className="text-[10px]">{f.application_mode}</Badge>
                  <Badge variant="outline" className={`text-[10px] ${f.application_status === "applied" ? "bg-green-100 text-green-800" : "bg-gray-100"}`}>{f.application_status}</Badge>
                </div>
                {f.source_text && <div className="text-xs"><span className="font-semibold">Source:</span> {f.source_text}</div>}
                {f.current_translation && <div className="text-xs"><span className="font-semibold">Current:</span> {f.current_translation}</div>}
                {f.proposed_change && <div className="text-xs"><span className="font-semibold">Proposed:</span> {f.proposed_change}</div>}
                {f.english_back_translation && <div className="text-xs"><span className="font-semibold">EN back-translation:</span> {f.english_back_translation}</div>}
                {f.rationale && <div className="text-xs text-gray-700 mt-1">{f.rationale}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Audit tab */}
      {tab === "audit" && (
        <section className="space-y-2">
          <h2 className="font-semibold">Audit log</h2>
          <div className="border rounded bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-2">When</th>
                  <th className="text-left p-2">Action</th>
                  <th className="text-left p-2">Actor</th>
                  <th className="text-left p-2">Payload</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="border-b last:border-b-0">
                    <td className="p-2 text-xs whitespace-nowrap">{new Date(a.occurred_at).toLocaleString()}</td>
                    <td className="p-2 text-xs font-mono">{a.action}</td>
                    <td className="p-2 text-xs">{a.actor_email ?? "system"}</td>
                    <td className="p-2 text-xs"><pre className="max-w-md overflow-auto">{JSON.stringify(a.payload, null, 2)}</pre></td>
                  </tr>
                ))}
                {audit.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-gray-500 italic">No audit entries yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Deliverables tab */}
      {tab === "deliverables" && (
        <section className="space-y-2">
          <h2 className="font-semibold">Deliverables</h2>
          <div className="border rounded bg-white">
            {files.filter((f) => f.role === "output").length === 0 && <div className="p-4 text-gray-500 italic text-center">No output files yet — run "Apply pending to .docx" on the Findings tab.</div>}
            {files.filter((f) => f.role === "output").map((f) => (
              <div key={f.id} className="border-b last:border-b-0 p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{f.original_filename}</div>
                  <div className="text-xs text-gray-500">created {new Date(f.created_at).toLocaleString()} · {f.bytes ? `${(f.bytes / 1024).toFixed(0)} KB` : ""}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => void downloadFile(f.id)}>Download</Button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
