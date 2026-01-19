import { FileText } from "lucide-react";

interface DocumentPricingCardProps {
  filename: string;
  languagePair: string;
  translationPrice: number;
  certificationPrice: number;
  pages?: number;
}

export default function DocumentPricingCard({
  filename,
  languagePair,
  translationPrice,
  certificationPrice,
  pages = 1,
}: DocumentPricingCardProps) {
  const subtotal = translationPrice + certificationPrice;

  return (
    <div className="bg-white border border-cethos-border rounded-xl p-5 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <FileText className="w-5 h-5 text-cethos-blue flex-shrink-0" />
          <span className="text-cethos-slate-dark font-medium text-sm truncate">
            {filename}
          </span>
        </div>
        <div className="flex-shrink-0">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 text-cethos-blue text-xs font-medium">
            {languagePair}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-cethos-border mb-4"></div>

      {/* Line Items */}
      <div className="space-y-3 mb-4">
        <div className="flex justify-between items-center text-sm">
          <span className="text-cethos-slate">
            Translation ({pages} page{pages !== 1 ? "s" : ""} est.)
          </span>
          <span className="text-cethos-slate-dark font-medium">
            ${translationPrice.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-cethos-slate">Certification (Notarization)</span>
          <span className="text-cethos-slate-dark font-medium">
            ${certificationPrice.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Subtotal */}
      <div className="border-t border-cethos-border pt-4">
        <div className="flex justify-between items-center">
          <span className="text-cethos-slate-dark font-semibold text-sm">
            Document Subtotal
          </span>
          <span className="text-cethos-slate-dark font-bold text-base">
            ${subtotal.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
