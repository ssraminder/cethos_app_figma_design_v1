import { HelpCircle, User } from "lucide-react";

export default function Header() {
  return (
    <header className="w-full h-16 bg-white border-b border-cethos-border shadow-sm sticky top-0 z-50">
      <div className="max-w-[1536px] mx-auto px-4 sm:px-8 lg:px-12 h-full flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-cethos-navy rounded-lg flex items-center justify-center">
            <span className="text-white font-jakarta font-bold text-base">C</span>
          </div>
          <span className="text-cethos-navy font-jakarta font-bold text-xl hidden sm:block">
            CETHOS
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 sm:gap-4">
          <button className="flex items-center gap-2 px-3 py-2 text-cethos-slate hover:text-cethos-slate-dark transition-colors">
            <HelpCircle className="w-5 h-5" />
            <span className="text-base font-medium hidden sm:inline">Help</span>
          </button>
          <button className="flex items-center gap-2 px-3 py-2 text-cethos-slate hover:text-cethos-slate-dark transition-colors">
            <User className="w-5 h-5" />
            <span className="text-base font-medium hidden sm:inline">Login</span>
          </button>
        </div>
      </div>
    </header>
  );
}
