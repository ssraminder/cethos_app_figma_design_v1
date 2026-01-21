import { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

export interface StaffSession {
  staffId: string;
  staffName: string;
  staffEmail: string;
  staffRole: string;
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

  const clearSessionAndRedirect = useCallback(() => {
    localStorage.removeItem("staffSession");
    setSession(null);

    // Store the current path to redirect back after login
    const returnPath = location.pathname;
    if (
      returnPath !== "/admin/login" &&
      returnPath !== "/admin/reset-password"
    ) {
      sessionStorage.setItem("adminReturnPath", returnPath);
    }

    navigate("/admin/login");
  }, [navigate, location.pathname]);

  const validateSession =
    useCallback(async (): Promise<StaffSession | null> => {
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

        // Verify user is still active staff
        const { data: staffData, error: staffError } = await supabase
          .from("staff")
          .select("id, name, email, role, is_active")
          .eq("email", authSession.user.email)
          .single();

        if (staffError) {
          console.error("Staff lookup error:", staffError);
          return null;
        }

        if (!staffData || !staffData.is_active) {
          console.log("User is not active staff");
          await supabase.auth.signOut();
          return null;
        }

        // Create/update staff session
        const staffSession: StaffSession = {
          staffId: staffData.id,
          staffName: staffData.name,
          staffEmail: staffData.email,
          staffRole: staffData.role,
          loggedIn: true,
          loginTime: new Date().toISOString(),
        };

        return staffSession;
      } catch (err) {
        console.error("Session validation error:", err);
        return null;
      }
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
      const cachedSession = localStorage.getItem("staffSession");
      if (cachedSession) {
        try {
          const parsed = JSON.parse(cachedSession) as StaffSession;
          setSession(parsed);
        } catch {
          localStorage.removeItem("staffSession");
        }
      }

      // Then validate against Supabase
      const validSession = await validateSession();

      if (validSession) {
        localStorage.setItem("staffSession", JSON.stringify(validSession));
        setSession(validSession);
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
        // Re-validate session on token refresh
        const validSession = await validateSession();
        if (validSession) {
          localStorage.setItem("staffSession", JSON.stringify(validSession));
          setSession(validSession);
        }
      } else if (event === "USER_UPDATED" && authSession) {
        // Re-validate if user was updated
        const validSession = await validateSession();
        if (validSession) {
          localStorage.setItem("staffSession", JSON.stringify(validSession));
          setSession(validSession);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate, validateSession]);

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
