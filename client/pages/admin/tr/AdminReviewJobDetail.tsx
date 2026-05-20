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
  listJobComments,
  listJobShareTokens,
  trApi,
  type TRReviewJob,
  type TRJobFile,
  type TRFilePair,
  type TRFinding,
  type TRJobPlan,
  type TRAuditLogRow,
  type TRJobComment,
  type TRJobShareToken,
  type LanguageRow,
} from "@/lib/tr";
import { supabase } from "@/lib/supabase";
import StructuredDiff, { type DiffRow } from "@/components/admin/StructuredDiff";

type TabKey = "preflight" | "plan" | "findings" | "comments" | "audit" | "deliverables";

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

  // Comments + close + share
  const [comments, setComments] = useState<TRJobComment[]>([]);
  const [tokens, setTokens] = useState<TRJobShareToken[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [postingFindingId, setPostingFindingId] = useState<string | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeOutcome, setCloseOutcome] = useState<"complete" | "cancelled">("complete");
  const [closeReason, setCloseReason] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareName, setShareName] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [shareExpires, setShareExpires] = useState(30);
  const [orderCustomer, setOrderCustomer] = useState<{
    order_number: string;
    customer_id: string;
    full_name: string;
  } | null>(null);

  async function refresh() {
    if (!id) return;
    setLoading(true);
    try {
      const [j, f, p, fin, pl, au, ls, co, tk] = await Promise.all([
        getReviewJob(id), listJobFiles(id), listFilePairs(id), listFindings(id),
        listJobPlans(id), listAuditLog(id), listLanguages(),
        listJobComments(id), listJobShareTokens(id),
      ]);
      setJob(j);
      setFiles(f);
      setPairs(p);
      setFindings(fin);
      setPlans(pl);
      setAudit(au);
      setLangs(Object.fromEntries(ls.map((x) => [x.id, x])));
      setComments(co);
      setTokens(tk);

      // Resolve linked order customer for the match-badge in the header.
      // Pull the first linked_order_id from any job_file; that's the order
      // this QM was started from.
      const linkedOrderId = f.find((x) => x.linked_order_id)?.linked_order_id ?? null;
      if (linkedOrderId) {
        const { data: orderRow } = await supabase
          .from("orders")
          .select("order_number, customer_id, customers(full_name)")
          .eq("id", linkedOrderId)
          .maybeSingle();
        if (orderRow) {
          setOrderCustomer({
            order_number: (orderRow as any).order_number,
            customer_id: (orderRow as any).customer_id,
            full_name: (orderRow as any).customers?.full_name ?? "",
          });
        } else {
          setOrderCustomer(null);
        }
      } else {
        setOrderCustomer(null);
      }
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

  const isClosed = ["complete", "cancelled"].includes(job.status);
  // Match badge: client_name on the job vs the linked order's customer
  // full_name. Visible only when we resolved a linked order. Case-insensitive
  // trim compare.
  const customerMatchState: "match" | "mismatch" | "missing" | "no-order" =
    !orderCustomer
      ? "no-order"
      : !job.client_name
        ? "missing"
        : job.client_name.trim().toLowerCase() === orderCustomer.full_name.trim().toLowerCase()
          ? "match"
          : "mismatch";

  async function doAddComment() {
    if (!id || !commentDraft.trim()) return;
    setBusy("comment");
    try {
      await trApi.addComment({ job_id: id, body: commentDraft.trim() });
      setCommentDraft("");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  // Drop a finding into the Comments thread with structured context the
  // translator can answer without re-opening the file.
  async function postFindingAsComment(f: TRFinding) {
    if (!id) return;
    const lines: string[] = [];
    lines.push(`Finding #${f.finding_number} (${f.severity} · ${f.category})`);
    if (f.source_text) lines.push(`Source: ${f.source_text}`);
    if (f.current_translation) {
      lines.push(`Currently in target: ${f.current_translation}`);
    } else if (f.current_translation === null) {
      // Claude explicitly said "no text in target" — surface that.
      lines.push(`Currently in target: (empty / missing)`);
    }
    if (f.proposed_change) lines.push(`Proposed: ${f.proposed_change}`);
    if (f.english_back_translation) lines.push(`EN back-translation: ${f.english_back_translation}`);
    if (f.rationale) lines.push("", f.rationale);
    const body = lines.join("\n");
    setPostingFindingId(f.id);
    try {
      await trApi.addComment({ job_id: id, body });
      await refresh();
      setTab("comments");
    } catch (e) {
      setError(String(e));
    } finally {
      setPostingFindingId(null);
    }
  }

  async function doCloseJob() {
    if (!id) return;
    setBusy("close");
    try {
      await trApi.closeJob({ job_id: id, outcome: closeOutcome, reason: closeReason.trim() || null });
      setCloseOpen(false);
      setCloseReason("");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function doCreateShare() {
    if (!id || !shareEmail.trim()) return;
    setBusy("share");
    try {
      const r = await trApi.vendorShareCreate({
        job_id: id,
        recipient_email: shareEmail.trim(),
        recipient_name: shareName.trim() || undefined,
        message: shareMessage.trim() || undefined,
        expires_in_days: shareExpires,
      });
      setShareOpen(false);
      setShareEmail("");
      setShareName("");
      setShareMessage("");
      alert(
        `Share link created and ${r.email_status === "sent" ? "emailed" : `not emailed (${r.email_status})`}.\n\n${r.share_url}`,
      );
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex-1">
          <Link to="/admin/tr/jobs" className="text-sm text-blue-700 hover:underline">← Back to jobs</Link>
          <h1 className="text-2xl font-semibold mt-1">{job.title || job.client_name || job.id.slice(0, 8)}</h1>
          <div className="text-sm text-gray-600 flex flex-wrap gap-3 mt-1 items-center">
            <span>Kind: <Badge variant="outline">{job.job_kind}</Badge></span>
            <span>Round: {job.review_round}
              {job.round_color_hex && <span className="inline-block w-3 h-3 rounded ml-1 align-middle" style={{ backgroundColor: job.round_color_hex }} />}
            </span>
            <span>Lang: {langs[job.source_language_id]?.code ?? "?"} → {langs[job.target_language_id]?.code ?? "?"}</span>
            <span>Status: <Badge>{job.status.replace(/_/g, " ")}</Badge></span>
          </div>
          {/* Customer-match badge — links to the order this QM was started from. */}
          {orderCustomer && (
            <div className="mt-2 text-xs flex items-center gap-2">
              <Link to={`/admin/orders/${orderCustomer.order_number ? "" : ""}`} className="text-gray-500">
                Linked order: <span className="font-mono text-gray-700">{orderCustomer.order_number}</span>
              </Link>
              <span className="text-gray-400">·</span>
              {customerMatchState === "match" && (
                <span className="text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded">
                  ✓ client name matches order customer ({orderCustomer.full_name})
                </span>
              )}
              {customerMatchState === "mismatch" && (
                <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded" title={`order customer: ${orderCustomer.full_name}`}>
                  ⚠ client name differs from order customer ({orderCustomer.full_name})
                </span>
              )}
              {customerMatchState === "missing" && (
                <span className="text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded">
                  no client name on job — order customer: {orderCustomer.full_name}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 items-end shrink-0">
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="border-purple-400 text-purple-700 hover:bg-purple-50"
              onClick={() => setShareOpen(true)}
              disabled={isClosed}
              title={isClosed ? "Job is closed" : "Send a tokenized share link to the translator"}
            >
              Send to translator
            </Button>
            <Button
              variant="outline"
              className="border-red-400 text-red-700 hover:bg-red-50"
              onClick={() => setCloseOpen(true)}
              disabled={isClosed}
              title={isClosed ? `Already ${job.close_outcome ?? job.status}` : "Close this job"}
            >
              {isClosed ? `Closed (${job.close_outcome ?? job.status})` : "Close job"}
            </Button>
          </div>
          {tokens.length > 0 && (
            <div className="text-[11px] text-gray-500 text-right">
              {tokens.filter((t) => !t.revoked_at).length} active share{tokens.length === 1 ? "" : "s"}
            </div>
          )}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded mb-3">{error}</div>}

      {/* Tabs */}
      <div className="border-b mb-4 flex gap-1 flex-wrap">
        {(["preflight", "plan", "findings", "comments", "audit", "deliverables"] as TabKey[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === t ? "border-blue-600 text-blue-700" : "border-transparent text-gray-600 hover:text-gray-900"}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === "comments" && comments.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 text-[10px] rounded-full bg-gray-100 text-gray-700">
                {comments.length}
              </span>
            )}
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
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-mono text-xs">#{f.finding_number}</span>
                  <Badge className={`uppercase text-[10px] ${SEVERITY_TONE[f.severity] ?? ""}`}>{f.severity}</Badge>
                  <Badge variant="outline" className="text-[10px]">{f.category}</Badge>
                  <Badge variant="outline" className="text-[10px]">{f.confidence}</Badge>
                  <Badge variant="outline" className="text-[10px]">{f.application_mode}</Badge>
                  <Badge variant="outline" className={`text-[10px] ${f.application_status === "applied" ? "bg-green-100 text-green-800" : "bg-gray-100"}`}>{f.application_status}</Badge>
                  <div className="ml-auto">
                    <button
                      type="button"
                      className="text-[11px] text-purple-700 hover:text-purple-900 underline disabled:opacity-50"
                      disabled={postingFindingId === f.id || isClosed}
                      onClick={() => void postFindingAsComment(f)}
                      title="Drop this finding into the Comments thread so the translator can respond"
                    >
                      {postingFindingId === f.id ? "Posting..." : "Post as comment"}
                    </button>
                  </div>
                </div>
                {f.source_text != null && <div className="text-xs"><span className="font-semibold">Source:</span> {f.source_text || <span className="italic text-gray-500">(empty)</span>}</div>}
                {f.current_translation != null && <div className="text-xs"><span className="font-semibold">Currently in target:</span> {f.current_translation || <span className="italic text-gray-500">(empty / missing)</span>}</div>}
                {f.proposed_change && <div className="text-xs"><span className="font-semibold">Proposed:</span> {f.proposed_change}</div>}
                {f.english_back_translation && <div className="text-xs"><span className="font-semibold">EN back-translation:</span> {f.english_back_translation}</div>}
                {f.rationale && <div className="text-xs text-gray-700 mt-1">{f.rationale}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Comments tab */}
      {tab === "comments" && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Comments &amp; activity</h2>
            <div className="text-xs text-gray-500">
              {comments.length} entr{comments.length === 1 ? "y" : "ies"}
            </div>
          </div>

          {/* Active share tokens — shown above the thread so staff can copy
              a link without leaving the page. */}
          {tokens.length > 0 && (
            <div className="border rounded bg-purple-50 border-purple-200 p-3 text-sm">
              <div className="font-medium text-purple-900 mb-1">Translator share links</div>
              <div className="space-y-1">
                {tokens.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="text-purple-900 font-medium">{t.recipient_name || t.recipient_email}</span>{" "}
                      <span className="text-purple-700">&lt;{t.recipient_email}&gt;</span>
                      <span className="text-purple-500 ml-2">
                        {t.revoked_at
                          ? "revoked"
                          : new Date(t.expires_at).getTime() < Date.now()
                            ? "expired"
                            : `expires ${new Date(t.expires_at).toLocaleDateString()}`}
                      </span>
                      {t.use_count > 0 && (
                        <span className="text-purple-500 ml-2">· opened {t.use_count}×</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="text-purple-700 hover:text-purple-900 underline"
                      onClick={() => {
                        const url = `${window.location.origin}/tr/share/${t.token}`;
                        navigator.clipboard.writeText(url).catch(() => {});
                      }}
                    >
                      Copy link
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Thread */}
          <div className="border rounded bg-white">
            {comments.length === 0 && (
              <div className="p-4 text-center text-gray-500 italic">No comments yet.</div>
            )}
            {comments.map((c) => {
              const tone =
                c.author_type === "staff"
                  ? "border-l-blue-400 bg-blue-50"
                  : c.author_type === "vendor"
                    ? "border-l-purple-400 bg-purple-50"
                    : "border-l-gray-400 bg-gray-50";
              const kindBadge =
                c.kind === "close_note"
                  ? <Badge variant="outline" className="text-red-700 border-red-300">close</Badge>
                  : c.kind === "file_replacement"
                    ? <Badge variant="outline" className="text-purple-700 border-purple-300">new version</Badge>
                    : c.kind === "status_note"
                      ? <Badge variant="outline" className="text-gray-700 border-gray-300">status</Badge>
                      : null;
              return (
                <div key={c.id} className={`border-b last:border-b-0 border-l-4 ${tone} p-3`}>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="font-medium text-gray-900">{c.author_name}</span>
                    <Badge variant="outline" className="text-[10px]">{c.author_type}</Badge>
                    {kindBadge}
                    <span className="text-gray-400">·</span>
                    <span>{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <div className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{c.body}</div>
                  {Array.isArray(c.files_jsonb) && c.files_jsonb.length > 0 && (
                    <div className="mt-2 text-xs space-y-0.5">
                      {(c.files_jsonb as Array<{ original_filename?: string; storage_path?: string }>).map((f, i) => (
                        <div key={i} className="text-gray-600">📎 {f.original_filename ?? f.storage_path ?? "attachment"}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Composer */}
          {!isClosed && (
            <div className="border rounded bg-white p-3 space-y-2">
              <Textarea
                placeholder="Write a comment for the thread. Translator will see this if you share the job with them."
                rows={3}
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
              />
              <div className="flex justify-end">
                <Button
                  onClick={doAddComment}
                  disabled={busy === "comment" || commentDraft.trim().length === 0}
                >
                  {busy === "comment" ? "Posting..." : "Post comment"}
                </Button>
              </div>
            </div>
          )}
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

      {/* Close-job modal */}
      {closeOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => !busy && setCloseOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b">
              <h3 className="text-lg font-semibold">Close job</h3>
              <p className="text-xs text-gray-500 mt-1">
                Closing moves the job to a terminal state and posts a system comment. Cannot be undone via the UI.
              </p>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Outcome</label>
                <div className="flex gap-3 text-sm">
                  <label className="flex items-center gap-1">
                    <input type="radio" checked={closeOutcome === "complete"} onChange={() => setCloseOutcome("complete")} />
                    Complete (QM passed)
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="radio" checked={closeOutcome === "cancelled"} onChange={() => setCloseOutcome("cancelled")} />
                    Cancel (abandon)
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Reason / note (optional)</label>
                <Textarea
                  rows={3}
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  placeholder="Why is the job being closed?"
                />
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCloseOpen(false)} disabled={busy === "close"}>Cancel</Button>
              <Button
                onClick={doCloseJob}
                disabled={busy === "close"}
                className={closeOutcome === "complete" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
              >
                {busy === "close" ? "Closing..." : closeOutcome === "complete" ? "Mark complete" : "Cancel job"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Share-with-translator modal */}
      {shareOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => !busy && setShareOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b">
              <h3 className="text-lg font-semibold">Send to translator</h3>
              <p className="text-xs text-gray-500 mt-1">
                Creates a tokenized link the recipient can use without a Cethos login. They can read comments, reply, and upload a new version of the file.
              </p>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Recipient email *</label>
                <input
                  type="email"
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  placeholder="translator@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Recipient name (optional)</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                  value={shareName}
                  onChange={(e) => setShareName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Expires in (days)</label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  className="w-32 border border-gray-300 rounded px-2 py-1 text-sm"
                  value={shareExpires}
                  onChange={(e) => setShareExpires(Math.max(1, Math.min(90, Number(e.target.value) || 30)))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Message (optional)</label>
                <Textarea
                  rows={3}
                  value={shareMessage}
                  onChange={(e) => setShareMessage(e.target.value)}
                  placeholder="Note shown in the email and visible on the share page."
                />
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShareOpen(false)} disabled={busy === "share"}>Cancel</Button>
              <Button onClick={doCreateShare} disabled={busy === "share" || !shareEmail.trim()}>
                {busy === "share" ? "Sending..." : "Create &amp; email link"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
