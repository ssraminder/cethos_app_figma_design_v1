import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  CheckCircle,
  Clock,
  Download,
  FileText,
  Loader2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  UserCog,
  XCircle,
} from "lucide-react";

interface StaffProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  job_title: string | null;
  date_of_joining: string | null;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

interface StaffDocument {
  id: string;
  file_name: string;
  category: string;
  notes: string | null;
  file_size: number | null;
  mime_type: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
}

interface TrainingEntry {
  assignment_id: string;
  assigned_at: string;
  due_date: string | null;
  training: { id: string; title: string; audience: string; estimated_minutes: number | null } | null;
  completion: { status: string; quiz_score: number | null; completed_at: string; method: string } | null;
}

const ROLES = [
  { value: "reviewer", label: "Reviewer", icon: Shield, color: "text-blue-600" },
  { value: "admin", label: "Admin", icon: ShieldCheck, color: "text-green-600" },
  { value: "super_admin", label: "Super Admin", icon: ShieldAlert, color: "text-purple-600" },
];

const DOC_CATEGORIES = [
  { value: "cv", label: "CV / Résumé" },
  { value: "contract", label: "Employment Contract" },
  { value: "id", label: "Government ID" },
  { value: "certification", label: "Certification" },
  { value: "nda", label: "NDA" },
  { value: "other", label: "Other" },
];

