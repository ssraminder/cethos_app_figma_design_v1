// AdminQmsApprovals — the human qualification-approval queue.
//
// Lists every vendor whose role_qualification has fully assembled (competence +
// §3.1.4 basis + verified evidence + active NDA) and now sits at status
// 'preliminary', awaiting a human sign-off. Approving here calls the same
// manage-qms-evidence action the per-vendor QMS tab uses. This is the
// always-visible work queue behind the sidebar count badge.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, ShieldCheck, ExternalLink, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import { toast } from "sonner";

interface PendingVendor {
  vendor_id: string;
  full_name: string | null;
  email: string | null;
  country: string | null;
  total_projects: number | null;
}

export default function AdminQmsApprovals() {
  const { session } = useAdminAuthContext();
  const staffId = (session as any)?.staffId ?? null;

  const [rows, setRows] = useState<PendingVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: statusRows, error: statusErr } = await supabase
        .from("qms_vendor_status" as any)
        .select("vendor_id")
        .eq("qual_status", "preliminary");
      if (statusErr) throw statusErr;
      const ids = (statusRows ?? []).map((r: any) => r.vendor_id).filter(Boolean);
      if (ids.length === 0) {
        setRows([]);
        return;
      }
      const { data: vendors, error: vErr } = await supabase
        .from("vendors")
        .select("id, full_name, email, country, total_projects")
        .in("id", ids);
      if (vErr) throw vErr;
      const mapped: PendingVendor[] = (vendors ?? []).map((v: any) => ({
        vendor_id: v.id,
        full_name: v.full_name,
        email: v.email,
        country: v.country,
        total_projects: v.total_projects,
      }));
      mapped.sort((a, b) => (b.total_projects ?? 0) - (a.total_projects ?? 0));
      setRows(mapped);
    } catch (err: any) {
      toast.error(`Failed to load approvals: ${err?.message ?? "unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (vendorId: string) => {
    if (!staffId) {
      toast.error("No staff session — cannot approve.");
      return;
    }
    setApprovingId(vendorId);
    try {
      const { data, error } = await supabase.functions.invoke("manage-qms-evidence", {
        body: { action: "approve_qualification", staff_id: staffId, vendor_id: vendorId },
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || "Approval failed");
      const approved = data?.result?.approved ?? 0;
      toast.success(approved > 0 ? "Qualification approved." : "Nothing to approve for this vendor.");
      setRows((prev) => prev.filter((r) => r.vendor_id !== vendorId));
    } catch (err: any) {
      toast.error(`Approve failed: ${err?.message ?? "unknown error"}`);
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f9fc] p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-blue-600" />
            Qualification Approvals
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Vendors fully assembled (competence + verified §3.1.4 evidence + active NDA) and awaiting human sign-off.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500">
            No vendors awaiting qualification approval. 🎉
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Country</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Jobs</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.vendor_id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-sm text-gray-900">{r.full_name || "—"}</div>
                    <div className="text-xs text-gray-400">{r.email}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.country || "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-gray-700">{r.total_projects ?? 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/admin/vendors/${r.vendor_id}?tab=qms`}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Review
                      </Link>
                      <button
                        onClick={() => approve(r.vendor_id)}
                        disabled={approvingId === r.vendor_id}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {approvingId === r.vendor_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                        Approve
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
