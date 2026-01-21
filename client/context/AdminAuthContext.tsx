import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// 8 hours in milliseconds
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

interface StaffSession {
  email: string;
  staffId: string;
  staffName: string;
  staffRole: string;
  loggedIn: boolean;
  loginTime: string;
}

interface AdminAuthContextType {
  session: StaffSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => void;
  refreshSession: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider');
  }
  return context;
};

interface AdminAuthProviderProps {
  children: ReactNode;
}

export const AdminAuthProvider: React.FC<AdminAuthProviderProps> = ({ children }) => {
  const [session, setSession] = useState<StaffSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const checkSession = () => {
    try {
      const stored = localStorage.getItem('staffSession');
      if (!stored) {
        setSession(null);
        setIsLoading(false);
        return false;
      }

      const parsed: StaffSession = JSON.parse(stored);
      
      // Check if session has required fields
      if (!parsed.staffId || !parsed.loginTime) {
        console.log('Invalid session: missing required fields');
        localStorage.removeItem('staffSession');
        setSession(null);
        setIsLoading(false);
        return false;
      }

      // Check if session has expired (8 hours)
      const loginTime = new Date(parsed.loginTime).getTime();
      const now = Date.now();
      const isExpired = (now - loginTime) > SESSION_DURATION_MS;

      if (isExpired) {
        console.log('Session expired after 8 hours');
        localStorage.removeItem('staffSession');
        setSession(null);
        setIsLoading(false);
        return false;
      }

      // Session is valid
      setSession(parsed);
      setIsLoading(false);
      return true;
    } catch (error) {
      console.error('Error checking session:', error);
      localStorage.removeItem('staffSession');
      setSession(null);
      setIsLoading(false);
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('staffSession');
    setSession(null);
    navigate('/admin/login');
  };

  const refreshSession = () => {
    // Update loginTime to extend session
    if (session) {
      const updated = {
        ...session,
        loginTime: new Date().toISOString()
      };
      localStorage.setItem('staffSession', JSON.stringify(updated));
      setSession(updated);
    }
  };

  // Check session on mount and route changes
  useEffect(() => {
    const isValid = checkSession();
    
    // Redirect to login if not authenticated and not already on login page
    if (!isValid && !location.pathname.includes('/admin/login')) {
      navigate('/admin/login', { 
        state: { returnTo: location.pathname } 
      });
    }
  }, [location.pathname]);

  // Check session periodically (every 5 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      const isValid = checkSession();
      if (!isValid && !location.pathname.includes('/admin/login')) {
        navigate('/admin/login');
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, []);

  const isAuthenticated = !!session && session.loggedIn;

  return (
    <AdminAuthContext.Provider value={{ 
      session, 
      isAuthenticated, 
      isLoading, 
      logout,
      refreshSession 
    }}>
      {isLoading ? (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      ) : (
        children
      )}
    </AdminAuthContext.Provider>
  );
};