const CATEGORY_COLORS: Record<string, string> = {
  cv: "bg-blue-100 text-blue-700",
  contract: "bg-green-100 text-green-700",
  id: "bg-yellow-100 text-yellow-700",
  certification: "bg-purple-100 text-purple-700",
  nda: "bg-red-100 text-red-700",
  other: "bg-gray-100 text-gray-600",
};

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function invokeManageStaff(action: string, params: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-staff`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ action, ...params }),
    },
  );
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

export default function AdminStaffDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"profile" | "documents" | "training">("profile");

  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

  const [formName, setFormName] = useState("");
  const [formJobTitle, setFormJobTitle] = useState("");
  const [formDateOfJoining, setFormDateOfJoining] = useState("");
  const [formRole, setFormRole] = useState("reviewer");

  const [documents, setDocuments] = useState<StaffDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState("cv");
  const [uploadNotes, setUploadNotes] = useState("");
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [trainingLog, setTrainingLog] = useState<TrainingEntry[]>([]);
  const [trainingLoading, setTrainingLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchProfile();
  }, [id]);

  useEffect(() => {
    if (!id || tab !== "documents") return;
    fetchDocuments();
  }, [id, tab]);

  useEffect(() => {
    if (!id || tab !== "training") return;
    fetchTraining();
  }, [id, tab]);

  const fetchProfile = async () => {
    setProfileLoading(true);
    try {
      const { data } = await invokeManageStaff("get_profile", { staff_user_id: id });
      setProfile(data);
      setFormName(data.full_name ?? "");
      setFormJobTitle(data.job_title ?? "");
      setFormDateOfJoining(data.date_of_joining ?? "");
      setFormRole(data.role ?? "reviewer");
    } catch (err) {
      console.error(err);
    } finally {
      setProfileLoading(false);
    }
  };

  const fetchDocuments = async () => {
    setDocsLoading(true);
    try {
      const { data } = await invokeManageStaff("list_documents", { staff_user_id: id });
      setDocuments(data ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setDocsLoading(false);
    }
  };

  const fetchTraining = async () => {
    setTrainingLoading(true);
    try {
      const { data } = await invokeManageStaff("get_training_log", { staff_user_id: id });
      setTrainingLog(data ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setTrainingLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      await invokeManageStaff("update_profile", {
        staff_user_id: id,
        full_name: formName.trim(),
        job_title: formJobTitle.trim() || null,
        date_of_joining: formDateOfJoining || null,
        role: formRole,
      });
      setSaved(true);
      fetchProfile();
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (file: File) => {
    if (!id) return;
    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const staffRow = await supabase
        .from("staff_users")
        .select("id")
        .eq("auth_user_id", session?.user?.id)
        .single();

      const result = await invokeManageStaff("upload_document", {
        staff_user_id: id,
        file_name: file.name,
        mime_type: file.type,
        file_size: file.size,
        category: uploadCategory,
        notes: uploadNotes.trim() || null,
        uploader_staff_id: staffRow.data?.id ?? null,
      });

      // Upload to signed URL
      await fetch(result.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      setShowUploadPanel(false);
      setUploadNotes("");
      setUploadCategory("cv");
      if (fileInputRef.current) fileInputRef.current.value = "";
      fetchDocuments();
    } catch (err: any) {
      console.error("Upload failed:", err);
      alert("Upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: StaffDocument) => {
    try {
      const { url, file_name } = await invokeManageStaff("get_document_url", { document_id: doc.id });
      const a = document.createElement("a");
      a.href = url;
      a.download = file_name;
      a.click();
    } catch (err: any) {
      alert("Could not get download link: " + err.message);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("Delete this document? This cannot be undone.")) return;
    try {
      await invokeManageStaff("delete_document", { document_id: docId });
      fetchDocuments();
    } catch (err: any) {
      alert("Delete failed: " + err.message);
    }
  };

  const getRoleInfo = (role: string) => ROLES.find((r) => r.value === role) ?? ROLES[0];

  if (profileLoading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (!profile) {
    return <div className="p-8 text-center text-gray-500">Staff member not found.</div>;
  }

  const roleInfo = getRoleInfo(profile.role);
  const RoleIcon = roleInfo.icon;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate("/admin/staff")}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-teal-600 mb-3"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Staff
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <UserCog className="w-7 h-7 text-teal-600" />
              {profile.full_name}
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-gray-500 text-sm">{profile.email}</span>
              <span className={`inline-flex items-center gap-1 text-sm ${roleInfo.color}`}>
                <RoleIcon className="w-4 h-4" />
                {roleInfo.label}
              </span>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                profile.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
              }`}>
                {profile.is_active ? "Active" : "Inactive"}
              </span>
            </div>
            {profile.job_title && (
              <p className="text-gray-600 mt-1 text-sm">{profile.job_title}</p>
            )}
          </div>
          <div className="text-right text-xs text-gray-400">
            {profile.last_login_at
              ? `Last login ${format(new Date(profile.last_login_at), "MMM d, yyyy")}`
              : "Never logged in"}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b mb-6">
        <div className="flex gap-6">
          {(["profile", "documents", "training"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 text-sm font-medium capitalize border-b-2 transition-colors ${
                tab === t
                  ? "border-teal-600 text-teal-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "training" ? "Training Log" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Profile tab ──────────────────────────────────────────────────────── */}
      {tab === "profile" && (
        <div className="bg-white rounded-lg border p-6 space-y-5">
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={profile.email}
                disabled
                className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
              <input
                type="text"
                value={formJobTitle}
                onChange={(e) => setFormJobTitle(e.target.value)}
                placeholder="e.g. Project Coordinator"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Portal Role</label>
              <select
                value={formRole}
                onChange={(e) => setFormRole(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                <Calendar className="w-4 h-4" /> Date of Joining
              </label>
              <input
                type="date"
                value={formDateOfJoining}
                onChange={(e) => setFormDateOfJoining(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Member Since</label>
              <input
                type="text"
                value={format(new Date(profile.created_at), "MMMM d, yyyy")}
                disabled
                className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-gray-500"
              />
            </div>
          </div>

          {saveError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {saveError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            {saved && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" /> Saved
              </span>
            )}
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* ── Documents tab ────────────────────────────────────────────────────── */}
      {tab === "documents" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">{documents.length} document{documents.length !== 1 ? "s" : ""}</p>
            <button
              onClick={() => setShowUploadPanel(!showUploadPanel)}
              className="flex items-center gap-2 px-3 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm"
            >
              <Upload className="w-4 h-4" /> Upload Document
            </button>
          </div>

          {showUploadPanel && (
            <div className="bg-gray-50 border rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                  >
                    {DOC_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
                  <input
                    type="text"
                    value={uploadNotes}
                    onChange={(e) => setUploadNotes(e.target.value)}
                    placeholder="e.g. Signed 2026-01-15"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                }}
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:border file:rounded-lg file:text-sm file:bg-white file:text-gray-700 hover:file:bg-gray-50"
              />
              {uploading && (
                <div className="flex items-center gap-2 text-sm text-teal-600">
                  <Loader2 className="w-4 h-4 animate-spin" /> Uploading…
                </div>
              )}
            </div>
          )}

          {docsLoading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
            </div>
          ) : documents.length === 0 ? (
            <div className="py-10 text-center text-gray-400">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No documents uploaded yet
            </div>
          ) : (
            <div className="bg-white rounded-lg border divide-y">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-4 px-4 py-3">
                  <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.file_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[doc.category] ?? CATEGORY_COLORS.other}`}>
                        {DOC_CATEGORIES.find((c) => c.value === doc.category)?.label ?? doc.category}
                      </span>
                      {doc.notes && <span className="text-xs text-gray-400">{doc.notes}</span>}
                      {doc.file_size && <span className="text-xs text-gray-400">{formatBytes(doc.file_size)}</span>}
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {format(new Date(doc.uploaded_at), "MMM d, yyyy")}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDownload(doc)}
                      className="p-1.5 text-gray-400 hover:text-teal-600 rounded"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Training Log tab ─────────────────────────────────────────────────── */}
      {tab === "training" && (
        <div>
          {trainingLoading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
            </div>
          ) : trainingLog.length === 0 ? (
            <div className="py-10 text-center text-gray-400">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No training assignments yet
            </div>
          ) : (
            <div className="bg-white rounded-lg border divide-y">
              {trainingLog.map((entry) => (
                <div key={entry.assignment_id} className="flex items-start gap-4 px-4 py-4">
                  <div className="mt-0.5">
                    {entry.completion ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <Clock className="w-5 h-5 text-amber-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {entry.training?.title ?? "Unknown Training"}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-500">
                      <span>Assigned {format(new Date(entry.assigned_at), "MMM d, yyyy")}</span>
                      {entry.due_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Due {format(new Date(entry.due_date), "MMM d, yyyy")}
                        </span>
                      )}
                      {entry.training?.estimated_minutes && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {entry.training.estimated_minutes} min
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    {entry.completion ? (
                      <div className="space-y-0.5">
                        <div className="text-green-600 font-medium">Completed</div>
                        <div className="text-gray-400">
                          {format(new Date(entry.completion.completed_at), "MMM d, yyyy")}
                        </div>
                        {entry.completion.quiz_score != null && (
                          <div className="text-gray-500">Score: {entry.completion.quiz_score}%</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-amber-600 font-medium">Pending</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
