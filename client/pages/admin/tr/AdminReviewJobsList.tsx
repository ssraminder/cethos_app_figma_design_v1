// Translation Review jobs list. Filtered to job_kind on optional ?kind= param
// so the sidebar "QM Certified" link reuses the same component.

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { listReviewJobs, listLanguages, type TRReviewJob, type LanguageRow } from "@/lib/tr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_TONE: Record<string, string> = {
  intake: "bg-gray-100 text-gray-700",
  preflight: "bg-blue-100 text-blue-800",
  plan_pending_approval: "bg-yellow-100 text-yellow-800",
  in_review: "bg-indigo-100 text-indigo-800",
  findings_pending_human_review: "bg-purple-100 text-purple-800",
  revisions_pending: "bg-orange-100 text-orange-800",
  blocked_open_questions: "bg-red-100 text-red-800",
  complete: "bg-green-100 text-green-800",
  cancelled: "bg-gray-200 text-gray-500",
};

export default function AdminReviewJobsList() {
  const [params] = useSearchParams();
  const kindFilter = params.get("kind") as TRReviewJob["job_kind"] | null;

  const [jobs, setJobs] = useState<TRReviewJob[]>([]);
  const [langs, setLangs] = useState<Record<string, LanguageRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [j, ls] = await Promise.all([listReviewJobs(), listLanguages()]);
        setJobs(j);
        setLangs(Object.fromEntries(ls.map((l) => [l.id, l])));
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(
    () => (kindFilter ? jobs.filter((j) => j.job_kind === kindFilter) : jobs),
    [jobs, kindFilter],
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">
          {kindFilter === "qm_certified" ? "QM Certified Translations" : "Translation Review Jobs"}
        </h1>
        <Link to="/admin/tr/jobs/new">
          <Button>New Job</Button>
        </Link>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded mb-3">{error}</div>}
      {loading && <div className="text-gray-500">Loading...</div>}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 border rounded bg-gray-50">
          <p className="text-gray-600 mb-3">No jobs yet.</p>
          <Link to="/admin/tr/jobs/new"><Button>Create the first job</Button></Link>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="border rounded-md bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 font-medium">Job</th>
                <th className="text-left p-3 font-medium">Kind</th>
                <th className="text-left p-3 font-medium">Lang pair</th>
                <th className="text-left p-3 font-medium">Round</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => (
                <tr key={j.id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="p-3">
                    <Link to={`/admin/tr/jobs/${j.id}`} className="font-medium text-blue-700 hover:underline">
                      {j.title || j.client_name || j.id.slice(0, 8)}
                    </Link>
                    {j.pm_contact && <div className="text-xs text-gray-500">PM {j.pm_contact}</div>}
                  </td>
                  <td className="p-3">{j.job_kind === "qm_certified" ? "QM" : "Review"}</td>
                  <td className="p-3 font-mono text-xs">
                    {langs[j.source_language_id]?.code ?? "?"} → {langs[j.target_language_id]?.code ?? "?"}
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-2">
                      {j.review_round}
                      {j.round_color_hex && (
                        <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: j.round_color_hex }} />
                      )}
                    </span>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={`text-[10px] uppercase ${STATUS_TONE[j.status] ?? ""}`}>
                      {j.status.replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="p-3 text-xs text-gray-500">{new Date(j.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
