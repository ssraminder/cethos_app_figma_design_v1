import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { setSentryUser } from "../lib/sentry";

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

interface Impersonator {
  staff_id: string;
  staff_name: string;
  staff_email?: string;
}

interface CustomerAuthContextType {
  session: Session | null;
  customer: Customer | null;
  loading: boolean;
  isImpersonation: boolean;
  impersonator: Impersonator | null;
  signOut: () => Promise<void>;
  endImpersonation: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthContextType | undefined>(
  undefined,
);

const SESSION_KEY = "cethos_customer_session";
const CUSTOMER_KEY = "cethos_customer_data";
const IMPERSONATION_KEY = "cethos_customer_impersonation";

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [impersonator, setImpersonator] = useState<Impersonator | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount: if ?impersonate_token=… is present in the URL, resolve it
  // via customer-resolve-impersonation, store the resulting session in
  // localStorage like a normal login, and strip the param from the URL.
  // Otherwise fall back to the existing localStorage flow.
  useEffect(() => {
    const init = async () => {
      try {
        const url = new URL(window.location.href);
        const impToken = url.searchParams.get("impersonate_token");

        if (impToken) {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
          const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
          const res = await fetch(
            `${supabaseUrl}/functions/v1/customer-resolve-impersonation`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${anonKey}`,
                apikey: anonKey,
              },
              body: JSON.stringify({ token: impToken }),
            },
          );
          const data = await res.json();
          if (res.ok && data?.session && data?.customer) {
            localStorage.setItem(SESSION_KEY, JSON.stringify(data.session));
            localStorage.setItem(CUSTOMER_KEY, JSON.stringify(data.customer));
            localStorage.setItem(
              IMPERSONATION_KEY,
              JSON.stringify(data.impersonator ?? { staff_id: "?", staff_name: "Staff" }),
            );
            setSession(data.session);
            setCustomer(data.customer);
            setImpersonator(data.impersonator ?? null);
            // Strip the token from the URL so it doesn't get copy-pasted.
            url.searchParams.delete("impersonate_token");
            window.history.replaceState({}, "", url.pathname + url.search + url.hash);
            return;
          }
          console.warn("Impersonation token rejected:", data?.error);
        }

        const storedSession = localStorage.getItem(SESSION_KEY);
        const storedCustomer = localStorage.getItem(CUSTOMER_KEY);
        const storedImp = localStorage.getItem(IMPERSONATION_KEY);

        if (storedSession && storedCustomer) {
          const sessionData: Session = JSON.parse(storedSession);
          const customerData: Customer = JSON.parse(storedCustomer);

          if (new Date(sessionData.expires_at) > new Date()) {
            setSession(sessionData);
            setCustomer(customerData);
            if (storedImp) setImpersonator(JSON.parse(storedImp));
          } else {
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(CUSTOMER_KEY);
            localStorage.removeItem(IMPERSONATION_KEY);
          }
        }
      } catch (error) {
        console.error("Failed to load session:", error);
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(CUSTOMER_KEY);
        localStorage.removeItem(IMPERSONATION_KEY);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  useEffect(() => {
    if (customer) {
      setSentryUser({
        id: customer.id,
        email: customer.email,
        role: impersonator ? "customer-impersonated" : "customer",
      });
    } else {
      setSentryUser(null);
    }
  }, [customer, impersonator]);

  const signOut = async () => {
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(CUSTOMER_KEY);
      localStorage.removeItem(IMPERSONATION_KEY);
      setSession(null);
      setCustomer(null);
      setImpersonator(null);
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  // Cooperative end of impersonation — calls admin-impersonate-customer
  // with action=end so the DB row is removed, then clears local state.
  // Staff JWT isn't available here (we're inside the customer portal),
  // so the edge function won't accept the end call; we send it anyway in
  // case the staff cookie is shared, otherwise we just fall through and
  // clear locally. The server row will also expire on its own (30 min).
  const endImpersonation = async () => {
    try {
      const tok = session?.token;
      if (tok) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
        await fetch(`${supabaseUrl}/functions/v1/admin-impersonate-customer`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey,
          },
          body: JSON.stringify({ action: "end", token: tok }),
        }).catch(() => {
          /* server-side row will TTL out — local clear is what matters */
        });
      }
    } finally {
      await signOut();
    }
  };

  return (
    <CustomerAuthContext.Provider
      value={{
        session,
        customer,
        loading,
        isImpersonation: !!impersonator,
        impersonator,
        signOut,
        endImpersonation,
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

export function setCustomerSession(session: Session, customer: Customer) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
  window.dispatchEvent(new Event("storage"));
}

export function getSessionToken(): string | null {
  try {
    const storedSession = localStorage.getItem(SESSION_KEY);
    if (storedSession) {
      const session: Session = JSON.parse(storedSession);
      if (new Date(session.expires_at) > new Date()) return session.token;
    }
  } catch (error) {
    console.error("Failed to get session token:", error);
  }
  return null;
}
