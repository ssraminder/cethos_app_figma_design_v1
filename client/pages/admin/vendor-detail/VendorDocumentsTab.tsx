/**
 * VendorDocumentsTab
 * Surfaces document storage for a vendor that previously only lived on
 * the recruitment side — CV, references, certifications, signed NDA.
 * Joins via vendor.email to cvp_applications / cvp_application_references
 * because the original application data isn't backfilled onto the vendor
 * row when a candidate gets promoted.
 *
 * Phase A: read-only display, signed-URL downloads.
 * Phase B (next): per-doc ISO 17100 assessment.
 */

import { useEffect, useState } from "react";
import {
  Loader2,
  FileText,
  Download,
  Mail,
  Star,
  StarOff,
  ShieldCheck,
  AlertCircle,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { TabProps } from "./types";
import IsoAssessmentSection from "./IsoAssessmentSection";
import VendorReferencesSection from "./VendorReferencesSection";
import VendorDocumentRequestSection from "./VendorDocumentRequestSection";

interface CvpApplication {
  id: string;
  application_number: string | null;
  email: string;
  full_name: string;
  cv_storage_path: string | null;
  certifications: string[] | null;
  education_level: string | null;
  years_experience: number | null;
  cat_tools: string[] | null;
  specializations?: string[] | null;
  domains_offered: string[] | null;
  linkedin_url: string | null;
  status: string;
  created_at: string;
}

interface CvpReference {
  id: string;
  application_id: string;
  reference_name: string;
  reference_email: string;
  reference_company: string | null;
  reference_relationship: string | null;
  feedback_text: string | null;
  feedback_rating: number | null;
  feedback_received_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  ai_analysis: Record<string, unknown> | null;
  status: string;
  created_at: string;
}

interface NdaSig {
  id: string;
  signed_at: string;
  signed_full_name: string;
  is_current: boolean;
  nda_template_id: string;
  template_version_label?: string | null;
}

interface VendorCv {
  id: string;
  version: number;
  file_name: string;
  file_size_bytes: number | null;
  content_type: string | null;
  uploaded_by_vendor: boolean;
  notes: string | null;
  is_current: boolean;
  superseded_at: string | null;
  created_at: string;
  download_url: string | null;
}

export default function VendorDocumentsTab({ vendorData }: TabProps) {
  const { vendor } = vendorData;
  const [loading, setLoading] = useState(true);
  const [application, setApplication] = useState<CvpApplication | null>(null);
  const [refs, setRefs] = useState<CvpReference[]>([]);
  const [nda, setNda] = useState<NdaSig | null>(null);
  const [downloadingCv, setDownloadingCv] = useState(false);
  const [vendorCvs, setVendorCvs] = useState<VendorCv[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);

      // Prefer the FK link on vendors.cvp_translator_id when present —
      // it survives email rotation and unambiguously points at the
      // recruitment artifact this vendor came from. Fall back to the
      // legacy ilike-email lookup for vendors that pre-date the
      // recruitment flow OR whose link hasn't been backfilled.
      //
      // The vendor object loaded by AdminVendorDetail's edge fn doesn't
      // currently include cvp_translator_id, so we read it from
      // `vendors` ourselves rather than waiting on a backend redeploy.
      let app: CvpApplication | null = null;
      const { data: vendorLink } = await supabase
        .from("vendors")
        .select("cvp_translator_id")
        .eq("id", vendor.id)
        .maybeSingle();
      const translatorId = (vendorLink as { cvp_translator_id: string | null } | null)?.cvp_translator_id ?? null;

      if (translatorId) {
        const { data: t } = await supabase
          .from("cvp_translators")
          .select("application_id")
          .eq("id", translatorId)
          .maybeSingle();
        const linkedAppId = (t as { application_id: string | null } | null)?.application_id ?? null;
        if (linkedAppId) {
          const { data: linkedApp } = await supabase
            .from("cvp_applications")
            .select(
              "id, application_number, email, full_name, cv_storage_path, certifications, education_level, years_experience, cat_tools, domains_offered, linkedin_url, status, created_at",
            )
            .eq("id", linkedAppId)
            .maybeSingle();
          app = (linkedApp as CvpApplication | null) ?? null;
        }
      }

      if (!app) {
        // Email fallback. Latest by created_at — vendors with multiple
        // applications over time should see the most recent one.
        const { data: apps } = await supabase
          .from("cvp_applications")
          .select(
            "id, application_number, email, full_name, cv_storage_path, certifications, education_level, years_experience, cat_tools, domains_offered, linkedin_url, status, created_at",
          )
          .ilike("email", vendor.email)
          .order("created_at", { ascending: false })
          .limit(1);
        app = (apps?.[0] ?? null) as CvpApplication | null;
      }

      // References tied to that application (or any application from
      // this vendor's email if they have multiple).
      let referenceRows: CvpReference[] = [];
      if (app) {
        const { data: r } = await supabase
          .from("cvp_application_references")
          .select(
            "id, application_id, reference_name, reference_email, reference_company, reference_relationship, feedback_text, feedback_rating, feedback_received_at, declined_at, decline_reason, ai_analysis, status, created_at",
          )
          .eq("application_id", app.id)
          .order("created_at", { ascending: false });
        referenceRows = (r ?? []) as CvpReference[];
      }

      // Latest current NDA signature for the deep link.
      const { data: ndaRow } = await supabase
        .from("vendor_nda_signatures")
        .select("id, signed_at, signed_full_name, is_current, nda_template_id")
        .eq("vendor_id", vendor.id)
        .eq("is_current", true)
        .order("signed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let ndaWithVersion: NdaSig | null = (ndaRow ?? null) as NdaSig | null;
      if (ndaWithVersion?.nda_template_id) {
        const { data: tpl } = await supabase
          .from("nda_templates")
          .select("version_label")
          .eq("id", ndaWithVersion.nda_template_id)
          .maybeSingle();
        ndaWithVersion = { ...ndaWithVersion, template_version_label: tpl?.version_label ?? null };
      }

      // Vendor-uploaded CV versions (post-onboarding). Edge function
      // returns the list with short-lived signed URLs.
      let vendorCvRows: VendorCv[] = [];
      try {
        const { data: cvList } = await supabase.functions.invoke("vendor-list-cvs", {
          body: { vendor_id: vendor.id, expiry_seconds: 600 },
        });
        if (cvList?.success && Array.isArray(cvList.cvs)) {
          vendorCvRows = cvList.cvs as VendorCv[];
        }
      } catch {
        /* tolerate — section will show empty state */
      }

      if (cancelled) return;
      setApplication(app);
      setRefs(referenceRows);
      setNda(ndaWithVersion);
      setVendorCvs(vendorCvRows);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [vendor.id, vendor.email]);

  const downloadCv = async () => {
    if (!application?.id) return;
    setDownloadingCv(true);
    try {
      const { data, error } = await supabase.functions.invoke("cvp-get-cv-url", {
        body: { applicationId: application.id, expirySeconds: 600 },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Could not generate CV URL");
      const url: string | undefined = data?.data?.download_url ?? data?.data?.signed_url;
      if (!url) throw new Error("No signed URL returned");
      // Pop a new tab so the browser handles the download/preview
      // without disturbing the current admin context.
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to fetch CV",
      );
    }
    setDownloadingCv(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  // Certifications can come from either the application or the live
  // vendor row. Merge + de-dupe so we show the union.
  const certificationsRaw = [
    ...(application?.certifications ?? []),
    ...(Array.isArray(vendor.certifications) ? vendor.certifications : []),
  ];
  const certifications = Array.from(new Set(certificationsRaw.filter((c) => typeof c === "string" && c.trim())));

  return (
    <div className="space-y-5">
      {!application && (
        <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-700 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <div className="font-semibold text-amber-900">No application on file</div>
            <div className="text-amber-800 mt-0.5">
              We couldn't find a recruitment application for{" "}
              <span className="font-mono">{vendor.email}</span>. Vendors imported
              before the recruitment flow shipped won't have a CV / references
              here. You can still see certifications, NDA, and other admin tabs.
            </div>
          </div>
        </div>
      )}

      {/* ISO 17100 assessment */}
      <IsoAssessmentSection vendorId={vendor.id} />

      {/* Admin → vendor: request missing ISO 17100 evidence */}
      <VendorDocumentRequestSection
        vendorId={vendor.id}
        vendorFirstName={(vendor.full_name || "").split(" ")[0] || ""}
      />

      {/* CV (post-onboarding uploads from vendor portal) */}
      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900">
              CV — vendor uploads
              {vendorCvs.length > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-500">
                  {vendorCvs.length} {vendorCvs.length === 1 ? "version" : "versions"}
                </span>
              )}
            </h3>
          </div>
        </div>
        {vendorCvs.length === 0 ? (
          <p className="text-xs text-gray-400 italic">
            Vendor has not uploaded a CV through the portal yet.
          </p>
        ) : (
          <div className="border border-gray-100 rounded divide-y divide-gray-100">
            {vendorCvs.map((cv) => (
              <div
                key={cv.id}
                className={`flex items-start justify-between gap-4 px-3 py-2.5 text-xs ${
                  cv.is_current ? "bg-emerald-50/40" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="font-medium text-gray-900">
                    v{cv.version} {cv.is_current && (
                      <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="text-gray-500 mt-0.5 truncate">{cv.file_name}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {cv.file_size_bytes ? `${(cv.file_size_bytes / 1024).toFixed(0)} KB · ` : ""}
                    {new Date(cv.created_at).toLocaleString()}
                    {cv.uploaded_by_vendor ? " · by vendor" : " · by staff"}
                    {cv.superseded_at && ` · superseded ${new Date(cv.superseded_at).toLocaleDateString()}`}
                  </div>
                  {cv.notes && (
                    <p className="text-[11px] text-gray-600 mt-1 italic">"{cv.notes}"</p>
                  )}
                </div>
                {cv.download_url && (
                  <a
                    href={cv.download_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-700 bg-white border border-teal-300 rounded hover:bg-teal-50"
                  >
                    <Download className="w-3 h-3" /> Download
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* CV — recruitment application (legacy / first CV) */}
      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900">CV — recruitment application</h3>
          </div>
          {application?.cv_storage_path && (
            <button
              onClick={downloadCv}
              disabled={downloadingCv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-700 bg-white border border-teal-300 rounded hover:bg-teal-50 disabled:opacity-50"
            >
              {downloadingCv ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {downloadingCv ? "Generating link…" : "Download"}
            </button>
          )}
        </div>
        {application?.cv_storage_path ? (
          <p className="text-xs text-gray-500">
            From application {application.application_number ? `#${application.application_number}` : application.id.slice(0, 8)} —{" "}
            submitted {new Date(application.created_at).toLocaleDateString()}.
          </p>
        ) : (
          <p className="text-xs text-gray-400 italic">No recruitment CV on file.</p>
        )}
      </section>

      {/* Vendor-side references (post-onboarding) */}
      <VendorReferencesSection vendorId={vendor.id} />

      {/* References from recruitment application */}
      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900">
              References — recruitment application ({refs.length})
            </h3>
          </div>
          {application && (
            <Link
              to={`/admin/recruitment/${application.id}`}
              className="inline-flex items-center gap-1 text-xs text-teal-700 hover:text-teal-900"
            >
              Open in Recruitment
              <ExternalLink className="w-3 h-3" />
            </Link>
          )}
        </div>

        {refs.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No references on file.</p>
        ) : (
          <div className="space-y-2">
            {refs.map((r) => (
              <div
                key={r.id}
                className="border border-gray-100 rounded p-3 text-xs"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">
                      {r.reference_name || "(unnamed reference)"}
                      {r.reference_company && (
                        <span className="text-gray-500 font-normal">
                          {" · "}{r.reference_company}
                        </span>
                      )}
                    </div>
                    <div className="text-gray-500 truncate mt-0.5">
                      {r.reference_email}
                      {r.reference_relationship && (
                        <span> · {r.reference_relationship}</span>
                      )}
                    </div>
                  </div>
                  <RefStatusBadge r={r} />
                </div>

                {r.feedback_text && (
                  <details className="mt-2">
                    <summary className="text-teal-700 cursor-pointer hover:text-teal-900 text-[11px]">
                      Show feedback
                    </summary>
                    <p className="mt-1 text-gray-700 whitespace-pre-wrap p-2 bg-gray-50 rounded border border-gray-100">
                      {r.feedback_text}
                    </p>
                    {r.feedback_rating != null && (
                      <div className="mt-1 flex items-center gap-1 text-gray-500">
                        <RatingStars rating={r.feedback_rating} />
                        <span>({r.feedback_rating}/5)</span>
                      </div>
                    )}
                    {r.ai_analysis && Object.keys(r.ai_analysis).length > 0 && (
                      <details className="mt-2">
                        <summary className="text-gray-500 cursor-pointer text-[10px] uppercase tracking-wider">
                          AI analysis
                        </summary>
                        <pre className="mt-1 p-2 bg-gray-50 rounded border border-gray-100 overflow-x-auto text-[10px] text-gray-600">
                          {JSON.stringify(r.ai_analysis, null, 2)}
                        </pre>
                      </details>
                    )}
                  </details>
                )}
                {r.declined_at && (
                  <p className="mt-1 text-gray-500 italic">
                    Declined {new Date(r.declined_at).toLocaleDateString()}
                    {r.decline_reason && `: ${r.decline_reason}`}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Certifications */}
      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            Certifications ({certifications.length})
          </h3>
        </div>
        {certifications.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No certifications recorded.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {certifications.map((c) => (
              <li
                key={c}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700"
              >
                {c}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Application metadata */}
      {application && (
        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Application snapshot
          </h3>
          <dl className="grid grid-cols-2 gap-y-2 text-xs">
            <dt className="text-gray-500">Education</dt>
            <dd className="text-gray-900">{application.education_level ?? "—"}</dd>
            <dt className="text-gray-500">Years experience</dt>
            <dd className="text-gray-900">{application.years_experience ?? "—"}</dd>
            <dt className="text-gray-500">CAT tools</dt>
            <dd className="text-gray-900">{application.cat_tools?.join(", ") || "—"}</dd>
            <dt className="text-gray-500">Domains offered</dt>
            <dd className="text-gray-900">{application.domains_offered?.join(", ") || "—"}</dd>
            <dt className="text-gray-500">LinkedIn</dt>
            <dd className="text-gray-900">
              {application.linkedin_url ? (
                <a
                  href={application.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-900"
                >
                  {application.linkedin_url.replace(/^https?:\/\//, "")}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : "—"}
            </dd>
            <dt className="text-gray-500">Application status</dt>
            <dd className="text-gray-900">{application.status}</dd>
          </dl>
        </section>
      )}

      {/* NDA — light pointer to the full NDA tab */}
      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900">NDA</h3>
          </div>
          <Link
            to={`/admin/vendors/${vendor.id}?tab=nda`}
            className="inline-flex items-center gap-1 text-xs text-teal-700 hover:text-teal-900"
          >
            Open NDA tab
            <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        {nda ? (
          <p className="text-xs text-gray-600">
            Signed by <strong>{nda.signed_full_name}</strong>{" "}
            on {new Date(nda.signed_at).toLocaleDateString()}
            {nda.template_version_label && (
              <> · version <strong>{nda.template_version_label}</strong></>
            )}.
          </p>
        ) : (
          <p className="text-xs text-gray-400 italic">No NDA signed yet.</p>
        )}
      </section>
    </div>
  );
}

function RefStatusBadge({ r }: { r: CvpReference }) {
  if (r.feedback_received_at) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
        Feedback received
      </span>
    );
  }
  if (r.declined_at) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">
        Declined
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
      Pending
    </span>
  );
}

function RatingStars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span className="inline-flex items-center">
      {[1, 2, 3, 4, 5].map((i) =>
        i <= full ? (
          <Star key={i} className="w-3 h-3 text-amber-500 fill-amber-500" />
        ) : (
          <StarOff key={i} className="w-3 h-3 text-gray-300" />
        ),
      )}
    </span>
  );
}
