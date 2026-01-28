import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

interface Customer {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  company_name?: string;
}

interface Session {
  token: string;
  expires_at: string;
}

interface CustomerAuthContextType {
  session: Session | null;
  customer: Customer | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthContextType | undefined>(
  undefined,
);

const SESSION_KEY = "cethos_customer_session";
const CUSTOMER_KEY = "cethos_customer_data";

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  // Load session from localStorage on mount
  useEffect(() => {
    const loadSession = () => {
      try {
        const storedSession = localStorage.getItem(SESSION_KEY);
        const storedCustomer = localStorage.getItem(CUSTOMER_KEY);

        if (storedSession && storedCustomer) {
          const sessionData: Session = JSON.parse(storedSession);
          const customerData: Customer = JSON.parse(storedCustomer);

          // Check if session is expired
          const expiresAt = new Date(sessionData.expires_at);
          if (expiresAt > new Date()) {
            setSession(sessionData);
            setCustomer(customerData);
          } else {
            // Session expired, clear it
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(CUSTOMER_KEY);
          }
        }
      } catch (error) {
        console.error("Failed to load session:", error);
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(CUSTOMER_KEY);
      } finally {
        setLoading(false);
      }
    };

    loadSession();
  }, []);

  // Sign out
  const signOut = async () => {
    try {
      // Clear localStorage
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(CUSTOMER_KEY);

      // Clear state
      setSession(null);
      setCustomer(null);

      // Could also call an Edge Function to invalidate session in DB
      // But for now, just clear client-side
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  return (
    <CustomerAuthContext.Provider
      value={{
        session,
        customer,
        loading,
        signOut,
      }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(CustomerAuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within a CustomerAuthProvider");
  }
  return context;
}

// Helper function to set session (called from Login page)
export function setCustomerSession(session: Session, customer: Customer) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));

  // Trigger a storage event to update other tabs/windows
  window.dispatchEvent(new Event("storage"));
}

// Helper function to get session token for API calls
export function getSessionToken(): string | null {
  try {
    const storedSession = localStorage.getItem(SESSION_KEY);
    if (storedSession) {
      const session: Session = JSON.parse(storedSession);
      // Check if expired
      const expiresAt = new Date(session.expires_at);
      if (expiresAt > new Date()) {
        return session.token;
      }
    }
  } catch (error) {
    console.error("Failed to get session token:", error);
  }
  return null;
}
