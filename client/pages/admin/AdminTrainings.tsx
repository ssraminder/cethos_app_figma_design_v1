// AdminTrainings — /admin/qms/training-records
//
// The QMS training-completion record (ISO 17100 / IQVIA training-file evidence).
// Shows BOTH vendor/linguist completions (cvp_training_completions) and staff
// completions (cvp_training_assignments.completed_at) in one filterable table,
// plus a "Record offline completion" action for linguists trained outside the
// portal. Filters let staff find a record fast in front of an auditor — by
// vendor/name, email, domain, language, training type, training name, and
// audience (staff vs vendor).

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Loader2, RefreshCw, Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import { toast } from "sonner";
import { QmsFilterBar } from "@/components/admin/QmsFilterBar";

interface Training {
  id: string;
  title: string;
  category: string;
  audience: string;
  quiz_enabled: boolean;
  is_active: boolean;
}

// One unified completion record, normalised across the vendor + staff tables.
interface CompletionRow {
  id: string;
  audience: "vendor" | "staff";
  personName: string;
  email: string;
  business: string;
  country: string;
  trainingId: string;
  trainingName: string;
  trainingType: string; // cvp_trainings.category
  method: string;
  completedAt: string;
  domains: string[];
  languages: string[];
}

const arr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => x != null).map((x) => String(x)) : [];

