import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export interface Language {
  id: string;
  code: string;
  name: string;
  native_name: string;
}

export interface IntendedUse {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

export function useDropdownOptions() {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [intendedUses, setIntendedUses] = useState<IntendedUse[]>([]);
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

        // Fetch languages
        const { data: langData, error: langError } = await supabase
          .from("languages")
          .select("id, code, name, native_name")
          .eq("is_active", true)
          .order("sort_order");

        if (langError) {
          console.error("Error fetching languages:", langError);
          setError("Failed to load languages");
        }

        // Fetch intended uses
        const { data: useData, error: useError } = await supabase
          .from("intended_uses")
          .select("id, code, name, description")
          .eq("is_active", true)
          .order("sort_order");

        if (useError) {
          console.error("Error fetching intended uses:", useError);
          setError("Failed to load intended uses");
        }

        setLanguages(langData || []);
        setIntendedUses(useData || []);
      } catch (err) {
        console.error("Error fetching dropdown options:", err);
        setError("Failed to load options");
      } finally {
        setLoading(false);
      }
    }

    fetchOptions();
  }, []);

  return { languages, intendedUses, loading, error };
}
