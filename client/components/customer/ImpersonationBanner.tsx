import { useState } from "react";
import { useAuth } from "../../context/CustomerAuthContext";
import { AlertTriangle, LogOut } from "lucide-react";

// Red banner shown across the customer portal when a staff "View as customer"
// session is active. Mirrors the vendor portal banner.
export default function ImpersonationBanner() {
  const { isImpersonation, impersonator, customer, endImpersonation } = useAuth();
  const [ending, setEnding] = useState(false);

  if (!isImpersonation) return null;

  const handleEnd = async () => {
    setEnding(true);
    try {
      await endImpersonation();
      window.location.href = "/";
    } finally {
      setEnding(false);
    }
  };

  return (
    <div className="bg-red-600 text-white text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">
            Viewing as <strong>{customer?.full_name || customer?.email}</strong>
            {impersonator?.staff_name ? (
              <> — impersonated by {impersonator.staff_name}</>
            ) : null}
          </span>
        </div>
        <button
          onClick={handleEnd}
          disabled={ending}
          className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 bg-white/20 hover:bg-white/30 rounded text-xs font-medium disabled:opacity-60"
        >
          <LogOut className="w-3 h-3" />
          {ending ? "Ending…" : "End impersonation"}
        </button>
      </div>
    </div>
  );
}
