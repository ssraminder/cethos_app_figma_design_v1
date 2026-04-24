import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { RefreshCw } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { VendorPageData, Currency, Service } from "./vendor-detail/types";
import VendorDetailHeader from "./vendor-detail/VendorDetailHeader";
import VendorProfileTab from "./vendor-detail/VendorProfileTab";
import VendorLanguagesTab from "./vendor-detail/VendorLanguagesTab";
import VendorDomainsTab from "./vendor-detail/VendorDomainsTab";
import VendorRatesTab from "./vendor-detail/VendorRatesTab";
import VendorPaymentTab from "./vendor-detail/VendorPaymentTab";
import VendorAuthTab from "./vendor-detail/VendorAuthTab";
import VendorJobsTab from "./vendor-detail/VendorJobsTab";

const TAB_KEYS = [
  "profile",
  "languages",
  "domains",
  "rates",
  "payment",
  "auth",
  "jobs",
] as const;

type TabKey = (typeof TAB_KEYS)[number];

const TAB_LABELS: Record<TabKey, string> = {
  profile: "Profile",
  languages: "Languages",
  domains: "Domains",
  rates: "Rates",
  payment: "Payment",
  auth: "Auth / Invitation",
  jobs: "Jobs",
};

export default function AdminVendorDetail() {
  const { vendorId } = useParams<{ vendorId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as TabKey) || "profile";

  const [vendorData, setVendorData] = useState<VendorPageData | null>(null);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVendorData = useCallback(async () => {
    if (!vendorId) return;

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/get-vendor-detail?vendor_id=${vendorId}`,
        {
          headers: {
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey,
          },
        }
      );

      const result = await response.json();

      if (!result.success) {
        setError(result.error || "Failed to load vendor data");
        return;
      }

      const d = result.data;
      setVendorData({
        vendor: d.vendor,
        languagePairs: d.language_pairs ?? [],
        rates: d.rates ?? [],
        paymentInfo: d.payment_info ?? null,
        auth: d.auth ?? null,
        activeSessions: d.active_sessions ?? 0,
        activeJobs: d.active_jobs ?? [],
        summary: d.summary ?? {
          language_pairs_active: 0,
          language_pairs_total: 0,
          rates_active: 0,
          rates_total: 0,
          has_payment_info: false,
          has_portal_access: false,
          active_job_count: 0,
        },
      });
      setError(null);
    } catch (err) {
      console.error("Failed to fetch vendor data:", err);
      setError("Failed to load vendor data");
    }
  }, [vendorId]);

  const fetchReferenceData = useCallback(async () => {
    const [currRes, svcRes] = await Promise.all([
      supabase
        .from("currencies")
        .select("code, name, symbol")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("services")
        .select("id, code, name, category, default_calculation_units, sort_order")
        .eq("is_active", true)
        .order("category")
        .order("sort_order"),
    ]);

    if (currRes.data) setCurrencies(currRes.data as Currency[]);
    if (svcRes.data) setServices(svcRes.data as Service[]);
  }, []);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([fetchVendorData(), fetchReferenceData()]);
      setLoading(false);
    };
    loadAll();
  }, [fetchVendorData, fetchReferenceData]);

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab });
  };

  const refreshVendorData = useCallback(async () => {
    await fetchVendorData();
  }, [fetchVendorData]);

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f6f9fc] p-6 flex items-center justify-center">
        <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  // Error / not found
  if (error || !vendorData) {
    return (
      <div className="min-h-screen bg-[#f6f9fc] p-6">
        <p className="text-gray-500">{error || "Vendor not found."}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f9fc] p-6">
      <VendorDetailHeader
        vendorData={vendorData}
        onRefresh={refreshVendorData}
      />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="w-full justify-start bg-white border border-gray-200 rounded-lg p-1 mb-6 flex-wrap h-auto gap-1">
          {TAB_KEYS.map((key) => (
            <TabsTrigger
              key={key}
              value={key}
              className="px-4 py-2 text-sm data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700 data-[state=active]:shadow-none rounded-md"
            >
              {TAB_LABELS[key]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="profile">
          <VendorProfileTab
            vendorData={vendorData}
            currencies={currencies}
            onRefresh={refreshVendorData}
          />
        </TabsContent>

        <TabsContent value="languages">
          <VendorLanguagesTab
            vendorData={vendorData}
            onRefresh={refreshVendorData}
          />
        </TabsContent>

        <TabsContent value="domains">
          <VendorDomainsTab
            vendorData={vendorData}
            onRefresh={refreshVendorData}
          />
        </TabsContent>

        <TabsContent value="rates">
          <VendorRatesTab
            vendorData={vendorData}
            currencies={currencies}
            services={services}
            onRefresh={refreshVendorData}
          />
        </TabsContent>

        <TabsContent value="payment">
          <VendorPaymentTab
            vendorData={vendorData}
            currencies={currencies}
            onRefresh={refreshVendorData}
          />
        </TabsContent>

        <TabsContent value="auth">
          <VendorAuthTab
            vendorData={vendorData}
            onRefresh={refreshVendorData}
          />
        </TabsContent>

        <TabsContent value="jobs">
          <VendorJobsTab
            vendorData={vendorData}
            onRefresh={refreshVendorData}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
