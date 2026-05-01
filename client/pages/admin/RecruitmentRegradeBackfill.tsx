import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, ArrowLeft, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

interface JobRow {
  id: string;
  prompt_version: string | null;
  total: number;
  completed: number;
  errored: number;
  status: "pending" | "running" | "completed" | "errored" | "cancelled";
  started_at: string | null;
  completed_at: string | null;
  log: Array<{ submissionId: string; ok: boolean; error?: string }>;
  created_at: string;
}

async function callBackfill(payload: Record<string, unknown>) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const session = (await supabase.auth.getSession()).data.session;
  const res = await fetch(
    `${supabaseUrl}/functions/v1/cvp-backfill-regrade-and-send-v22`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${session?.access_token ?? supabaseKey}`,
      },
      body: JSON.stringify(payload),
    },
  );
  return res.json();
}

export default function RecruitmentRegradeBackfill() {
  const [job, setJob] = useState<JobRow | null>(null);
  const [busy, setBusy] = useState(false);

  // Find the most recent job (running or otherwise) on mount.
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("cvp_test_regrade_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setJob(data as JobRow);
    })();
  }, []);

  // Poll the job while it's running.
  useEffect(() => {
    if (!job || (job.status !== "running" && job.status !== "pending")) return;
    const interval = setInterval(async () => {
      const res = (await callBackfill({ action: "status", jobId: job.id })) as {
        success?: boolean;
        data?: JobRow;
      };
      if (res.success && res.data) setJob(res.data);
    }, 5000);
    return () => clearInterval(interval);
  }, [job]);

  const handleStart = async () => {
    const confirmed = confirm(
      "Start backfill?\n\nThis will:\n  • Re-grade EVERY existing test submission with the corrected prompt\n  • Send V22 emails to EVERY applicant — including those already accepted or rejected\n\nThis cannot be undone. Are you sure?",
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      const res = (await callBackfill({ action: "start" })) as {
        success?: boolean;
        error?: string;
        data?: { jobId: string; total: number };
      };
      if (!res.success) {
        toast.error(res.error ?? "Failed to start backfill.");
        return;
      }
      toast.success(`Backfill started — ${res.data?.total ?? 0} submissions queued.`);
      // Re-fetch the freshly-created job.
      const { data } = await supabase
        .from("cvp_test_regrade_jobs")
        .select("*")
        .eq("id", res.data!.jobId)
        .single();
      if (data) setJob(data as JobRow);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!job) return;
    if (!confirm("Cancel this backfill? In-flight batches will finish, but no new ones will start.")) return;
    setBusy(true);
    try {
      await callBackfill({ action: "cancel", jobId: job.id });
      toast.success("Backfill cancelled.");
      const { data } = await supabase
        .from("cvp_test_regrade_jobs")
        .select("*")
        .eq("id", job.id)
        .single();
      if (data) setJob(data as JobRow);
    } finally {
      setBusy(false);
    }
  };

  const isRunning = job?.status === "running" || job?.status === "pending";
  const progressPct = job && job.total > 0
    ? Math.round(((job.completed + job.errored) / job.total) * 100)
    : 0;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Link
        to="/admin/recruitment"
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Recruitment
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Regrade backfill</h1>
        <p className="text-sm text-gray-600 mt-1">
          Re-grades every previously-graded test under the current AI prompt and re-issues V22 to all applicants. Use this once after a prompt fix that changes how tests are scored.
        </p>
      </div>

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
        <div>
          <div className="font-semibold">High blast radius</div>
          <div className="mt-1">
            V22 will be re-sent to every applicant in the corpus — including those already accepted or rejected. Only run this after a verified prompt change.
          </div>
        </div>
      </div>

      {!job || (!isRunning && job.status !== "completed") ? (
        <button
          type="button"
          onClick={handleStart}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Start backfill
        </button>
      ) : null}

      {job && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-900">
                Job <span className="font-mono text-xs">{job.id.slice(0, 8)}</span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                Started {job.started_at ? new Date(job.started_at).toLocaleString() : "—"}
                {job.completed_at && ` · Finished ${new Date(job.completed_at).toLocaleString()}`}
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${
                job.status === "running" || job.status === "pending"
                  ? "bg-blue-100 text-blue-700"
                  : job.status === "completed"
                  ? "bg-emerald-100 text-emerald-700"
                  : job.status === "cancelled"
                  ? "bg-gray-100 text-gray-600"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {job.status}
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
              <span>{job.completed + job.errored} / {job.total} processed</span>
              <span>{progressPct}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex gap-4 text-xs text-gray-600 mt-2">
              <span>✅ {job.completed} regraded</span>
              {job.errored > 0 && <span className="text-red-600">⚠ {job.errored} errors</span>}
            </div>
          </div>

          {isRunning && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy}
              className="text-xs text-red-700 hover:text-red-900 underline disabled:opacity-50"
            >
              Cancel backfill
            </button>
          )}

          {job.log.filter((l) => !l.ok).length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-gray-700 font-medium">
                Recent errors ({job.log.filter((l) => !l.ok).length})
              </summary>
              <ul className="mt-2 space-y-1 text-red-700 font-mono">
                {job.log
                  .filter((l) => !l.ok)
                  .slice(-10)
                  .map((l) => (
                    <li key={l.submissionId}>
                      {l.submissionId.slice(0, 8)}: {l.error}
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
