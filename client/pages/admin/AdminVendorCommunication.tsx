// AdminVendorCommunication — standalone /admin/vendors/communication page.
// An INBOX of all vendor messages (sent + received, across every vendor),
// auto-refreshing every 2 minutes. Click a row to open that vendor's full
// thread (the shared VendorCommunicationTab). "New message" searches a vendor
// to start a conversation.

import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Search, Loader2, ArrowLeft, MessageSquare, RefreshCw, ArrowRight, Mail, Plus } from "lucide-react";
import VendorCommunicationTab from "./vendor-detail/VendorCommunicationTab";

interface VendorLite {
  id: string;
  full_name: string | null;
  business_name: string | null;
  email: string | null;
  status?: string | null;
}
interface InboxItem {
  kind: "outbound" | "inbound";
  id: string;
  vendorId: string;
  vendorName: string;
  vendorEmail: string | null;
  at: string;
  subject: string | null;
  snippet: string;
  unread: boolean;
}

function fmt(at: string): string {
  try {
    return new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return at;
  }
}

export default function AdminVendorCommunication() {
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<VendorLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [composing, setComposing] = useState(false);
  const [selected, setSelected] = useState<VendorLite | null>(null);

  const loadInbox = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-vendor-communication", { body: { action: "inbox" } });
      if (error) throw new Error(error.message);
      setInbox((((data as { data?: { inbox?: InboxItem[] } })?.data?.inbox) ?? []) as InboxItem[]);
      setLastRefreshed(new Date());
    } catch {
      // Stay quiet on auto-refresh failures; the existing list remains visible.
    } finally {
      setLoadingInbox(false);
    }
  }, []);

  // Load on mount + auto-refresh every 2 minutes.
  useEffect(() => {
    loadInbox();
    const t = setInterval(loadInbox, 120000);
    return () => clearInterval(t);
  }, [loadInbox]);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
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
    setSearching(false);
  }, []);

  const openThread = (v: VendorLite) => {
    setSelected(v);
    setComposing(false);
  };

  if (selected) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <button
          onClick={() => { setSelected(null); loadInbox(); }}
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" /> Back to inbox
        </button>
        <div className="border border-gray-200 rounded-lg p-5 bg-white">
          <VendorCommunicationTab
            vendorId={selected.id}
            vendorName={selected.business_name || selected.full_name}
            vendorEmail={selected.email}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-cyan-600" />
          <h1 className="text-xl font-semibold text-gray-900">Vendor Communication</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {lastRefreshed ? `Updated ${lastRefreshed.toLocaleTimeString()}` : ""} · auto every 2 min
          </span>
          <button
            onClick={loadInbox}
            className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 border border-gray-200 rounded-md px-2.5 py-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            onClick={() => setComposing((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs text-white bg-cyan-600 hover:bg-cyan-700 rounded-md px-3 py-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> New message
          </button>
        </div>
      </div>

      {composing && (
        <div className="border border-cyan-200 bg-cyan-50/40 rounded-lg p-4 mb-4 space-y-3">
          <p className="text-xs text-gray-600">Search a vendor by name or email to start a conversation:</p>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); doSearch(e.target.value); }}
              placeholder="Search vendors…"
              className="w-full text-sm border border-gray-300 rounded-md pl-9 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          {searching ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-2 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          ) : results.length > 0 ? (
            <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white">
              {results.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => openThread(v)}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">{v.business_name || v.full_name || "(no name)"}</div>
                      <div className="text-xs text-gray-500">{v.email || "(no email)"}</div>
                    </div>
                    {v.status && <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{v.status}</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      {loadingInbox && inbox.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading inbox…
        </div>
      ) : inbox.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No messages yet. Use “New message” to start one.</p>
      ) : (
        <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white">
          {inbox.map((it) => {
            const outbound = it.kind === "outbound";
            return (
              <li key={`${it.kind}-${it.id}`}>
                <button
                  onClick={() => openThread({ id: it.vendorId, full_name: it.vendorName, business_name: null, email: it.vendorEmail })}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 flex items-start gap-3 ${it.unread ? "bg-amber-50/60" : ""}`}
                >
                  <span className={`mt-0.5 inline-flex items-center justify-center h-6 w-6 rounded-full ${outbound ? "bg-cyan-100 text-cyan-700" : "bg-amber-100 text-amber-700"}`}>
                    {outbound ? <ArrowRight className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">{it.vendorName}</span>
                      {it.unread && <span className="h-2 w-2 rounded-full bg-amber-500" />}
                      <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">{fmt(it.at)}</span>
                    </div>
                    <div className="text-xs text-gray-700 truncate">{outbound ? "→ " : "← "}{it.subject || "(no subject)"}</div>
                    {it.snippet && <div className="text-xs text-gray-400 truncate">{it.snippet}</div>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
