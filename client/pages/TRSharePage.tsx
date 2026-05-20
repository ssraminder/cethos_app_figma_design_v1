// Public translator share page: /tr/share/:token
//
// No Supabase auth required. Hits 3 token-auth edge functions:
//   - tr-vendor-resolve-token   (read job summary + comments + target file)
//   - tr-vendor-comment         (post a reply)
//   - tr-vendor-upload-new-version (upload a new target file)

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

type Resolved = {
  token_id: string;
  recipient: { email: string; name: string | null; kind: string };
  job: {
    id: string;
    title: string | null;
    client_name: string | null;
    job_kind: string;
    status: string;
    closed_at: string | null;
    close_outcome: string | null;
    source_language?: { code?: string; name?: string };
    target_language?: { code?: string; name?: string };
  };
  comments: Array<{
    id: string;
    author_type: string;
    author_name: string;
    body: string;
    kind: string;
    files_jsonb: Array<{ original_filename?: string; storage_path?: string }>;
    created_at: string;
  }>;
  target_file: { id: string; original_filename: string; mime_type: string | null; bytes: number | null } | null;
  source_files: Array<{ id: string; original_filename: string }>;
  reference_files: Array<{ id: string; original_filename: string }>;
  findings: Array<{
    id: string;
    finding_number: number;
    severity: "critical" | "major" | "minor" | "info";
    category: string;
    confidence: "high" | "medium" | "low";
    source_text: string | null;
    current_translation: string | null;
    proposed_change: string | null;
    english_back_translation: string | null;
    rationale: string;
    application_status: string;
    application_mode: string;
    vendor_decision: "accepted" | "rejected" | null;
    vendor_decision_reason: string | null;
    vendor_decision_at: string | null;
    vendor_uploaded_file_id: string | null;
    created_at: string;
  }>;
};

const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-red-200 text-red-900",
  major: "bg-orange-200 text-orange-900",
  minor: "bg-yellow-100 text-yellow-800",
  info: "bg-blue-100 text-blue-800",
};

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_BEARER = `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`;

