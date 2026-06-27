/**
 * AdminQmsHub — /admin/qms (Overview tab of the consolidated QMS Hub).
 *
 * The shared header, tab bar and cross-domain navigation now live in
 * QmsHubLayout. This page is just the Overview: at-a-glance stats and quick
 * links across SOPs, Documents, Trainings and Quality. Read-only aggregation —
 * editing still happens on the dedicated pages reached via the hub tabs.
 */

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Files,
  GraduationCap,
  ClipboardList,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  ArrowUpRight,
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
    document_version: string | null;
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

// Known gaps — cleared once the SOP is published
const GAP_SOPS: { number: string; title: string; note: string }[] = [];

// ── component ─────────────────────────────────────────────────────────────────

export default function AdminQmsHub() {
  const navigate = useNavigate();

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

  // ── derived stats ───────────────────────────────────────────────────────────
  const activeSops = sops.filter((s) => !s.is_archived && s.current_version?.status === "active").length;
  const draftSops = sops.filter((s) => !s.is_archived && s.current_version?.status === "draft").length;
  const activeDocCount = docs.filter((d) => !d.is_archived).length;
  const m = quality?.metrics ?? {};

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      {/* Gap banner */}
      {GAP_SOPS.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 mb-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                {GAP_SOPS.length} QMS gap{GAP_SOPS.length !== 1 ? "s" : ""} identified
              </p>
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
          <p className="text-sm text-emerald-700 font-medium">
            All QMS gaps resolved — {activeSops} SOPs active, compliance and offboarding procedures in place.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : (
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
                    badge={sopStatusChip(
                      s.current_version?.status,
                      s.current_version
                        ? `v${s.current_version.document_version ?? s.current_version.version_number}`
                        : undefined,
                    )}
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
