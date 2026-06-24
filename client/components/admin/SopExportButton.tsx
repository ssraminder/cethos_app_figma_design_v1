/**
 * SopExportButton — Export a SOP version as Word (.docx) or PDF.
 * Calls the `export-sop` edge function (returns a binary blob) and triggers a
 * client download, mirroring the quote/invoice PDF download pattern.
 */
import { useEffect, useRef, useState } from "react";
import { Download, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function SopExportButton({
  sopId,
  sopNumber,
  title,
  versionId,
  compact = false,
}: {
  sopId: string;
  sopNumber: string;
  title: string;
  versionId?: string | null;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | "docx" | "pdf">(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const run = async (format: "docx" | "pdf", e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    setBusy(format);
    try {
      const base = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const resp = await fetch(`${base}/functions/v1/export-sop`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ sop_id: sopId, version_id: versionId ?? undefined, format }),
      });
      if (!resp.ok) throw new Error((await resp.text()) || `HTTP ${resp.status}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        `${sopNumber} - ${title}`.replace(/[^a-zA-Z0-9 ._-]/g, "_").slice(0, 120) +
        (format === "docx" ? ".docx" : ".pdf");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Export failed: " + (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const btnClass = compact
    ? "inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
    : "inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
  const ic = compact ? "w-3.5 h-3.5" : "w-4 h-4";

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        disabled={!!busy}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={btnClass}
        title="Export SOP"
      >
        {busy ? <Loader2 className={`${ic} animate-spin`} /> : <Download className={ic} />}
        {!compact && <span>Export</span>}
        <ChevronDown className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={(e) => run("docx", e)}
            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Word (.docx)
          </button>
          <button
            type="button"
            onClick={(e) => run("pdf", e)}
            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            PDF
          </button>
        </div>
      )}
    </div>
  );
}
