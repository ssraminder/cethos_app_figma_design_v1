import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

export interface StaffSession {
  staffId: string;
  staffName: string;
  staffEmail: string;
  staffRole: string;
  isActive: boolean;
  loggedIn: boolean;
  loginTime: string;
}

interface UseAdminAuthReturn {
  session: StaffSession | null;
  loading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

export function useAdminAuth(): UseAdminAuthReturn {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<StaffSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use a ref for location.pathname so clearSessionAndRedirect doesn't
  // change identity on every route change (which would re-trigger the
  // auth check effect and flash "Verifying access..." on every navigation).
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;

  const clearSessionAndRedirect = useCallback(() => {
    localStorage.removeItem("staffSession");
    setSession(null);

    // Store the current path to redirect back after login
    const returnPath = locationRef.current;
    if (
      returnPath !== "/admin/login" &&
      returnPath !== "/admin/reset-password"
    ) {
      sessionStorage.setItem("adminReturnPath", returnPath);
    }

    navigate("/admin/login");
  }, [navigate]);

  const validateSession =
    useCallback(async (): Promise<StaffSession | null> => {
      // Auth state changes (SIGNED_IN, TOKEN_REFRESHED) cause the Supabase
      // client to throw AbortError on any in-flight request. Retry once.
      for (let outerAttempt = 0; outerAttempt < 2; outerAttempt++) {
        try {
          // Check Supabase Auth session
          const {
            data: { session: authSession },
            error: authError,
          } = await supabase.auth.getSession();

          if (authError) {
            console.error("Auth session error:", authError);
            return null;
          }

          if (!authSession) {
            console.log("No auth session found");
            return null;
          }

          if (!authSession.user.email) {
            console.log("Authenticated user missing email");
            await supabase.auth.signOut();
            return null;
          }

          // Verify user is still active staff
          const { data: staffData, error: staffError } = await supabase
            .from("staff_users")
            .select("id, full_name, email, role, is_active")
            .eq("email", authSession.user.email)
            .single();

          if (staffError || !staffData) {
            console.error(
              "Staff lookup error or missing staff record:",
              staffError,
            );
            await supabase.auth.signOut();
            return null;
          }

          if (!staffData.is_active) {
            console.log("User is not active staff");
            await supabase.auth.signOut();
            return null;
          }

          // Create/update staff session
          const staffSession: StaffSession = {
            staffId: staffData.id,
            staffName: staffData.full_name,
            staffEmail: staffData.email,
            staffRole: staffData.role,
            isActive: staffData.is_active,
            loggedIn: true,
            loginTime: new Date().toISOString(),
          };

          return staffSession;
        } catch (err: any) {
          const isAbort =
            err?.name === "AbortError" ||
            err?.message?.includes("AbortError") ||
            err?.message?.includes("aborted") ||
            err?.message?.includes("signal is aborted");
          if (isAbort && outerAttempt === 0) {
            console.warn("validateSession: AbortError, retrying in 400ms...");
            await new Promise((resolve) => setTimeout(resolve, 400));
            continue;
          }
          console.error("Session validation error:", err);
          return null;
        }
      }
      return null;
    }, []);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    setError(null);

    const validSession = await validateSession();

    if (validSession) {
      localStorage.setItem("staffSession", JSON.stringify(validSession));
      setSession(validSession);
    } else {
      clearSessionAndRedirect();
    }

    setLoading(false);
  }, [validateSession, clearSessionAndRedirect]);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      localStorage.removeItem("staffSession");
      sessionStorage.removeItem("adminReturnPath");
      setSession(null);
      navigate("/admin/login");
    }
  }, [navigate]);

  // Initial auth check
  useEffect(() => {
    const checkAuth = async () => {
      setLoading(true);
      setError(null);

      // First check localStorage for cached session (faster initial load)
      let cachedParsed: StaffSession | null = null;
      const cachedSession = localStorage.getItem("staffSession");
      if (cachedSession) {
        try {
          cachedParsed = JSON.parse(cachedSession) as StaffSession;
          setSession(cachedParsed);
        } catch {
          localStorage.removeItem("staffSession");
        }
      }

      // Then validate against Supabase.
      // If validation fails with an abort (Supabase client aborts in-flight
      // requests on auth state changes like SIGNED_IN) but we already have a
      // recent localStorage session, keep it rather than bouncing to login.
      // The periodic 5-minute re-validation will catch any truly expired sessions.
      const validSession = await validateSession();

      if (validSession) {
        localStorage.setItem("staffSession", JSON.stringify(validSession));
        setSession(validSession);
      } else if (cachedParsed) {
        // Validation failed (likely an abort race) but a cached session exists.
        // Keep the session — don't redirect.
        console.warn("useAdminAuth: Supabase validation failed but cached session present, keeping session");
      } else {
        clearSessionAndRedirect();
      }

      setLoading(false);
    };

    checkAuth();
  }, [validateSession, clearSessionAndRedirect]);

  // Listen for auth state changes
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, authSession) => {
      console.log("Auth state changed:", event);

      if (event === "SIGNED_OUT") {
        localStorage.removeItem("staffSession");
        setSession(null);
        navigate("/admin/login");
      } else if (event === "TOKEN_REFRESHED" && authSession) {
        // TOKEN_REFRESHED means auth is definitely valid — don't re-query staff_users
        // because this very event aborts any in-flight Supabase client requests,
        // causing validateSession to fail and triggering a false redirect to login.
        // If we have a cached staffSession, keep it. Only redirect if there's none.
        const cached = localStorage.getItem("staffSession");
        if (!cached) {
          clearSessionAndRedirect();
        }
        // else: keep the existing session, auth is valid
      } else if (event === "USER_UPDATED" && authSession) {
        // Re-validate if user was updated; keep cached session on abort
        const validSession = await validateSession();
        if (validSession) {
          localStorage.setItem("staffSession", JSON.stringify(validSession));
          setSession(validSession);
        } else if (!localStorage.getItem("staffSession")) {
          clearSessionAndRedirect();
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate, validateSession, clearSessionAndRedirect]);

  // Periodic session validation (every 5 minutes)
  useEffect(() => {
    const interval = setInterval(
      async () => {
        if (session) {
          const validSession = await validateSession();
          if (!validSession) {
            clearSessionAndRedirect();
          }
        }
      },
      5 * 60 * 1000,
    ); // 5 minutes

    return () => clearInterval(interval);
  }, [session, validateSession, clearSessionAndRedirect]);

  return {
    session,
    loading,
    error,
    signOut,
    refreshSession,
  };
}
