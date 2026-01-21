import React, { createContext, useContext, ReactNode } from "react";
import { useAdminAuth, StaffSession } from "../hooks/useAdminAuth";

interface AdminAuthContextType {
  session: StaffSession | null;
  loading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(
  undefined,
);

interface AdminAuthProviderProps {
  children: ReactNode;
}

export function AdminAuthProvider({ children }: AdminAuthProviderProps) {
  const { session, loading, error, signOut, refreshSession } = useAdminAuth();

  const value: AdminAuthContextType = {
    session,
    loading,
    error,
    signOut,
    refreshSession,
    isAuthenticated: !!session,
    isAdmin:
      session?.staffRole === "admin" || session?.staffRole === "super_admin",
    isSuperAdmin: session?.staffRole === "super_admin",
  };

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuthContext(): AdminAuthContextType {
  const context = useContext(AdminAuthContext);
  if (context === undefined) {
    throw new Error(
      "useAdminAuthContext must be used within an AdminAuthProvider",
    );
  }
  return context;
}

// Export useAdminAuth as well for backward compatibility
export { useAdminAuth } from "../hooks/useAdminAuth";
