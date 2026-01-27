import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface StaffUser {
  id: string;
  email: string;
  full_name: string;
  role: "reviewer" | "senior_reviewer" | "admin" | "super_admin";
  is_active: boolean;
}

interface StaffAuthContextType {
  user: User | null;
  staffUser: StaffUser | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  isStaff: boolean;
}

const StaffAuthContext = createContext<StaffAuthContextType | undefined>(
  undefined,
);

export function StaffAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [staffUser, setStaffUser] = useState<StaffUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch staff user data from staff_users table
  const fetchStaffUser = async (userEmail: string) => {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("staff_users")
      .select("id, email, full_name, role, is_active")
      .eq("email", userEmail)
      .eq("is_active", true)
      .single();

    if (error || !data) {
      console.error("Staff user fetch error:", error);
      return null;
    }

    return data as StaffUser;
  };

  useEffect(() => {
    let isMounted = true;
    const checkAuth = async () => {
      console.log("StaffAuthContext: Checking auth...");

      // First, check localStorage
      const storedSession = localStorage.getItem("staffSession");
      if (storedSession) {
        try {
          const parsed = JSON.parse(storedSession);
          if (parsed.staffId && parsed.loggedIn) {
            console.log("StaffAuthContext: Found valid localStorage session");
            setStaffUser({
              id: parsed.staffId,
              email: parsed.staffEmail,
              full_name: parsed.staffName,
              role: parsed.staffRole,
              is_active: parsed.isActive,
            });

            // Also get the Supabase session for completeness
            const {
              data: { session },
            } = await supabase.auth.getSession();
            if (!isMounted) return;
            setSession(session);
            setUser(session?.user ?? null);

            setLoading(false);
            return;
          }
        } catch (e: any) {
          if (e?.name === "AbortError") {
            return;
          }
          console.error("StaffAuthContext: Error parsing localStorage", e);
          localStorage.removeItem("staffSession");
        }
      }

      // No localStorage session - check Supabase auth
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!isMounted) return;
      if (!session) {
        console.log("StaffAuthContext: No session found");
        setStaffUser(null);
        setUser(null);
        setSession(null);
        setLoading(false);
        return;
      }

      setSession(session);
      setUser(session.user);

      // Has Supabase session but no localStorage - rebuild from database
      console.log("StaffAuthContext: Rebuilding session from Supabase");
      const { data: staffData, error } = await supabase
        .from("staff_users")
        .select("id, email, full_name, role, is_active")
        .eq("email", session.user.email)
        .eq("is_active", true)
        .single();

      if (!isMounted) return;
      if (error || !staffData) {
        console.error("StaffAuthContext: Staff lookup failed", error);
        setStaffUser(null);
        setLoading(false);
        return;
      }

      // Save to localStorage and state
      const sessionData = {
        staffId: staffData.id,
        staffName: staffData.full_name,
        staffEmail: staffData.email,
        staffRole: staffData.role,
        isActive: staffData.is_active,
        loggedIn: true,
        loginTime: new Date().toISOString(),
      };
      localStorage.setItem("staffSession", JSON.stringify(sessionData));

      setStaffUser(staffData);
      setLoading(false);
    };

    checkAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("StaffAuthContext: Auth state changed:", event);

      if (event === "SIGNED_OUT") {
        localStorage.removeItem("staffSession");
        setStaffUser(null);
        setUser(null);
        setSession(null);
      } else if (event === "SIGNED_IN" && session) {
        // Don't set session/user here - let the login handler complete
        // the full sequence (auth -> staff verification -> localStorage -> navigate)
        // Only check if localStorage already has the session (from login handler)
        const storedSession = localStorage.getItem("staffSession");
        if (storedSession) {
          try {
            const parsed = JSON.parse(storedSession);
            if (parsed.staffId && parsed.loggedIn) {
              if (!isMounted) return;

              setSession(session);
              setUser(session.user);
              setStaffUser({
                id: parsed.staffId,
                email: parsed.staffEmail,
                full_name: parsed.staffName,
                role: parsed.staffRole,
                is_active: parsed.isActive,
              });
              return;
            }
          } catch (e) {
            console.error("Error parsing localStorage", e);
          }
        }

        // If no localStorage session, this is a fresh SIGNED_IN event
        // Don't do anything - let the login handler complete the flow
        console.log("StaffAuthContext: SIGNED_IN event received, waiting for login handler to complete...");
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string) => {
    if (!supabase) {
      return { error: new Error("Supabase not configured") };
    }

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/admin/hitl`,
        },
      });

      return { error: error ? new Error(error.message) : null };
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return { error: null };
      }
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  };

  const signOut = async () => {
    if (!supabase) return;

    await supabase.auth.signOut();
    localStorage.removeItem("staffSession");
    setUser(null);
    setStaffUser(null);
    setSession(null);
  };

  const value = {
    user,
    staffUser,
    session,
    loading,
    signIn,
    signOut,
    isStaff: !!staffUser,
  };

  return (
    <StaffAuthContext.Provider value={value}>
      {children}
    </StaffAuthContext.Provider>
  );
}

export function useStaffAuth() {
  const context = useContext(StaffAuthContext);
  if (context === undefined) {
    throw new Error("useStaffAuth must be used within a StaffAuthProvider");
  }
  return context;
}
