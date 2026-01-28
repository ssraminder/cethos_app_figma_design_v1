import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, ArrowRight, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

type LoginMethod = "otp" | "magic_link";
type LoginStep = "email" | "verify";

export default function Login() {
  const navigate = useNavigate();
  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [method, setMethod] = useState<LoginMethod>("otp");
  const [loading, setLoading] = useState(false);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter your email address",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/send-customer-login-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: window.location.origin,
          },
          body: JSON.stringify({
            email: email.toLowerCase(),
            method,
          }),
        },
      );

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to send code");
      }

      if (method === "magic_link") {
        toast({
          title: "Login link sent!",
          description: "Check your email for the login link",
        });
      } else {
        toast({
          title: "Code sent!",
          description: "Check your email for the verification code",
        });
        setStep("verify");
      }
    } catch (error: any) {
      console.error("Send code error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to send code",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!otp || otp.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Please enter the 6-digit code",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/verify-customer-login-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: email.toLowerCase(),
            otp,
          }),
        },
      );

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Invalid code");
      }

      // Use the hashed token to verify and get session
      if (data.session && data.session.hashed_token) {
        const { data: verifyData, error: verifyError } =
          await supabase.auth.verifyOtp({
            email: email.toLowerCase(),
            token: data.session.hashed_token,
            type: "magiclink",
          });

        if (verifyError) {
          throw new Error(verifyError.message);
        }

        if (verifyData.session) {
          toast({
            title: "Success!",
            description: "Logging you in...",
          });

          // Navigate to dashboard
          setTimeout(() => {
            navigate("/dashboard");
          }, 500);
        } else {
          throw new Error("Failed to create session");
        }
      } else {
        throw new Error("No session data received");
      }
    } catch (error: any) {
      console.error("Verify OTP error:", error);
      toast({
        title: "Verification failed",
        description: error.message || "Invalid or expired code",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
        {step === "email" ? (
          <>
            {/* Email Step */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-teal-100 rounded-full mb-4">
                <Mail className="w-8 h-8 text-teal-600" />
              </div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-2">
                Customer Portal Login
              </h1>
              <p className="text-sm text-gray-600">
                Enter your email to access your account
              </p>
            </div>

            <form onSubmit={handleSendCode} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 px-4 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </div>

              {/* Login Method Selector */}
              <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-gray-700">
                  Login Method
                </p>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="method"
                      value="otp"
                      checked={method === "otp"}
                      onChange={() => setMethod("otp")}
                      className="w-4 h-4 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Email Code (Recommended)
                      </p>
                      <p className="text-xs text-gray-500">
                        Get a 6-digit code via email
                      </p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="method"
                      value="magic_link"
                      checked={method === "magic_link"}
                      onChange={() => setMethod("magic_link")}
                      className="w-4 h-4 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Login Link
                      </p>
                      <p className="text-xs text-gray-500">
                        Get a one-click login link via email
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  "Sending..."
                ) : (
                  <>
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-xs text-gray-500">
                Don't have an account?{" "}
                <a href="/quote" className="text-teal-600 hover:text-teal-700">
                  Get a quote
                </a>
              </p>
            </div>
          </>
        ) : (
          <>
            {/* OTP Verification Step */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-2">
                Check Your Email
              </h1>
              <p className="text-sm text-gray-600">
                We sent a 6-digit code to
                <br />
                <span className="font-medium text-gray-900">{email}</span>
              </p>
            </div>

            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Verification Code
                </label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "");
                    if (value.length <= 6) {
                      setOtp(value);
                    }
                  }}
                  className="w-full h-14 px-4 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-center text-2xl font-mono tracking-widest"
                  placeholder="000000"
                  maxLength={6}
                  required
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Code expires in 10 minutes
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full h-11 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? "Verifying..." : "Verify & Sign In"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setOtp("");
                }}
                className="w-full text-sm text-gray-600 hover:text-gray-900"
              >
                ← Back to email
              </button>

              <div className="pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setOtp("");
                    handleSendCode(new Event("submit") as any);
                  }}
                  disabled={loading}
                  className="w-full text-sm text-teal-600 hover:text-teal-700 disabled:opacity-50"
                >
                  Resend code
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
