import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";

const _SB_URL = import.meta.env.VITE_SUPABASE_URL as string;
const _SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function sbGet(path: string, extraHeaders?: Record<string, string>): Promise<Response> {
  let token = _SB_KEY;
  try {
    const s = localStorage.getItem("cethos-auth");
    if (s) token = JSON.parse(s)?.access_token || _SB_KEY;
  } catch {}
  return fetch(`${_SB_URL}/rest/v1/${path}`, {
    headers: { apikey: _SB_KEY, Authorization: `Bearer ${token}`, ...extraHeaders },
  });
}
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import { toast } from "sonner";
import {
  Search,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  Download,
  RefreshCw,
  X,
  Package,
  Truck,
  CheckCircle,
  MoreVertical,
  Eye,
  Settings2,
  Pin,
  PinOff,
  ArrowUp,
  ArrowDown,
  GripVertical,
  MessageSquare,
} from "lucide-react";
import { format } from "date-fns";
import { StatCard } from "@/components/admin/StatCard";
import { DollarSign, Zap, TrendingUp, Hash } from "lucide-react";

interface Order {
  id: string;
  order_number: string;
  status: string;
  work_status: string;
  total_amount: number;
  is_rush: boolean;
  created_at: string;
  estimated_delivery_date: string;
  estimated_delivery_at: string | null;
  customer_email: string;
  customer_name: string;
  customer_company_name: string | null;
  customer_type: string | null;
  service_id: string | null;
  service_code: string | null;
  document_count: number;
  xtrf_invoice_id: number | null;
  xtrf_invoice_number: string | null;
  xtrf_invoice_status: string | null;
  xtrf_invoice_payment_status: string | null;
  xtrf_project_total_agreed: number | null;
  xtrf_project_total_cost: number | null;
  xtrf_project_currency_code: string | null;
  xtrf_project_number: string | null;
  xtrf_project_status: string | null;
  internal_project_number: string | null;
  source_language_name: string | null;
  target_language_name: string | null;
  active_vendor_name: string | null;
  assignment_bucket: string | null;
  pinned_position: number | null;
  staff_note_excerpt: string | null;
  staff_note_author: string | null;
  staff_note_count: number;
}

interface CompanyOption {
  id: string;
  name: string;
}

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "processing", label: "Processing" },
  { value: "draft_review", label: "Draft Review" },
  { value: "completed", label: "Completed" },
  { value: "delivered", label: "Delivered" },
  { value: "invoiced", label: "Invoiced" },
  { value: "refunded", label: "Refunded" },
  { value: "cancelled", label: "Cancelled" },
];

// Must mirror the DB CHECK on orders.work_status:
// ('pending','in_progress','completed','cancelled','on_hold').
const WORK_STATUS_OPTIONS = [
  { value: "", label: "All Work Statuses" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const PAGE_SIZE = 25;

const FILTERS_STORAGE_KEY = "adminOrdersFilters";
const COLUMN_SETTINGS_KEY = "adminOrdersColumnSettings";

// Column keys used for both UI and export visibility
type ColumnKey =
  | "orderDetails"
  | "customer"
  | "languagePair"
  | "vendor"
  | "assignment"
  | "status"
  | "total"
  | "clientTotal"
  | "vendorCost"
  | "profit"
  | "profitPct"
  | "xtrfProject"
  | "xtrfInvoice"
  | "delivery";

interface ColumnDef {
  key: ColumnKey;
  label: string;
  ui: boolean;
  export: boolean;
}

const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: "orderDetails", label: "Order Details", ui: true, export: true },
  { key: "customer", label: "Customer", ui: true, export: true },
  { key: "languagePair", label: "Languages", ui: true, export: true },
  { key: "vendor", label: "Vendor", ui: true, export: true },
  { key: "assignment", label: "Assignment", ui: true, export: true },
  { key: "status", label: "Status", ui: true, export: true },
  { key: "total", label: "Total", ui: true, export: true },
  { key: "clientTotal", label: "Client Total", ui: true, export: true },
  { key: "vendorCost", label: "Vendor Cost", ui: true, export: true },
  { key: "profit", label: "Profit", ui: true, export: true },
  { key: "profitPct", label: "% Profit", ui: true, export: true },
  { key: "xtrfProject", label: "XTRF Project", ui: true, export: true },
  { key: "xtrfInvoice", label: "XTRF Invoice", ui: true, export: true },
  { key: "delivery", label: "Client Deadline", ui: true, export: true },
];

function loadColumnSettings(): ColumnDef[] {
  try {
    const saved = localStorage.getItem(COLUMN_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, { ui: boolean; export: boolean }>;
      return DEFAULT_COLUMNS.map((col) => ({
        ...col,
        ui: parsed[col.key]?.ui ?? col.ui,
        export: parsed[col.key]?.export ?? col.export,
      }));
    }
  } catch { /* ignore */ }
  return DEFAULT_COLUMNS;
}

