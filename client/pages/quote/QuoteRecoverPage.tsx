import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Mail,
  KeyRound,
} from "lucide-react";

type RecoveryMethod = "magic_link" | "otp";

type RecoveryStep = "input" | "otp" | "link" | "success";

interface RecoveredQuote {
  id: string;
  quote_number?: string;
  status: string;
  created_at?: string;
  total?: number;
  expires_at?: string;
}

interface VerifyResponse {
  success: boolean;
  email?: string;
  quotes?: RecoveredQuote[];
  error?: string;
}

export default function QuoteRecoverPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState("");
  const [method, setMethod] = useState<RecoveryMethod>("magic_link");
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState<RecoveryStep>("input");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<RecoveredQuote[]>([]);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      setStep("link");
      verifyWithToken(token);
    }
  }, [searchParams]);

  const sendRecovery = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Enter your email to continue.");
      return;
    }

    setSending(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-quote-recovery`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), method }),
        },
      );

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Unable to send recovery email.");
      }

      setStep(method === "otp" ? "otp" : "link");
    } catch (err: any) {
      setError(err.message || "Unable to send recovery email.");
    } finally {
      setSending(false);
    }
  };

  const verifyWithToken = async (token: string) => {
    setVerifying(true);
    setError(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-quote-recovery`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        },
      );

      const result: VerifyResponse = await response.json().catch(() => ({
        success: false,
      }));

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to verify recovery link.");
      }

      setVerifiedEmail(result.email || null);
      setQuotes(result.quotes || []);
      setStep("success");
    } catch (err: any) {
      setError(err.message || "Unable to verify recovery link.");
      setStep("input");
    } finally {
      setVerifying(false);
    }
  };

  const verifyWithOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!otpCode.trim()) {
      setError("Enter the 6-digit code from your email.");
      return;
    }

    setVerifying(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-quote-recovery`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            otp_code: otpCode.trim(),
          }),
        },
      );

      const result: VerifyResponse = await response.json().catch(() => ({
        success: false,
      }));

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to verify the code.");
      }

      setVerifiedEmail(result.email || email.trim());
      setQuotes(result.quotes || []);
      setStep("success");
    } catch (err: any) {
      setError(err.message || "Unable to verify the code.");
    } finally {
      setVerifying(false);
    }
  };

  const resetFlow = () => {
    setStep("input");
    setOtpCode("");
    setError(null);
    setQuotes([]);
    setVerifiedEmail(null);
  };

  const isQuoteExpired = (quote: RecoveredQuote) => {
    if (!quote.expires_at) return false;
    return new Date(quote.expires_at) < new Date();
  };

  const handleQuoteClick = (quote: RecoveredQuote) => {
    // Check if quote is expired
    if (isQuoteExpired(quote)) {
      // Get file count - default to 0 since we don't have it in recovered quotes
      navigate("/quote/expired", {
        replace: true,
        state: {
          quoteNumber: quote.quote_number || quote.id,
          documentsCount: 0,
        },
      });
      return;
    }

    // Navigate to appropriate page based on status
    const redirectPath = getRedirectPath(quote);
    if (redirectPath) {
      navigate(redirectPath);
    }
  };

  const getRedirectPath = (quote: RecoveredQuote) => {
    switch (quote.status) {
      case "draft":
        return `/quote/new?quoteId=${quote.id}&step=1`;
      case "details_pending":
        return `/quote/new?quoteId=${quote.id}&step=2`;
      case "processing":
      case "quote_ready":
      case "hitl_pending":
      case "hitl_in_review":
        return `/quote/${quote.id}/review`;
      case "awaiting_payment":
        return `/quote/new?quoteId=${quote.id}&step=5`;
      case "revision_needed":
        return `/quote/${quote.id}/revision`;
      case "converted":
        return `/quote/${quote.id}/review`;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">
            Recover Your Quote
          </h1>
          <p className="text-gray-600 mt-2">
            Enter your email and we&apos;ll help you return to your quote.
          </p>

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {step === "input" && (
            <form onSubmit={sendRecovery} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">
                  Recovery method
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMethod("magic_link")}
                    className={`border rounded-lg px-4 py-3 text-left transition-colors ${
                      method === "magic_link"
                        ? "border-teal-500 bg-teal-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-900">
                      Email me a link
                    </p>
                    <p className="text-xs text-gray-500">
                      Open a secure magic link.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethod("otp")}
                    className={`border rounded-lg px-4 py-3 text-left transition-colors ${
                      method === "otp"
                        ? "border-teal-500 bg-teal-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-900">
                      Send me a code
                    </p>
                    <p className="text-xs text-gray-500">
                      Enter a 6-digit OTP.
                    </p>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-teal-600 text-white py-2.5 rounded-lg font-medium hover:bg-teal-700"
                disabled={sending}
              >
                {sending ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </span>
                ) : (
                  "Continue"
                )}
              </button>
            </form>
          )}

          {step === "link" && (
            <div className="mt-8 space-y-4 text-gray-600">
              {verifying ? (
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                  Verifying your link...
                </div>
              ) : (
                <div className="bg-teal-50 border border-teal-100 rounded-lg p-4">
                  <p className="text-sm text-teal-700">
                    We sent a magic link to <strong>{email}</strong>. Open it to
                    access your quotes.
                  </p>
                </div>
              )}
              <button
                type="button"
                onClick={resetFlow}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Use a different email
              </button>
            </div>
          )}

          {step === "otp" && (
            <form onSubmit={verifyWithOtp} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  6-digit code
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value)}
                    placeholder="Enter code"
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-teal-600 text-white py-2.5 rounded-lg font-medium hover:bg-teal-700"
                disabled={verifying}
              >
                {verifying ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying...
                  </span>
                ) : (
                  "Verify code"
                )}
              </button>

              <button
                type="button"
                onClick={resetFlow}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Use a different email
              </button>
            </form>
          )}

          {step === "success" && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-2 text-teal-700 bg-teal-50 border border-teal-100 rounded-lg p-3 text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  Quotes for {verifiedEmail || email} are ready. Choose one to
                  continue.
                </span>
              </div>

              {quotes.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No quotes were found for this email.
                </p>
              ) : (
                <div className="space-y-3">
                  {quotes.map((quote) => {
                    const redirectPath = getRedirectPath(quote);
                    return (
                      <div
                        key={quote.id}
                        className="border border-gray-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {quote.quote_number || quote.id}
                          </p>
                          <p className="text-xs text-gray-500 capitalize">
                            Status: {quote.status.replace(/_/g, " ")}
                          </p>
                        </div>
                        {isQuoteExpired(quote) ? (
                          <button
                            type="button"
                            onClick={() => handleQuoteClick(quote)}
                            className="inline-flex items-center gap-2 text-red-600 hover:text-red-700 text-sm font-medium"
                          >
                            Expired
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        ) : redirectPath ? (
                          <button
                            type="button"
                            onClick={() => handleQuoteClick(quote)}
                            className="inline-flex items-center gap-2 text-teal-600 hover:text-teal-700 text-sm font-medium"
                          >
                            Open quote
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-xs text-gray-500">
                            Cannot open
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                onClick={resetFlow}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Recover another email
              </button>
            </div>
          )}

          <div className="mt-8 text-sm text-gray-500">
            Need help?{" "}
            <a
              href="mailto:support@cethos.com"
              className="text-teal-600 hover:underline"
            >
              Contact support
            </a>
            .
          </div>

          <Link
            to="/quote"
            className="mt-4 inline-flex text-sm text-gray-500 hover:text-gray-700"
          >
            Return to Quote Form
          </Link>
        </div>
      </div>
    </div>
  );
}