async function postJson<T>(name: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: "POST",
    headers: { Authorization: ANON_BEARER, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const parsed = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
  if (!res.ok) {
    const err = (parsed && (parsed as any).error) || `HTTP ${res.status}`;
    return { ok: false, status: res.status, error: String(err) };
  }
  return { ok: true, data: (parsed ?? {}) as T };
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(bin);
}

export default function TRSharePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Resolved | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reply, setReply] = useState("");
  const [posting, setPosting] = useState(false);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadNote, setUploadNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Per-finding arbitration state. Each finding can be in 'accept' or
  // 'reject' draft mode; submitting clears it.
  const [arbMode, setArbMode] = useState<Record<string, "accept" | "reject" | null>>({});
  const [arbFile, setArbFile] = useState<Record<string, File | null>>({});
  const [arbNote, setArbNote] = useState<Record<string, string>>({});
  const [arbReason, setArbReason] = useState<Record<string, string>>({});
  const [arbBusy, setArbBusy] = useState<string | null>(null);

  async function refresh() {
    if (!token) return;
    setLoading(true);
    setError(null);
    const r = await postJson<Resolved>("tr-vendor-resolve-token", { token });
    if (!r.ok) {
      setError(
        r.status === 404
          ? "This link doesn't exist or has been removed."
          : r.status === 410
            ? r.error === "expired"
              ? "This link has expired. Contact your Cethos reviewer for a new one."
              : "This link was revoked."
            : `Failed to load (${r.error}).`,
      );
    } else {
      setData(r.data);
    }
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, [token]);

  async function doReply() {
    if (!token || !reply.trim()) return;
    setPosting(true);
    const r = await postJson<{ comment_id: string }>("tr-vendor-comment", { token, body: reply.trim() });
    setPosting(false);
    if (!r.ok) {
      setError(`Failed to post: ${r.error}`);
      return;
    }
    setReply("");
    await refresh();
  }

  async function doAcceptFinding(findingId: string) {
    if (!token) return;
    const file = arbFile[findingId];
    if (!file) {
      setError("Please attach the corrected file before accepting.");
      return;
    }
    setArbBusy(findingId);
    try {
      const data_base64 = await fileToBase64(file);
      const r = await postJson<{ finding_id: string; file_id: string }>(
        "tr-vendor-finding-respond",
        {
          token,
          finding_id: findingId,
          decision: "accepted",
          file: {
            filename: file.name,
            mime_type: file.type || "application/octet-stream",
            data_base64,
          },
          note: (arbNote[findingId] ?? "").trim() || undefined,
        },
      );
      if (!r.ok) {
        setError(`Accept failed: ${r.error}`);
        return;
      }
      setArbMode((m) => ({ ...m, [findingId]: null }));
      setArbFile((f) => ({ ...f, [findingId]: null }));
      setArbNote((n) => ({ ...n, [findingId]: "" }));
      await refresh();
    } finally {
      setArbBusy(null);
    }
  }

  async function doRejectFinding(findingId: string) {
    if (!token) return;
    const reason = (arbReason[findingId] ?? "").trim();
    if (!reason) {
      setError("Please add a reason for declining the finding.");
      return;
    }
    setArbBusy(findingId);
    try {
      const r = await postJson<{ finding_id: string }>(
        "tr-vendor-finding-respond",
        { token, finding_id: findingId, decision: "rejected", reason },
      );
      if (!r.ok) {
        setError(`Decline failed: ${r.error}`);
        return;
      }
      setArbMode((m) => ({ ...m, [findingId]: null }));
      setArbReason((n) => ({ ...n, [findingId]: "" }));
      await refresh();
    } finally {
      setArbBusy(null);
    }
  }

  async function doUpload() {
    if (!token || !uploadFile) return;
    setUploading(true);
    setUploadProgress("Reading file...");
    try {
      const data_base64 = await fileToBase64(uploadFile);
      setUploadProgress("Uploading...");
      const r = await postJson<{ file_id: string; comment_id: string }>(
        "tr-vendor-upload-new-version",
        {
          token,
          filename: uploadFile.name,
          mime_type: uploadFile.type || "application/octet-stream",
          data_base64,
          note: uploadNote.trim() || undefined,
        },
      );
      if (!r.ok) {
        setError(`Upload failed: ${r.error}`);
        return;
      }
      setUploadFile(null);
      setUploadNote("");
      await refresh();
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading…</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-lg shadow-md p-6 max-w-md w-full text-center">
          <div className="text-3xl mb-3">🔒</div>
          <h1 className="text-xl font-semibold mb-2">Link not available</h1>
          <p className="text-gray-600 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const isClosed = !!data.job.closed_at;
  const langPair = `${data.job.source_language?.code ?? "?"} → ${data.job.target_language?.code ?? "?"}`;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border p-5 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500">Translation review</div>
              <h1 className="text-xl font-semibold mt-0.5">
                {data.job.title || data.job.client_name || data.job.id.slice(0, 8)}
              </h1>
              <div className="text-xs text-gray-500 mt-1">
                {langPair} · {data.job.job_kind.replace(/_/g, " ")} ·{" "}
                <span className="capitalize">{data.job.status.replace(/_/g, " ")}</span>
              </div>
            </div>
            <div className="text-right text-xs text-gray-500">
              Shared with<br />
              <span className="text-gray-900">{data.recipient.name || data.recipient.email}</span>
            </div>
          </div>
          {isClosed && (
            <div className="mt-3 text-sm bg-gray-100 text-gray-700 rounded p-2">
              This job is closed ({data.job.close_outcome ?? "closed"}). You can still read the thread but cannot reply or upload new versions.
            </div>
          )}
        </div>

        {/* Files manifest */}
        <div className="bg-white rounded-lg shadow-sm border p-5 mb-4">
          <h2 className="font-semibold text-sm mb-2">Files in this job</h2>
          <ul className="text-sm text-gray-700 space-y-1">
            {data.target_file && (
              <li>
                <span className="text-teal-700 font-medium">Target:</span>{" "}
                {data.target_file.original_filename}
              </li>
            )}
            {data.source_files.map((f) => (
              <li key={f.id}>
                <span className="text-blue-700 font-medium">Source:</span> {f.original_filename}
              </li>
            ))}
            {data.reference_files.map((f) => (
              <li key={f.id}>
                <span className="text-gray-500 font-medium">Reference:</span> {f.original_filename}
              </li>
            ))}
          </ul>
        </div>

        {/* Review findings — translator arbitrates each one. Accept (must
            upload a corrected file) or Deny (must give a reason). Once
            decided, the row goes read-only with the decision badge. */}
        {data.findings.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border p-5 mb-4">
            <h2 className="font-semibold text-sm mb-2">
              Review findings ({data.findings.length})
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              Accept each finding (upload the corrected file) or decline it with a reason. You can use the Comments box below for general remarks.
            </p>
            <div className="space-y-3">
              {data.findings.map((f) => {
                const decided = !!f.vendor_decision;
                const mode = arbMode[f.id] ?? null;
                const busy = arbBusy === f.id;
                return (
                  <div key={f.id} className="border rounded p-3 text-sm">
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-mono">#{f.finding_number}</span>
                      <span className={`uppercase text-[10px] px-1.5 py-0.5 rounded ${SEVERITY_TONE[f.severity] ?? "bg-gray-100"}`}>
                        {f.severity}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{f.category}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{f.confidence}</span>
                      {f.vendor_decision === "accepted" && (
                        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800">
                          ✓ Accepted{f.vendor_decision_at ? ` · ${new Date(f.vendor_decision_at).toLocaleDateString()}` : ""}
                        </span>
                      )}
                      {f.vendor_decision === "rejected" && (
                        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-800">
                          ✗ Declined{f.vendor_decision_at ? ` · ${new Date(f.vendor_decision_at).toLocaleDateString()}` : ""}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 space-y-1 text-xs">
                      {f.source_text != null && (
                        <div>
                          <span className="font-semibold">Source:</span>{" "}
                          {f.source_text || <span className="italic text-gray-500">(empty)</span>}
                        </div>
                      )}
                      {f.current_translation != null && (
                        <div>
                          <span className="font-semibold">Currently in target:</span>{" "}
                          {f.current_translation || <span className="italic text-gray-500">(empty / missing)</span>}
                        </div>
                      )}
                      {f.proposed_change && (
                        <div>
                          <span className="font-semibold">Proposed:</span> {f.proposed_change}
                        </div>
                      )}
                      {f.english_back_translation && (
                        <div>
                          <span className="font-semibold">EN back-translation:</span> {f.english_back_translation}
                        </div>
                      )}
                    </div>
                    {f.rationale && <div className="mt-2 text-sm text-gray-800">{f.rationale}</div>}

                    {/* Decided — show the locked outcome. */}
                    {decided && (
                      <div className="mt-2 border-t pt-2 text-xs">
                        {f.vendor_decision === "accepted" ? (
                          <div className="text-green-800">
                            You accepted this finding and uploaded a corrected version.
                            {f.vendor_decision_reason && (
                              <div className="text-gray-700 mt-1">Note: {f.vendor_decision_reason}</div>
                            )}
                          </div>
                        ) : (
                          <div className="text-red-800">
                            You declined this finding.
                            {f.vendor_decision_reason && (
                              <div className="text-gray-800 mt-1">Reason: {f.vendor_decision_reason}</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Not yet decided — show actions, and inline form when chosen. */}
                    {!decided && !isClosed && (
                      <div className="mt-3 border-t pt-3">
                        {mode === null && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setArbMode((m) => ({ ...m, [f.id]: "accept" }))}
                              className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                            >
                              Accept (upload corrected file)
                            </button>
                            <button
                              type="button"
                              onClick={() => setArbMode((m) => ({ ...m, [f.id]: "reject" }))}
                              className="px-3 py-1 text-xs border border-red-400 text-red-700 rounded hover:bg-red-50"
                            >
                              Decline
                            </button>
                          </div>
                        )}

                        {mode === "accept" && (
                          <div className="space-y-2">
                            <div className="text-xs text-gray-600">
                              Upload the corrected file (this becomes a new target version on the job).
                            </div>
                            <input
                              type="file"
                              className="text-sm"
                              onChange={(e) => {
                                const picked = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                                setArbFile((s) => ({ ...s, [f.id]: picked }));
                                try { e.target.value = ""; } catch {}
                              }}
                            />
                            {arbFile[f.id] && (
                              <div className="text-xs text-gray-700">
                                Selected: <span className="font-medium">{arbFile[f.id]!.name}</span>{" "}
                                <span className="text-gray-500">({(arbFile[f.id]!.size / 1024).toFixed(1)} KB)</span>
                              </div>
                            )}
                            <textarea
                              className="w-full border border-gray-300 rounded p-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                              rows={2}
                              placeholder="Optional note about the change you made."
                              value={arbNote[f.id] ?? ""}
                              onChange={(e) => setArbNote((s) => ({ ...s, [f.id]: e.target.value }))}
                            />
                            <div className="flex gap-2 justify-end">
                              <button
                                type="button"
                                className="px-3 py-1 text-xs text-gray-600 hover:text-gray-900"
                                onClick={() => setArbMode((m) => ({ ...m, [f.id]: null }))}
                                disabled={busy}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                                onClick={() => doAcceptFinding(f.id)}
                                disabled={busy || !arbFile[f.id]}
                              >
                                {busy ? "Submitting..." : "Submit acceptance"}
                              </button>
                            </div>
                          </div>
                        )}

                        {mode === "reject" && (
                          <div className="space-y-2">
                            <div className="text-xs text-gray-600">
                              Tell the reviewer why this finding doesn't apply.
                            </div>
                            <textarea
                              className="w-full border border-gray-300 rounded p-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
                              rows={3}
                              placeholder="Reason for declining (required)..."
                              value={arbReason[f.id] ?? ""}
                              onChange={(e) => setArbReason((s) => ({ ...s, [f.id]: e.target.value }))}
                            />
                            <div className="flex gap-2 justify-end">
                              <button
                                type="button"
                                className="px-3 py-1 text-xs text-gray-600 hover:text-gray-900"
                                onClick={() => setArbMode((m) => ({ ...m, [f.id]: null }))}
                                disabled={busy}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                                onClick={() => doRejectFinding(f.id)}
                                disabled={busy || !(arbReason[f.id] ?? "").trim()}
                              >
                                {busy ? "Submitting..." : "Submit decline"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Comments thread */}
        <div className="bg-white rounded-lg shadow-sm border p-5 mb-4">
          <h2 className="font-semibold text-sm mb-3">Comments &amp; activity</h2>
          {data.comments.length === 0 && (
            <div className="text-sm text-gray-500 italic">No comments yet.</div>
          )}
          <div className="space-y-3">
            {data.comments.map((c) => {
              const tone =
                c.author_type === "staff"
                  ? "border-l-blue-400 bg-blue-50"
                  : c.author_type === "vendor"
                    ? "border-l-teal-400 bg-teal-50"
                    : "border-l-gray-400 bg-gray-50";
              return (
                <div key={c.id} className={`border-l-4 ${tone} rounded p-3`}>
                  <div className="text-xs text-gray-600">
                    <span className="font-medium text-gray-900">{c.author_name}</span>{" "}
                    <span className="text-gray-400">·</span>{" "}
                    <span>{new Date(c.created_at).toLocaleString()}</span>
                    {c.kind !== "comment" && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-500">{c.kind.replace("_", " ")}</span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{c.body}</div>
                  {Array.isArray(c.files_jsonb) && c.files_jsonb.length > 0 && (
                    <div className="mt-1 text-xs text-gray-600">
                      {c.files_jsonb.map((f, i) => (
                        <div key={i}>📎 {f.original_filename ?? f.storage_path ?? "attachment"}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!isClosed && (
            <div className="mt-4 border-t pt-4">
              <textarea
                className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                rows={3}
                placeholder="Reply to the reviewer..."
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={doReply}
                  disabled={posting || !reply.trim()}
                  className="px-4 py-2 bg-teal-700 text-white rounded text-sm hover:bg-teal-800 disabled:opacity-50"
                >
                  {posting ? "Posting..." : "Post reply"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Upload new version */}
        {!isClosed && (
          <div className="bg-white rounded-lg shadow-sm border p-5">
            <h2 className="font-semibold text-sm mb-2">Upload a new version of the target file</h2>
            <p className="text-xs text-gray-500 mb-3">
              Uploading attaches the file to this job and posts an entry in the thread. Up to 100 MB.
            </p>
            <input
              type="file"
              onChange={(e) => {
                const picked = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                setUploadFile(picked);
                try { e.target.value = ""; } catch {}
              }}
              className="text-sm"
            />
            {uploadFile && (
              <div className="text-xs text-gray-700 mt-2">
                Selected: <span className="font-medium">{uploadFile.name}</span>{" "}
                <span className="text-gray-500">({(uploadFile.size / 1024).toFixed(1)} KB)</span>
              </div>
            )}
            <textarea
              className="mt-2 w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              rows={2}
              placeholder="Note (optional) — what changed in this version?"
              value={uploadNote}
              onChange={(e) => setUploadNote(e.target.value)}
            />
            <div className="flex items-center justify-between mt-2">
              <div className="text-xs text-gray-500">{uploadProgress}</div>
              <button
                type="button"
                onClick={doUpload}
                disabled={!uploadFile || uploading}
                className="px-4 py-2 bg-teal-700 text-white rounded text-sm hover:bg-teal-800 disabled:opacity-50"
              >
                {uploading ? "Uploading..." : "Upload new version"}
              </button>
            </div>
          </div>
        )}

        <div className="text-center text-[11px] text-gray-400 mt-6">
          Cethos Translation Services
        </div>
      </div>
    </div>
  );
}