// Page through a PostgREST table in 1000-row windows so the record set isn't
// silently capped (PostgREST caps any single response at 1000 rows).
async function pageAll(
  build: () => any,
  pages = 15,
): Promise<any[]> {
  const out: any[] = [];
  for (let p = 0; p < pages; p++) {
    const from = p * 1000;
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export default function AdminTrainings() {
  const { session } = useAdminAuthContext();
  const staffId = (session as any)?.staffId ?? null;

  const [trainings, setTrainings] = useState<Training[]>([]);
  const [rows, setRows] = useState<CompletionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [audience, setAudience] = useState("");
  const [trainingName, setTrainingName] = useState("");
  const [trainingType, setTrainingType] = useState("");
  const [domain, setDomain] = useState("");
  const [language, setLanguage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // All trainings (both audiences, incl. inactive) — used to resolve a
      // completion's name/type even if the training was later deactivated.
      const { data: tData, error: tErr } = await supabase
        .from("cvp_trainings")
        .select("id, title, category, audience, quiz_enabled, is_active")
        .order("created_at");
      if (tErr) throw tErr;
      const tlist = (tData as Training[]) ?? [];
      setTrainings(tlist);
      const tById = new Map(tlist.map((t) => [t.id, t]));

      // Vendor / linguist completions.
      const vendorRows = await pageAll(() =>
        supabase
          .from("cvp_training_completions")
          .select(
            "id, vendor_id, training_id, method, completed_at, vendors(full_name, business_name, email, country, specializations, target_languages)",
          )
          .order("completed_at", { ascending: false }),
      );

      // Staff completions live as a stamped completed_at on the assignment.
      const staffAssign = await pageAll(() =>
        supabase
          .from("cvp_training_assignments")
          .select("id, staff_user_id, training_id, completed_at")
          .not("staff_user_id", "is", null)
          .not("completed_at", "is", null)
          .order("completed_at", { ascending: false }),
      );
      const staffIds = [...new Set(staffAssign.map((a) => a.staff_user_id))];
      const staffById = new Map<string, any>();
      for (let i = 0; i < staffIds.length; i += 1000) {
        const chunk = staffIds.slice(i, i + 1000);
        const { data } = await supabase
          .from("staff_users")
          .select("id, full_name, email")
          .in("id", chunk);
        (data ?? []).forEach((s: any) => staffById.set(s.id, s));
      }

      const unified: CompletionRow[] = [];
      for (const c of vendorRows) {
        const v = (c as any).vendors ?? {};
        const t = tById.get(c.training_id);
        unified.push({
          id: `v_${c.id}`,
          audience: "vendor",
          personName: v.full_name ?? v.business_name ?? "—",
          email: v.email ?? "",
          business: v.business_name ?? "",
          country: v.country ?? "",
          trainingId: c.training_id,
          trainingName: t?.title ?? "—",
          trainingType: t?.category ?? "—",
          method: c.method ?? "online",
          completedAt: c.completed_at,
          domains: arr(v.specializations),
          languages: arr(v.target_languages),
        });
      }
      for (const a of staffAssign) {
        const s = staffById.get(a.staff_user_id) ?? {};
        const t = tById.get(a.training_id);
        unified.push({
          id: `s_${a.id}`,
          audience: "staff",
          personName: s.full_name ?? "—",
          email: s.email ?? "",
          business: "",
          country: "",
          trainingId: a.training_id,
          trainingName: t?.title ?? "—",
          trainingType: t?.category ?? "—",
          method: "portal",
          completedAt: a.completed_at,
          domains: [],
          languages: [],
        });
      }
      unified.sort((x, y) => (y.completedAt ?? "").localeCompare(x.completedAt ?? ""));
      setRows(unified);
    } catch (e: any) {
      toast.error(`Load failed: ${e?.message ?? "unknown"}`);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Distinct option lists for the dropdowns, derived from the loaded records.
  const opts = useMemo(() => {
    const names = new Set<string>();
    const types = new Set<string>();
    const domains = new Set<string>();
    const langs = new Set<string>();
    for (const r of rows) {
      if (r.trainingName && r.trainingName !== "—") names.add(r.trainingName);
      if (r.trainingType && r.trainingType !== "—") types.add(r.trainingType);
      r.domains.forEach((d) => domains.add(d));
      r.languages.forEach((l) => langs.add(l));
    }
    const sortOpt = (s: Set<string>) =>
      [...s].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));
    return {
      names: sortOpt(names),
      types: sortOpt(types),
      domains: sortOpt(domains),
      langs: sortOpt(langs),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (audience && r.audience !== audience) return false;
      if (trainingName && r.trainingName !== trainingName) return false;
      if (trainingType && r.trainingType !== trainingType) return false;
      if (domain && !r.domains.includes(domain)) return false;
      if (language && !r.languages.includes(language)) return false;
      if (q) {
        const hay = `${r.personName} ${r.email} ${r.business}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, audience, trainingName, trainingType, domain, language]);

  const activeTrainings = trainings.filter((t) => t.is_active);
  const countByTraining = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.trainingId] = (m[r.trainingId] ?? 0) + 1;
    return m;
  }, [rows]);

  const linguistTrainings = trainings.filter((t) => t.audience === "linguist");

  return (
    <div className="min-h-screen bg-[#f6f9fc] p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-teal-600" /> Training Completion Records
          </h1>
          <p className="text-sm text-gray-500 mt-1">Vendor &amp; staff training completions (ISO 17100 / client-audit training records). Online completions auto-record; use “Record offline” for linguists trained outside the portal.</p>
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
            {activeTrainings.map((t) => (
              <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-900">{t.title}</div>
                <div className="text-xs text-gray-400 mt-0.5 capitalize">{t.category} · {t.audience === "linguist" ? "vendor" : "staff"}</div>
                <div className="mt-3 text-2xl font-bold text-teal-600">{countByTraining[t.id] ?? 0}</div>
                <div className="text-xs text-gray-500">completions</div>
              </div>
            ))}
          </div>

          <QmsFilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search vendor / staff name, email, business…"
            resultCount={filtered.length}
            totalCount={rows.length}
            selects={[
              { id: "audience", label: "All audiences", value: audience, onChange: setAudience, options: [{ value: "vendor", label: "Vendor / linguist" }, { value: "staff", label: "Staff" }] },
              { id: "training", label: "All trainings", value: trainingName, onChange: setTrainingName, options: opts.names },
              { id: "type", label: "All types", value: trainingType, onChange: setTrainingType, options: opts.types },
              { id: "domain", label: "All domains", value: domain, onChange: setDomain, options: opts.domains },
              { id: "language", label: "All languages", value: language, onChange: setLanguage, options: opts.langs },
            ]}
          />

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">
                {rows.length === 0 ? "No completions recorded yet." : "No records match the current filters."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                    <th className="text-left px-4 py-2">Person</th>
                    <th className="text-left px-4 py-2">Audience</th>
                    <th className="text-left px-4 py-2">Training</th>
                    <th className="text-left px-4 py-2">Domain / Language</th>
                    <th className="text-left px-4 py-2">Method</th>
                    <th className="text-left px-4 py-2">Completed</th>
                  </tr></thead>
                  <tbody>
                    {filtered.map((c) => (
                      <tr key={c.id} className="border-b border-gray-100">
                        <td className="px-4 py-2 text-sm"><div className="font-medium text-gray-900">{c.personName}</div><div className="text-xs text-gray-400">{c.email}{c.business ? ` · ${c.business}` : ""}</div></td>
                        <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${c.audience === "staff" ? "bg-indigo-50 text-indigo-700" : "bg-sky-50 text-sky-700"}`}>{c.audience === "staff" ? "Staff" : "Vendor"}</span></td>
                        <td className="px-4 py-2 text-sm text-gray-700">{c.trainingName}<div className="text-xs text-gray-400 capitalize">{c.trainingType}</div></td>
                        <td className="px-4 py-2 text-xs text-gray-500">
                          {c.domains.length || c.languages.length ? (
                            <>
                              {c.domains.length > 0 && <div>{c.domains.join(", ")}</div>}
                              {c.languages.length > 0 && <div className="text-gray-400">{c.languages.join(", ")}</div>}
                            </>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${c.method === "offline" ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>{c.method}</span></td>
                        <td className="px-4 py-2 text-sm text-gray-600">{c.completedAt ? new Date(c.completedAt).toLocaleDateString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {modalOpen && <OfflineModal staffId={staffId} trainings={linguistTrainings} onClose={() => setModalOpen(false)} onDone={() => { setModalOpen(false); load(); }} />}
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
