import { useState } from "react";
import { Bug } from "lucide-react";
import { BugReportModal } from "./BugReportModal";

export function BugReportFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Report a bug"
        title="Report a bug"
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 px-3 py-2.5 rounded-full bg-white border border-gray-200 shadow-lg text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors group"
      >
        <Bug className="w-4 h-4 text-teal-600 group-hover:text-teal-700" />
        <span className="text-xs font-medium hidden sm:inline">Report a bug</span>
      </button>
      <BugReportModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
