import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useStaffAuth } from "../../context/StaffAuthContext";
import { Eye, EyeOff, ArrowLeft, Loader2 } from "lucide-react";

export default function AdminLogin() {
  const navigate = useNavigate();
  const { session, staffUser, loading: authLoading } = useStaffAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authCheckTimedOut, setAuthCheckTimedOut] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAuthCheckTimedOut(true);
      setCheckingAuth(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let mounted = true;

    const checkExistingSession = async () => {
      if (authLoading) return;

      try {
        if (session && staffUser) {
          navigate("/admin/dashboard", { replace: true });
          return;
        }

        if (session && !staffUser) {
          await supabase.auth.signOut();
          if (!mounted) return;
          localStorage.removeItem("staffSession");
          setError("Access denied. Your account is not authorized for admin access.");
        }

        if (!session) {
          localStorage.removeItem("staffSession");
        }
      } catch (err) {
        console.error("Auth check failed:", err);
        localStorage.removeItem("staffSession");
      } finally {
        if (mounted) {
          setCheckingAuth(false);
        }
      }
    };

    checkExistingSession();

    return () => {
      mounted = false;
    };
  }, [session, staffUser, authLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

      if (!isMountedRef.current) return;

      if (authError) {
        throw new Error(
          authError.message === "Invalid login credentials"
            ? "Invalid email or password"
            : authError.message,
        );
      }

      if (!authData.session) {
        throw new Error("Failed to establish session. Please try again.");
      }

      const { data: staffData, error: staffError } = await supabase
        .from("staff_users")
        .select("id, full_name, email, role, is_active")
        .eq("email", normalizedEmail)
        .single();

      if (!isMountedRef.current) return;

      if (staffError || !staffData) {
        await supabase.auth.signOut();
        throw new Error("Access denied. Your account is not authorized for admin access.");
      }

      if (!staffData.is_active) {
        await supabase.auth.signOut();
        throw new Error("Your account has been deactivated.");
      }

      const staffSession = {
        staffId: staffData.id,
        staffName: staffData.full_name,
        staffEmail: staffData.email,
        staffRole: staffData.role,
        isActive: staffData.is_active,
        loggedIn: true,
        loginTime: new Date().toISOString(),
      };
      localStorage.setItem("staffSession", JSON.stringify(staffSession));

      navigate("/admin/dashboard");
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      if (!isMountedRef.current) return;
      setError(err.message || "Failed to sign in. Please try again.");
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo: `${window.location.origin}/admin/reset-password`,
        },
      );

      if (error) {
        throw new Error(error.message);
      }

      setResetEmailSent(true);
    } catch (err: any) {
      setError(err.message || "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if ((authLoading || checkingAuth) && !authCheckTimedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0d9488] to-[#0f766e]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
          <p className="text-white/80">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Redirecting state
  if (session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0d9488] to-[#0f766e]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
          <p className="text-lg font-medium text-white">Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding (hidden on mobile) */}
      <div className="hidden md:flex md:w-[40%] bg-gradient-to-br from-[#0d9488] to-[#0f766e] flex-col justify-between p-10 relative overflow-hidden">
        {/* Decorative shapes */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/3" />
        <div className="absolute top-1/2 right-10 w-24 h-24 bg-white/5 rounded-lg rotate-45" />
        <div className="absolute bottom-1/3 left-1/4 w-16 h-16 bg-white/5 rounded-full" />

        {/* Logo */}
        <div className="relative z-10">
          <span className="font-bold text-2xl text-white tracking-tight">CETHOS</span>
        </div>

        {/* Center content */}
        <div className="relative z-10">
          <h1 className="text-3xl font-bold text-white leading-tight">
            Manage your content with confidence
          </h1>
          <p className="mt-4 text-white/80 text-lg leading-relaxed">
            The Cethos marketing hub &mdash; blog, SEO, and analytics in one place.
          </p>
        </div>

        {/* Footer */}
        <div className="relative z-10">
          <p className="text-white/50 text-sm">&copy; 2026 Cethos Solutions Inc.</p>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-md">
          {/* Logo for mobile */}
          <div className="mb-8 text-center md:text-left">
            <span className="font-bold text-2xl text-[#0f172a] tracking-tight">CETHOS</span>
          </div>

          {showForgotPassword ? (
            // Forgot Password View
            <div>
              <h1 className="text-2xl font-bold text-[#0f172a]">Reset password</h1>
              <p className="mt-2 text-[#64748b]">
                Enter your email and we'll send you a reset link.
              </p>

              {resetEmailSent ? (
                <div className="mt-8">
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-green-800 font-medium">Check your email</p>
                    <p className="text-green-700 text-sm mt-1">
                      We've sent a password reset link to <strong>{email}</strong>
                    </p>
                  </div>
                  <button
                    onClick={() => { setShowForgotPassword(false); setResetEmailSent(false); }}
                    className="mt-6 flex items-center gap-2 text-[#0d9488] hover:text-[#0f766e] font-medium text-sm"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="mt-8 space-y-5">
                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-[#dc2626]">{error}</p>
                    </div>
                  )}

                  <div>
                    <label htmlFor="reset-email" className="block text-sm font-medium text-[#0f172a] mb-1.5">
                      Email address
                    </label>
                    <input
                      id="reset-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 border border-[#e2e8f0] rounded-md focus:ring-2 focus:ring-[#0d9488] focus:border-[#0d9488] outline-none transition-colors text-[#0f172a] placeholder-[#94a3b8]"
                      placeholder="you@cethos.com"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-[#0d9488] text-white font-medium rounded-md hover:bg-[#0f766e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sending...
                      </span>
                    ) : (
                      "Send reset link"
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setShowForgotPassword(false); setError(""); }}
                    className="flex items-center gap-2 text-[#64748b] hover:text-[#0f172a] text-sm mx-auto"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to login
                  </button>
                </form>
              )}
            </div>
          ) : (
            // Main Login View
            <div>
              <h1 className="text-2xl font-bold text-[#0f172a]">Welcome back</h1>
              <p className="mt-2 text-[#64748b]">Sign in to your admin account</p>

              <form onSubmit={handleLogin} className="mt-8 space-y-5">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-[#dc2626]">{error}</p>
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-[#0f172a] mb-1.5">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full px-3.5 py-2.5 border border-[#e2e8f0] rounded-md focus:ring-2 focus:ring-[#0d9488] focus:border-[#0d9488] outline-none transition-colors text-[#0f172a] placeholder-[#94a3b8]"
                    placeholder="you@cethos.com"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-[#0f172a] mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="w-full px-3.5 py-2.5 pr-10 border border-[#e2e8f0] rounded-md focus:ring-2 focus:ring-[#0d9488] focus:border-[#0d9488] outline-none transition-colors text-[#0f172a] placeholder-[#94a3b8]"
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#64748b] transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="flex justify-end mt-1.5">
                    <button
                      type="button"
                      onClick={() => { setShowForgotPassword(true); setError(""); }}
                      className="text-sm text-[#0d9488] hover:text-[#0f766e] transition-colors"
                    >
                      Forgot your password?
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-[#0d9488] text-white font-medium rounded-md hover:bg-[#0f766e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Signing in...
                    </span>
                  ) : (
                    "Sign In"
                  )}
                </button>
              </form>

              <div className="mt-8 text-center">
                <a
                  href="https://cethos.com"
                  className="flex items-center justify-center gap-1.5 text-sm text-[#64748b] hover:text-[#0f172a] transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to cethos.com
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
