import { useState, useEffect, useRef } from "react";
import type { PaymentMethod } from "@/types/payments";

const EDGE_URL = "https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/manage-customer-payments";

let cachedMethods: PaymentMethod[] | null = null;

export function usePaymentMethods() {
  const [methods, setMethods] = useState<PaymentMethod[]>(cachedMethods || []);
  const [loading, setLoading] = useState(!cachedMethods);
  const fetched = useRef(false);

  useEffect(() => {
    if (cachedMethods || fetched.current) return;
    fetched.current = true;

    const fetchMethods = async () => {
      try {
        const token =
          localStorage.getItem("sb-access-token") ||
          import.meta.env.VITE_SUPABASE_ANON_KEY;
        const res = await fetch(EDGE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: "list_payment_methods" }),
        });
        const data = await res.json();
        if (data.methods) {
          cachedMethods = data.methods;
          setMethods(data.methods);
        }
      } catch (err) {
        console.error("Failed to load payment methods:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMethods();
  }, []);

  /** Offline / manual methods only (excludes Stripe, Online Payment, etc.) */
  const manualMethods = methods.filter((m) => !m.is_online);

  return { methods, manualMethods, loading };
}
