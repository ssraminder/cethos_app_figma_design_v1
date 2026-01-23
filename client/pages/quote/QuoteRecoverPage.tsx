import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, Loader2, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function QuoteRecoverPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [tokenInput, setTokenInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const urlQuoteId = searchParams.get("quote_id");
    const urlToken = searchParams.get("token");
    const storedQuoteId = sessionStorage.getItem("cethos_current_quote_id");

    if (urlQuoteId || storedQuoteId) {
      const quoteId = urlQuoteId || storedQuoteId;
      if (quoteId) {
        sessionStorage.setItem("cethos_current_quote_id", quoteId);
        navigate(`/quote/${quoteId}/review`, { replace: true });
        return;
      }
    }

    if (urlToken) {
      setTokenInput(urlToken);
      recoverQuote(urlToken);
      return;
    }

    setLoading(false);
  }, [navigate, searchParams]);

  const recoverQuote = async (token: string) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("quotes")
        .select("id")
        .eq("recovery_token", token)
        .single();

      if (fetchError || !data) {
        throw new Error(
          fetchError?.message || "We couldn't find a quote for that token.",
        );
      }

      sessionStorage.setItem("cethos_current_quote_id", data.id);
      navigate(`/quote/${data.id}/review`, { replace: true });
    } catch (err: any) {
      setError(err.message || "Unable to recover this quote.");
      setLoading(false);
    }
  };

  const handleRecover = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tokenInput.trim()) {
      setError("Enter your recovery token to continue.");
      return;
    }
    await recoverQuote(tokenInput.trim());
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">
            Recover Your Quote
          </h1>
          <p className="text-gray-600 mt-2">
            Use the recovery link from your email, or paste the recovery token
            below to continue.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
            </div>
          ) : (
            <form onSubmit={handleRecover} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Recovery Token
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={tokenInput}
                    onChange={(event) => setTokenInput(event.target.value)}
                    placeholder="Paste your token"
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-teal-600 text-white py-2.5 rounded-lg font-medium hover:bg-teal-700"
              >
                Find My Quote
              </button>
            </form>
          )}

          {!loading && (
            <div className="mt-6 text-sm text-gray-500">
              Need help?{