import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { setCustomerSession } from "@/context/CustomerAuthContext";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [method, setMethod] = useState<"otp" | "magic_link">("otp");
  const [step, setStep] = useState<"email" | "verify-otp" | "check-email">(
    "email",
  );
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Refs for 6-digit OTP inputs
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── Send Handler ──────────────────────────────────────────────────────

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/send-customer-login-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
          },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            method: method,
          }),
        },
      );

      const data = await response.json();

      if (!data.success) {
        setError(data.error || "Failed to send. Please try again.");
        return;
      }

      if (method === "otp") {
        setStep("verify-otp");
      } else {
        setStep("check-email");
      }
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── OTP Verify Handler ────────────────────────────────────────────────

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/verify-customer-login-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
          },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            otp: otp,
          }),
        },
      );

      const data = await response.json();

      if (!data.success) {
        setError(data.error || "Invalid code. Please try again.");
        return;
      }

      setCustomerSession(data.session, data.customer);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Resend Handler (works for both OTP and magic link) ────────────────

  const handleResend = async () => {
    setLoading(true);
    setError("");

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/send-customer-login-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
          },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            method: method,
          }),
        },
      );

      const data = await response.json();
      if (!data.success) {
        setError(data.error || "Failed to resend. Please try again.");
      }
      // Reset OTP input on resend
      if (method === "otp") setOtp("");
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── OTP digit input helpers ───────────────────────────────────────────

  const handleOtpDigit = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const digits = otp.split("");
    while (digits.length < 6) digits.push("");
    digits[index] = value.slice(-1);
    const newOtp = digits.join("");
    setOtp(newOtp);

    // Auto-advance to next input
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    setOtp(pastedData);
    const focusIndex = Math.min(pastedData.length, 5);
    otpRefs.current[focusIndex]?.focus();
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="https://lmzoyezvsjgsxveoakdr.supabase.co/storage/v1/object/public/web-assets/png_logo_cethos_light_bg.png"
            alt="Cethos Translation Services"
            className="h-10 mx-auto"
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          {/* ── Screen 1: Email + Method Toggle ── */}
          {step === "email" && (
            <form onSubmit={handleSendCode}>
              <h1
                className="text-2xl font-bold mb-1"
                style={{ color: "#0C2340" }}
              >
                Log in to your account
              </h1>
              <p className="text-sm text-gray-500 mb-6">
                Choose how you'd like to sign in.
              </p>

              {/* Method Toggle */}
              <div className="flex gap-3 mb-6">
                <button
                  type="button"
                  onClick={() => setMethod("otp")}
                  className={`flex-1 p-3 rounded-lg border-2 text-center transition-all ${
                    method === "otp"
                      ? "border-amber-400 bg-amber-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="text-lg mb-1">🔢</div>
                  <div className="text-sm font-semibold text-gray-900">
                    Email Code
                  </div>
                  <div className="text-xs text-gray-500">6-digit code</div>
                </button>
                <button
                  type="button"
                  onClick={() => setMethod("magic_link")}
                  className={`flex-1 p-3 rounded-lg border-2 text-center transition-all ${
                    method === "magic_link"
                      ? "border-blue-400 bg-blue-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="text-lg mb-1">🔗</div>
                  <div className="text-sm font-semibold text-gray-900">
                    Login Link
                  </div>
                  <div className="text-xs text-gray-500">Click to log in</div>
                </button>
              </div>

              {/* Email Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 px-4 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0891B2] focus:border-transparent"
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </div>

              {/* Error */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-lg text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: "#0891B2" }}
              >
                {loading
                  ? "Sending..."
                  : method === "otp"
                    ? "Send Code"
                    : "Send Login Link"}
              </button>

              {/* Sign up link */}
              <p className="text-center text-sm text-gray-500 mt-6">
                Don't have an account?{" "}
                <Link
                  to="/quote"
                  className="font-medium"
                  style={{ color: "#0891B2" }}
                >
                  Start a Quote
                </Link>
              </p>
            </form>
          )}

          {/* ── Screen 2a: Enter OTP Code ── */}
          {step === "verify-otp" && (
            <form onSubmit={handleVerifyOtp}>
              <h1
                className="text-2xl font-bold mb-1 text-center"
                style={{ color: "#0C2340" }}
              >
                Enter your code
              </h1>
              <p className="text-sm text-gray-500 text-center mb-6">
                We sent a 6-digit code to{" "}
                <span
                  className="font-semibold"
                  style={{ color: "#0C2340" }}
                >
                  {email}
                </span>
              </p>

              {/* 6-digit OTP Input Boxes */}
              <div className="flex justify-center gap-2 mb-2">
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      otpRefs.current[index] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={otp[index] || ""}
                    onChange={(e) => handleOtpDigit(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    onPaste={index === 0 ? handleOtpPaste : undefined}
                    className="w-9 h-12 text-center text-xl font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0891B2] focus:border-transparent"
                    autoFocus={index === 0}
                  />
                ))}
              </div>
              <p className="text-xs text-gray-400 text-center mb-6">
                Code expires in 10 minutes
              </p>

              {/* Error */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Verify Button */}
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full h-11 rounded-lg text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                style={{ backgroundColor: "#0891B2" }}
              >
                {loading ? "Verifying..." : "Verify Code"}
              </button>

              {/* Resend */}
              <button
                type="button"
                onClick={handleResend}
                disabled={loading}
                className="block mx-auto text-sm font-medium disabled:opacity-50"
                style={{ color: "#0891B2" }}
              >
                Resend code
              </button>

              {/* Back to login */}
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setOtp("");
                  setError("");
                }}
                className="block mx-auto text-sm text-gray-400 mt-3"
              >
                &larr; Back to login
              </button>
            </form>
          )}

          {/* ── Screen 2b: Check Your Email (Magic Link) ── */}
          {step === "check-email" && (
            <div className="text-center">
              <div className="text-5xl mb-4">&#9993;&#65039;</div>
              <h1
                className="text-2xl font-bold mb-2"
                style={{ color: "#0C2340" }}
              >
                Check your email
              </h1>
              <p className="text-sm text-gray-500 mb-1">
                We sent a login link to
              </p>
              <p className="font-semibold mb-4" style={{ color: "#0C2340" }}>
                {email}
              </p>
              <p className="text-xs text-gray-400 mb-6">
                The link expires in 15 minutes.
              </p>

              {/* Error */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Resend */}
              <p className="text-sm text-gray-500">
                Didn't receive it?{" "}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading}
                  className="font-medium disabled:opacity-50"
                  style={{ color: "#0891B2" }}
                >
                  Resend
                </button>
              </p>

              {/* Back to login */}
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setError("");
                }}
                className="text-sm text-gray-400 mt-3"
              >
                &larr; Back to login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
