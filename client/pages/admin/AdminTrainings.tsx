// AdminTrainings — linguist training completion tracker + offline recording.
// Shows each linguist training with how many vendors have completed it, a recent
// completions feed, and a "Record offline completion" action for linguists trained
// outside the portal. Completions are the ISO/IQVIA training-file evidence.

import { useCallback, useEffect, useState } from "react";
import { BookOpen, CheckCircle2, Loader2, RefreshCw, Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import { toast } from "sonner";

interface Training { id: string; title: string; category: string; quiz_enabled: boolean; }
interface Completion {
  id: string; vendor_id: string; training_id: string; method: string; completed_at: string;
  vendors?: { full_name: string | null; email: string | null } | null;
}

export default function AdminTrainings() {
  const { session } = useAdminAuthContext();
  const staffId = (session as any)?.staffId ?? null;

  const [trainings, setTrainings] = useState<Training[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [countByTraining, setCountByTraining] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: t }, { data: c }] = await Promise.all([
        supabase.from("cvp_trainings").select("id, title, category, quiz_enabled").eq("audience", "linguist").eq("is_active", true).order("created_at"),
        supabase.from("cvp_training_completions").select("id, vendor_id, training_id, method, completed_at, vendors(full_name, email)").order("completed_at", { ascending: false }).limit(500),
      ]);
      const tlist = (t as Training[]) ?? [];
      setTrainings(tlist);
      setCompletions((c as unknown as Completion[]) ?? []);
      // Accurate per-training completion counts via real COUNT queries — the
      // "recent completions" feed above is capped, so deriving counts from it
      // under-reports once total completions exceed the cap (e.g. after a bulk
      // rollout). One head-count per training (small N).
      const counts: Record<string, number> = {};
      await Promise.all(
        tlist.map(async (tr) => {
          const { count } = await supabase
            .from("cvp_training_completions")
            .select("id", { count: "exact", head: true })
            .eq("training_id", tr.id);
          counts[tr.id] = count ?? 0;
        }),
      );
      setCountByTraining(counts);
    } catch (e: any) {
      toast.error(`Load failed: ${e?.message ?? "unknown"}`);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-[#f6f9fc] p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-teal-600" /> Linguist Trainings
          </h1>
          <p className="text-sm text-gray-500 mt-1">Completion tracking (ISO 17100 / client-audit training records). Completions auto-record when a linguist finishes online; use “Record offline” for those trained outside the portal.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"><RefreshCw className="w-4 h-4" />Refresh</button>
          <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-3 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700"><Plus className="w-4 h-4" />Record offline completion</button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {trainings.map((t) => (
              <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-900">{t.title}</div>
                <div className="text-xs text-gray-400 mt-0.5 capitalize">{t.category}{t.quiz_enabled ? " · quiz on" : " · quiz off"}</div>
                <div className="mt-3 text-2xl font-bold text-teal-600">{countByTraining[t.id] ?? 0}</div>
                <div className="text-xs text-gray-500">linguists completed</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">Recent completions <span className="font-normal text-gray-400">(latest 500 — counts above are totals)</span></div>
            {completions.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">No completions recorded yet.</div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-2">Linguist</th><th className="text-left px-4 py-2">Training</th><th className="text-left px-4 py-2">Method</th><th className="text-left px-4 py-2">Completed</th>
                </tr></thead>
                <tbody>
                  {completions.map((c) => (
                    <tr key={c.id} className="border-b border-gray-100">
                      <td className="px-4 py-2 text-sm"><div className="font-medium text-gray-900">{c.vendors?.full_name ?? "—"}</div><div className="text-xs text-gray-400">{c.vendors?.email}</div></td>
                      <td className="px-4 py-2 text-sm text-gray-700">{trainings.find((t) => t.id === c.training_id)?.title ?? "—"}</td>
                      <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${c.method === "offline" ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>{c.method}</span></td>
                      <td className="px-4 py-2 text-sm text-gray-600">{new Date(c.completed_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {modalOpen && <OfflineModal staffId={staffId} trainings={trainings} onClose={() => setModalOpen(false)} onDone={() => { setModalOpen(false); load(); }} />}
    </div>
  );
}

function OfflineModal({ staffId, trainings, onClose, onDone }: { staffId: string | null; trainings: Training[]; onClose: () => void; onDone: () => void; }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
  const [vendor, setVendor] = useState<{ id: string; full_name: string | null } | null>(null);
  const [trainingId, setTrainingId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (search.trim().length < 2) { setResults([]); return; }
    let cancel = false;
    supabase.from("vendors").select("id, full_name, email").or(`full_name.ilike.%${search}%,email.ilike.%${search}%`).limit(8)
      .then(({ data }) => { if (!cancel) setResults((data as any) ?? []); });
    return () => { cancel = true; };
  }, [search]);

  async function submit() {
    if (!staffId) { toast.error("No staff session"); return; }
    if (!vendor || !trainingId) { toast.error("Pick a linguist and a training"); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-record-training-completion", {
        body: { staff_id: staffId, vendor_id: vendor.id, training_id: trainingId, notes: notes || null },
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || "Failed");
      toast.success("Offline completion recorded.");
      onDone();
    } catch (e: any) {
      toast.error(`Failed: ${e?.message ?? "unknown"}`);
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="font-semibold text-gray-900">Record offline completion</h2><button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button></div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Linguist</label>
        {vendor ? (
          <div className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 mb-3"><span className="text-sm">{vendor.full_name}</span><button onClick={() => setVendor(null)} className="text-xs text-gray-400">change</button></div>
        ) : (
          <div className="mb-3">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email…" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            {results.length > 0 && (
              <div className="mt-1 border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
                {results.map((r) => (
                  <button key={r.id} onClick={() => { setVendor(r); setResults([]); setSearch(""); }} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50">{r.full_name} <span className="text-gray-400 text-xs">{r.email}</span></button>
                ))}
              </div>
            )}
          </div>
        )}
        <label className="block text-xs font-medium text-gray-500 mb-1">Training</label>
        <select value={trainingId} onChange={(e) => setTrainingId(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-3 bg-white">
          <option value="">Select…</option>
          {trainings.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
        <label className="block text-xs font-medium text-gray-500 mb-1">Notes (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="e.g. completed in live onboarding session 2026-06-18" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-4" />
        <button onClick={submit} disabled={saving} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}Record completion
        </button>
      </div>
    </div>
  );
}
