import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import {
  Search,
  Loader2,
  AlertTriangle,
  Check,
  Building2,
  Mail,
  FileText,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { getCurrencySymbol, getCurrencyBadgeClasses } from "@/utils/currency";

// ── Types ────────────────────────────────────────────────────────────
interface CustomerResult {
  id: string;
  full_name: string;
  email: string;
  company_name: string | null;
  customer_type: string;
  requires_po: boolean;
  requires_client_project_number: boolean;
  payment_terms: string | null;
  preferred_currency?: string | null;
  invoicing_branch_id: number | null;
  invoicing_branch?: { legal_name: string } | null;
  stats?: { unbilled_orders: number };
}

interface UnbilledOrder {
  id: string;
  order_number: string;
  total_amount: string;
  subtotal: string;
  certification_total: string;
  rush_fee: string;
  delivery_fee: string;
  discount_total: string;
  surcharge_total: string;
  tax_rate: string;
  tax_amount: string;
  po_number: string | null;
  client_project_number: string | null;
  invoice_status: string;
  paid_at: string | null;
  po_missing: boolean;
  project_number_missing: boolean;
  selectable: boolean;
}

interface CustomLine {
  id: string;
  description: string;
  amount: number;
}

// ── Step Indicator ───────────────────────────────────────────────────
const STEPS = ["Select Customer", "Select Orders", "Review & Generate"];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((label, i) => {
        const stepNum = i + 1;
        const isCompleted = stepNum < currentStep;
        const isActive = stepNum === currentStep;
        const isUpcoming = stepNum > currentStep;

        return (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`w-12 h-0.5 ${
                  isCompleted || isActive ? "bg-blue-400" : "bg-gray-300"
                }`}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  isCompleted
                    ? "bg-green-500 text-white"
                    : isActive
                      ? "bg-blue-600 text-white"
                      : "bg-gray-300 text-gray-500"
                }`}
              >
                {isCompleted ? <Check className="w-3.5 h-3.5" /> : stepNum}
              </div>
              <span
                className={`text-sm font-medium ${
                  isActive
                    ? "text-blue-600"
                    : isCompleted
                      ? "text-green-600"
                      : "text-gray-400"
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────
export default function CreateInvoice() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session } = useAdminAuthContext();
  const [currentStep, setCurrentStep] = useState(1);
  const presetCustomerId = searchParams.get("customer_id");
  const preselectOrderId = searchParams.get("preselect");
  const didAutoLoad = useRef(false);

  // Step 1 state
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<CustomerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [recentCustomers, setRecentCustomers] = useState<CustomerResult[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null);
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const [readinessError, setReadinessError] = useState<{ message: string; customerId: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 2 state
  const [orders, setOrders] = useState<UnbilledOrder[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [customLines, setCustomLines] = useState<CustomLine[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [poFilter, setPoFilter] = useState("");
  const [orderNumberFilter, setOrderNumberFilter] = useState("");
  const [newLineDesc, setNewLineDesc] = useState("");
  const [newLineAmount, setNewLineAmount] = useState("");
  const [ordersResponse, setOrdersResponse] = useState<{
    total_count: number;
    selectable_count: number;
    requires_po: boolean;
    requires_client_project_number: boolean;
  } | null>(null);

  // Step 3 state
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Load recent customers with unbilled orders ──
  useEffect(() => {
    (async () => {
      try {
        // Get unique customer_ids with unbilled orders
        const { data: orderRows, error: ordErr } = await supabase
          .from("orders")
          .select("customer_id")
          .eq("invoice_status", "unbilled")
          .not("customer_id", "is", null);

        if (ordErr || !orderRows) {
          setLoadingRecent(false);
          return;
        }

        const uniqueIds = [...new Set(orderRows.map((r) => r.customer_id))].slice(0, 10);
        if (uniqueIds.length === 0) {
          setLoadingRecent(false);
          return;
        }

        const { data: customers } = await supabase
          .from("customers")
          .select("id, full_name, email, company_name, customer_type, requires_po, requires_client_project_number, payment_terms, invoicing_branch_id")
          .in("id", uniqueIds);

        if (customers) {
          // Count unbilled orders per customer
          const countMap: Record<string, number> = {};
          for (const r of orderRows) {
            countMap[r.customer_id] = (countMap[r.customer_id] || 0) + 1;
          }

          // Load branch names
          const branchIds = [...new Set(customers.map(c => c.invoicing_branch_id).filter(Boolean))];
          let branchMap: Record<number, string> = {};
          if (branchIds.length > 0) {
            const { data: branches } = await supabase
              .from("branches")
              .select("id, legal_name")
              .in("id", branchIds);
            if (branches) {
              branchMap = Object.fromEntries(branches.map(b => [b.id, b.legal_name]));
            }
          }

          setRecentCustomers(
            customers.map((c) => ({
              ...c,
              invoicing_branch: c.invoicing_branch_id
                ? { legal_name: branchMap[c.invoicing_branch_id] || "Unknown" }
                : null,
              stats: { unbilled_orders: countMap[c.id] || 0 },
            }))
          );
        }
      } catch {
        // Silently fail for recent customers
      }
      setLoadingRecent(false);
    })();
  }, []);

  // ── Auto-load customer from URL params ──
  useEffect(() => {
    if (!presetCustomerId || didAutoLoad.current) return;
    didAutoLoad.current = true;

    (async () => {
      try {
        const { data: customer } = await supabase
          .from("customers")
          .select("id, full_name, email, company_name, customer_type, requires_po, requires_client_project_number, payment_terms, invoicing_branch_id")
          .eq("id", presetCustomerId)
          .single();

        if (customer) {
          // Wrap in the same flow as handleSelectCustomer but skip readiness check UI
          const customerResult: CustomerResult = {
            ...customer,
            stats: { unbilled_orders: 0 },
          };
          handleSelectCustomer(customerResult);
        }
      } catch {
        // Silently fail — user can still search manually
      }
    })();
  }, [presetCustomerId]);

  // ── Search customers ──
  const searchCustomers = useCallback(async (term: string) => {
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("id, full_name, email, company_name, customer_type, requires_po, requires_client_project_number, payment_terms, invoicing_branch_id")
        .or(`full_name.ilike.%${term}%,email.ilike.%${term}%,company_name.ilike.%${term}%`)
        .limit(10);

      if (error) {
        toast.error("Search failed");
        return;
      }
      if (data) {
        // Count unbilled orders for each
        const ids = data.map(c => c.id);
        const { data: orderRows } = await supabase
          .from("orders")
          .select("customer_id")
          .eq("invoice_status", "unbilled")
          .in("customer_id", ids);

        const countMap: Record<string, number> = {};
        if (orderRows) {
          for (const r of orderRows) {
            countMap[r.customer_id] = (countMap[r.customer_id] || 0) + 1;
          }
        }

        // Load branch names
        const branchIds = [...new Set(data.map(c => c.invoicing_branch_id).filter(Boolean))];
        let branchMap: Record<number, string> = {};
        if (branchIds.length > 0) {
          const { data: branches } = await supabase
            .from("branches")
            .select("id, legal_name")
            .in("id", branchIds);
          if (branches) {
            branchMap = Object.fromEntries(branches.map(b => [b.id, b.legal_name]));
          }
        }

        setSearchResults(
          data.map((c) => ({
            ...c,
            invoicing_branch: c.invoicing_branch_id
              ? { legal_name: branchMap[c.invoicing_branch_id] || "Unknown" }
              : null,
            stats: { unbilled_orders: countMap[c.id] || 0 },
          }))
        );
      }
    } catch {
      toast.error("Search failed");
    }
    setSearching(false);
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchCustomers(searchTerm);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, searchCustomers]);

  // ── Check invoice readiness ──
  const handleSelectCustomer = async (customer: CustomerResult) => {
    setReadinessError(null);
    setCheckingReadiness(true);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-manage-customer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authSession?.access_token}`,
          },
          body: JSON.stringify({
            action: "check_invoice_readiness",
            customer_id: customer.id,
          }),
        }
      );
      const result = await resp.json();

      if (!result.ready) {
        const missing = Array.isArray(result.missing) ? result.missing.join(", ") : "unknown fields";
        setReadinessError({
          message: `Cannot create invoice — missing: ${missing}.`,
          customerId: customer.id,
        });
        setCheckingReadiness(false);
        return;
      }

      // Fetch full customer data via get action for payment_terms, branch etc.
      const custResp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-manage-customer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authSession?.access_token}`,
          },
          body: JSON.stringify({
            action: "get",
            customer_id: customer.id,
          }),
        }
      );
      const custData = await custResp.json();
      const enrichedCustomer = {
        ...customer,
        ...custData,
        stats: customer.stats,
      };

      setSelectedCustomer(enrichedCustomer);
      setCurrentStep(2);
    } catch {
      toast.error("Failed to check invoice readiness");
    }
    setCheckingReadiness(false);
  };

  // ── Load unbilled orders (Step 2) ──
  const loadOrders = useCallback(async () => {
    if (!selectedCustomer) return;
    setLoadingOrders(true);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const body: Record<string, unknown> = {
        action: "get_unbilled_orders",
        customer_id: selectedCustomer.id,
      };
      if (dateFrom) body.date_from = dateFrom;
      if (dateTo) body.date_to = dateTo;
      if (poFilter) body.po_number = poFilter;

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-manage-customer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authSession?.access_token}`,
          },
          body: JSON.stringify(body),
        }
      );
      const result = await resp.json();
      const loadedOrders: UnbilledOrder[] = result.orders || [];
      setOrders(loadedOrders);
      setOrdersResponse({
        total_count: result.total_count || 0,
        selectable_count: result.selectable_count || 0,
        requires_po: result.requires_po || false,
        requires_client_project_number: result.requires_client_project_number || false,
      });

      // Auto-preselect order from URL params
      if (preselectOrderId) {
        const match = loadedOrders.find((o) => o.id === preselectOrderId);
        if (match && match.selectable) {
          setSelectedOrderIds((prev) => new Set(prev).add(preselectOrderId));
        }
      }
    } catch {
      toast.error("Failed to load unbilled orders");
    }
    setLoadingOrders(false);
  }, [selectedCustomer, dateFrom, dateTo, poFilter, preselectOrderId]);

  useEffect(() => {
    if (currentStep === 2) {
      loadOrders();
    }
  }, [currentStep, loadOrders]);

  // ── Auto-calculate due date when step 3 activates ──
  useEffect(() => {
    if (currentStep === 3 && selectedCustomer) {
      const terms = selectedCustomer.payment_terms || "net_30";
      const days = parseInt(terms.replace(/\D/g, ""), 10) || 30;
      const due = new Date();
      due.setDate(due.getDate() + days);
      setDueDate(due.toISOString().split("T")[0]);

      // Auto-fill PO if all selected orders share the same PO
      const selectedOrds = orders.filter((o) => selectedOrderIds.has(o.id));
      const pos = [...new Set(selectedOrds.map((o) => o.po_number).filter(Boolean))];
      if (pos.length === 1) setPoNumber(pos[0]!);
    }
  }, [currentStep]);

  // ── Helpers ──
  const selectedOrders = orders.filter((o) => selectedOrderIds.has(o.id));
  const ordersSubtotal = selectedOrders.reduce((sum, o) => sum + parseFloat(o.total_amount), 0);
  const customLinesTotal = customLines.reduce((sum, cl) => sum + cl.amount, 0);
  const preTaxSubtotal = selectedOrders.reduce((sum, o) => sum + parseFloat(o.subtotal), 0) + customLinesTotal;
  const taxRate = selectedOrders.length > 0 ? parseFloat(selectedOrders[0].tax_rate) : 0.05;
  const taxOnCustomLines = customLinesTotal * taxRate;
  const orderTaxTotal = selectedOrders.reduce((sum, o) => sum + parseFloat(o.tax_amount), 0);
  const totalTax = orderTaxTotal + taxOnCustomLines;
  const grandTotal = ordersSubtotal + customLinesTotal + taxOnCustomLines;
  const amountPaid = ordersSubtotal; // orders are already paid
  const balanceDue = Math.max(grandTotal - amountPaid, 0);

  // ── Customer Card Component ──
  const renderCustomerCard = (customer: CustomerResult, isSelected = false) => (
    <button
      key={customer.id}
      onClick={() => handleSelectCustomer(customer)}
      disabled={checkingReadiness}
      className={`w-full text-left bg-white border rounded-lg p-4 cursor-pointer hover:border-blue-400 hover:shadow-sm transition ${
        isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-gray-900 truncate">
              {customer.company_name || customer.full_name}
            </span>
            {customer.company_name && (
              <span className="text-gray-500 text-sm truncate">
                · {customer.full_name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap text-sm text-gray-500">
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {customer.customer_type}
            </span>
            <span className="flex items-center gap-1">
              <Mail className="w-3 h-3" />
              {customer.email}
            </span>
            {(customer.requires_po || customer.requires_client_project_number) && (
              <span className="flex items-center gap-1 text-amber-600">
                <AlertTriangle className="w-3 h-3" />
                {customer.requires_po && "Requires PO"}
                {customer.requires_po && customer.requires_client_project_number && " · "}
                {customer.requires_client_project_number && "Requires Project #"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
            {customer.invoicing_branch && (
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                Branch: {customer.invoicing_branch.legal_name}
              </span>
            )}
            {(customer.stats?.unbilled_orders ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {customer.stats!.unbilled_orders} unbilled order{customer.stats!.unbilled_orders !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );

  // ── Render Step 1 ──
  const renderStep1 = () => (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Customer</h2>

      {/* Search input */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search customer by name, email, or company…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full border border-gray-300 rounded-lg p-3 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
        )}
      </div>

      {/* Readiness error */}
      {readinessError && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800 mb-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p>{readinessError.message}</p>
            <a
              href={`/admin/customers/${readinessError.customerId}`}
              className="text-amber-900 underline hover:no-underline text-xs font-medium mt-1 inline-block"
            >
              Edit Customer Profile →
            </a>
          </div>
        </div>
      )}

      {/* Checking readiness spinner */}
      {checkingReadiness && (
        <div className="flex items-center gap-2 text-gray-500 text-sm mb-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Checking invoice readiness…
        </div>
      )}

      {/* Search results */}
      {searchTerm.length >= 2 && searchResults.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Search Results ({searchResults.length})
          </h3>
          <div className="space-y-2">
            {searchResults.map((c) => renderCustomerCard(c))}
          </div>
        </div>
      )}

      {searchTerm.length >= 2 && !searching && searchResults.length === 0 && (
        <p className="text-sm text-gray-500 mb-6">No customers found.</p>
      )}

      {/* Recent customers with unbilled orders */}
      <div>
        <h3 className="text-sm font-medium text-gray-500 mb-2">
          Customers with Unbilled Orders
        </h3>
        {loadingRecent ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        ) : recentCustomers.length === 0 ? (
          <p className="text-sm text-gray-500">No customers with unbilled orders.</p>
        ) : (
          <div className="space-y-2">
            {recentCustomers.map((c) => renderCustomerCard(c))}
          </div>
        )}
      </div>
    </div>
  );

  // ── Step 2: Toggle order selection ──
  const toggleOrder = (orderId: string) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const selectableOrders = orders.filter((o) => o.selectable);
  const allSelectableSelected = selectableOrders.length > 0 && selectableOrders.every((o) => selectedOrderIds.has(o.id));

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(selectableOrders.map((o) => o.id)));
    }
  };

  // Client-side order number filter
  const filteredOrders = orderNumberFilter
    ? orders.filter((o) => o.order_number.toLowerCase().includes(orderNumberFilter.toLowerCase()))
    : orders;

  const addCustomLine = () => {
    const desc = newLineDesc.trim();
    const amt = parseFloat(newLineAmount);
    if (!desc || isNaN(amt) || amt === 0) {
      toast.error("Enter a description and non-zero amount");
      return;
    }
    setCustomLines((prev) => [...prev, { id: crypto.randomUUID(), description: desc, amount: amt }]);
    setNewLineDesc("");
    setNewLineAmount("");
  };

  const removeCustomLine = (id: string) => {
    setCustomLines((prev) => prev.filter((cl) => cl.id !== id));
  };

  const customerCurrency = selectedCustomer?.preferred_currency || "CAD";
  const currSymbol = getCurrencySymbol(customerCurrency);
  const fmtMoney = (val: number) =>
    `${currSymbol}${val.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ── Render Step 2 ──
  const renderStep2 = () => (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Select Orders</h2>
      <p className="text-sm text-gray-500 mb-4 flex items-center gap-2">
        Customer: <strong>{selectedCustomer?.company_name || selectedCustomer?.full_name}</strong>
        {customerCurrency !== "CAD" && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full ${getCurrencyBadgeClasses(customerCurrency)}`}>
            {customerCurrency}
          </span>
        )}
      </p>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Date from</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Date to</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">PO #</label>
          <input
            type="text"
            value={poFilter}
            onChange={(e) => setPoFilter(e.target.value)}
            placeholder="PO number"
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-36"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Order #</label>
          <input
            type="text"
            value={orderNumberFilter}
            onChange={(e) => setOrderNumberFilter(e.target.value)}
            placeholder="Filter by order #"
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-40"
          />
        </div>
      </div>

      {/* Order list */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">
            Unbilled Orders ({ordersResponse?.selectable_count ?? 0} available)
          </h3>
          <div className="text-sm text-gray-600">
            Selected: {selectedOrderIds.size} order{selectedOrderIds.size !== 1 ? "s" : ""} ·{" "}
            Subtotal: {fmtMoney(ordersSubtotal)}
          </div>
        </div>

        {loadingOrders ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading orders…
          </div>
        ) : filteredOrders.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">No unbilled orders found.</p>
        ) : (
          <div className="space-y-1">
            {/* Select all header */}
            <div className="flex items-center gap-3 px-3 py-2 bg-gray-100 rounded-lg text-sm">
              <input
                type="checkbox"
                checked={allSelectableSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="font-medium text-gray-600">Select all</span>
            </div>

            {filteredOrders.map((order) => {
              const isSelected = selectedOrderIds.has(order.id);
              const disabled = !order.selectable;
              const paidDate = order.paid_at ? new Date(order.paid_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" }) : "";

              return (
                <div
                  key={order.id}
                  className={`bg-white border rounded-lg p-3 flex items-center gap-3 ${
                    disabled ? "opacity-50 bg-gray-50" : isSelected ? "border-blue-400 bg-blue-50" : "border-gray-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={disabled}
                    onChange={() => toggleOrder(order.id)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-900">{order.order_number}</span>
                      {paidDate && <span className="text-xs text-gray-500">{paidDate}</span>}
                      <span className="text-sm font-medium text-gray-900">{fmtMoney(parseFloat(order.total_amount))}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 flex-wrap">
                      {order.po_number && <span>PO: {order.po_number}</span>}
                      {order.client_project_number && <span>Project: {order.client_project_number}</span>}
                      {disabled && (
                        <span className="text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {order.po_missing && "Missing PO"}
                          {order.po_missing && order.project_number_missing && " · "}
                          {order.project_number_missing && "Missing Project #"}
                          {" — cannot include"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Custom line items */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Custom Line Items (optional)</h3>

        {customLines.length > 0 && (
          <div className="space-y-1 mb-3">
            {customLines.map((cl, idx) => (
              <div key={cl.id} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-2 text-sm">
                <span className="text-gray-400 w-6 text-right">{idx + 1}.</span>
                <span className="flex-1 text-gray-900">{cl.description}</span>
                <span className={`font-medium ${cl.amount < 0 ? "text-red-600" : "text-gray-900"}`}>
                  {cl.amount < 0 ? "-" : ""}{fmtMoney(Math.abs(cl.amount))}
                </span>
                <button
                  onClick={() => removeCustomLine(cl.id)}
                  className="text-gray-400 hover:text-red-500 text-lg leading-none px-1"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={newLineDesc}
            onChange={(e) => setNewLineDesc(e.target.value)}
            placeholder="Description"
            className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm"
          />
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number"
              step="0.01"
              value={newLineAmount}
              onChange={(e) => setNewLineAmount(e.target.value)}
              placeholder="0.00"
              className="w-28 border border-gray-300 rounded-md pl-6 pr-2 py-1.5 text-sm"
            />
          </div>
          <button
            onClick={addCustomLine}
            className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
          >
            Add
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">Negative amounts for credits/discounts</p>
      </div>

      {/* Summary */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Summary</h3>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Orders subtotal:</span>
            <span className="font-medium">{fmtMoney(ordersSubtotal)}</span>
          </div>
          {customLines.length > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Custom lines:</span>
              <span className={`font-medium ${customLinesTotal < 0 ? "text-red-600" : ""}`}>
                {fmtMoney(customLinesTotal)}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-gray-200 pt-1">
            <span className="text-gray-800 font-medium">Pre-tax total:</span>
            <span className="font-semibold">{fmtMoney(ordersSubtotal + customLinesTotal)}</span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => {
            setCurrentStep(1);
            setSelectedOrderIds(new Set());
            setOrders([]);
          }}
          className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-300 transition"
        >
          ← Back
        </button>
        <button
          onClick={() => setCurrentStep(3)}
          disabled={selectedOrderIds.size === 0 && customLines.length === 0}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          Continue to Review →
        </button>
      </div>
    </div>
  );

  // ── Submit invoice ──
  const handleSubmit = async (isDraft: boolean) => {
    // Validation
    if (selectedOrderIds.size === 0 && customLines.length === 0) {
      toast.error("At least one line item is required");
      return;
    }

    if (selectedCustomer?.requires_po) {
      const missingPo = selectedOrders.some((o) => !o.po_number);
      if (missingPo) {
        toast.error("All selected orders must have a PO number");
        return;
      }
    }

    setSubmitting(true);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const payload = {
        action: "create_invoice" as const,
        customer_id: selectedCustomer!.id,
        order_ids: selectedOrders.map((o) => o.id),
        custom_lines: customLines.map((cl) => ({
          description: cl.description,
          amount: cl.amount,
        })),
        as_draft: isDraft,
        staff_id: session?.staffId,
        notes: notes || undefined,
        po_number: poNumber || undefined,
      };

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-customer-invoice`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authSession?.access_token}`,
          },
          body: JSON.stringify(payload),
        }
      );
      const result = await resp.json();

      if (!resp.ok || !result.success) {
        toast.error(result.error || "Failed to create invoice");
        setSubmitting(false);
        return;
      }

      const action = isDraft ? "Draft invoice" : "Invoice";
      toast.success(`${action} ${result.invoice_number} ${isDraft ? "created" : "issued"}`);
      navigate("/admin/invoices/customer");
    } catch {
      toast.error("Network error creating invoice");
    }
    setSubmitting(false);
  };

  // ── Render Step 3 ──
  const renderStep3 = () => {
    const taxPct = (taxRate * 100).toFixed(taxRate * 100 % 1 === 0 ? 0 : 1);

    return (
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Review & Generate</h2>

        {/* Invoice details */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Invoice Details</h3>
          <div className="grid grid-cols-2 gap-y-2 gap-x-6 text-sm mb-4">
            <div>
              <span className="text-gray-500">Customer:</span>{" "}
              <span className="font-medium text-gray-900">
                {selectedCustomer?.company_name || selectedCustomer?.full_name}
                {selectedCustomer?.company_name && ` · ${selectedCustomer?.full_name}`}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Branch:</span>{" "}
              <span className="font-medium text-gray-900">
                {selectedCustomer?.invoicing_branch?.legal_name || "—"}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Invoice #:</span>{" "}
              <span className="text-gray-400 italic">Auto-generated on save</span>
            </div>
            <div>
              <span className="text-gray-500">Payment Terms:</span>{" "}
              <span className="font-medium text-gray-900">
                {selectedCustomer?.payment_terms?.replace("_", " ") || "Net 30"}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Currency:</span>{" "}
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full ${
                customerCurrency !== "CAD"
                  ? getCurrencyBadgeClasses(customerCurrency)
                  : "bg-gray-100 text-gray-600"
              }`}>
                <Lock className="w-3 h-3" />
                {customerCurrency}
              </span>
            </div>
          </div>

          {/* Editable fields */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block text-gray-500 mb-1">Invoice Date</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-gray-500 mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-gray-500 mb-1">PO Number</label>
              <input
                type="text"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="PO number"
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-gray-500 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes for this invoice…"
                rows={2}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm resize-none"
              />
            </div>
          </div>
        </div>

        {/* Line items table */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Line Items</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="pb-2 w-8">#</th>
                <th className="pb-2">Description</th>
                <th className="pb-2">PO</th>
                <th className="pb-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {selectedOrders.map((order, idx) => (
                <tr key={order.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="py-2 text-gray-400">{idx + 1}</td>
                  <td className="py-2 text-gray-900">Order {order.order_number}</td>
                  <td className="py-2 text-gray-600">{order.po_number || "—"}</td>
                  <td className="py-2 text-right font-medium text-gray-900">
                    {fmtMoney(parseFloat(order.total_amount))}
                  </td>
                </tr>
              ))}
              {customLines.map((cl, idx) => (
                <tr
                  key={cl.id}
                  className={(selectedOrders.length + idx) % 2 === 0 ? "bg-white" : "bg-gray-50"}
                >
                  <td className="py-2 text-gray-400">{selectedOrders.length + idx + 1}</td>
                  <td className="py-2 text-gray-900">{cl.description}</td>
                  <td className="py-2 text-gray-400">—</td>
                  <td className={`py-2 text-right font-medium ${cl.amount < 0 ? "text-red-600" : "text-gray-900"}`}>
                    {cl.amount < 0 ? "-" : ""}{fmtMoney(Math.abs(cl.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="space-y-1 text-sm max-w-xs ml-auto">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal:</span>
              <span className="font-medium">{fmtMoney(ordersSubtotal + customLinesTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">GST ({taxPct}%):</span>
              <span className="font-medium">{fmtMoney(totalTax)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-300 pt-1">
              <span className="text-gray-800 font-semibold">Total:</span>
              <span className="font-bold">{fmtMoney(grandTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Amount Paid:</span>
              <span className="font-medium">{fmtMoney(amountPaid)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-300 pt-1">
              <span className="text-gray-800 font-semibold">Balance Due:</span>
              <span className={`font-bold ${balanceDue <= 0 ? "text-green-600" : "text-red-600"}`}>
                {balanceDue <= 0 ? "$0.00 — PAID" : fmtMoney(balanceDue)}
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-between items-center">
          <button
            onClick={() => setCurrentStep(2)}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-300 disabled:opacity-50 transition"
          >
            ← Back
          </button>
          <div className="flex gap-3">
            <button
              onClick={() => handleSubmit(true)}
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-300 disabled:opacity-50 transition inline-flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Save as Draft
            </button>
            <button
              onClick={() => handleSubmit(false)}
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition inline-flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Create & Issue Invoice
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Create Invoice</h1>
      <StepIndicator currentStep={currentStep} />
      {currentStep === 1 && renderStep1()}
      {currentStep === 2 && renderStep2()}
      {currentStep === 3 && renderStep3()}
    </div>
  );
}
