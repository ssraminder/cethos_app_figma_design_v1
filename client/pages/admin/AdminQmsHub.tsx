/**
 * AdminQmsHub — /admin/qms
 *
 * Consolidated QMS command centre. One page with global search across SOPs,
 * Documents & Manuals, Trainings, and Quality records. All data comes from
 * the same edge functions used by the individual pages — this is read-only
 * aggregation; editing still goes through the dedicated pages.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Files,
  GraduationCap,
  ClipboardList,
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronRight,
  Loader2,
  ShieldCheck,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { listMyTrainings, TrainingWithStats } from "@/lib/trainings";
import { sopStatusChip } from "./AdminSops";
import { toast } from "sonner";

// ── types (minimal — just what we show) ──────────────────────────────────────

interface Sop {
  id: string;
  sop_number: string;
  title: string;
  category: string;
  iso_clause_reference: string | null;
  is_archived: boolean;
  current_version: {
    id: string;
    version_number: number;
    status: string;
    effective_date: string | null;
  } | null;
}

interface PortalDoc {
  id: string;
  doc_code: string | null;
  title: string;
  category: string;
  audience: string;
  is_published: boolean;
  is_archived: boolean;
  updated_at: string;
  current_file: { version: string; file_name: string } | null;
}

type Tab = "overview" | "sops" | "documents" | "trainings" | "quality";

// ── helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

function audienceChip(a: string) {
  const cls =
    a === "vendor"
      ? "bg-teal-50 text-teal-700 border-teal-200"
      : a === "customer"
        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
        : a === "all"
          ? "bg-purple-50 text-purple-700 border-purple-200"
          : "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {a}
    </span>
  );
}

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: ClipboardList },
  { id: "sops", label: "SOPs", icon: BookOpen },
  { id: "documents", label: "Documents", icon: Files },
  { id: "trainings", label: "Trainings", icon: GraduationCap },
  { id: "quality", label: "Quality", icon: ShieldCheck },
];

// Known gaps — cleared once the SOP is published
const GAP_SOPS: { number: string; title: string; note: string }[] = [];

// ── component ─────────────────────────────────────────────────────────────────

export default function AdminQmsHub() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");

  const [sops, setSops] = useState<Sop[]>([]);
  const [docs, setDocs] = useState<PortalDoc[]>([]);
  const [trainings, setTrainings] = useState<TrainingWithStats[]>([]);
  const [quality, setQuality] = useState<any>(null);

  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sopRes, docRes, trainRes, qualRes] = await Promise.all([
        supabase.functions.invoke("manage-sops", { body: { action: "list" } }),
        supabase.functions.invoke("manage-portal-documents", { body: { action: "list" } }),
        listMyTrainings(),
        supabase.functions.invoke("quality-read", { body: { action: "dashboard" } }),
      ]);
      if (sopRes.data?.success) setSops(sopRes.data.sops ?? []);
      if (docRes.data?.success) setDocs(docRes.data.documents ?? []);
      setTrainings(trainRes);
      if (qualRes.data?.success !== false) setQuality(qualRes.data?.result ?? null);
    } catch (err: any) {
      toast.error("Failed to load QMS data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── filtered views ──────────────────────────────────────────────────────────
  const q = search.toLowerCase();

  const filteredSops = useMemo(
    () =>
      sops.filter(
        (s) =>
          !s.is_archived &&
          (!q ||
            s.sop_number.toLowerCase().includes(q) ||
            s.title.toLowerCase().includes(q) ||
            s.category.toLowerCase().includes(q) ||
            (s.iso_clause_reference ?? "").toLowerCase().includes(q)),
      ),
    [sops, q],
  );

  const filteredDocs = useMemo(
    () =>
      docs.filter(
        (d) =>
          !d.is_archived &&
          (!q ||
            d.title.toLowerCase().includes(q) ||
            d.category.toLowerCase().includes(q) ||
            (d.doc_code ?? "").toLowerCase().includes(q) ||
            d.audience.toLowerCase().includes(q)),
      ),
    [docs, q],
  );

  const filteredTrainings = useMemo(
    () =>
      trainings.filter(
        (t) =>
          !q ||
          t.title.toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q),
      ),
    [trainings, q],
  );

  // ── derived stats ───────────────────────────────────────────────────────────
  const activeSops = sops.filter((s) => !s.is_archived && s.current_version?.status === "active").length;
  const draftSops = sops.filter((s) => !s.is_archived && s.current_version?.status === "draft").length;
  const activeDocCount = docs.filter((d) => !d.is_archived).length;
  const m = quality?.metrics ?? {};

  const sopCategories = [...new Set(filteredSops.map((s) => s.category))].sort();
  const docCategories = [...new Set(filteredDocs.map((d) => d.category))].sort();

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f6f9fc]">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-teal-600" />
                QMS Command Centre
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                SOPs · Documents · Trainings · Quality records — all in one place
              </p>
            </div>
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {/* Global search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SOPs, documents, trainings…"
              className="w-full rounded-lg border border-slate-300 pl-9 pr-4 py-2 text-sm focus:border-teal-500 focus:outline-none bg-slate-50"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Gap banner */}
      <div className="max-w-6xl mx-auto px-6 pt-4">
        {GAP_SOPS.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 mb-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">{GAP_SOPS.length} QMS gap{GAP_SOPS.length !== 1 ? "s" : ""} identified</p>
                <ul className="mt-1 space-y-1">
                  {GAP_SOPS.map((g) => (
                    <li key={g.number} className="text-xs text-amber-700">
                      <span className="font-mono font-semibold">{g.number}</span> — <strong>{g.title}:</strong>{" "}
                      {g.note}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-sm text-emerald-700 font-medium">All QMS gaps resolved — 36 SOPs active, compliance and offboarding procedures in place.</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex border-b border-slate-200 mb-6 -mx-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === id
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            {/* ── OVERVIEW ───────────────────────────────────────────────────── */}
            {tab === "overview" && (
              <div className="space-y-6 pb-8">
                {/* Stat cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Active SOPs" value={activeSops} sub={`${draftSops} draft`} icon={BookOpen} accent="teal" to="/admin/sops" />
                  <StatCard label="Documents" value={activeDocCount} sub="in library" icon={Files} accent="indigo" to="/admin/documents" />
                  <StatCard label="Open NCs" value={m.open_nonconformities ?? "—"} sub="nonconformities" icon={AlertTriangle} accent="amber" to="/admin/quality" />
                  <StatCard label="Open Complaints" value={m.open_complaints ?? "—"} sub={`${m.capa_due_soon ?? 0} CAPA due`} icon={ClipboardList} accent="red" to="/admin/quality" />
                </div>

                {/* Quick links */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <QuickSection title="Recent SOPs" viewAll="/admin/sops">
                    {sops
                      .filter((s) => !s.is_archived)
                      .slice(0, 5)
                      .map((s) => (
                        <QuickRow
                          key={s.id}
                          label={s.sop_number}
                          sub={s.title}
                          badge={sopStatusChip(s.current_version?.status, s.current_version?.version_number)}
                          onClick={() => navigate(`/admin/sops/${s.id}`)}
                        />
                      ))}
                  </QuickSection>

                  <QuickSection title="Trainings" viewAll="/admin/trainings">
                    {trainings.slice(0, 5).map((t) => (
                      <QuickRow
                        key={t.id}
                        label={t.title}
                        sub={`${t.lesson_count} lessons`}
                        badge={
                          t.my_assignment?.completed_at ? (
                            <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" /> Done
                            </span>
                          ) : t.my_assignment ? (
                            <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                              <Clock className="w-3 h-3" /> In progress
                            </span>
                          ) : null
                        }
                        onClick={() => navigate(`/admin/trainings/${t.slug}`)}
                      />
                    ))}
                  </QuickSection>

                  <QuickSection title="QMS coverage" viewAll={undefined}>
                    {GAP_SOPS.length === 0 ? (
                      <div className="py-3 text-center">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                        <p className="text-xs text-emerald-700 font-medium">All gaps resolved</p>
                      </div>
                    ) : (
                      GAP_SOPS.map((g) => (
                        <div key={g.number} className="py-2 border-b border-slate-100 last:border-0">
                          <p className="text-xs font-mono font-semibold text-amber-700">{g.number}</p>
                          <p className="text-xs text-slate-700 font-medium">{g.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{g.note}</p>
                        </div>
                      ))
                    )}
                    <div className="pt-2 space-y-0.5">
                      <p className="text-xs text-slate-400">Training plan → SOP-002 ✓</p>
                      <p className="text-xs text-slate-400">Compliance management → SOP-039 ✓</p>
                      <p className="text-xs text-slate-400">Offboarding + data → SOP-040 ✓</p>
                    </div>
                  </QuickSection>
                </div>
              </div>
            )}

            {/* ── SOPs ───────────────────────────────────────────────────────── */}
            {tab === "sops" && (
              <div className="pb-8 space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">
                    {filteredSops.length} SOP{filteredSops.length !== 1 ? "s" : ""}
                    {search ? ` matching "${search}"` : ""}
                  </p>
                  <Link
                    to="/admin/sops"
                    className="inline-flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700"
                  >
                    Manage SOPs <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                {sopCategories.map((cat) => (
                  <div key={cat}>
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{cat}</h2>
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-4 py-2.5 w-24">Number</th>
                            <th className="px-4 py-2.5">Title</th>
                            <th className="px-4 py-2.5 w-44 hidden md:table-cell">ISO reference</th>
                            <th className="px-4 py-2.5 w-36">Status</th>
                            <th className="px-4 py-2.5 w-32 hidden md:table-cell">Effective</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredSops
                            .filter((s) => s.category === cat)
                            .map((s) => (
                              <tr
                                key={s.id}
                                onClick={() => navigate(`/admin/sops/${s.id}`)}
                                className="cursor-pointer hover:bg-slate-50"
                              >
                                <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.sop_number}</td>
                                <td className="px-4 py-3 font-medium text-slate-900">{s.title}</td>
                                <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">
                                  {s.iso_clause_reference ?? "—"}
                                </td>
                                <td className="px-4 py-3">
                                  {sopStatusChip(s.current_version?.status, s.current_version?.version_number)}
                                </td>
                                <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">
                                  {s.current_version?.effective_date ?? "—"}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}

                {filteredSops.length === 0 && (
                  <EmptyState message={search ? `No SOPs match "${search}"` : "No SOPs found"} />
                )}
              </div>
            )}

            {/* ── DOCUMENTS ──────────────────────────────────────────────────── */}
            {tab === "documents" && (
              <div className="pb-8 space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">
                    {filteredDocs.length} document{filteredDocs.length !== 1 ? "s" : ""}
                    {search ? ` matching "${search}"` : ""}
                  </p>
                  <Link
                    to="/admin/documents"
                    className="inline-flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700"
                  >
                    Manage documents <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                {docCategories.map((cat) => (
                  <div key={cat}>
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{cat}</h2>
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-4 py-2.5 w-32 hidden md:table-cell">Code</th>
                            <th className="px-4 py-2.5">Title</th>
                            <th className="px-4 py-2.5 w-24">Audience</th>
                            <th className="px-4 py-2.5 w-20 hidden md:table-cell">Version</th>
                            <th className="px-4 py-2.5 w-32 hidden md:table-cell">Updated</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredDocs
                            .filter((d) => d.category === cat)
                            .map((d) => (
                              <tr
                                key={d.id}
                                onClick={() => navigate("/admin/documents")}
                                className="cursor-pointer hover:bg-slate-50"
                              >
                                <td className="px-4 py-3 font-mono text-xs text-slate-500 hidden md:table-cell">
                                  {d.doc_code ?? "—"}
                                </td>
                                <td className="px-4 py-3 font-medium text-slate-900">{d.title}</td>
                                <td className="px-4 py-3">{audienceChip(d.audience)}</td>
                                <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">
                                  {d.current_file?.version ?? "—"}
                                </td>
                                <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">
                                  {fmtDate(d.updated_at)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}

                {filteredDocs.length === 0 && (
                  <EmptyState message={search ? `No documents match "${search}"` : "No documents found"} />
                )}
              </div>
            )}

            {/* ── TRAININGS ──────────────────────────────────────────────────── */}
            {tab === "trainings" && (
              <div className="pb-8">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-slate-500">
                    {filteredTrainings.length} training{filteredTrainings.length !== 1 ? "s" : ""}
                    {search ? ` matching "${search}"` : ""}
                  </p>
                  <Link
                    to="/admin/trainings"
                    className="inline-flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700"
                  >
                    Manage trainings <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5">Title</th>
                        <th className="px-4 py-2.5 w-20 hidden md:table-cell">Lessons</th>
                        <th className="px-4 py-2.5 w-24 hidden md:table-cell">Audience</th>
                        <th className="px-4 py-2.5 w-32">Progress</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTrainings.map((t) => {
                        const pct = t.lesson_count
                          ? Math.round((t.my_progress_count / t.lesson_count) * 100)
                          : 0;
                        const done = !!t.my_assignment?.completed_at;
                        return (
                          <tr
                            key={t.id}
                            onClick={() => navigate(`/admin/trainings/${t.slug}`)}
                            className="cursor-pointer hover:bg-slate-50"
                          >
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-900">{t.title}</p>
                              {t.description && (
                                <p className="text-xs text-slate-500 line-clamp-1">{t.description}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">
                              {t.lesson_count}
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              {(t as any).audience === "linguist" ? (
                                <span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs text-teal-700">
                                  Vendor
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                                  Staff
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {t.my_assignment ? (
                                done ? (
                                  <span className="flex items-center gap-1 text-xs text-green-700 font-medium">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Completed
                                  </span>
                                ) : (
                                  <div className="w-24">
                                    <div className="h-1.5 w-full rounded-full bg-slate-200">
                                      <div
                                        className="h-1.5 rounded-full bg-teal-500"
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5">{pct}%</p>
                                  </div>
                                )
                              ) : (
                                <span className="text-xs text-slate-400">Not assigned</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {filteredTrainings.length === 0 && (
                  <EmptyState message={search ? `No trainings match "${search}"` : "No trainings found"} />
                )}
              </div>
            )}

            {/* ── QUALITY ────────────────────────────────────────────────────── */}
            {tab === "quality" && (
              <div className="pb-8 space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">CAPA register, complaints and nonconformities</p>
                  <Link
                    to="/admin/quality"
                    className="inline-flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700"
                  >
                    Open Quality hub <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MiniStat label="Open complaints" value={m.open_complaints ?? "—"} />
                  <MiniStat label="Open NCs" value={m.open_nonconformities ?? "—"} />
                  <MiniStat label="CAPA due ≤14d" value={m.capa_due_soon ?? "—"} warn={!!(m.capa_due_soon > 0)} />
                  <MiniStat label="Under review" value={m.linguists_under_review ?? "—"} />
                </div>

                {/* NC / CAPA register */}
                {quality?.register?.length > 0 && (
                  <div>
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                      Open nonconformities &amp; CAPA
                    </h2>
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-4 py-2.5 w-24">#</th>
                            <th className="px-4 py-2.5">Title</th>
                            <th className="px-4 py-2.5 w-24 hidden md:table-cell">Severity</th>
                            <th className="px-4 py-2.5 w-28">Status</th>
                            <th className="px-4 py-2.5 w-32 hidden md:table-cell">CAPA due</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {quality.register.map((nc: any) => (
                            <tr
                              key={nc.id}
                              onClick={() => navigate(`/admin/quality/nc/${nc.id}`)}
                              className="cursor-pointer hover:bg-slate-50"
                            >
                              <td className="px-4 py-3 font-mono text-xs text-slate-500">{nc.nc_number}</td>
                              <td className="px-4 py-3 font-medium text-slate-900">{nc.title}</td>
                              <td className="px-4 py-3 hidden md:table-cell">
                                <span
                                  className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                                    nc.severity === "critical"
                                      ? "bg-red-200 text-red-900"
                                      : nc.severity === "high"
                                        ? "bg-red-100 text-red-800"
                                        : nc.severity === "medium"
                                          ? "bg-amber-100 text-amber-800"
                                          : "bg-gray-100 text-gray-700"
                                  }`}
                                >
                                  {nc.severity}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs text-slate-600 capitalize">{nc.status}</span>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">
                                {nc.next_capa_due ? fmtDate(nc.next_capa_due) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {!quality && (
                  <EmptyState message="Quality data unavailable" />
                )}

                {/* SOP cross-references for compliance */}
                <div className="rounded-lg border border-slate-200 bg-white p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-3">Compliance SOP cross-reference</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-600">
                    {[
                      { sop: "SOP-011", title: "Corrective and Preventive Actions" },
                      { sop: "SOP-012", title: "Internal Audits" },
                      { sop: "SOP-013", title: "Management Review" },
                      { sop: "SOP-014", title: "Data Security and Confidentiality" },
                      { sop: "SOP-015", title: "Risk Management" },
                    ].map(({ sop, title }) => (
                      <div
                        key={sop}
                        className="flex items-center gap-2 cursor-pointer hover:text-teal-700"
                        onClick={() => {
                          const match = sops.find((s) => s.sop_number === sop);
                          if (match) navigate(`/admin/sops/${match.id}`);
                        }}
                      >
                        <span className="font-mono text-slate-400">{sop}</span>
                        <span>{title}</span>
                        <ChevronRight className="w-3 h-3 text-slate-300 ml-auto" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── small shared components ───────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, accent, to,
}: {
  label: string;
  value: number | string;
  sub: string;
  icon: React.ElementType;
  accent: "teal" | "indigo" | "amber" | "red";
  to: string;
}) {
  const navigate = useNavigate();
  const ring: Record<string, string> = {
    teal: "border-teal-200 bg-teal-50",
    indigo: "border-indigo-200 bg-indigo-50",
    amber: "border-amber-200 bg-amber-50",
    red: "border-red-200 bg-red-50",
  };
  const text: Record<string, string> = {
    teal: "text-teal-700", indigo: "text-indigo-700", amber: "text-amber-700", red: "text-red-700",
  };
  return (
    <button
      onClick={() => navigate(to)}
      className={`text-left rounded-lg border p-4 hover:shadow-sm transition ${ring[accent]}`}
    >
      <Icon className={`w-5 h-5 mb-2 ${text[accent]}`} />
      <p className={`text-2xl font-bold ${text[accent]}`}>{value}</p>
      <p className="text-xs font-medium text-slate-700">{label}</p>
      <p className="text-xs text-slate-500">{sub}</p>
    </button>
  );
}

function MiniStat({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 bg-white ${warn ? "border-amber-300" : "border-slate-200"}`}>
      <p className={`text-2xl font-bold ${warn ? "text-amber-700" : "text-slate-800"}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function QuickSection({
  title, children, viewAll,
}: {
  title: string;
  children: React.ReactNode;
  viewAll: string | undefined;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {viewAll && (
          <Link to={viewAll} className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-0.5">
            View all <ArrowUpRight className="w-3 h-3" />
          </Link>
        )}
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  );
}

function QuickRow({
  label, sub, badge, onClick,
}: {
  label: string;
  sub: string;
  badge?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between py-2 cursor-pointer hover:bg-slate-50 -mx-1 px-1 rounded"
    >
      <div className="min-w-0">
        <p className="text-xs font-mono text-slate-500">{label}</p>
        <p className="text-xs font-medium text-slate-800 truncate">{sub}</p>
      </div>
      {badge && <div className="ml-2 shrink-0">{badge}</div>}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-12 text-center text-slate-500 text-sm">
      {message}
    </div>
  );
}
