import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export interface Language {
  id: string;
  code: string;
  name: string;
  native_name: string;
  tier: number;
  multiplier: number;
}

export interface IntendedUse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  subcategory: string | null;
  default_certification_type_id: string | null;
}

export interface Country {
  id: string;
  code: string;
  name: string;
  is_common: boolean;
}

export interface CertificationType {
  id: string;
  code: string;
  name: string;
  price: number;
}

export function useDropdownOptions() {
  const [sourceLanguages, setSourceLanguages] = useState<Language[]>([]);
  const [targetLanguages, setTargetLanguages] = useState<Language[]>([]);
  const [intendedUses, setIntendedUses] = useState<IntendedUse[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [certificationTypes, setCertificationTypes] = useState<
    CertificationType[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Supabase v2 + PKCE flowType throws "AbortError: signal is aborted without
    // reason" when the page transitions from cethos.com → portal.cethos.com:
    // the auth Web Lock contends with the immediate parallel queries below.
    // The data is small and PUBLIC (anon RLS), so a short retry-with-backoff
    // resolves it without changing the auth flow.
    //
    // We also fall back to a direct REST GET (no supabase-js auth wrapper) on
    // the final attempt, so even if the lock is permanently stuck the dropdowns
    // still populate.
    const ABORT_RETRY_MS = [120, 350, 800];

    function isAbort(result: any): boolean {
      const m = result?.error?.message || "";
      return /aborted/i.test(m) || result?.status === 0;
    }

    async function fetchAll() {
      if (!supabase) return null;
      return Promise.all([
        supabase
          .from("languages")
          .select("id, code, name, native_name, tier, multiplier")
          .eq("is_active", true)
          .eq("is_source_available", true)
          .order("sort_order"),
        supabase
          .from("languages")
          .select("id, code, name, native_name, tier, multiplier")
          .eq("is_active", true)
          .eq("is_target_available", true)
          .order("sort_order"),
        supabase
          .from("intended_uses")
          .select(
            "id, code, name, description, subcategory, default_certification_type_id",
          )
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("countries")
          .select("id, code, name, is_common")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("certification_types")
          .select("id, code, name, price")
          .eq("is_active", true)
          .order("sort_order"),
      ]);
    }

    async function fetchAllViaRest(): Promise<any[] | null> {
      const url = (import.meta as any).env?.VITE_SUPABASE_URL || "";
      const anon = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || "";
      if (!url || !anon) return null;
      const headers = { apikey: anon, Authorization: `Bearer ${anon}` };
      const get = async (path: string) => {
        const r = await fetch(`${url}/rest/v1/${path}`, { headers });
        if (!r.ok) throw new Error(`REST ${path} ${r.status}`);
        const data = await r.json();
        return { data, error: null };
      };
      try {
        return await Promise.all([
          get(
            "languages?select=id,code,name,native_name,tier,multiplier&is_active=eq.true&is_source_available=eq.true&order=sort_order",
          ),
          get(
            "languages?select=id,code,name,native_name,tier,multiplier&is_active=eq.true&is_target_available=eq.true&order=sort_order",
          ),
          get(
            "intended_uses?select=id,code,name,description,subcategory,default_certification_type_id&is_active=eq.true&order=name.asc",
          ),
          get(
            "countries?select=id,code,name,is_common&is_active=eq.true&order=sort_order",
          ),
          get(
            "certification_types?select=id,code,name,price&is_active=eq.true&order=sort_order",
          ),
        ]);
      } catch {
        return null;
      }
    }

    async function fetchOptions() {
      setLoading(true);
      setError(null);

      let results: any[] | null = null;

      try {
        if (!supabase) {
          setLoading(false);
          return;
        }

        for (let attempt = 0; attempt <= ABORT_RETRY_MS.length; attempt++) {
          if (cancelled) return;
          const r = await fetchAll();
          if (cancelled || !r) return;
          // Abort detection — retry on any aborted leg
          if (r.some(isAbort)) {
            if (attempt < ABORT_RETRY_MS.length) {
              await new Promise((res) =>
                setTimeout(res, ABORT_RETRY_MS[attempt]),
              );
              continue;
            }
            // All retries exhausted; final fallback: direct REST
            const restResults = await fetchAllViaRest();
            if (cancelled) return;
            if (restResults) {
              results = restResults;
              break;
            }
            results = r; // surface the original errors
            break;
          }
          results = r;
          break;
        }

        if (!results || cancelled) return;

        const [
          sourceLangResult,
          targetLangResult,
          usesResult,
          countriesResult,
          certTypesResult,
        ] = results;

        const named = [
          { name: "source languages", result: sourceLangResult },
          { name: "target languages", result: targetLangResult },
          { name: "intended uses", result: usesResult },
          { name: "countries", result: countriesResult },
          { name: "certification types", result: certTypesResult },
        ];

        for (const { name, result } of named) {
          if (result?.error) {
            console.error(
              `Error fetching ${name}:`,
              `code=${result.error.code}`,
              `message=${result.error.message}`,
              `details=${result.error.details}`,
              `hint=${result.error.hint}`,
              `status=${result.status}`,
            );
            setError(`Failed to load ${name}`);
          }
        }

        setSourceLanguages(sourceLangResult?.data || []);
        setTargetLanguages(targetLangResult?.data || []);
        setIntendedUses(usesResult?.data || []);
        setCountries(countriesResult?.data || []);
        setCertificationTypes(certTypesResult?.data || []);
      } catch (err) {
        if (!cancelled) {
          console.error("Error fetching dropdown options:", err);
          setError("Failed to load options");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    sourceLanguages,
    targetLanguages,
    intendedUses,
    countries,
    certificationTypes,
    loading,
    error,
  };
}
