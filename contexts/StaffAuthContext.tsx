// contexts/StaffAuthContext.tsx
// React context for managing staff authentication state

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { User, Session } from '@supabase/supabase-js';

interface StaffUser {
  id: string;
  email: string;
  fullName: string;
  role: 'reviewer' | 'senior_reviewer' | 'admin' | 'super_admin';
  permissions: Record<string, any>;
  avatarUrl?: string;
  timezone: string;
  notificationPreferences: Record<string, any>;
}

interface StaffAuthContextType {
  user: User | null;
  session: Session | null;
  staff: StaffUser | null;
  isLoading: boolean;
  isStaff: boolean;
  signIn: (email: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: string) => boolean;
  hasPermission: (permission: string) => boolean;
}

const StaffAuthContext = createContext<StaffAuthContextType | undefined>(undefined);

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const supabase = createClientComponentClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session) {
        fetchStaffProfile(session.access_token);
      } else {
        setIsLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session) {
          await fetchStaffProfile(session.access_token);
        } else {
          setStaff(null);
          setIsLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const fetchStaffProfile = async (accessToken: string) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/staff-auth`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (data.isStaff) {
        setStaff(data.staff);
      } else {
        setStaff(null);
      }
    } catch (error) {
      console.error('Failed to fetch staff profile:', error);
      setStaff(null);
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = async (email: string) => {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/admin/auth/callback`,
        },
      });
      return { error };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setStaff(null);
  };

  const roleHierarchy = ['reviewer', 'senior_reviewer', 'admin', 'super_admin'];
  
  const hasRole = (requiredRole: string): boolean => {
    if (!staff) return false;
    const requiredIndex = roleHierarchy.indexOf(requiredRole);
    const userIndex = roleHierarchy.indexOf(staff.role);
    return userIndex >= requiredIndex;
  };

  const hasPermission = (permission: string): boolean => {
    if (!staff) return false;
    // Super admins have all permissions
    if (staff.role === 'super_admin') return true;
    return staff.permissions?.[permission] === true;
  };

  return (
    <StaffAuthContext.Provider
      value={{
        user,
        session,
        staff,
        isLoading,
        isStaff: !!staff,
        signIn,
        signOut,
        hasRole,
        hasPermission,
      }}
    >
      {children}
    </StaffAuthContext.Provider>
  );
}

export function useStaffAuth() {
  const context = useContext(StaffAuthContext);
  if (context === undefined) {
    throw new Error('useStaffAuth must be used within a StaffAuthProvider');
  }
  return context;
}

// Higher-order component for protecting pages
export function withStaffAuth<P extends object>(
  Component: React.ComponentType<P>,
  requiredRole?: string
) {
  return function ProtectedComponent(props: P) {
    const { staff, isLoading, hasRole } = useStaffAuth();

    if (isLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      );
    }

    if (!staff) {
      if (typeof window !== 'undefined') {
        window.location.href = '/admin/login';
      }
      return null;
    }

    if (requiredRole && !hasRole(requiredRole)) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">Access Denied</h1>
            <p className="text-gray-600 mt-2">
              You don't have permission to access this page.
            </p>
          </div>
        </div>
      );
    }

    return <Component {...props} />;
  };
}
