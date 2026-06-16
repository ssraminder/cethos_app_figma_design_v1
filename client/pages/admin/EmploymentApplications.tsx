import { useEffect, useState, Fragment, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import {
  Briefcase,
  Download,
  Loader2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

// Full-time ("Careers") staff applications. Submitted by the public form on
// join.cethos.com (recruitment app) into public.fulltime_applications; readable
// here only by super_admin via RLS (has_staff_role('super_admin')). CVs live in
// the private careers-applications bucket and are fetched via signed URLs.
interface FullTimeApplication {
  id: string;
  created_at: string;
  role_slug: string;
  role_title: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  country: string;
  linkedin_url: string | null;
  years_experience: string;
  resume_bucket: string | null;
  resume_path: string;
  screening_experience: string;
  screening_hours: string;
  expected_comp_amount: number | null;
  expected_comp_currency: string | null;
  about_you: string;
  how_heard: string | null;
  additional_notes: string | null;
  consent_privacy: boolean;
  status: string;
  source: string | null;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function EmploymentApplications() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAdminAuthContext();

  const [apps, setApps] = useState<FullTimeApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const isSuperAdmin = session?.staffRole === "super_admin";

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("fulltime_applications")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setError(error.message);
      setApps([]);
    } else {
      setApps((data as FullTimeApplication[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!authLoading && isSuperAdmin) {
      load();
    } else if (!authLoading) {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isSuperAdmin]);

  async function downloadResume(app: FullTimeApplication) {
    setDownloadingId(app.id);
    try {
      const { data, error } = await supabase.storage
        .from(app.resume_bucket || "careers-applications")
        .createSignedUrl(app.resume_path, 300);
      if (error || !data?.signedUrl) {
        alert(error?.message || "Could not generate download link.");
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingId(null);
    }
  }

  // Access control: super_admin only (also enforced by RLS at the DB layer).
  if (!authLoading && !isSuperAdmin) {
    return (
      <div className="p-6">
        <div className="max-w-4xl mx-auto bg-red-50 border border-red-200 rounded-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-red-900 mb-2">Access Denied</h1>
          <p className="text-red-700">
            Only super administrators can view employment applications.
          </p>
          <button
            onClick={() => navigate("/admin")}
            className="mt-4 text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Employment Applications
            </h1>
            <p className="text-sm text-gray-500">
              Full-time staff (Careers) applications · super-admin only
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">
          Failed to load applications: {error}
        </div>
      ) : apps.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-500">
          <Briefcase className="w-8 h-8 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-700">No applications yet</p>
          <p className="text-sm mt-1">
            Submissions from the Careers form (join.cethos.com) will appear here.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium w-8"></th>
                <th className="px-4 py-3 font-medium">Applicant</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Experience</th>
                <th className="px-4 py-3 font-medium">Expected comp</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">CV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {apps.map((app) => {
                const open = expandedId === app.id;
                return (
                  <Fragment key={app.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-3 align-top">
                        <button
                          onClick={() => setExpandedId(open ? null : app.id)}
                          className="text-gray-400 hover:text-gray-700"
                          aria-label={open ? "Collapse" : "Expand"}
                        >
                          {open ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-gray-900">
                          {app.full_name}
                        </div>
                        <a
                          href={`mailto:${app.email}`}
                          className="text-teal-600 hover:underline"
                        >
                          {app.email}
                        </a>
                      </td>
                      <td className="px-4 py-3 align-top text-gray-700">
                        {app.role_title || app.role_slug}
                      </td>
                      <td className="px-4 py-3 align-top text-gray-700">
                        {[app.city, app.country].filter(Boolean).join(", ")}
                      </td>
                      <td className="px-4 py-3 align-top text-gray-700">
                        {app.years_experience}
                      </td>
                      <td className="px-4 py-3 align-top text-gray-700">
                        {app.expected_comp_amount != null
                          ? `${app.expected_comp_amount.toLocaleString()} ${
                              app.expected_comp_currency || ""
                            }`.trim()
                          : "—"}
                      </td>
                      <td className="px-4 py-3 align-top text-gray-500 whitespace-nowrap">
                        {formatDate(app.created_at)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs capitalize">
                          {app.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <button
                          onClick={() => downloadResume(app)}
                          disabled={downloadingId === app.id}
                          className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-800 disabled:opacity-50"
                        >
                          {downloadingId === app.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                          CV
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-gray-50">
                        <td></td>
                        <td colSpan={8} className="px-4 py-4">
                          <dl className="grid md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                            {app.phone && (
                              <Field label="Phone" value={app.phone} />
                            )}
                            {app.linkedin_url && (
                              <Field
                                label="LinkedIn"
                                value={
                                  <a
                                    href={app.linkedin_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-teal-600 hover:underline break-all"
                                  >
                                    {app.linkedin_url}
                                  </a>
                                }
                              />
                            )}
                            {app.how_heard && (
                              <Field label="How they heard" value={app.how_heard} />
                            )}
                            {app.source && (
                              <Field label="Source" value={app.source} />
                            )}
                            <Field
                              className="md:col-span-2"
                              label="Relevant experience (LV / COA / eCOA / cognitive debriefing)"
                              value={app.screening_experience}
                            />
                            <Field
                              className="md:col-span-2"
                              label="Shifted-schedule willingness"
                              value={app.screening_hours}
                            />
                            <Field
                              className="md:col-span-2"
                              label="About them"
                              value={app.about_you}
                            />
                            {app.additional_notes && (
                              <Field
                                className="md:col-span-2"
                                label="Additional notes"
                                value={app.additional_notes}
                              />
                            )}
                          </dl>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  className = "",
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
        {label}
      </dt>
      <dd className="text-gray-800 whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
