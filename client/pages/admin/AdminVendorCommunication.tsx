// AdminVendorCommunication — standalone /admin/vendors/communication page.
// Pick a vendor, then send/read email from vm@cethos.com via the shared
// VendorCommunicationTab component (same one used on the vendor profile).

import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Search, Loader2, ArrowLeft, MessageSquare } from "lucide-react";
import VendorCommunicationTab from "./vendor-detail/VendorCommunicationTab";

interface VendorLite {
  id: string;
  full_name: string | null;
  business_name: string | null;
  email: string | null;
  status: string | null;
}

export default function AdminVendorCommunication() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<VendorLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<VendorLite | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    const term = q.replace(/[%,]/g, " ").trim();
    const { data } = await supabase
      .from("vendors")
      .select("id, full_name, business_name, email, status")
      .or(`full_name.ilike.%${term}%,business_name.ilike.%${term}%,email.ilike.%${term}%`)
      .order("full_name")
      .limit(25);
    setResults((data as VendorLite[]) ?? []);
    setSearched(true);
    setSearching(false);
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-6">
        <MessageSquare className="h-5 w-5 text-cyan-600" />
        <h1 className="text-xl font-semibold text-gray-900">Vendor Communication</h1>
      </div>

      {selected ? (
        <div className="space-y-4">
          <button
            onClick={() => setSelected(null)}
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" /> Choose a different vendor
          </button>
          <div className="border border-gray-200 rounded-lg p-5 bg-white">
            <VendorCommunicationTab
              vendorId={selected.id}
              vendorName={selected.business_name || selected.full_name}
              vendorEmail={selected.email}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Search for a vendor by name or email to start or continue a conversation. Emails send from
            <span className="font-mono"> vm@cethos.com</span>; replies are captured automatically.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                doSearch(e.target.value);
              }}
              placeholder="Search vendors by name or email…"
              className="w-full text-sm border border-gray-300 rounded-md pl-9 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          {searching ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-4 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          ) : results.length > 0 ? (
            <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white">
              {results.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => setSelected(v)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">{v.business_name || v.full_name || "(no name)"}</div>
                      <div className="text-xs text-gray-500">{v.email || "(no email)"}</div>
                    </div>
                    {v.status && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{v.status}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : searched ? (
            <p className="text-sm text-gray-400 py-4 text-center">No vendors match that search.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
