import { useEffect, useRef, useState } from "react";
import { Loader2, X as XIcon, Upload, CheckCircle2, AlertCircle, Bug } from "lucide-react";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import { getConsoleLogs } from "../../lib/consoleCapture";
import { supabase } from "../../lib/supabase";

interface Props {
  open: boolean;
  onClose: () => void;
}

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export function BugReportModal({ open, onClose }: Props) {
  const { session } = useAdminAuthContext();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [includeConsole, setIncludeConsole] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [consoleCount, setConsoleCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setScreenshotFile(null);
      setScreenshotPreview(null);
      setIncludeConsole(true);
      setError(null);
      setSubmitted(false);
      setConsoleCount(getConsoleLogs().length);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setConsoleCount(getConsoleLogs().length), 750);
    return () => clearInterval(id);
  }, [open]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (PNG, JPG, or WebP).");
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setError(`Image is ${(file.size / 1024 / 1024).toFixed(1)} MB — max 5 MB.`);
      return;
    }
    setError(null);
    setScreenshotFile(file);
    const reader = new FileReader();
    reader.onload = () => setScreenshotPreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  function clearScreenshot() {
    setScreenshotFile(null);
    setScreenshotPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit() {
    if (!session) { setError("Not signed in."); return; }
    if (title.trim().length < 3) { setError("Title is required."); return; }
    if (description.trim().length < 10) { setError("Please describe what happened (10+ chars)."); return; }

    setSubmitting(true);
    setError(null);
    try {
      const consoleLogs = includeConsole ? getConsoleLogs() : null;
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
      };

      const { data, error: fnErr } = await supabase.functions.invoke("staff-submit-bug-report", {
        body: {
          title: title.trim(),
          description: description.trim(),
          url: window.location.href,
          user_agent: navigator.userAgent,
          viewport,
          console_logs: consoleLogs,
          has_screenshot: !!screenshotFile,
        },
      });
      if (fnErr) throw new Error(fnErr.message || "Submission failed");
      if (!data?.success) throw new Error(data?.error ?? "Submission failed");

      if (screenshotFile && data?.data?.id) {
        const path = `staff/${data.data.id}.png`;
        const { error: upErr } = await supabase.storage
          .from("bug-report-screenshots")
          .upload(path, screenshotFile, { contentType: "image/png", upsert: false });
        if (!upErr) {
          await supabase
            .from("bug_reports")
            .update({ screenshot_storage_path: path })
            .eq("id", data.data.id);
        }
      }

      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Bug className="w-5 h-5 text-teal-600" />
            <h3 className="text-base font-semibold text-gray-900">Report a bug</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
          {submitted ? (
            <div className="flex items-start gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              <div className="text-sm text-emerald-900">
                <strong>Bug report filed.</strong>
                <p className="mt-1 text-emerald-800">
                  Logged with page URL, browser info, and console output. It will show up in the bug reports dashboard.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Short title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Order detail page crashes on save"
                  maxLength={120}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">What happened? *</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="What were you trying to do, what did you expect, and what actually happened?"
                  maxLength={4000}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
                />
              </div>

              <div className="p-3 rounded border border-gray-200">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" /> Screenshot (optional)
                  </div>
                  {screenshotFile && (
                    <button type="button" onClick={clearScreenshot} className="text-[11px] text-gray-500 hover:text-gray-700 underline">
                      Remove
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {screenshotPreview ? (
                  <div className="mt-2">
                    <img src={screenshotPreview} alt="Screenshot preview" className="max-h-48 w-auto border border-gray-200 rounded" />
                    <div className="text-[11px] text-gray-500 mt-1">
                      {screenshotFile?.name} ({((screenshotFile?.size ?? 0) / 1024).toFixed(0)} KB)
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded hover:bg-teal-100"
                  >
                    <Upload className="w-3.5 h-3.5" /> Choose screenshot
                  </button>
                )}
              </div>

              <label className="flex items-start gap-2 cursor-pointer p-2.5 rounded border border-gray-200">
                <input type="checkbox" checked={includeConsole} onChange={(e) => setIncludeConsole(e.target.checked)} className="mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">Include console output</div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Last 100 entries ({consoleCount} captured) — app logs and network calls.
                  </p>
                </div>
              </label>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-100">
          {submitted ? (
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm font-medium text-white bg-teal-600 rounded hover:bg-teal-700">
              Close
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={submitting} className="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !session}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-teal-600 rounded hover:bg-teal-700 disabled:opacity-50"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Send report
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
