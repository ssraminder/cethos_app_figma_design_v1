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
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user?.email) {
        const staff = await fetchStaffUser(session.user.email);
        setStaffUser(staff);
      }

      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth state changed:", event);
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user?.email) {
        const staff = await fetchStaffUser(session.user.email);
        setStaffUser(staff);
      } else {
        setStaffUser(null);
      }

      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string) => {
    if (!supabase) {
      return { error: new Error("Supabase not configured") };
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/admin/hitl`,
      },
    });

    return { error: error ? new Error(error.message) : null };
  };

  const signOut = async () => {
    if (!supabase) return;

    await supabase.auth.signOut();
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
