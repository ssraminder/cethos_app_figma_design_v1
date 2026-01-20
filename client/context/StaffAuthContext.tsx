// client/context/StaffAuthContext.tsx
// React context for managing staff authentication state

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient, User, Session } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || ''
);

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
  supabase: typeof supabase;
}

const StaffAuthContext = createContext<StaffAuthContextType | undefined>(undefined);

export function StaffAuthProvider({ children }: { children: ReactNode }) {
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
        fetchStaffProfile(session.user.id);
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
          await fetchStaffProfile(session.user.id);
        } else {
          setStaff(null);
          setIsLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const fetchStaffProfile = async (authUserId: string) => {
    try {
      const { data: staffUser, error } = await supabase
        .from('staff_users')
        .select('*')
        .eq('auth_user_id', authUserId)
        .eq('is_active', true)
        .single();

      if (error || !staffUser) {
        console.log('User is not a staff member');
        setStaff(null);
      } else {
        setStaff({
          id: staffUser.id,
          email: staffUser.email,
          fullName: staffUser.full_name,
          role: staffUser.role,
          permissions: staffUser.permissions || {},
          avatarUrl: staffUser.avatar_url,
          timezone: staffUser.timezone,
          notificationPreferences: staffUser.notification_preferences || {},
        });

        // Update last login
        await supabase
          .from('staff_users')
          .update({ last_login_at: new Date().toISOString() })
          .eq('id', staffUser.id);
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
          emailRedirectTo: `${window.location.origin}/admin/hitl`,
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
        supabase,
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

export { supabase };
