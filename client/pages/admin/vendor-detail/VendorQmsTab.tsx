// VendorQmsTab — staff-driven QMS qualification entry (R14).
// Shows the vendor's current qms.role_qualifications + qms.nda_agreements +
// recent qms.assignment_eligibility_events, and lets staff record a new
// qualification (role + competence basis + verified evidence + language pairs)
// via the admin-record-qualification edge function. The edge function calls
// qms.record_qualification, which writes evidence/NDA/qualification/pairs in
// one transaction.

import { useEffect, useState, useMemo } from "react";
import { Loader2, Plus, ShieldCheck, ShieldAlert, AlertTriangle, Upload, X, Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import { toast } from "sonner";
import type { TabProps } from "./types";

const ROLE_CODES = [
  { code: "translator",  label: "Translator" },
  { code: "reviser",     label: "Reviser" },
  { code: "reviewer",    label: "Reviewer (domain specialist)" },
  { code: "post_editor", label: "Post-editor" },
  { code: "interpreter", label: "Interpreter" },
] as const;

const DIRECTIONS = [
  { value: "source_to_target", label: "One-way (source → target)" },
  { value: "both_directions",  label: "Bidirectional" },
] as const;

// Verification tier display. "verified" = a human checked the primary document;
// "screened" = AI-extracted from the self-declared CV, pending verification.
// Qualification status display. under_review = provisional (screened-only or
// awaiting Tier-2 verification) — NOT ISO/COA-qualified until verified.
const STATUS_META: Record<string, { label: string; chip: string }> = {
  qualified:    { label: "qualified",  chip: "bg-green-50 text-green-700" },
  under_review: { label: "Provisional — not ISO/COA qualified", chip: "bg-amber-50 text-amber-700" },
  suspended:    { label: "suspended",  chip: "bg-red-50 text-red-700" },
  expired:      { label: "expired",    chip: "bg-gray-100 text-gray-600" },
  withdrawn:    { label: "withdrawn",  chip: "bg-gray-100 text-gray-600" },
};

const TIER_META: Record<string, { label: string; chip: string }> = {
  verified:   { label: "Verified",  chip: "bg-teal-50 text-teal-700 border border-teal-200" },
  screened:   { label: "Screened — pending verification", chip: "bg-amber-50 text-amber-700 border border-amber-200" },
  unverified: { label: "Unverified", chip: "bg-gray-100 text-gray-600 border border-gray-200" },
};
function tierOf(e: { verified: boolean; tier?: string | null; verification_method?: string | null }): "verified" | "screened" | "unverified" {
  if (e.tier === "verified" || e.tier === "screened" || e.tier === "unverified") return e.tier;
  if (e.verified) return "verified";
  if (e.verification_method === "ai_cv_extraction") return "screened";
  return "unverified";
}
// A qualification's overall standing = its weakest evidence tier.
function qualTier(evidence?: Array<{ verified: boolean; tier?: string | null; verification_method?: string | null }>): "verified" | "screened" | "unverified" | null {
  if (!evidence || evidence.length === 0) return null;
  const tiers = evidence.map(tierOf);
  if (tiers.includes("unverified")) return "unverified";
  if (tiers.includes("screened")) return "screened";
  return "verified";
}

// True when the AI screen flagged a concern (name mismatch / wrong doc type)
// in the verification notes — staff should not blind-verify these.
function hasAiConcern(e: { verification_notes?: string | null }): boolean {
  const n = (e.verification_notes ?? "");
  return /name match:\s*no\b/i.test(n) || /\bMISMATCH\b/.test(n) || /Concerns:\s*\S/.test(n);
}

function EvidenceItem({ e, onVerify, onView }: { e: EvidenceRow; onVerify: () => void; onView: () => void }) {
  const t = tierOf(e);
  return (
    <li className="text-xs text-gray-700">
      <div className="flex items-center gap-1.5 flex-wrap">
        {t === "verified"
          ? <ShieldCheck className="w-3.5 h-3.5 text-teal-600 shrink-0" />
          : <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
        <span className="font-medium text-gray-800">{e.title}</span>
        {e.evidence_type && <span className="text-gray-500">· {e.evidence_type}</span>}
        {e.issuing_organization && <span className="text-gray-500">· {e.issuing_organization}</span>}
        <span className={`px-1.5 py-0.5 rounded ${TIER_META[t].chip}`}>{TIER_META[t].label}</span>
        {e.has_file && (
          <button onClick={onView} className="px-1.5 py-0.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1">
            <Download className="w-3 h-3" /> View document
          </button>
        )}
        {e.has_hash && <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">sha-256 ✓</span>}
        {t === "verified" && e.verified_at && <span className="text-gray-400">verified {new Date(e.verified_at).toLocaleDateString()}</span>}
        {t !== "verified" && (
          <button onClick={onVerify} className="ml-1 px-2 py-0.5 rounded border border-teal-300 text-teal-700 hover:bg-teal-50 font-medium">
            Verify
          </button>
        )}
      </div>
      {e.verification_notes && (
        <div className="text-gray-500 mt-0.5 pl-5 whitespace-pre-wrap">{e.verification_notes}</div>
      )}
    </li>
  );
}

interface EvidenceRow {
  id: string;
  title: string;
  evidence_type: string | null;
  issuing_organization: string | null;
  verified: boolean;
  tier?: "verified" | "screened" | "unverified" | null;
  verification_method: string | null;
  verification_notes: string | null;
  verified_at: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  has_file: boolean;
  has_hash: boolean;
}

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
  subject_matter_qualifications?: Array<{
    subject_matter: { id: string; name: string } | null;
    proficiency: string;
    notes: string | null;
  }>;
  evidence?: EvidenceRow[];
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
  const [unlinkedEvidence, setUnlinkedEvidence] = useState<EvidenceRow[]>([]);
  const [ndas, setNdas] = useState<NdaRow[]>([]);
  const [portalNdaSignedAt, setPortalNdaSignedAt] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Verify a screened/unverified evidence row → Tier-2.
  const [verifyTarget, setVerifyTarget] = useState<{ id: string; title: string; concern: boolean } | null>(null);
  // Upload a new document into the locker (optionally linked to a qualification).
  const [uploadTarget, setUploadTarget] = useState<{ roleQualificationId: string | null; label: string } | null>(null);

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
      setUnlinkedEvidence((data.unlinked_evidence as EvidenceRow[]) ?? []);
      setNdas((data.ndas as NdaRow[]) ?? []);
      setPortalNdaSignedAt((data.portal_nda_signed_at as string | null) ?? null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load QMS data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, [vendorId]);

  // Public views over qms.competence_bases + qms.evidence_types — see
  // migration 20260602_qms_public_lookup_views_v2.sql.
  const ensureLookups = async () => {
    if (competenceBases.length > 0 && evidenceTypes.length > 0) return;
    const [cb, ev, lg] = await Promise.all([
      supabase.from("qms_competence_bases" as any).select("id, code, short_label, role_type_code"),
      supabase.from("qms_evidence_types" as any).select("id, code, name, applies_to_roles"),
      supabase.from("languages").select("id, code, name").order("name"),
    ]);
    setCompetenceBases((cb.data ?? []) as CompetenceBasisOpt[]);
    setEvidenceTypes((ev.data ?? []) as EvidenceTypeOpt[]);
    setLanguages(lg.data ?? []);
  };

  const openForm = async () => { await ensureLookups(); setShowForm(true); };
  const openUpload = async (roleQualificationId: string | null, label: string) => {
    await ensureLookups();
    setUploadTarget({ roleQualificationId, label });
  };

  // Open the uploaded document behind an evidence row (short-lived signed URL).
  const handleViewEvidence = async (evidenceId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("qms-evidence-download", {
        body: { evidence_id: evidenceId, staff_id: staffId },
      });
      if (error || !data?.success) { toast.error(data?.error ?? error?.message ?? "Could not open document"); return; }
      window.open(data.signed_url as string, "_blank", "noopener");
    } catch (e: any) { toast.error(e?.message ?? "Could not open document"); }
  };

  // Flip a screened/unverified evidence row to Tier-2 (verified).
  const handleVerify = async (method: string, notes: string) => {
    if (!verifyTarget) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-qms-evidence", {
        body: { action: "verify", staff_id: staffId, evidence_id: verifyTarget.id, verification_method: method, verification_notes: notes },
      });
      if (error || !data?.success) { toast.error(data?.error ?? error?.message ?? "Verification failed"); return; }
      toast.success("Evidence verified");
      setVerifyTarget(null);
      await loadData();
    } catch (e: any) { toast.error(e?.message ?? "Verification failed"); }
    finally { setSubmitting(false); }
  };

  // Generate first-party experience evidence from Cethos payment/PO records.
  const [buildingFp, setBuildingFp] = useState(false);
  const handleBuildFirstParty = async () => {
    setBuildingFp(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-qms-evidence", {
        body: { action: "build_first_party", staff_id: staffId, vendor_id: vendorId, dry_run: false },
      });
      if (error || !data?.success) { toast.error(data?.error ?? error?.message ?? "Generate failed"); return; }
      const r = data.result ?? {};
      if (r.found === false) { toast.info("No Cethos payment records on file for this vendor (legacy/XTRF history not imported)."); return; }
      toast.success(`First-party evidence recorded: ${r.jobs} job(s), ${r.earliest} → ${r.latest}`);
      await loadData();
    } catch (e: any) { toast.error(e?.message ?? "Generate failed"); }
    finally { setBuildingFp(false); }
  };

  // Add a new document into the locker (optionally linked to a qualification).
  const handleAddEvidence = async (payload: {
    evidence_type_code: string; title: string; issuing_organization?: string;
    issued_date?: string; expiry_date?: string; verified: boolean;
    verification_method?: string; verification_notes?: string;
    file?: { name: string; mime: string; base64: string } | null;
  }) => {
    if (!uploadTarget) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-qms-evidence", {
        body: { action: "add", staff_id: staffId, vendor_id: vendorId, role_qualification_id: uploadTarget.roleQualificationId, ...payload },
      });
      if (error || !data?.success) { toast.error(data?.error ?? error?.message ?? "Upload failed"); return; }
      toast.success("Evidence added");
      setUploadTarget(null);
      await loadData();
    } catch (e: any) { toast.error(e?.message ?? "Upload failed"); }
    finally { setSubmitting(false); }
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
          {qualifications.length > 0 ? "Add qualification" : "Mark vendor qualified"}
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
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_META[q.status]?.chip ?? 'bg-gray-100 text-gray-600'}`}>{STATUS_META[q.status]?.label ?? q.status}</span>
                  <span className="font-medium text-gray-800">{q.role_type?.name ?? q.role_type?.code}</span>
                  {q.competence_basis && <span className="text-gray-500">— {q.competence_basis.short_label}</span>}
                  {(() => {
                    const t = qualTier(q.evidence);
                    return t ? (
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_META[t].chip}`} title={t === 'screened' ? 'Qualified on AI-screened CV evidence; awaiting verification against a primary document.' : undefined}>
                        {TIER_META[t].label}
                      </span>
                    ) : null;
                  })()}
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
                {q.subject_matter_qualifications && q.subject_matter_qualifications.length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs text-gray-500 mb-1">Subject-matter competence (ISO §6.1.6 / COA §5.2)</div>
                    <div className="flex flex-wrap gap-1">
                      {q.subject_matter_qualifications.map((s, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded" title={s.notes ?? undefined}>
                          {s.subject_matter?.name}{s.proficiency ? ` · ${s.proficiency}` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-2 border-t border-gray-100 pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs text-gray-500">Evidence / proof</div>
                    <button
                      onClick={() => openUpload(q.id, `${q.role_type?.name ?? q.role_type?.code} qualification`)}
                      className="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 inline-flex items-center gap-1"
                    >
                      <Upload className="w-3 h-3" /> Add document
                    </button>
                  </div>
                  {q.evidence && q.evidence.length > 0 ? (
                    <ul className="space-y-1.5">
                      {q.evidence.map((e) => (
                        <EvidenceItem key={e.id} e={e} onVerify={() => setVerifyTarget({ id: e.id, title: e.title, concern: hasAiConcern(e) })} onView={() => handleViewEvidence(e.id)} />
                      ))}
                    </ul>
                  ) : (
                    <div className="text-xs text-gray-400">No evidence documents on this qualification yet.</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Evidence locker — documents not tied to a single qualification
          (e.g. CVs, references, payment statements, certifications). */}
      <div className="rounded-lg border bg-white">
        <div className="px-4 py-2 border-b flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Evidence locker</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBuildFirstParty}
              disabled={buildingFp}
              title="Record verified first-party experience evidence from this vendor's Cethos payment/PO records (ISO §3.1.4)."
              className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 inline-flex items-center gap-1 disabled:opacity-50"
            >
              {buildingFp ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />} Generate from payment history
            </button>
            <button
              onClick={() => openUpload(null, "vendor evidence locker")}
              className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 inline-flex items-center gap-1"
            >
              <Upload className="w-3 h-3" /> Upload document
            </button>
          </div>
        </div>
        {loading ? (
          <div className="p-4 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : unlinkedEvidence.length === 0 ? (
          <div className="p-4 text-xs text-gray-400">No locker documents. Use "Upload document" to file a diploma, reference, certification, or first-party payment statement that isn't tied to one qualification.</div>
        ) : (
          <ul className="p-4 space-y-1.5">
            {unlinkedEvidence.map((e) => (
              <EvidenceItem key={e.id} e={e} onVerify={() => setVerifyTarget({ id: e.id, title: e.title, concern: hasAiConcern(e) })} onView={() => handleViewEvidence(e.id)} />
            ))}
          </ul>
        )}
      </div>

      {verifyTarget && (
        <VerifyEvidenceModal
          title={verifyTarget.title}
          concern={verifyTarget.concern}
          submitting={submitting}
          onCancel={() => setVerifyTarget(null)}
          onSubmit={handleVerify}
        />
      )}

      {uploadTarget && (
        <AddEvidenceModal
          label={uploadTarget.label}
          evidenceTypes={evidenceTypes}
          submitting={submitting}
          onCancel={() => setUploadTarget(null)}
          onSubmit={handleAddEvidence}
        />
      )}

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

const VERIFY_METHODS = [
  { value: "document_review", label: "Checked the primary document (diploma / certificate)" },
  { value: "first_party_records", label: "Cethos first-party payment / PO records" },
  { value: "reference_check", label: "Professional reference confirmed" },
  { value: "external_register", label: "Verified against issuing body / external register" },
  { value: "professional_membership", label: "Professional membership confirmed" },
] as const;

function VerifyEvidenceModal({ title, concern, submitting, onCancel, onSubmit }: {
  title: string;
  concern: boolean;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (method: string, notes: string) => void;
}) {
  const [method, setMethod] = useState("document_review");
  const [notes, setNotes] = useState("");
  // When the AI flagged a concern, require a written override reason before verifying.
  const blocked = concern && notes.trim().length < 5;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-sm font-semibold text-gray-900">Verify evidence</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="text-gray-600">Marking <span className="font-medium text-gray-800">{title}</span> as Tier-2 verified. This records you as the verifier, with the date and method, for the audit trail.</div>
          {concern && (
            <div className="flex items-start gap-2 p-2.5 rounded border border-red-200 bg-red-50 text-xs text-red-800">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <strong>The AI screen flagged a concern</strong> on this document (e.g. the name doesn't match the vendor, or it's the wrong document type). Review the document and the notes above before verifying. To proceed anyway, record an override reason below.
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">How was it verified?</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
              {VERIFY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {concern ? "Override reason — required (what you checked, why it's valid despite the flag)" : "Verification notes (what you checked)"}
            </label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`w-full border rounded px-2 py-1.5 text-sm ${blocked ? "border-red-300" : ""}`} placeholder="e.g. Confirmed BA Translation diploma scan against issuing university; dates match CV." />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
          <button onClick={onCancel} disabled={submitting} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={() => onSubmit(method, notes)} disabled={submitting || blocked} className={`px-4 py-2 text-sm text-white rounded disabled:opacity-50 inline-flex items-center gap-1.5 ${concern ? "bg-red-600 hover:bg-red-700" : "bg-teal-600 hover:bg-teal-700"}`}>
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {concern ? "Override & verify" : "Mark verified"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddEvidenceModal({ label, evidenceTypes, submitting, onCancel, onSubmit }: {
  label: string;
  evidenceTypes: EvidenceTypeOpt[];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: {
    evidence_type_code: string; title: string; issuing_organization?: string;
    issued_date?: string; expiry_date?: string; verified: boolean;
    verification_method?: string; verification_notes?: string;
    file?: { name: string; mime: string; base64: string } | null;
  }) => void;
}) {
  const [typeCode, setTypeCode] = useState("");
  const [title, setTitle] = useState("");
  const [org, setOrg] = useState("");
  const [issued, setIssued] = useState("");
  const [expiry, setExpiry] = useState("");
  const [verified, setVerified] = useState(true);
  const [method, setMethod] = useState("document_review");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const submit = async () => {
    if (!typeCode || !title.trim()) { toast.error("Evidence type and title are required"); return; }
    let filePayload: { name: string; mime: string; base64: string } | null = null;
    if (file) {
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      filePayload = { name: file.name, mime: file.type || "application/octet-stream", base64 };
    }
    onSubmit({
      evidence_type_code: typeCode,
      title: title.trim(),
      issuing_organization: org.trim() || undefined,
      issued_date: issued || undefined,
      expiry_date: expiry || undefined,
      verified,
      verification_method: verified ? method : undefined,
      verification_notes: notes.trim() || undefined,
      file: filePayload,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-sm font-semibold text-gray-900">Add evidence document</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="text-xs text-gray-500">Filing into: <span className="text-gray-700">{label}</span></div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Evidence type *</label>
            <select value={typeCode} onChange={(e) => setTypeCode(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
              <option value="">Select…</option>
              {evidenceTypes.map((t) => <option key={t.id} value={t.code}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" placeholder="e.g. BA in Translation — diploma" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Issuing organization</label>
            <input value={org} onChange={(e) => setOrg(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" placeholder="e.g. Universidad de Tarapacá" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Issued date</label>
              <input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Expiry date</label>
              <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Document file</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.doc,.docx,.xls,.xlsx,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="w-full text-sm" />
            <div className="text-xs text-gray-400 mt-1">Stored in the qms-evidence locker; a SHA-256 hash is recorded for integrity.</div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
            <span>Mark as <span className="font-medium">Verified</span> (a human has reviewed this document)</span>
          </label>
          {verified && (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Verification method</label>
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
                  {VERIFY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Verification notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
          <button onClick={onCancel} disabled={submitting} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={submit} disabled={submitting} className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50 inline-flex items-center gap-1.5">
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Add evidence
          </button>
        </div>
      </div>
    </div>
  );
}
