// VendorQmsTab — staff-driven QMS qualification entry (R14).
// Shows the vendor's current qms.role_qualifications + qms.nda_agreements +
// recent qms.assignment_eligibility_events, and lets staff record a new
// qualification (role + competence basis + verified evidence + language pairs)
// via the admin-record-qualification edge function. The edge function calls
// qms.record_qualification, which writes evidence/NDA/qualification/pairs in
// one transaction.

import { useEffect, useState, useMemo } from "react";
import { Loader2, Plus, ShieldCheck, ShieldAlert, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import { toast } from "sonner";
import type { TabProps } from "./types";

const ROLE_CODES = [
  { code: "translator",  label: "Translator" },
  { code: "reviser",     label: "Reviser" },
  { code: "post_editor", label: "Post-editor" },
  { code: "interpreter", label: "Interpreter" },
] as const;

const DIRECTIONS = [
  { value: "source_to_target", label: "One-way (source → target)" },
  { value: "both_directions",  label: "Bidirectional" },
] as const;

interface RoleQualificationRow {
  id: string;
  status: string;
  qualified_at: string | null;
  re_qualification_due: string | null;
  role_type: { code: string; name: string } | null;
  competence_basis: { code: string; short_label: string } | null;
  language_pair_qualifications: Array<{
    source_language: { code: string; name: string } | null;
    target_language: { code: string; name: string } | null;
    direction: string;
  }>;
}

interface NdaRow {
  id: string;
  status: string;
  signed_date: string | null;
  effective_date: string | null;
  expiry_date: string | null;
  template_version: string | null;
}

interface CompetenceBasisOpt { id: string; code: string; short_label: string; role_type_code: string }
interface EvidenceTypeOpt { id: string; code: string; name: string; applies_to_roles?: string[] | null }
interface LanguageOpt { id: string; code: string; name: string }

export default function VendorQmsTab({ vendorData, onRefresh }: TabProps & { onRefresh?: () => void }) {
  const vendorId = vendorData.vendor.id;
  const { session } = useAdminAuthContext();
  const staffId = (session as any)?.staffId ?? null;

  const [loading, setLoading] = useState(true);
  const [qualifications, setQualifications] = useState<RoleQualificationRow[]>([]);
  const [ndas, setNdas] = useState<NdaRow[]>([]);
  const [portalNdaSignedAt, setPortalNdaSignedAt] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [competenceBases, setCompetenceBases] = useState<CompetenceBasisOpt[]>([]);
  const [evidenceTypes, setEvidenceTypes] = useState<EvidenceTypeOpt[]>([]);
  const [languages, setLanguages] = useState<LanguageOpt[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      // PostgREST only exposes public/graphql_public/tr — qms schema is not
      // reachable via supabase.schema('qms'), so per-vendor lookups route
      // through an edge function that uses service_role.
      const { data, error } = await supabase.functions.invoke("list-vendor-qms", {
        body: { vendor_id: vendorId },
      });
      if (error || !data?.success) {
        toast.error(data?.error ?? error?.message ?? "Failed to load QMS data");
        return;
      }
      setQualifications((data.qualifications as RoleQualificationRow[]) ?? []);
      setNdas((data.ndas as NdaRow[]) ?? []);
      setPortalNdaSignedAt((data.portal_nda_signed_at as string | null) ?? null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load QMS data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, [vendorId]);

  // Load lookups on first form open
  const openForm = async () => {
    if (competenceBases.length === 0) {
      // Public views over qms.competence_bases + qms.evidence_types — see
      // migration 20260602_qms_public_lookup_views_v2.sql.
      const [cb, ev, lg] = await Promise.all([
        supabase.from("qms_competence_bases" as any).select("id, code, short_label, role_type_code"),
        supabase.from("qms_evidence_types" as any).select("id, code, name, applies_to_roles"),
        supabase.from("languages").select("id, code, name").order("name"),
      ]);
      setCompetenceBases((cb.data ?? []) as CompetenceBasisOpt[]);
      setEvidenceTypes((ev.data ?? []) as EvidenceTypeOpt[]);
      setLanguages(lg.data ?? []);
    }
    setShowForm(true);
  };

  const hasActiveNda = useMemo(() =>
    ndas.some((n) => n.status === "active" && (!n.expiry_date || new Date(n.expiry_date) >= new Date())),
    [ndas],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">QMS Qualifications</h2>
        <button
          onClick={openForm}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-md text-sm hover:bg-teal-700"
        >
          <Plus className="w-4 h-4" />
          Mark vendor qualified
        </button>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-medium text-gray-700 mb-2">NDA on file</div>
        {ndas.length === 0 ? (
          portalNdaSignedAt ? (
            <div className="text-sm text-gray-700 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-600" />
              Signed via vendor portal {new Date(portalNdaSignedAt).toLocaleDateString()}
              <span className="text-gray-400 text-xs">(agreements system — QMS record will be created with the first qualification)</span>
            </div>
          ) : (
            <div className="text-sm text-gray-500 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500" /> No NDA recorded. One will be created when you record the first qualification.
            </div>
          )
        ) : (
          <ul className="text-sm text-gray-700 space-y-1">
            {ndas.map((n) => (
              <li key={n.id} className="flex items-center gap-2">
                <ShieldCheck className={n.status === 'active' ? 'w-4 h-4 text-teal-600' : 'w-4 h-4 text-gray-400'} />
                <span className="capitalize">{n.status}</span>
                {n.signed_date && <span className="text-gray-500">· signed {new Date(n.signed_date).toLocaleDateString()}</span>}
                {n.expiry_date && <span className="text-gray-500">· expires {new Date(n.expiry_date).toLocaleDateString()}</span>}
                {n.template_version && <span className="text-gray-400 text-xs">({n.template_version})</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border bg-white">
        <div className="px-4 py-2 border-b text-sm font-medium text-gray-700">Role qualifications</div>
        {loading ? (
          <div className="p-4 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : qualifications.length === 0 ? (
          <div className="p-4 text-sm text-gray-500 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />
            <div>
              <div>No role qualifications recorded for this vendor.</div>
              <div className="text-xs text-gray-400 mt-1">Assignments to ISO-scoped services will be flagged by qms_check_assignment until at least one qualification is on file.</div>
            </div>
          </div>
        ) : (
          <ul className="divide-y">
            {qualifications.map((q) => (
              <li key={q.id} className="p-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${q.status === 'qualified' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{q.status}</span>
                  <span className="font-medium text-gray-800">{q.role_type?.name ?? q.role_type?.code}</span>
                  {q.competence_basis && <span className="text-gray-500">— {q.competence_basis.short_label}</span>}
                </div>
                {q.qualified_at && (
                  <div className="text-xs text-gray-500 mt-1">
                    Qualified {new Date(q.qualified_at).toLocaleDateString()}
                    {q.re_qualification_due && ` · re-qualification due ${new Date(q.re_qualification_due).toLocaleDateString()}`}
                  </div>
                )}
                {q.language_pair_qualifications?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {q.language_pair_qualifications.map((p, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-700">
                        {p.source_language?.name ?? p.source_language?.code}
                        {p.direction === 'both_directions' ? ' ↔ ' : ' → '}
                        {p.target_language?.name ?? p.target_language?.code}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {showForm && (
        <QmsRecordForm
          vendorId={vendorId}
          staffId={staffId}
          competenceBases={competenceBases}
          evidenceTypes={evidenceTypes}
          languages={languages}
          hasActiveNda={hasActiveNda}
          submitting={submitting}
          setSubmitting={setSubmitting}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            loadData();
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
}

function QmsRecordForm({
  vendorId, staffId, competenceBases, evidenceTypes, languages,
  hasActiveNda, submitting, setSubmitting, onClose, onSaved,
}: {
  vendorId: string;
  staffId: string | null;
  competenceBases: CompetenceBasisOpt[];
  evidenceTypes: EvidenceTypeOpt[];
  languages: LanguageOpt[];
  hasActiveNda: boolean;
  submitting: boolean;
  setSubmitting: (b: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [roleCode, setRoleCode] = useState("translator");
  const [basisCode, setBasisCode] = useState("");
  const [evidenceTypeCode, setEvidenceTypeCode] = useState("");
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceOrg, setEvidenceOrg] = useState("");
  const [evidenceIssued, setEvidenceIssued] = useState("");
  const [evidenceExpiry, setEvidenceExpiry] = useState("");
  const [evidenceNotes, setEvidenceNotes] = useState("");
  const [ndaSignedDate, setNdaSignedDate] = useState("");
  const [pairs, setPairs] = useState<{ source: string; target: string; direction: string }[]>([
    { source: "", target: "", direction: "source_to_target" },
  ]);

  const filteredBases = competenceBases.filter((b) => b.role_type_code === roleCode);

  const handleSubmit = async () => {
    if (!staffId) { toast.error("No staff session — cannot record qualification"); return; }
    if (!basisCode) { toast.error("Pick a competence basis"); return; }
    if (!evidenceTypeCode) { toast.error("Pick an evidence type"); return; }
    if (!evidenceTitle.trim()) { toast.error("Evidence title is required"); return; }
    if (!hasActiveNda && !ndaSignedDate) { toast.error("Vendor has no active NDA — provide signed date"); return; }
    const validPairs = pairs.filter((p) => p.source && p.target);
    if (validPairs.length === 0) { toast.error("Add at least one language pair"); return; }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-record-qualification", {
        body: {
          vendor_id: vendorId,
          role_code: roleCode,
          competence_basis_code: basisCode,
          evidence: {
            type_code: evidenceTypeCode,
            title: evidenceTitle,
            issuing_organization: evidenceOrg || undefined,
            issued_date: evidenceIssued || undefined,
            expiry_date: evidenceExpiry || undefined,
            notes: evidenceNotes || undefined,
          },
          nda: hasActiveNda ? undefined : { signed_date: ndaSignedDate },
          language_pairs: validPairs.map((p) => ({
            source: languages.find((l) => l.id === p.source)?.code,
            target: languages.find((l) => l.id === p.target)?.code,
            direction: p.direction,
          })),
          staff_id: staffId,
        },
      });
      if (error || !data?.success) {
        toast.error(data?.error ?? error?.message ?? "Failed to record qualification");
        return;
      }
      toast.success("Vendor qualification recorded");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-800">Mark vendor qualified</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              Role
              <select
                value={roleCode}
                onChange={(e) => { setRoleCode(e.target.value); setBasisCode(""); }}
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
              >
                {ROLE_CODES.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
              </select>
            </label>
            <label className="text-sm">
              Competence basis (ISO §3.1.4)
              <select
                value={basisCode}
                onChange={(e) => setBasisCode(e.target.value)}
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
              >
                <option value="">Select…</option>
                {filteredBases.map((b) => <option key={b.id} value={b.code}>{b.short_label}</option>)}
              </select>
            </label>
          </div>

          <div className="border-t pt-3">
            <div className="text-sm font-medium text-gray-700 mb-2">Evidence (verified off-platform by you)</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                Type
                <select value={evidenceTypeCode} onChange={(e) => setEvidenceTypeCode(e.target.value)}
                  className="mt-1 w-full border rounded px-2 py-1.5 text-sm">
                  <option value="">Select…</option>
                  {evidenceTypes.map((t) => <option key={t.id} value={t.code}>{t.name}</option>)}
                </select>
              </label>
              <label className="text-sm">
                Title
                <input value={evidenceTitle} onChange={(e) => setEvidenceTitle(e.target.value)}
                  placeholder="e.g. MA Translation, University of Toronto"
                  className="mt-1 w-full border rounded px-2 py-1.5 text-sm" />
              </label>
              <label className="text-sm">
                Issuing organization
                <input value={evidenceOrg} onChange={(e) => setEvidenceOrg(e.target.value)}
                  placeholder="Optional" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" />
              </label>
              <label className="text-sm">
                Issued date
                <input type="date" value={evidenceIssued} onChange={(e) => setEvidenceIssued(e.target.value)}
                  className="mt-1 w-full border rounded px-2 py-1.5 text-sm" />
              </label>
              <label className="text-sm">
                Expiry date (optional)
                <input type="date" value={evidenceExpiry} onChange={(e) => setEvidenceExpiry(e.target.value)}
                  className="mt-1 w-full border rounded px-2 py-1.5 text-sm" />
              </label>
              <label className="text-sm col-span-2">
                Verification notes
                <textarea value={evidenceNotes} onChange={(e) => setEvidenceNotes(e.target.value)}
                  rows={2} placeholder="What did you check? Where is the source document filed?"
                  className="mt-1 w-full border rounded px-2 py-1.5 text-sm" />
              </label>
            </div>
          </div>

          {!hasActiveNda && (
            <div className="border-t pt-3">
              <div className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-500" /> NDA needed
              </div>
              <label className="text-sm">
                NDA signed date *
                <input type="date" value={ndaSignedDate} onChange={(e) => setNdaSignedDate(e.target.value)}
                  className="mt-1 w-full border rounded px-2 py-1.5 text-sm" />
              </label>
            </div>
          )}

          <div className="border-t pt-3">
            <div className="text-sm font-medium text-gray-700 mb-2">Language pairs</div>
            <div className="space-y-2">
              {pairs.map((p, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <select value={p.source} onChange={(e) => {
                    const next = [...pairs]; next[i].source = e.target.value; setPairs(next);
                  }} className="col-span-4 border rounded px-2 py-1.5 text-sm">
                    <option value="">Source…</option>
                    {languages.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
                  </select>
                  <select value={p.target} onChange={(e) => {
                    const next = [...pairs]; next[i].target = e.target.value; setPairs(next);
                  }} className="col-span-4 border rounded px-2 py-1.5 text-sm">
                    <option value="">Target…</option>
                    {languages.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
                  </select>
                  <select value={p.direction} onChange={(e) => {
                    const next = [...pairs]; next[i].direction = e.target.value; setPairs(next);
                  }} className="col-span-3 border rounded px-2 py-1.5 text-sm">
                    {DIRECTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                  {pairs.length > 1 && (
                    <button onClick={() => setPairs(pairs.filter((_, idx) => idx !== i))}
                      className="col-span-1 text-gray-400 hover:text-red-600 text-lg">×</button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setPairs([...pairs, { source: "", target: "", direction: "source_to_target" }])}
                className="text-xs text-teal-700 hover:text-teal-800"
              >+ Add pair</button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
          <button onClick={onClose} disabled={submitting} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Record qualification
          </button>
        </div>
      </div>
    </div>
  );
}
