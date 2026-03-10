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
    async function fetchOptions() {
      setLoading(true);
      setError(null);

      try {
        // Only fetch if Supabase is available
        if (!supabase) {
          setLoading(false);
          return;
        }

        // Fetch all data in parallel
        const [
          sourceLangResult,
          targetLangResult,
          usesResult,
          countriesResult,
          certTypesResult,
        ] = await Promise.all([
          // Fetch source languages
          supabase
            .from("languages")
            .select("id, code, name, native_name, tier, multiplier")
            .eq("is_active", true)
            .eq("is_source_available", true)
            .order("sort_order"),

          // Fetch target languages
          supabase
            .from("languages")
            .select("id, code, name, native_name, tier, multiplier")
            .eq("is_active", true)
            .eq("is_target_available", true)
            .order("sort_order"),

          // Fetch intended uses
          supabase
            .from("intended_uses")
            .select(
              "id, code, name, description, subcategory, default_certification_type_id",
            )
            .eq("is_active", true)
            .order("name", { ascending: true }),

          // Fetch countries
          supabase
            .from("countries")
            .select("id, code, name, is_common")
            .eq("is_active", true)
            .order("sort_order"),

          // Fetch certification types
          supabase
            .from("certification_types")
            .select("id, code, name, price")
            .eq("is_active", true)
            .order("sort_order"),
        ]);

        const results = [
          { name: "source languages", result: sourceLangResult },
          { name: "target languages", result: targetLangResult },
          { name: "intended uses", result: usesResult },
          { name: "countries", result: countriesResult },
          { name: "certification types", result: certTypesResult },
        ];

        for (const { name, result } of results) {
          if (result.error) {
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

        setSourceLanguages(sourceLangResult.data || []);
        setTargetLanguages(targetLangResult.data || []);
        setIntendedUses(usesResult.data || []);
        setCountries(countriesResult.data || []);
        setCertificationTypes(certTypesResult.data || []);
      } catch (err) {
        console.error("Error fetching dropdown options:", err);
        setError("Failed to load options");
      } finally {
        setLoading(false);
      }
    }

    fetchOptions();
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
