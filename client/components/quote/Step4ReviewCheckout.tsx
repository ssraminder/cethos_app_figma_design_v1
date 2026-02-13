import { useState, useEffect } from "react";
import { useQuote } from "@/context/QuoteContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";
import StartOverLink from "@/components/quote/StartOverLink";

export default function Step4ReviewCheckout() {
  const { state, goToPreviousStep } = useQuote();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Placeholder — will be replaced in Phase 2
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-cethos-teal" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pb-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-cethos-navy mb-2">
          Review & Checkout
        </h2>
        <p className="text-cethos-gray">
          Review your quote, choose options, and pay securely
        </p>
        {state.quoteNumber && (
          <p className="text-sm text-gray-400 mt-1">
            Quote ref: <span className="font-medium text-gray-500">{state.quoteNumber}</span>
          </p>
        )}
      </div>

      {/* Placeholder content — replaced in Phases 2-4 */}
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-gray-500">Checkout page under construction</p>
        <p className="text-sm text-gray-400 mt-2">Quote ID: {state.quoteId}</p>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <StartOverLink />
        <button
          onClick={goToPreviousStep}
          className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}
