import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // Handle the code parameter from Supabase email link
  useEffect(() => {
    const code = searchParams.get("code");
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get("access_token");
    const type = hashParams.get("type");

    // If no code or token, show error
    if (!code && !(accessToken && type === "recovery")) {
      setError(
        "Invalid reset link. Please request a new one from the login page.",
      );
      setLoading(false);
      return;
    }

    let timeout: NodeJS.Timeout;
    let unsubscribe: (() => void) | undefined;

    const handleCodeExchange = async () => {
      setLoading(true);
      setError("");

      try {
        if (code) {
          // PKCE flow - Supabase client automatically handles code exchange
          // via detectSessionInUrl: true, so we listen for auth state changes
          console.log(
            "Waiting for automatic PKCE code exchange (detectSessionInUrl)...",
          );

          // Listen for auth state changes
          const { data: authListener } = supabase.auth.onAuthStateChange(
            (event, session) => {
              console.log("Auth state changed:", event, session?.user?.id);

              if (event === "SIGNED_IN" && session) {
                console.log("Session established successfully via PKCE");
                setSessionReady(true);
                setLoading(false);
              } else if (event === "PASSWORD_RECOVERY") {
                console.log("Password recovery event detected");
                setSessionReady(true);
                setLoading(false);
              }
            },
          );

          unsubscribe = authListener.subscription.unsubscribe;

          // Fallback: Check session after 3 seconds
          timeout = setTimeout(async () => {
            const {
              data: { session },
            } = await supabase.auth.getSession();

            if (session) {
              console.log("Session found via fallback check");
              setSessionReady(true);
              setLoading(false);
            } else {
              setError(
                "Failed to establish session. The link may have expired. Please request a new one.",
              );
              setLoading(false);
            }
          }, 3000);
        } else if (accessToken && type === "recovery") {
          // Legacy implicit flow
          console.log("Using access token from hash...");
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: hashParams.get("refresh_token") || "",
          });

          if (sessionError) {
            throw new Error(
              "Invalid or expired reset link. Please request a new one.",
            );
          }

          if (data.session) {
            setSessionReady(true);
          }
          setLoading(false);
        }
      } catch (err: any) {
        console.error("Reset password init error:", err);
        setError(err.message || "Failed to verify reset link");
        setLoading(false);
      }
    };

    handleCodeExchange();

    // Cleanup
    return () => {
      if (timeout) clearTimeout(timeout);
      if (unsubscribe) unsubscribe();
    };
  }, [searchParams]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        throw new Error(updateError.message);
      }

      setSuccess(true);

      // Sign out after password change (forces fresh login)
      await supabase.auth.signOut();

      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate("/admin/login");
      }, 3000);
    } catch (err: any) {
      console.error("Password update error:", err);
      setError(err.message || "Failed to reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Loading state while verifying token
  if (loading && !sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Password Updated!
          </h1>
          <p className="text-gray-600 mb-6">
            Your password has been successfully changed. Redirecting to login...
          </p>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  // Error state (invalid/expired link)
  if (error && !sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Link Expired
          </h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate("/admin/login")}
            className="w-full py-2.5 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  // Main form (session is ready)
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
          <h1 className="text-2xl font-bold text-gray-900">Set New Password</h1>
          <p className="text-gray-600 mt-2">Enter your new password below.</p>
        </div>

        <form onSubmit={handleResetPassword} className="space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              New Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="••••••••"
            />
            <p className="text-xs text-gray-500 mt-1">Minimum 8 characters</p>
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Confirm Password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
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
                Updating...
              </span>
            ) : (
              "Update Password"
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate("/admin/login")}
            className="text-sm text-gray-600 hover:text-gray-700"
          >
            ← Back to login
          </button>
        </div>
      </div>
    </div>
  );
}
