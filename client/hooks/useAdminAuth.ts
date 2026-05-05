import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SB_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

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

  // Tracks intentional sign-out so the SIGNED_OUT event handler doesn't
  // double-redirect when the user clicks Sign Out (signOut() already
  // cleans up and navigates in its finally block).
  const signingOutRef = useRef(false);

  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;

  const clearSessionAndRedirect = useCallback(() => {
    localStorage.removeItem("staffSession");
    setSession(null);

    const returnPath = locationRef.current;
    if (
      returnPath !== "/admin/login" &&
      returnPath !== "/admin/reset-password"
    ) {
      sessionStorage.setItem("adminReturnPath", returnPath);
    }

    navigate("/admin/login");
  }, [navigate]);

  // Validates the current session entirely via direct REST — bypasses the
  // Supabase JS client to avoid the AbortError that the client fires when
  // auth state changes (SIGNED_IN / TOKEN_REFRESHED) abort in-flight requests.
  const validateSession =
    useCallback(async (): Promise<StaffSession | null> => {
      try {
        const authRaw = localStorage.getItem("cethos-auth");
        if (!authRaw) return null;

        let authData: any;
        try { authData = JSON.parse(authRaw); } catch { return null; }

        const accessToken: string | undefined = authData?.access_token;
        const userEmail: string | undefined = authData?.user?.email;

        if (!accessToken || !userEmail) return null;

        // Fast-fail on expired JWT (avoid a network round-trip for expired tokens).
        try {
          const payload = JSON.parse(
            atob(accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
          );
          if (payload.exp && Date.now() / 1000 > payload.exp + 30) {
            console.log("validateSession: JWT expired");
            return null;
          }
        } catch {
          // Malformed JWT — let the server decide
        }

        // Verify the user is still active staff via direct REST fetch.
        const res = await fetch(
          `${SB_URL}/rest/v1/staff_users?select=id,full_name,email,role,is_active&email=eq.${encodeURIComponent(userEmail)}&limit=1`,
          { headers: { apikey: SB_ANON, Authorization: `Bearer ${accessToken}` } },
        );

        if (!res.ok) {
          console.error("validateSession: staff lookup HTTP", res.status);
          return null;
        }

        const rows: any[] = await res.json();
        if (!rows.length) {
          console.error("validateSession: no staff record for", userEmail);
          return null;
        }

        const s = rows[0];
        if (!s.is_active) {
          console.log("validateSession: staff account is inactive");
          return null;
        }

        return {
          staffId: s.id,
          staffName: s.full_name,
          staffEmail: s.email,
          staffRole: s.role,
          isActive: s.is_active,
          loggedIn: true,
          loginTime: new Date().toISOString(),
        };
      } catch (err) {
        console.error("validateSession error:", err);
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
    signingOutRef.current = true;
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      signingOutRef.current = false;
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

      // Optimistically populate from cache so the page renders immediately.
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

      const validSession = await validateSession();

      if (validSession) {
        localStorage.setItem("staffSession", JSON.stringify(validSession));
        setSession(validSession);
      } else if (cachedParsed) {
        // validateSession may fail if the token is mid-refresh — keep the
        // cached session; the periodic re-validation will catch genuine expiry.
        console.warn("useAdminAuth: validateSession failed but cached session present, keeping");
      } else {
        clearSessionAndRedirect();
      }

      setLoading(false);
    };

    checkAuth();
  }, [validateSession, clearSessionAndRedirect]);

  // Listen for Supabase auth state changes
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, authSession) => {
      console.log("Auth state changed:", event);

      if (event === "SIGNED_OUT") {
        if (signingOutRef.current) {
          // Intentional sign-out — signOut() already handles cleanup + navigate.
          return;
        }
        // SIGNED_OUT can fire as a false positive when Supabase's auto-refresh
        // fails (AbortError / network failure).  If staffSession still exists
        // the user was active; let validateSession re-check on next page load
        // rather than abruptly kicking them out.
        const staffCached = localStorage.getItem("staffSession");
        if (!staffCached) {
          setSession(null);
          navigate("/admin/login");
        } else {
          console.warn("useAdminAuth: SIGNED_OUT with cached staffSession — likely token refresh failure, keeping session");
        }
      } else if (event === "TOKEN_REFRESHED" && authSession) {
        // Token was successfully refreshed — update staffSession loginTime so
        // the periodic check sees a recent timestamp, but don't re-query
        // staff_users (this event's own arrival can abort in-flight requests).
        const cached = localStorage.getItem("staffSession");
        if (cached) {
          try {
            const parsed: StaffSession = JSON.parse(cached);
            const updated = { ...parsed, loginTime: new Date().toISOString() };
            localStorage.setItem("staffSession", JSON.stringify(updated));
            setSession(updated);
          } catch {}
        } else {
          clearSessionAndRedirect();
        }
      } else if (event === "USER_UPDATED" && authSession) {
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
          if (validSession) {
            localStorage.setItem("staffSession", JSON.stringify(validSession));
            setSession(validSession);
          } else if (!localStorage.getItem("staffSession")) {
            clearSessionAndRedirect();
          }
          // If staffSession still present but validateSession returned null,
          // keep the session — transient network failure shouldn't log users out.
        }
      },
      5 * 60 * 1000,
    );

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
