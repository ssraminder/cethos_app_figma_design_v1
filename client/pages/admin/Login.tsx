import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBranding } from "../../context/BrandingContext";

export default function Login() {
  const { companyName, logoUrl, primaryColor } = useBranding();
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!SUPABASE_URL) {
      setMessage("Database not configured");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/send-staff-otp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.toLowerCase() }),
        },
      );

      const result = await response.json();

      if (result.success) {
        setStep("otp");
        setMessage("OTP code sent to your email");
      } else {
        setMessage(result.error || "Failed to send OTP");
      }
    } catch (err) {
      console.error("Send OTP error:", err);
      setMessage(`Error: ${err}`);
    }

    setLoading(false);
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!SUPABASE_URL) {
      setMessage("Database not configured");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/verify-staff-otp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.toLowerCase(), otp: otpCode }),
        },
      );

      const result = await response.json();

      if (result.success) {
        // 1. Store session FIRST
        const sessionData = {
          email: result.user.email,
          staffId: result.user.id,
          staffName: result.user.fullName,
          staffRole: result.user.role,
          loggedIn: true,
          loginTime: new Date().toISOString(),
        };

        console.log("Saving session:", sessionData);
        sessionStorage.setItem("staffSession", JSON.stringify(sessionData));

        // 2. Verify it was saved
        console.log("Session saved:", sessionStorage.getItem("staffSession"));

        setMessage("Login successful! Redirecting...");

        // 3. Navigate AFTER
        navigate("/admin/hitl", { replace: true });
      } else {
        setMessage(result.error || "Invalid OTP code");
        setLoading(false);
      }
    } catch (err) {
      console.error("Verify OTP error:", err);
      setMessage(`Error: ${err}`);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={companyName}
              className="h-12 mx-auto mb-4"
            />
          ) : (
            <h1
              className="text-3xl font-bold mb-4"
              style={{ color: primaryColor }}
            >
              {companyName.toUpperCase()}
            </h1>
          )}
          <h2 className="text-2xl font-semibold text-gray-900">Staff Portal</h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {step === "email"
              ? "Enter your staff email"
              : "Enter the 6-digit code"}
          </p>
        </div>

        {step === "email" ? (
          <form className="mt-8 space-y-6" onSubmit={handleSendOTP}>
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="you@cethos.com"
              />
            </div>

            {message && (
              <p
                className={`text-sm text-center ${message.includes("sent") ? "text-blue-600" : "text-red-600"}`}
              >
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Checking..." : "Continue"}
            </button>
          </form>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleVerifyOTP}>
            <p className="text-sm text-center text-gray-500">
              Logging in as: {email}
            </p>

            <div>
              <label
                htmlFor="otp"
                className="block text-sm font-medium text-gray-700"
              >
                6-Digit Code
              </label>
              <input
                id="otp"
                type="text"
                required
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-center text-2xl tracking-widest"
                placeholder="000000"
              />
            </div>

            {message && (
              <p
                className={`text-sm text-center ${message.includes("successful") ? "text-green-600" : "text-red-600"}`}
              >
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || otpCode.length !== 6}
              className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify Code"}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("email");
                setOtpCode("");
                setMessage("");
              }}
              className="w-full py-2 px-4 text-sm text-gray-600 hover:text-gray-900"
            >
              ← Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