function saveColumnSettings(columns: ColumnDef[]) {
  try {
    const data: Record<string, { ui: boolean; export: boolean }> = {};
    columns.forEach((c) => { data[c.key] = { ui: c.ui, export: c.export }; });
    localStorage.setItem(COLUMN_SETTINGS_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

export default function AdminOrdersList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [restoredFromSession, setRestoredFromSession] = useState(false);

  // Staff session (needs to be declared before any effect that reads staffId;
  // minified prod builds enforce TDZ and will throw "Cannot access 'F'
  // before initialization" if this lives further down).
  const { session } = useAdminAuthContext();
  const staffId = session?.staffId || null;

  const filterKeys = [
    "search", "status", "work_status", "from", "to", "rush",
    "xtrfStatus", "xtrfInvStatus", "xtrfPayStatus", "po",
    "service", "company",
    "vendor", "srcLang", "tgtLang", "assignment",
  ];

  // Restore filters from sessionStorage on mount if URL has no filter params
  useEffect(() => {
    const hasUrlFilters = filterKeys.some(k => searchParams.has(k));
    if (!hasUrlFilters) {
      try {
        const saved = sessionStorage.getItem(FILTERS_STORAGE_KEY);
        if (saved) {
          const restored = new URLSearchParams(saved);
          // Only restore if there are actual filter values
          if (filterKeys.some(k => restored.has(k))) {
            setSearchParams(restored, { replace: true });
          }
        }
      } catch { /* ignore storage errors */ }
    }
    setRestoredFromSession(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-staff UI preferences — load defaults once, then never overwrite.
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  useEffect(() => {
    if (!staffId || prefsLoaded) return;
    let cancelled = false;
    (async () => {
      const res = await sbGet(`staff_users?select=ui_preferences&id=eq.${staffId}&limit=1`);
      if (cancelled) return;
      setPrefsLoaded(true);
      const rows: any[] = res.ok ? await res.json() : [];
      const saved = (rows[0]?.ui_preferences as any)?.ordersListFilters;
      // Only apply if the URL has no active filter params (i.e. we haven't
      // also restored from sessionStorage or landed here with explicit URL).
      const hasAny = filterKeys.some((k) => searchParams.has(k));
      if (!hasAny && saved && typeof saved === "object") {
        const next = new URLSearchParams();
        for (const [k, v] of Object.entries(saved)) {
          if (v !== null && v !== undefined && v !== "") next.set(k, String(v));
        }
        if ([...next.keys()].length > 0) {
          setSearchParams(next, { replace: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId]);

  const handleSaveFilterDefault = async () => {
    if (!staffId) return;
    setSavingPrefs(true);
    try {
      const snapshot: Record<string, string> = {};
      for (const k of filterKeys) {
        const v = searchParams.get(k);
        if (v) snapshot[k] = v;
      }
      // Read-modify-write so we don't clobber other ui_preferences.
      const { data } = await supabase
        .from("staff_users")
        .select("ui_preferences")
        .eq("id", staffId)
        .maybeSingle();
      const existing = (data?.ui_preferences as any) || {};
      const next = { ...existing, ordersListFilters: snapshot };
      const { error } = await supabase
        .from("staff_users")
        .update({ ui_preferences: next })
        .eq("id", staffId);
      if (error) throw error;
      toast.success("Saved as your default filter");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save filters");
    } finally {
      setSavingPrefs(false);
    }
  };

  const [orders, setOrders] = useState<Order[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  // Drag-and-drop state for the pin/reorder UX. dragOrderId is the row
  // currently being dragged; dropTargetId is the row hovered over so we
  // can highlight it. Native HTML5 DnD on <tr>; no extra dependency.
  const [dragOrderId, setDragOrderId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  // Aggregates across the FILTERED dataset (not just the current page).
  // Computed by a second PostgREST fetch alongside the paginated one so the
  // stat cards reflect "5 rush orders match your filters" rather than "0 rush
  // orders on this 25-row page".
  const [filteredRevenue, setFilteredRevenue] = useState(0);
  const [filteredRushCount, setFilteredRushCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters from URL
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";
  const workStatus = searchParams.get("work_status") || "";
  const dateFrom = searchParams.get("from") || "";
  const dateTo = searchParams.get("to") || "";
  const rushOnly = searchParams.get("rush") === "true";
  const xtrfStatus = searchParams.get("xtrfStatus") || "";
  const poStatus = searchParams.get("poStatus") || "";
  const xtrfInvoiceStatuses = searchParams.get("xtrfInvStatus")?.split(",").filter(Boolean) || [];
  const xtrfPaymentStatuses = searchParams.get("xtrfPayStatus")?.split(",").filter(Boolean) || [];
  const serviceFilter = (searchParams.get("service") || "all") as
    | "all"
    | "certified"
    | "non_certified";
  const companyFilter = searchParams.get("company") || ""; // companies.id
  // #2.2b — active-vendor / language pair / assignment-bucket filters.
  // Vendor + assignment translate to a 2-stage query (order_workflow_steps
  // → orders) since they're computed across steps; language filters use
  // PostgREST embedded-resource filters on the existing quote join.
  const vendorFilter = searchParams.get("vendor") || ""; // vendors.id
  const srcLangFilter = searchParams.get("srcLang") || ""; // languages.id
  const tgtLangFilter = searchParams.get("tgtLang") || ""; // languages.id
  const assignmentFilter = searchParams.get("assignment") || ""; // bucket label
  const page = parseInt(searchParams.get("page") || "1", 10);

  // Certified service UUID (for "certified / non-certified" filtering)
  const [certifiedServiceId, setCertifiedServiceId] = useState<string | null>(null);
  const [certifiedServiceLoaded, setCertifiedServiceLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await sbGet("services?select=id&code=eq.certified_translation&limit=1");
      if (!cancelled) {
        const rows: any[] = res.ok ? await res.json() : [];
        setCertifiedServiceId(rows[0]?.id || null);
        setCertifiedServiceLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Company filter lookup + autocomplete
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companySearch, setCompanySearch] = useState("");
  const [selectedCompanyName, setSelectedCompanyName] = useState<string>("");
  const companyDebounceRef = useRef<number | null>(null);
  useEffect(() => {
    const q = companySearch.trim();
    if (companyDebounceRef.current) window.clearTimeout(companyDebounceRef.current);
    if (q.length < 2) {
      setCompanies([]);
      return;
    }
    companyDebounceRef.current = window.setTimeout(async () => {
      const esc = q.replace(/[*,%()]/g, "").trim();
      const res = await sbGet(`companies?select=id,name&name=ilike.*${esc}*&order=name&limit=10`);
      setCompanies(res.ok ? await res.json() : []);
    }, 200);
    return () => {
      if (companyDebounceRef.current) window.clearTimeout(companyDebounceRef.current);
    };
  }, [companySearch]);

  // Resolve current companyFilter → display name for chip rendering
  useEffect(() => {
    if (!companyFilter) {
      setSelectedCompanyName("");
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await sbGet(`companies?select=id,name&id=eq.${companyFilter}&limit=1`);
      if (!cancelled && res.ok) {
        const rows: any[] = await res.json();
        if (rows[0]) setSelectedCompanyName(rows[0].name);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyFilter]);

  // #2.2b — vendor typeahead (mirrors company autocomplete pattern)
  type VendorOption = { id: string; full_name: string };
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [vendorSearch, setVendorSearch] = useState("");
  const [selectedVendorName, setSelectedVendorName] = useState<string>("");
  const vendorDebounceRef = useRef<number | null>(null);
  useEffect(() => {
    const q = vendorSearch.trim();
    if (vendorDebounceRef.current) window.clearTimeout(vendorDebounceRef.current);
    if (q.length < 2) {
      setVendors([]);
      return;
    }
    vendorDebounceRef.current = window.setTimeout(async () => {
      const esc = q.replace(/[*,%()]/g, "").trim();
      const res = await sbGet(`vendors?select=id,full_name&full_name=ilike.*${esc}*&deleted_at=is.null&order=full_name&limit=10`);
      setVendors(res.ok ? await res.json() : []);
    }, 200);
    return () => {
      if (vendorDebounceRef.current) window.clearTimeout(vendorDebounceRef.current);
    };
  }, [vendorSearch]);
  useEffect(() => {
    if (!vendorFilter) {
      setSelectedVendorName("");
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await sbGet(`vendors?select=id,full_name&id=eq.${vendorFilter}&limit=1`);
      if (!cancelled && res.ok) {
        const rows: any[] = await res.json();
        if (rows[0]) setSelectedVendorName(rows[0].full_name);
      }
    })();
    return () => { cancelled = true; };
  }, [vendorFilter]);

  // #2.2b — languages cache for src/tgt dropdowns
  type LanguageOption = { id: string; name: string; code: string };
  const [languagesList, setLanguagesList] = useState<LanguageOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await sbGet("languages?select=id,name,code&order=name&limit=500");
      if (!cancelled && res.ok) setLanguagesList(await res.json());
    })();
    return () => { cancelled = true; };
  }, []);

  // Persist filters to sessionStorage whenever they change
  useEffect(() => {
    if (!restoredFromSession) return;
    try {
      sessionStorage.setItem(FILTERS_STORAGE_KEY, searchParams.toString());
    } catch { /* ignore storage errors */ }
  }, [searchParams, restoredFromSession]);

  const [searchInput, setSearchInput] = useState(search);
  const [showFilters, setShowFilters] = useState(() => {
    // Auto-open filter panel if there are active filters (from URL or session)
    const filterKeys = ["status", "work_status", "from", "to", "rush", "xtrfStatus", "xtrfInvStatus", "xtrfPayStatus", "vendor", "srcLang", "tgtLang", "assignment"];
    return filterKeys.some(k => searchParams.has(k));
  });

  // Keep searchInput in sync when search param changes (e.g. after session restore)
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  // Auto-expand filter panel when filters become active
  useEffect(() => {
    if (restoredFromSession) {
      const filterKeys = ["status", "work_status", "from", "to", "rush", "xtrfStatus", "xtrfInvStatus", "xtrfPayStatus", "vendor", "srcLang", "tgtLang", "assignment"];
      if (filterKeys.some(k => searchParams.has(k))) {
        setShowFilters(true);
      }
    }
  }, [searchParams, restoredFromSession]);

  // Actions menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Column visibility settings
  const [columnSettings, setColumnSettings] = useState<ColumnDef[]>(loadColumnSettings);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const isColVisible = (key: ColumnKey) => columnSettings.find((c) => c.key === key)?.ui !== false;
  const isColExported = (key: ColumnKey) => columnSettings.find((c) => c.key === key)?.export !== false;
  const toggleColumnSetting = (key: ColumnKey, field: "ui" | "export") => {
    setColumnSettings((prev) => {
      const next = prev.map((c) => c.key === key ? { ...c, [field]: !c[field] } : c);
      saveColumnSettings(next);
      return next;
    });
  };

  // Pin / unpin / reorder handlers. Direct PostgREST UPDATEs via the
  // supabase client — RLS already grants is_active_staff() full access on
  // orders, and no edge function is needed for what is essentially a
  // single-column write. Lower pinned_position = higher in list.
  const handlePinOrder = async (orderId: string) => {
    setOpenMenuId(null);
    try {
      const { data: minRow } = await supabase
        .from("orders")
        .select("pinned_position")
        .not("pinned_position", "is", null)
        .order("pinned_position", { ascending: true })
        .limit(1)
        .maybeSingle();
      const next = (minRow?.pinned_position ?? 1) - 1;
      const { error } = await supabase
        .from("orders")
        .update({ pinned_position: next })
        .eq("id", orderId);
      if (error) throw error;
      toast.success("Order pinned to top");
      fetchOrders();
    } catch (e: any) {
      toast.error(`Failed to pin order: ${e?.message || e}`);
    }
  };

  const handleUnpinOrder = async (orderId: string) => {
    setOpenMenuId(null);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ pinned_position: null })
        .eq("id", orderId);
      if (error) throw error;
      toast.success("Order unpinned");
      fetchOrders();
    } catch (e: any) {
      toast.error(`Failed to unpin order: ${e?.message || e}`);
    }
  };

  // Swap pinned_position with the adjacent pinned row. "Up" = smaller
  // pinned_position. No-op when the row is already at the top/bottom of
  // the pinned section. Two UPDATEs because there's no UNIQUE constraint
  // to deferr around.
  const handleMovePinned = async (orderId: string, direction: "up" | "down") => {
    setOpenMenuId(null);
    const me = orders.find((o) => o.id === orderId);
    if (!me || me.pinned_position == null) return;
    try {
      const q = supabase
        .from("orders")
        .select("id, pinned_position")
        .not("pinned_position", "is", null);
      const { data: neighbor } = direction === "up"
        ? await q
            .lt("pinned_position", me.pinned_position)
            .order("pinned_position", { ascending: false })
            .limit(1)
            .maybeSingle()
        : await q
            .gt("pinned_position", me.pinned_position)
            .order("pinned_position", { ascending: true })
            .limit(1)
            .maybeSingle();
      if (!neighbor) {
        toast.message(direction === "up" ? "Already at top of pinned" : "Already at bottom of pinned");
        return;
      }
      // Two-step swap via a sentinel out-of-range value avoids any temporary
      // collision (defensive — there's no UNIQUE on pinned_position today).
      const SENTINEL = -2_000_000_000;
      const { error: e1 } = await supabase.from("orders").update({ pinned_position: SENTINEL }).eq("id", orderId);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("orders").update({ pinned_position: me.pinned_position }).eq("id", (neighbor as any).id);
      if (e2) throw e2;
      const { error: e3 } = await supabase.from("orders").update({ pinned_position: (neighbor as any).pinned_position }).eq("id", orderId);
      if (e3) throw e3;
      fetchOrders();
    } catch (e: any) {
      toast.error(`Failed to reorder: ${e?.message || e}`);
    }
  };

  // Drop handler: a user dragged sourceId onto targetId. Behaviour:
  //  - both pinned       → swap their pinned_position (two-step via sentinel)
  //  - source unpinned   → pin source above target (target.pp - 1, or top
  //                        of pinned section if target is also unpinned)
  //  - source pinned     → if target unpinned: unpin source (drag-out)
  // Same row → no-op.
  const handleDropOnRow = async (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const source = orders.find((o) => o.id === sourceId);
    const target = orders.find((o) => o.id === targetId);
    if (!source || !target) return;
    try {
      if (source.pinned_position != null && target.pinned_position != null) {
        const SENTINEL = -2_000_000_000;
        const { error: e1 } = await supabase.from("orders").update({ pinned_position: SENTINEL }).eq("id", sourceId);
        if (e1) throw e1;
        const { error: e2 } = await supabase.from("orders").update({ pinned_position: source.pinned_position }).eq("id", targetId);
        if (e2) throw e2;
        const { error: e3 } = await supabase.from("orders").update({ pinned_position: target.pinned_position }).eq("id", sourceId);
        if (e3) throw e3;
      } else if (source.pinned_position == null) {
        // Pin source above target. If target isn't pinned either, pin
        // source to the top (current min - 1 or 0).
        let nextPos: number;
        if (target.pinned_position != null) {
          nextPos = target.pinned_position - 1;
        } else {
          const { data: minRow } = await supabase
            .from("orders")
            .select("pinned_position")
            .not("pinned_position", "is", null)
            .order("pinned_position", { ascending: true })
            .limit(1)
            .maybeSingle();
          nextPos = (minRow?.pinned_position ?? 1) - 1;
        }
        const { error } = await supabase
          .from("orders")
          .update({ pinned_position: nextPos })
          .eq("id", sourceId);
        if (error) throw error;
      } else {
        // source pinned, target unpinned → unpin source.
        const { error } = await supabase
          .from("orders")
          .update({ pinned_position: null })
          .eq("id", sourceId);
        if (error) throw error;
      }
      fetchOrders();
    } catch (e: any) {
      toast.error(`Failed to reorder: ${e?.message || e}`);
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const select =
        "id,order_number,status,work_status,total_amount,is_rush,po_number,created_at,estimated_delivery_date,estimated_delivery_at,pinned_position,service_id,quote_id,xtrf_invoice_id,xtrf_invoice_number,xtrf_invoice_status,xtrf_invoice_payment_status,xtrf_project_number,xtrf_project_total_agreed,xtrf_project_total_cost,xtrf_project_currency_code,xtrf_project_status,internal_project_id,customers!inner(email,full_name,company_name,customer_type,company_id,requires_po_mode),service:services(code),internal_project:internal_projects!internal_project_id(project_number),quote:quotes(source_language:languages!source_language_id(name),target_language:languages!target_language_id(name))";

      const filters: string[] = [];

      // Search: resolve customer ids first, then OR filter
      if (search) {
        const esc = search.replace(/[*,%()]/g, "").trim();
        const custRes = await sbGet(`customers?select=id&or=(email.ilike.*${esc}*,full_name.ilike.*${esc}*)&limit=500`);
        const custRows: any[] = custRes.ok ? await custRes.json() : [];
        const custIds = custRows.map((c: any) => c.id);
        if (custIds.length > 0) {
          filters.push(`or=(order_number.ilike.*${esc}*,xtrf_project_number.ilike.*${esc}*,customer_id.in.(${custIds.join(",")}))`);
        } else {
          filters.push(`or=(order_number.ilike.*${esc}*,xtrf_project_number.ilike.*${esc}*)`);
        }
      }
      if (status) filters.push(`status=eq.${status}`);
      if (workStatus) filters.push(`work_status=eq.${workStatus}`);
      if (dateFrom) filters.push(`created_at=gte.${dateFrom}`);
      if (dateTo) filters.push(`created_at=lte.${dateTo}T23:59:59`);
      if (rushOnly) filters.push(`is_rush=eq.true`);
      if (xtrfStatus === "none") {
        filters.push(`xtrf_project_number=is.null`);
      } else if (xtrfStatus) {
        filters.push(`xtrf_project_status=eq.${xtrfStatus}`);
      }
      if (xtrfInvoiceStatuses.length > 0) {
        if (xtrfInvoiceStatuses.includes("NONE")) {
          const others = xtrfInvoiceStatuses.filter(s => s !== "NONE");
          if (others.length > 0) {
            filters.push(`or=(xtrf_invoice_status.is.null,xtrf_invoice_status.in.(${others.join(",")}))`);
          } else {
            filters.push(`xtrf_invoice_status=is.null`);
          }
        } else {
          filters.push(`xtrf_invoice_status=in.(${xtrfInvoiceStatuses.join(",")})`);
        }
      }
      if (xtrfPaymentStatuses.length > 0) {
        filters.push(`xtrf_invoice_payment_status=in.(${xtrfPaymentStatuses.join(",")})`);
      }
      // PO Pending: customer is in pending_acceptable PO mode and the
      // order has no po_number yet. Mirrors the DB-level invoice-issue
      // gate so staff can chase what's blocking issue.
      if (poStatus === "pending") {
        filters.push(`customers.requires_po_mode=eq.pending_acceptable`);
        filters.push(`po_number=is.null`);
      } else if (poStatus === "received") {
        filters.push(`po_number=not.is.null`);
      }
      if (serviceFilter !== "all" && certifiedServiceId) {
        filters.push(serviceFilter === "certified"
          ? `service_id=eq.${certifiedServiceId}`
          : `service_id=neq.${certifiedServiceId}`);
      }
      if (companyFilter) {
        const custRes = await sbGet(`customers?select=id&company_id=eq.${companyFilter}&limit=1000`);
        const custRows: any[] = custRes.ok ? await custRes.json() : [];
        if (custRows.length === 0) {
          setOrders([]);
          setTotalCount(0);
          setLoading(false);
          return;
        }
        filters.push(`customer_id=in.(${custRows.map((c: any) => c.id).join(",")})`);
      }

      // #2.2b — vendor / assignment / language filters
      // Vendor + assignment require a 2-stage query against order_workflow_steps.
      // Language filters piggyback on the quote inner-join via PostgREST embed.
      if (vendorFilter) {
        const stRes = await sbGet(`order_workflow_steps?select=order_id&vendor_id=eq.${vendorFilter}&limit=2000`);
        const stRows: any[] = stRes.ok ? await stRes.json() : [];
        const ids = Array.from(new Set(stRows.map((s) => s.order_id))).filter(Boolean);
        if (ids.length === 0) {
          setOrders([]); setTotalCount(0); setLoading(false); return;
        }
        filters.push(`id=in.(${ids.join(",")})`);
      }

      if (assignmentFilter) {
        // Pull all vendor-actor steps and bucket order_ids client-side, then
        // intersect with orders. Step rows are small per order; limit=5000
        // comfortably covers a year of active workflows.
        const stRes = await sbGet(`order_workflow_steps?select=order_id,vendor_id,status&actor_type=eq.external_vendor&limit=5000`);
        const stRows: any[] = stRes.ok ? await stRes.json() : [];
        const terminal = new Set(["approved", "skipped", "cancelled"]);
        const byOrder = new Map<string, { total: number; assigned: number; live: number }>();
        for (const s of stRows) {
          const cur = byOrder.get(s.order_id) || { total: 0, assigned: 0, live: 0 };
          cur.total += 1;
          if (s.vendor_id) cur.assigned += 1;
          if (!terminal.has(s.status)) cur.live += 1;
          byOrder.set(s.order_id, cur);
        }
        const matchOrderIds: string[] = [];
        for (const [oid, agg] of byOrder.entries()) {
          let bucket: string;
          if (agg.live === 0) bucket = "Completed";
          else if (agg.assigned === 0) bucket = "Unassigned";
          else if (agg.assigned < agg.total) bucket = "Partially assigned";
          else bucket = "Fully assigned";
          if (bucket === assignmentFilter) matchOrderIds.push(oid);
        }
        if (matchOrderIds.length === 0) {
          setOrders([]); setTotalCount(0); setLoading(false); return;
        }
        filters.push(`id=in.(${matchOrderIds.join(",")})`);
      }

      if (srcLangFilter || tgtLangFilter) {
        // Resolve via quotes table directly → quote_id IN (). PostgREST
        // filters on embedded resources require an inner-join embed, which
        // we don't want to force here (some legacy orders have no quote_id).
        const qFilters = [
          srcLangFilter ? `source_language_id=eq.${srcLangFilter}` : null,
          tgtLangFilter ? `target_language_id=eq.${tgtLangFilter}` : null,
        ].filter(Boolean).join("&");
        const qRes = await sbGet(`quotes?select=id&${qFilters}&limit=5000`);
        const qRows: any[] = qRes.ok ? await qRes.json() : [];
        const qIds = qRows.map((q) => q.id);
        if (qIds.length === 0) {
          setOrders([]); setTotalCount(0); setLoading(false); return;
        }
        filters.push(`quote_id=in.(${qIds.join(",")})`);
      }

      // Pagination
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const filterStr = filters.length > 0 ? "&" + filters.join("&") : "";
      // Pinned rows render at the top in pinned_position ASC (NULLs last);
      // unpinned fall back to the original created_at DESC sort.
      const qs = `orders?select=${encodeURIComponent(select)}${filterStr}&order=pinned_position.asc.nullslast,created_at.desc`;

      // Parallel: aggregate over the FULL filtered dataset so the stat cards
      // ("Rush Orders", "Avg Order Value", revenue) reflect every matching
      // order, not just the page. Slim select keeps payload tiny; cap at
      // 10000 to bound worst case (today ~378 orders total).
      const aggQs = `orders?select=is_rush,total_amount${filterStr}&limit=10000`;

      const [res, aggRes] = await Promise.all([
        sbGet(qs, {
          Prefer: "count=exact",
          Range: `${from}-${to}`,
          "Range-Unit": "items",
        }),
        sbGet(aggQs),
      ]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentRange = res.headers.get("Content-Range") || "";
      const count = parseInt(contentRange.split("/")[1] || "0", 10);
      const data: any[] = await res.json();

      if (aggRes.ok) {
        const aggRows: Array<{ is_rush: boolean | null; total_amount: number | null }> = await aggRes.json();
        let rev = 0, rush = 0;
        for (const r of aggRows) {
          rev += r.total_amount || 0;
          if (r.is_rush) rush += 1;
        }
        setFilteredRevenue(rev);
        setFilteredRushCount(rush);
      } else {
        setFilteredRevenue(0);
        setFilteredRushCount(0);
      }

      // Batched per-page fetch of workflow steps so we can derive:
      // - the active vendor's name (first non-completed external_vendor step
      //   with a vendor_id, else most-recent completed external_vendor step)
      // - the assignment bucket (Unassigned / Partially / Fully / Completed)
      // PostgREST embedded join would explode row counts; a single IN() batch
      // mirrors the pattern get-order-workflow uses.
      const orderIds = (data ?? []).map((o: any) => o.id).filter(Boolean);
      let stepsByOrder = new Map<string, any[]>();
      // Staff notes — latest non-deleted note per order, plus a per-order
      // count, so the row can render a MessageSquare icon + tooltip
      // excerpt without an extra round trip per row.
      let notesByOrder = new Map<string, { excerpt: string; author: string | null; count: number }>();
      if (orderIds.length > 0) {
        const stepsQs = `order_workflow_steps?select=order_id,actor_type,status,vendor_id,assigned_at,step_number,vendor:vendors!vendor_id(full_name)&order_id=in.(${orderIds.join(",")})`;
        const notesQs = `staff_notes?select=entity_id,body,created_by_name,created_at&entity_type=eq.order&entity_id=in.(${orderIds.join(",")})&deleted_at=is.null&order=created_at.desc&limit=500`;
        const [stepsRes, notesRes] = await Promise.all([sbGet(stepsQs), sbGet(notesQs)]);
        if (stepsRes.ok) {
          const stepsRows: any[] = await stepsRes.json();
          for (const s of stepsRows) {
            const arr = stepsByOrder.get(s.order_id) || [];
            arr.push(s);
            stepsByOrder.set(s.order_id, arr);
          }
        }
        if (notesRes.ok) {
          const noteRows: Array<{ entity_id: string; body: string; created_by_name: string | null; created_at: string }> = await notesRes.json();
          // Rows arrive newest-first per the order=created_at.desc above; the
          // first encounter for each entity_id is the latest note for that order.
          for (const n of noteRows) {
            const cur = notesByOrder.get(n.entity_id);
            if (cur) {
              cur.count += 1;
            } else {
              notesByOrder.set(n.entity_id, {
                excerpt: (n.body || "").slice(0, 240),
                author: n.created_by_name,
                count: 1,
              });
            }
          }
        }
      }

      function deriveVendorAndAssignment(rows: any[]): { vendorName: string | null; bucket: string } {
        const vendorSteps = rows.filter((r) => r.actor_type === "external_vendor");
        if (vendorSteps.length === 0) return { vendorName: null, bucket: "—" };
        const terminal = new Set(["approved", "skipped", "cancelled"]);
        const liveVendorSteps = vendorSteps.filter((r) => !terminal.has(r.status));
        const allDone = liveVendorSteps.length === 0;
        const assignedCount = vendorSteps.filter((r) => r.vendor_id).length;
        let bucket: string;
        if (allDone) bucket = "Completed";
        else if (assignedCount === 0) bucket = "Unassigned";
        else if (assignedCount < vendorSteps.length) bucket = "Partially assigned";
        else bucket = "Fully assigned";
        // Active vendor: first non-completed vendor step with vendor_id,
        // ordered by step_number asc.
        const candidates = liveVendorSteps
          .filter((r) => r.vendor_id)
          .sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0));
        const pick = candidates[0] ?? vendorSteps.filter((r) => r.vendor_id).sort((a, b) => (b.assigned_at || "").localeCompare(a.assigned_at || ""))[0];
        return { vendorName: pick?.vendor?.full_name ?? null, bucket };
      }

      // Transform data
      const transformedOrders =
        data?.map((order) => ({
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          work_status: order.work_status,
          total_amount: order.total_amount,
          is_rush: order.is_rush,
          created_at: order.created_at,
          estimated_delivery_date: order.estimated_delivery_date,
          estimated_delivery_at: (order as any).estimated_delivery_at ?? null,
          customer_email: (order.customers as any)?.email || "",
          customer_name: (order.customers as any)?.full_name || "",
          customer_company_name: (order.customers as any)?.company_name || null,
          customer_type: (order.customers as any)?.customer_type || null,
          service_id: (order as any).service_id || null,
          service_code: (order.service as any)?.code || null,
          document_count: 0, // TODO: Add document count
          xtrf_project_number: order.xtrf_project_number,
          xtrf_invoice_id: order.xtrf_invoice_id,
          xtrf_invoice_number: order.xtrf_invoice_number,
          xtrf_invoice_status: order.xtrf_invoice_status,
          xtrf_invoice_payment_status: order.xtrf_invoice_payment_status,
          xtrf_project_total_agreed: order.xtrf_project_total_agreed,
          xtrf_project_total_cost: order.xtrf_project_total_cost,
          xtrf_project_currency_code: order.xtrf_project_currency_code,
          xtrf_project_status: order.xtrf_project_status,
          internal_project_number: (order.internal_project as any)?.project_number ?? null,
          source_language_name: (order.quote as any)?.source_language?.name ?? null,
          target_language_name: (order.quote as any)?.target_language?.name ?? null,
          pinned_position: (order as any).pinned_position ?? null,
          staff_note_excerpt: notesByOrder.get(order.id)?.excerpt ?? null,
          staff_note_author: notesByOrder.get(order.id)?.author ?? null,
          staff_note_count: notesByOrder.get(order.id)?.count ?? 0,
          ...(() => {
            const va = deriveVendorAndAssignment(stepsByOrder.get(order.id) || []);
            return { active_vendor_name: va.vendorName, assignment_bucket: va.bucket };
          })(),
        })) || [];

      setOrders(transformedOrders);
      setTotalCount(count || 0);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!restoredFromSession) return;
    // If filtering by service type, wait until the certified service UUID has resolved
    // (null = still loading; once loaded, certifiedServiceLoaded flips true and we re-run)
    if (serviceFilter !== "all" && !certifiedServiceLoaded) return;
    fetchOrders();
  }, [restoredFromSession, search, status, workStatus, dateFrom, dateTo, rushOnly, xtrfStatus, poStatus, xtrfInvoiceStatuses.join(","), xtrfPaymentStatuses.join(","), page, serviceFilter, companyFilter, vendorFilter, srcLangFilter, tgtLangFilter, assignmentFilter, certifiedServiceLoaded]);

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    if (key !== "page") {
      params.set("page", "1");
    }
    setSearchParams(params);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilter("search", searchInput);
  };

  const toggleMultiFilter = (key: string, value: string, current: string[]) => {
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    updateFilter(key, next.join(","));
  };

  const clearFilters = () => {
    setSearchParams({});
    setSearchInput("");
    try { sessionStorage.removeItem(FILTERS_STORAGE_KEY); } catch { /* ignore */ }
  };

  const handleExport = () => {
    // Map column keys to export headers and value extractors
    const exportColumns: { key: ColumnKey; headers: string[]; values: (o: Order) => string[] }[] = [
      { key: "orderDetails", headers: ["Order Number", "Rush", "Created"], values: (o) => [o.order_number, o.is_rush ? "Yes" : "No", format(new Date(o.created_at), "yyyy-MM-dd")] },
      { key: "customer", headers: ["Customer Name", "Customer Email"], values: (o) => [o.customer_name, o.customer_email] },
      { key: "languagePair", headers: ["Source Language", "Target Language"], values: (o) => [o.source_language_name || "", o.target_language_name || ""] },
      { key: "vendor", headers: ["Active Vendor"], values: (o) => [o.active_vendor_name || ""] },
      { key: "assignment", headers: ["Assignment Status"], values: (o) => [o.assignment_bucket || ""] },
      { key: "status", headers: ["Status", "Work Status"], values: (o) => [o.status, o.work_status] },
      { key: "total", headers: ["Total"], values: (o) => [(o.total_amount || 0).toFixed(2)] },
      { key: "clientTotal", headers: ["Client Total"], values: (o) => [o.xtrf_project_total_agreed != null ? o.xtrf_project_total_agreed.toFixed(2) : ""] },
      { key: "vendorCost", headers: ["Vendor Cost"], values: (o) => [o.xtrf_project_total_cost != null && o.xtrf_project_total_cost > 0 ? o.xtrf_project_total_cost.toFixed(2) : ""] },
      { key: "profit", headers: ["Profit", "Currency"], values: (o) => {
        const clientTotal = o.xtrf_project_total_agreed;
        const vendorCost = o.xtrf_project_total_cost;
        const profit = clientTotal != null && vendorCost != null && vendorCost > 0 ? clientTotal - vendorCost : null;
        return [profit != null ? profit.toFixed(2) : "", o.xtrf_project_currency_code ?? ""];
      }},
      { key: "profitPct", headers: ["% Profit"], values: (o) => {
        const clientTotal = o.xtrf_project_total_agreed;
        const vendorCost = o.xtrf_project_total_cost;
        const profit = clientTotal != null && vendorCost != null && vendorCost > 0 ? clientTotal - vendorCost : null;
        const pct = profit != null && clientTotal != null && clientTotal > 0 ? (profit / clientTotal) * 100 : null;
        return [pct != null ? pct.toFixed(1) : ""];
      }},
      { key: "xtrfProject", headers: ["XTRF Project"], values: (o) => [o.xtrf_project_number ?? ""] },
      { key: "xtrfInvoice", headers: ["XTRF Invoice"], values: (o) => [o.xtrf_invoice_number ?? ""] },
      { key: "delivery", headers: ["Client Deadline"], values: (o) => [o.estimated_delivery_at ? new Date(o.estimated_delivery_at).toISOString() : (o.estimated_delivery_date ? format(new Date(o.estimated_delivery_date), "yyyy-MM-dd") : "")] },
    ];

    const visibleExportCols = exportColumns.filter((c) => isColExported(c.key));
    const headers = visibleExportCols.flatMap((c) => c.headers);
    const rows = orders.map((o) => visibleExportCols.flatMap((c) => c.values(o)));
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasActiveFilters =
    search || status || workStatus || dateFrom || dateTo || rushOnly || xtrfStatus || xtrfInvoiceStatuses.length > 0 || xtrfPaymentStatuses.length > 0;

  // Summary stats reflect the FULL filtered dataset, not just the current
  // page, so the cards stay consistent with "Total Orders" (which is also
  // a filtered count from Content-Range).
  const totalRevenue = filteredRevenue;
  const avgOrderValue = totalCount > 0 ? totalRevenue / totalCount : 0;

  return (
    <div className="max-w-[1800px] mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalCount.toLocaleString()} total orders
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchOrders()}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={() => setShowColumnSettings(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title="Column Settings"
          >
            <Settings2 className="w-4 h-4" />
            Columns
          </button>
          <Link
            to="/admin/orders/new"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          >
            New project
          </Link>
        </div>
      </div>

      <div>
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Total Orders"
            value={totalCount}
            icon={Hash}
            color="blue"
          />
          <StatCard
            label="Revenue"
            value={`$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
            icon={DollarSign}
            color="green"
          />
          <StatCard
            label="Rush Orders"
            value={filteredRushCount}
            icon={Zap}
            color="amber"
            valueColor={filteredRushCount > 0 ? "text-amber-600" : undefined}
          />
          <StatCard
            label="Avg Order Value"
            value={`$${avgOrderValue.toFixed(2)}`}
            icon={TrendingUp}
            color="purple"
          />
        </div>

        {/* Search & Filters Bar */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Search */}
            <form onSubmit={handleSearch} className="flex-1 md:max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search orders..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            </form>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
                hasActiveFilters
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {hasActiveFilters && (
                <span className="w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center">
                  {
                    [
                      search,
                      status,
                      workStatus,
                      dateFrom,
                      dateTo,
                      rushOnly,
                      xtrfStatus,
                      xtrfInvoiceStatuses.length > 0,
                      xtrfPaymentStatuses.length > 0,
                    ].filter(Boolean).length
                  }
                </span>
              )}
              <ChevronDown
                className={`w-4 h-4 transition-transform ${showFilters ? "rotate-180" : ""}`}
              />
            </button>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                <X className="w-4 h-4" />
                Clear
              </button>
            )}
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-6 gap-4">
              {/* Order Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Order Status
                </label>
                <select
                  value={status}
                  onChange={(e) => updateFilter("status", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Work Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Work Status
                </label>
                <select
                  value={workStatus}
                  onChange={(e) => updateFilter("work_status", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {WORK_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date From */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => updateFilter("from", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Date To */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => updateFilter("to", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* XTRF Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  XTRF Status
                </label>
                <select
                  value={xtrfStatus}
                  onChange={(e) => updateFilter("xtrfStatus", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All XTRF Status</option>
                  <option value="OPENED">XTRF Open</option>
                  <option value="CLOSED">XTRF Closed</option>
                  <option value="CANCELLED">XTRF Cancelled</option>
                  <option value="none">No XTRF Project</option>
                </select>
              </div>

              {/* PO Status — surfaces the orders blocked from invoicing
                  because their customer is in pending_acceptable PO mode
                  and the PO hasn't arrived yet. */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PO Status
                </label>
                <select
                  value={poStatus}
                  onChange={(e) => updateFilter("poStatus", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All PO Status</option>
                  <option value="pending">PO Pending — chase</option>
                  <option value="received">PO Received</option>
                </select>
              </div>

              {/* Rush Only */}
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rushOnly}
                    onChange={(e) =>
                      updateFilter("rush", e.target.checked ? "true" : "")
                    }
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">
                    Rush orders only
                  </span>
                </label>
              </div>

              {/* Service type (certified vs non-certified) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Service type
                </label>
                <select
                  value={serviceFilter}
                  onChange={(e) => updateFilter("service", e.target.value === "all" ? "" : e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All services</option>
                  <option value="certified">Certified translations</option>
                  <option value="non_certified">Non-certified / other</option>
                </select>
              </div>

              {/* Company (business) filter */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company
                </label>
                {companyFilter && selectedCompanyName ? (
                  <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg bg-teal-50">
                    <span className="text-sm text-teal-800 flex-1 truncate">
                      {selectedCompanyName}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateFilter("company", "")}
                      className="text-gray-400 hover:text-red-600"
                      title="Clear company filter"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={companySearch}
                      onChange={(e) => setCompanySearch(e.target.value)}
                      placeholder="Search by company…"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    {companies.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-20 max-h-56 overflow-y-auto">
                        <ul className="divide-y divide-gray-100">
                          {companies.map((co) => (
                            <li key={co.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  updateFilter("company", co.id);
                                  setCompanySearch("");
                                  setCompanies([]);
                                }}
                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-teal-50"
                              >
                                {co.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Vendor (active step) filter — #2.2b */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vendor
                </label>
                {vendorFilter && selectedVendorName ? (
                  <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg bg-teal-50">
                    <span className="text-sm text-teal-800 flex-1 truncate">{selectedVendorName}</span>
                    <button
                      type="button"
                      onClick={() => updateFilter("vendor", "")}
                      className="text-gray-400 hover:text-red-600"
                      title="Clear vendor filter"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={vendorSearch}
                      onChange={(e) => setVendorSearch(e.target.value)}
                      placeholder="Search by vendor…"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    {vendors.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-20 max-h-56 overflow-y-auto">
                        <ul className="divide-y divide-gray-100">
                          {vendors.map((v) => (
                            <li key={v.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  updateFilter("vendor", v.id);
                                  setVendorSearch("");
                                  setVendors([]);
                                }}
                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-teal-50"
                              >
                                {v.full_name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Source language filter — #2.2b */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Source language
                </label>
                <select
                  value={srcLangFilter}
                  onChange={(e) => updateFilter("srcLang", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="">Any source</option>
                  {languagesList.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              {/* Target language filter — #2.2b */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target language
                </label>
                <select
                  value={tgtLangFilter}
                  onChange={(e) => updateFilter("tgtLang", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="">Any target</option>
                  {languagesList.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              {/* Assignment status filter — #2.2b */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Assignment status
                </label>
                <select
                  value={assignmentFilter}
                  onChange={(e) => updateFilter("assignment", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="">Any</option>
                  <option value="Unassigned">Unassigned</option>
                  <option value="Partially assigned">Partially assigned</option>
                  <option value="Fully assigned">Fully assigned</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>

              {/* Save current filters as personal default */}
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleSaveFilterDefault}
                  disabled={!staffId || savingPrefs}
                  className="px-3 py-2 text-sm border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-50 disabled:opacity-50"
                  title="Save these filters to your profile so they load every time you open Orders"
                >
                  {savingPrefs ? "Saving…" : "Save as my default"}
                </button>
              </div>

              {/* XTRF Invoice Status */}
              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  XTRF Invoice Status
                </label>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {[
                    { value: "NONE", label: "No Invoice" },
                    { value: "READY", label: "Ready" },
                    { value: "SENT", label: "Sent" },
                    { value: "NOT_READY", label: "Not Ready" },
                    { value: "DRAFT", label: "Draft" },
                  ].map((opt) => (
                    <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={xtrfInvoiceStatuses.includes(opt.value)}
                        onChange={() => toggleMultiFilter("xtrfInvStatus", opt.value, xtrfInvoiceStatuses)}
                        className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* XTRF Payment Status */}
              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  XTRF Payment Status
                </label>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {[
                    { value: "FULLY_PAID", label: "Paid" },
                    { value: "PARTIALLY_PAID", label: "Partially Paid" },
                    { value: "NOT_PAID", label: "Unpaid" },
                  ].map((opt) => (
                    <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={xtrfPaymentStatuses.includes(opt.value)}
                        onChange={() => toggleMultiFilter("xtrfPayStatus", opt.value, xtrfPaymentStatuses)}
                        className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px]">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="w-6 px-1.5 py-2.5" aria-label="Drag handle" />
                  {isColVisible("orderDetails") && <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Order Details</th>}
                  {isColVisible("customer") && <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Customer</th>}
                  {isColVisible("languagePair") && <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Languages</th>}
                  {isColVisible("vendor") && <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Vendor</th>}
                  {isColVisible("assignment") && <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Assignment</th>}
                  {isColVisible("status") && <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Status</th>}
                  {isColVisible("total") && <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Total</th>}
                  {isColVisible("clientTotal") && <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Client Total</th>}
                  {isColVisible("vendorCost") && <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Vendor Cost</th>}
                  {isColVisible("profit") && <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Profit</th>}
                  {isColVisible("profitPct") && <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Profit %</th>}
                  {isColVisible("xtrfProject") && <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">XTRF Project</th>}
                  {isColVisible("xtrfInvoice") && <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">XTRF Invoice</th>}
                  {isColVisible("delivery") && <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Client Deadline</th>}
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={columnSettings.filter(c => c.ui).length + 2} className="px-6 py-12 text-center">
                      <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columnSettings.filter(c => c.ui).length + 2}
                      className="px-6 py-12 text-center text-gray-500"
                    >
                      No orders found
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => {
                    const isNonCertified =
                      !!order.service_code &&
                      order.service_code !== "certified_translation";
                    const isDropTarget = dropTargetId === order.id && dragOrderId !== order.id;
                    const isDragging = dragOrderId === order.id;
                    return (
                    <tr
                      key={order.id}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dropTargetId !== order.id) setDropTargetId(order.id); }}
                      onDragLeave={() => { if (dropTargetId === order.id) setDropTargetId(null); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const src = e.dataTransfer.getData("text/plain") || dragOrderId;
                        setDropTargetId(null);
                        if (src) void handleDropOnRow(src, order.id);
                      }}
                      className={`transition-colors ${
                        isDragging
                          ? "opacity-40"
                          : isDropTarget
                            ? "ring-2 ring-teal-400 ring-inset bg-teal-50/60"
                            : isNonCertified
                              ? "bg-indigo-50/60 hover:bg-indigo-100/70"
                              : "hover:bg-gray-50"
                      }`}
                    >
                      {/* Drag handle: hold + drag to reorder pinned rows
                          or to pin/unpin by dropping on another row. */}
                      <td className="w-6 px-1.5 py-2.5 text-center cursor-grab active:cursor-grabbing select-none"
                          draggable
                          onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", order.id); setDragOrderId(order.id); }}
                          onDragEnd={() => { setDragOrderId(null); setDropTargetId(null); }}
                          aria-label="Drag to reorder"
                          title="Drag onto another row to pin / swap / unpin">
                        <GripVertical className="w-3.5 h-3.5 text-gray-400 mx-auto" />
                      </td>
                      {/* Order Details */}
                      {isColVisible("orderDetails") && (
                        <td className="px-3 py-2.5">
                          <Link to={`/admin/orders/${order.id}`} className="block group">
                            <p className="text-sm font-semibold text-gray-900 font-mono group-hover:text-teal-600 flex items-center gap-1.5">
                              {order.pinned_position != null && (
                                <Pin className="w-3.5 h-3.5 text-teal-600 fill-teal-100" aria-label="Pinned" />
                              )}
                              {order.order_number}
                              {order.staff_note_excerpt && (
                                <span
                                  className="inline-flex items-center gap-0.5 text-amber-600 cursor-help"
                                  title={`Staff note${order.staff_note_count > 1 ? ` (latest of ${order.staff_note_count})` : ""}${order.staff_note_author ? ` — ${order.staff_note_author}` : ""}:\n${order.staff_note_excerpt}${order.staff_note_excerpt.length >= 240 ? "…" : ""}`}
                                  aria-label="Has staff note"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                >
                                  <MessageSquare className="w-3.5 h-3.5 fill-amber-100" />
                                  {order.staff_note_count > 1 && (
                                    <span className="text-[10px] font-semibold">{order.staff_note_count}</span>
                                  )}
                                </span>
                              )}
                            </p>
                            {order.internal_project_number && (
                              <p className="text-xs font-mono text-teal-700 mt-0.5">
                                {order.internal_project_number}
                              </p>
                            )}
                            <p className="text-xs text-gray-500 mt-0.5">
                              {format(new Date(order.created_at), "MMM d, yyyy")}
                              {order.is_rush && (
                                <span className="ml-1.5 text-amber-600 font-medium">⚡ Rush</span>
                              )}
                            </p>
                          </Link>
                        </td>
                      )}
                      {/* Customer */}
                      {isColVisible("customer") && (
                        <td className="px-3 py-2.5 max-w-[220px]">
                          <p className="text-sm font-medium text-gray-900 truncate" title={order.customer_name || ""}>{order.customer_name || "—"}</p>
                          {order.customer_company_name && (
                            <p className="text-xs text-gray-700 mt-0.5 font-medium truncate" title={order.customer_company_name}>
                              {order.customer_company_name}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 mt-0.5 truncate" title={order.customer_email || ""}>{order.customer_email || "—"}</p>
                        </td>
                      )}
                      {/* Languages */}
                      {isColVisible("languagePair") && (
                        <td className="px-3 py-2.5 text-sm text-gray-700 whitespace-nowrap">
                          {order.source_language_name && order.target_language_name
                            ? `${order.source_language_name} → ${order.target_language_name}`
                            : (order.source_language_name || order.target_language_name || "—")}
                        </td>
                      )}
                      {/* Vendor */}
                      {isColVisible("vendor") && (
                        <td className="px-3 py-2.5 text-sm text-gray-700">
                          {order.active_vendor_name || <span className="text-gray-400 italic text-xs">—</span>}
                        </td>
                      )}
                      {/* Assignment */}
                      {isColVisible("assignment") && (
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                          {(() => {
                            const b = order.assignment_bucket;
                            if (b === "Fully assigned") return <span className="inline-flex px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">Fully assigned</span>;
                            if (b === "Partially assigned") return <span className="inline-flex px-2 py-0.5 rounded bg-amber-100 text-amber-800">Partially assigned</span>;
                            if (b === "Unassigned") return <span className="inline-flex px-2 py-0.5 rounded bg-red-100 text-red-800">Unassigned</span>;
                            if (b === "Completed") return <span className="inline-flex px-2 py-0.5 rounded bg-gray-100 text-gray-700">Completed</span>;
                            return <span className="text-gray-400">—</span>;
                          })()}
                        </td>
                      )}
                      {/* Status */}
                      {isColVisible("status") && (
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <OrderStatusBadge status={order.status} />
                            <WorkStatusBadge status={order.work_status} />
                            <XtrfProjectStatusBadge status={order.xtrf_project_status} />
                          </div>
                        </td>
                      )}
                      {/* Total */}
                      {isColVisible("total") && (
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <p className="text-sm font-semibold text-gray-900 tabular-nums">
                            ${(order.total_amount || 0).toFixed(2)}
                          </p>
                        </td>
                      )}
                      {/* Client Total */}
                      {isColVisible("clientTotal") && (
                        <td className="px-3 py-2.5 text-right">
                          {order.xtrf_project_total_agreed != null ? (
                            <span className="text-sm text-gray-900 tabular-nums">
                              {order.xtrf_project_total_agreed.toFixed(2)} {order.xtrf_project_currency_code ?? ''}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-300">—</span>
                          )}
                        </td>
                      )}
                      {/* Vendor Cost */}
                      {isColVisible("vendorCost") && (
                        <td className="px-3 py-2.5 text-right">
                          {order.xtrf_project_total_cost != null && order.xtrf_project_total_cost > 0 ? (
                            <span className="text-sm text-gray-700 tabular-nums">
                              {order.xtrf_project_total_cost.toFixed(2)} {order.xtrf_project_currency_code ?? ''}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-300">—</span>
                          )}
                        </td>
                      )}
                      {/* Profit */}
                      {isColVisible("profit") && (
                        <td className="px-3 py-2.5 text-right">
                          {order.xtrf_project_total_agreed != null && order.xtrf_project_total_cost != null && order.xtrf_project_total_cost > 0 ? (() => {
                            const profit = order.xtrf_project_total_agreed - order.xtrf_project_total_cost;
                            return (
                              <span className={`text-sm font-medium tabular-nums ${profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                {profit.toFixed(2)} {order.xtrf_project_currency_code ?? ''}
                              </span>
                            );
                          })() : (
                            <span className="text-sm text-gray-300">—</span>
                          )}
                        </td>
                      )}
                      {/* % Profit */}
                      {isColVisible("profitPct") && (
                        <td className="px-3 py-2.5 text-right">
                          {order.xtrf_project_total_agreed != null && order.xtrf_project_total_agreed > 0 && order.xtrf_project_total_cost != null && order.xtrf_project_total_cost > 0 ? (() => {
                            const profitPct = ((order.xtrf_project_total_agreed - order.xtrf_project_total_cost) / order.xtrf_project_total_agreed) * 100;
                            return (
                              <span className={`text-sm font-medium tabular-nums ${profitPct >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                {profitPct.toFixed(1)}%
                              </span>
                            );
                          })() : (
                            <span className="text-sm text-gray-300">—</span>
                          )}
                        </td>
                      )}
                      {/* XTRF Project */}
                      {isColVisible("xtrfProject") && (
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {order.xtrf_project_number ? (
                            <span className="text-sm font-mono text-gray-900">{order.xtrf_project_number}</span>
                          ) : (
                            <span className="text-sm text-gray-300">—</span>
                          )}
                        </td>
                      )}
                      {/* XTRF Invoice */}
                      {isColVisible("xtrfInvoice") && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          {order.xtrf_invoice_number ? (
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-mono text-gray-900">{order.xtrf_invoice_number}</span>
                              <div className="flex items-center gap-1">
                                <XtrfInvoiceStatusBadge status={order.xtrf_invoice_status} />
                                <XtrfPaymentStatusBadge status={order.xtrf_invoice_payment_status} />
                              </div>
                            </div>
                          ) : order.xtrf_project_total_agreed != null ? (
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-gray-400 italic">No invoice</span>
                              <span className="text-xs text-gray-500">
                                {order.xtrf_project_total_agreed.toFixed(2)} {order.xtrf_project_currency_code ?? ''}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-300">—</span>
                          )}
                        </td>
                      )}
                      {/* Client deadline — shows time when estimated_delivery_at
                         (timestamptz) is present so staff can see the
                         customer-promised instant in their own timezone.
                         Falls back to legacy date-only when older rows
                         don't carry the timestamp. */}
                      {isColVisible("delivery") && (
                        <td className="px-3 py-2.5">
                          {order.estimated_delivery_at ? (
                            <p className="text-sm text-gray-700">
                              {new Date(order.estimated_delivery_at).toLocaleString(undefined, {
                                month: "short", day: "numeric", year: "numeric",
                                hour: "numeric", minute: "2-digit",
                              })}
                            </p>
                          ) : order.estimated_delivery_date ? (
                            <p className="text-sm text-gray-700">
                              {format(new Date(order.estimated_delivery_date), "MMM d, yyyy")}
                            </p>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </td>
                      )}
                      {/* Actions Meatball Menu */}
                      <td className="px-3 py-2.5 text-center relative">
                        <button
                          onClick={() =>
                            setOpenMenuId(
                              openMenuId === order.id ? null : order.id,
                            )
                          }
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                          aria-label="Actions"
                        >
                          <MoreVertical className="w-4 h-4 text-gray-600" />
                        </button>
                        {openMenuId === order.id && (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setOpenMenuId(null)}
                            />
                            <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                              <Link
                                to={`/admin/orders/${order.id}`}
                                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                onClick={() => setOpenMenuId(null)}
                              >
                                <Eye className="w-4 h-4" />
                                View Details
                              </Link>
                              <div className="my-1 border-t border-gray-100" />
                              {order.pinned_position == null ? (
                                <button
                                  type="button"
                                  onClick={() => handlePinOrder(order.id)}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <Pin className="w-4 h-4" />
                                  Pin to top
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleMovePinned(order.id, "up")}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                  >
                                    <ArrowUp className="w-4 h-4" />
                                    Move up
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMovePinned(order.id, "down")}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                  >
                                    <ArrowDown className="w-4 h-4" />
                                    Move down
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUnpinOrder(order.id)}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                  >
                                    <PinOff className="w-4 h-4" />
                                    Unpin
                                  </button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing {(page - 1) * PAGE_SIZE + 1} to{" "}
                {Math.min(page * PAGE_SIZE, totalCount)} of{" "}
                {totalCount.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateFilter("page", String(page - 1))}
                  disabled={page <= 1}
                  className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-700">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => updateFilter("page", String(page + 1))}
                  disabled={page >= totalPages}
                  className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Column Settings Modal */}
        {showColumnSettings && (
          <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowColumnSettings(false)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">Column Settings</h3>
                  <button onClick={() => setShowColumnSettings(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
                <div className="px-6 py-4">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                        <th className="pb-3">Column</th>
                        <th className="pb-3 text-center w-20">UI</th>
                        <th className="pb-3 text-center w-20">Export</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {columnSettings.map((col) => (
                        <tr key={col.key} className="hover:bg-gray-50">
                          <td className="py-2.5 text-sm text-gray-700">{col.label}</td>
                          <td className="py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={col.ui}
                              onChange={() => toggleColumnSetting(col.key, "ui")}
                              className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={col.export}
                              onChange={() => toggleColumnSetting(col.key, "export")}
                              className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-6 py-3 border-t border-gray-200 flex justify-between">
                  <button
                    onClick={() => {
                      setColumnSettings(DEFAULT_COLUMNS);
                      saveColumnSettings(DEFAULT_COLUMNS);
                    }}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Reset to defaults
                  </button>
                  <button
                    onClick={() => setShowColumnSettings(false)}
                    className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Order Status Badge - Normalized to Title Case
function OrderStatusBadge({ status }: { status?: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    pending_payment: "bg-amber-100 text-amber-700",
    paid: "bg-green-100 text-green-700",
    processing: "bg-blue-100 text-blue-700",
    draft_review: "bg-amber-100 text-amber-700",
    completed: "bg-green-100 text-green-700",
    delivered: "bg-green-100 text-green-700",
    invoiced: "bg-purple-100 text-purple-700",
    refunded: "bg-red-100 text-red-700",
    cancelled: "bg-gray-100 text-gray-700",
  };

  const labels: Record<string, string> = {
    pending: "Pending",
    pending_payment: "Pending Payment",
    paid: "Paid",
    processing: "Processing",
    draft_review: "Draft Review",
    completed: "Completed",
    delivered: "Delivered",
    invoiced: "Invoiced",
    refunded: "Refunded",
    cancelled: "Cancelled",
  };

  // Fallback: convert snake_case to Title Case
  const formatStatus = (s: string) => {
    return s
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  return (
    <span
      className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${styles[status || ""] || "bg-gray-100 text-gray-700"}`}
    >
      {labels[status || ""] || (status ? formatStatus(status) : "Unknown")}
    </span>
  );
}

// Work Status Badge - Normalized to Title Case
function WorkStatusBadge({ status }: { status?: string }) {
  const config: Record<
    string,
    { style: string; icon: React.ReactNode; label: string }
  > = {
    pending: {
      style: "bg-gray-100 text-gray-700",
      icon: <Package className="w-3 h-3" />,
      label: "Pending",
    },
    in_progress: {
      style: "bg-blue-100 text-blue-700",
      icon: <Truck className="w-3 h-3" />,
      label: "In Progress",
    },
    on_hold: {
      style: "bg-amber-100 text-amber-700",
      icon: <Package className="w-3 h-3" />,
      label: "On Hold",
    },
    completed: {
      style: "bg-green-100 text-green-700",
      icon: <CheckCircle className="w-3 h-3" />,
      label: "Completed",
    },
    cancelled: {
      style: "bg-red-100 text-red-700",
      icon: <X className="w-3 h-3" />,
      label: "Cancelled",
    },
  };

  // Fallback: convert snake_case to Title Case
  const formatStatus = (s: string) => {
    return s
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  const { style, icon, label } = config[status || ""] || {
    style: "bg-gray-100 text-gray-700",
    icon: null,
    label: status ? formatStatus(status) : "Unknown",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full ${style}`}
    >
      {icon}
      {label}
    </span>
  );
}

function XtrfProjectStatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  const cfg: Record<string, { style: string; label: string }> = {
    OPENED:    { style: "bg-blue-100 text-blue-700",   label: "XTRF Open" },
    CLOSED:    { style: "bg-green-100 text-green-700", label: "XTRF Closed" },
    CANCELLED: { style: "bg-red-100 text-red-700",     label: "XTRF Cancelled" },
  };
  const { style, label } = cfg[status] ?? { style: "bg-gray-100 text-gray-500", label: status };
  return (
    <span className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded ${style}`}>
      {label}
    </span>
  );
}

function XtrfInvoiceStatusBadge({ status }: { status?: string | null }) {
  const styles: Record<string, string> = {
    SENT:      "bg-green-100 text-green-700",
    READY:     "bg-blue-100 text-blue-700",
    NOT_READY: "bg-gray-100 text-gray-500",
    DRAFT:     "bg-yellow-100 text-yellow-700",
  };
  if (!status) return null;
  return (
    <span className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded ${styles[status] || "bg-gray-100 text-gray-500"}`}>
      {status}
    </span>
  );
}

function XtrfPaymentStatusBadge({ status }: { status?: string | null }) {
  const styles: Record<string, string> = {
    FULLY_PAID:     "bg-green-100 text-green-700",
    PARTIALLY_PAID: "bg-amber-100 text-amber-700",
    NOT_PAID:       "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    FULLY_PAID:     "Paid",
    PARTIALLY_PAID: "Partial",
    NOT_PAID:       "Unpaid",
  };
  if (!status) return null;
  return (
    <span className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded ${styles[status] || "bg-gray-100 text-gray-500"}`}>
      {labels[status] || status}
    </span>
  );
}

