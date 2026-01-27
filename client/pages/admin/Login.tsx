import React, { useState, useEffect } from "react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  // Check if already logged in
  useEffect(() => {
    const checkExistingSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        // Verify user is still active staff
        const { data: staffData } = await supabase
          .from("staff_users")
          .select("id, is_active")
          .eq("email", session.user.email)
          .eq("is_active", true)
          .single();

        if (staffData) {
          navigate("/admin/hitl");
        }
      }
    };
    checkExistingSession();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    console.log("=== LOGIN START ===");

    try {
      const normalizedEmail = email.trim().toLowerCase();

      // Step 1: Sign in with Supabase Auth
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

      console.log("Auth response:", { authData, authError });

      if (authError) {
        throw new Error(
          authError.message === "Invalid login credentials"
            ? "Invalid email or password"
            : authError.message,
        );
      }

      console.log("Auth error check passed");

      if (!authData.session) {
        throw new Error("Failed to establish session. Please try again.");
      }

      console.log("Session exists:", authData.session ? "YES" : "NO");

      // Step 2: Verify user is in staff_users table and active
      console.log("Querying staff_users for email:", normalizedEmail);

      const { data: staffData, error: staffError } = await supabase
        .from("staff_users")
        .select("id, full_name, email, role, is_active")
        .eq("email", normalizedEmail)
        .single();

      console.log("Staff query result:", { staffData, staffError });

      if (staffError || !staffData) {
        await supabase.auth.signOut();
        throw new Error(
          "Access denied. Your account is not authorized for admin access.",
        );
      }

      if (!staffData.is_active) {
        await supabase.auth.signOut();
        throw new Error("Your account has been deactivated.");
      }

      // Step 3: Store staff info in localStorage to keep UI helpers in sync
      console.log("Setting staffSession in localStorage");

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

      // Step 4: Redirect to admin dashboard
      console.log("Navigating to /admin/hitl");
      navigate("/admin/hitl");
    } catch (err: any) {
      console.error("LOGIN ERROR:", err);
      setError(err.message || "Failed to sign in. Please try again.");
    } finally {
      console.log("=== LOGIN END ===");
      setLoading(false);
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
      console.error("Password reset error:", err);
      setError(err.message || "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  // Forgot Password View
  if (showForgotPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Reset Password</h1>
            <p className="text-gray-600 mt-2">
              Enter your email and we'll send you a link to reset your password.
            </p>
          </div>

          {resetEmailSent ? (
            <div className="text-center">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-6">
                <svg
                  className="w-12 h-12 text-green-500 mx-auto mb-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-green-800 font-medium">Check your email</p>
                <p className="text-green-700 text-sm mt-1">
                  We've sent a password reset link to {email}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowForgotPassword(false);
                  setResetEmailSent(false);
                }}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                ← Back to login
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-6">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div>
                <label
                  htmlFor="reset-email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Email Address
                </label>
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="you@company.com"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setError("");
                  }}
                  className="text-gray-600 hover:text-gray-700 text-sm"
                >
                  ← Back to login
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Main Login View
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Login</h1>
          <p className="text-gray-600 mt-2">
            Sign in to access the admin panel
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Signing in...
              </span>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setShowForgotPassword(true);
              setError("");
            }}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Forgot your password?
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-500">
            Protected area. Authorized personnel only.
          </p>
        </div>
      </div>
    </div>
  );
}
