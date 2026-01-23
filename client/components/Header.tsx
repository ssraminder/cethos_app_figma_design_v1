import { HelpCircle, User } from "lucide-react";
import { useBranding } from "../context/BrandingContext";

export default function Header() {
  const { companyName, logoUrl, loading } = useBranding();

  return (
    <header className="w-full h-16 bg-white border-b border-cethos-border shadow-sm sticky top-0 z-50">
      <div className="max-w-[1536px] mx-auto px-4 sm:px-8 lg:px-12 h-full flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt={companyName} 
              className="h-8 w-auto"
            />
          ) : (
            // Fallback while loading or if no logo URL
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-cethos-navy rounded-lg flex items-center justify-center">
                <span className="text-white font-jakarta font-bold text-base">
                  {loading ? "..." : companyName?.[0] || "C"}
                </span>
              </div>
              <span className="text-cethos-navy font-jakarta font-bold text-xl hidden sm:block">
                {companyName || "CETHOS"}
              </span>
            </div>
          )}
          {/* Show company name next to logo if logo exists */}
          {logoUrl && (
            <span className="text-cethos-navy font-jakarta font-bold text-xl hidden sm:block sr-only">
              {companyName}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 sm:gap-4">
          <button className="flex items-center gap-2 px-3 py-2 text-cethos-gray hover:text-cethos-navy transition-colors">
            <HelpCircle className="w-5 h-5" />
            <span className="text-base font-medium hidden sm:inline">Help</span>
          </button>
          <button className="flex items-center gap-2 px-3 py-2 text-cethos-gray hover:text-cethos-navy transition-colors">
            <User className="w-5 h-5" />
            <span className="text-base font-medium hidden sm:inline">
              Login
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
