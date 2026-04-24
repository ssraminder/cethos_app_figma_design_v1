import { useState, useEffect, useRef } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import {
  ArrowLeft,
  RefreshCw,
  Edit2,
  Save,
  X,
  Mail,
  Phone,
  Building2,
  User,
  MapPin,
  Calendar,
  ShoppingCart,
  FileText,
  CreditCard,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  TrendingUp,
  Zap,
  Loader2,
  AlertTriangle,
  Link2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Folder } from "lucide-react";
import CustomerARSummary from "@/components/admin/CustomerARSummary";
import CustomerFilesTab from "@/components/admin/CustomerFilesTab";

interface Customer {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  customer_type: string;
  company_name: string | null;
  requires_po: boolean;
  requires_client_project_number: boolean;
  billing_address_line1: string | null;
  billing_address_line2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_postal_code: string | null;
  billing_country: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  // Invoicing fields
  xtrf_customer_id: number | null;
  invoicing_branch_id: number | null;
  tax_number: string | null;
  preferred_payment_method_id: string | null;
  backup_payment_method_id: string | null;
  preferred_currency: string | null;
  payment_terms: string | null;
  is_ar_customer: boolean;
  ar_contact_email: string | null;
  accounting_contact_name: string | null;
  accounting_contact_phone: string | null;
  credit_limit: number | null;
  ar_notes: string | null;
  // Enriched objects from edge function
  invoicing_branch?: Branch | null;
  preferred_payment_method?: PaymentMethodOption | null;
  backup_payment_method?: PaymentMethodOption | null;
  invoice_ready?: boolean;
  invoice_missing?: string[];
}

interface CustomerTypeOption {
  value: string;
  label: string;
  group: string;
}

interface Branch {
  id: number;
  code: string;
  legal_name: string;
  division: string | null;
  is_default: boolean;
}

interface PaymentMethodOption {
  id: string;
  name: string;
  code: string;
  is_online: boolean;
}

interface InvoiceReadiness {
  ready: boolean;
  missing: string[];
}

interface Quote {
  id: string;
  quote_number: string;
  status: string;
  total: number;
  created_at: string;
  expires_at: string | null;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  work_status: string | null;
  total_amount: number;
  created_at: string;
  estimated_delivery_date: string | null;
  actual_delivery_date: string | null;
}

interface Payment {
  id: string;
  order_id: string;
  order_number: string;
  amount: number;
  currency: string;
  payment_type: string;
  status: string;
  created_at: string;
  receipt_url: string | null;
}

interface CustomerStats {
  totalOrders: number;
  totalSpent: number;
  avgOrderValue: number;
  firstOrderDate: string | null;
  lastOrderDate: string | null;
}

const TABS = ["profile", "quotes", "orders", "payments", "files", "stats"] as const;
type Tab = (typeof TABS)[number];

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useAdminAuthContext();

  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const originalDataRef = useRef<Partial<Customer>>({});

  // Invoicing state
  const [customerTypes, setCustomerTypes] = useState<CustomerTypeOption[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [currencies, setCurrencies] = useState<{ code: string; name: string }[]>([]);
  const [currencyWarning, setCurrencyWarning] = useState<string | null>(null);
  const [invoiceReadiness, setInvoiceReadiness] = useState<InvoiceReadiness | null>(null);
  const [xtrfSyncing, setXtrfSyncing] = useState(false);
  const [xtrfSyncResult, setXtrfSyncResult] = useState<string[] | null>(null);
  const [arExpanded, setArExpanded] = useState(false);

  // Deposit modal state
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [depositForm, setDepositForm] = useState({ amount: '', notes: '' });
  const [depositSubmitting, setDepositSubmitting] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositResult, setDepositResult] = useState<{
    payment_url: string;
    amount: number;
  } | null>(null);
  const [formData, setFormData] = useState<Partial<Customer>>({});
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<CustomerStats>({
    totalOrders: 0,
    totalSpent: 0,
    avgOrderValue: 0,
    firstOrderDate: null,
    lastOrderDate: null,
  });

  // Helper to call admin-manage-customer edge function
  const callAdminManageCustomer = async (body: Record<string, unknown>) => {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-manage-customer`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(body),
      }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Edge function error");
    return data;
  };

  // Fetch customer profile via edge function
  const fetchCustomer = async () => {
    if (!id) return;

    try {
      const data = await callAdminManageCustomer({ action: "get", customer_id: id });
      const cust = data.customer || data;
      setCustomer(cust);
      setFormData(cust);
      originalDataRef.current = { ...cust };
      if (cust.is_ar_customer) setArExpanded(true);
    } catch (error) {
      console.error("Error fetching customer:", error);
      toast.error("Failed to load customer");
      navigate("/admin/customers");
    }
  };

  // Fetch customer types for dropdown
  const fetchCustomerTypes = async () => {
    try {
      const data = await callAdminManageCustomer({ action: "list_customer_types" });
      setCustomerTypes(data.customer_types || []);
    } catch (error) {
      console.error("Error fetching customer types:", error);
    }
  };

  // Fetch branches for dropdown
  const fetchBranches = async () => {
    try {
      const data = await callAdminManageCustomer({ action: "list_branches" });
      setBranches(data.branches || []);
    } catch (error) {
      console.error("Error fetching branches:", error);
    }
  };

  // Fetch payment methods for dropdown
  const fetchPaymentMethods = async () => {
    try {
      const data = await callAdminManageCustomer({ action: "list_payment_methods" });
      setPaymentMethods(data.payment_methods || []);
    } catch (error) {
      console.error("Error fetching payment methods:", error);
    }
  };

  // Fetch active currencies for dropdown
  const fetchCurrencies = async () => {
    try {
      const { data, error } = await supabase
        .from("currencies")
        .select("code, name")
        .eq("is_active", true)
        .order("code");
      if (!error && data) setCurrencies(data);
    } catch (error) {
      console.error("Error fetching currencies:", error);
    }
  };

  // Check if changing currency would conflict with unpaid invoices
  const checkCurrencyWarning = async (newCurrency: string) => {
    if (!id || !newCurrency) {
      setCurrencyWarning(null);
      return;
    }
    const oldCurrency = customer?.preferred_currency || "CAD";
    if (newCurrency === oldCurrency) {
      setCurrencyWarning(null);
      return;
    }
    try {
      const { count } = await supabase
        .from("customer_invoices")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", id)
        .in("status", ["issued", "sent", "overdue", "partially_paid"])
        .gt("balance_due", 0)
        .neq("currency", newCurrency);
      if (count && count > 0) {
        setCurrencyWarning(
          `This customer has ${count} unpaid invoice(s) in ${oldCurrency}. Changing currency only affects future invoices.`
        );
      } else {
        setCurrencyWarning(null);
      }
    } catch {
      setCurrencyWarning(null);
    }
  };

  // Check invoice readiness
  const fetchInvoiceReadiness = async () => {
    if (!id) return;
    try {
      const data = await callAdminManageCustomer({ action: "check_invoice_readiness", customer_id: id });
      setInvoiceReadiness({ ready: data.ready, missing: data.missing || [] });
    } catch (error) {
      console.error("Error checking invoice readiness:", error);
    }
  };

  // XTRF Sync
  const handleXtrfSync = async () => {
    if (!id || !customer?.xtrf_customer_id) return;
    setXtrfSyncing(true);
    setXtrfSyncResult(null);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/xtrf-sync-customers`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ mode: "sync_single", customer_id: id }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sync failed");
      const synced = data.synced_fields || [];
      setXtrfSyncResult(synced);
      if (synced.length > 0) {
        toast.success(`Synced: ${synced.join(", ")}`);
        await fetchCustomer();
        await fetchInvoiceReadiness();
      } else {
        toast.info("No new data found in XTRF");
      }
    } catch (error: any) {
      console.error("XTRF sync error:", error);
      toast.error(error.message || "Failed to sync from XTRF");
    } finally {
      setXtrfSyncing(false);
    }
  };

  // Fetch quotes
  const fetchQuotes = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, status, total, created_at, expires_at")
        .eq("customer_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setQuotes(data || []);
    } catch (error) {
      console.error("Error fetching quotes:", error);
    }
  };

  // Fetch orders
  const fetchOrders = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, work_status, total_amount, created_at, estimated_delivery_date, actual_delivery_date"
        )
        .eq("customer_id", id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setOrders(data || []);

      // Calculate stats
      if (data && data.length > 0) {
        const totalSpent = data.reduce((sum, o) => sum + (o.total_amount || 0), 0);
        const dates = data.map((o) => o.created_at).sort();

        setStats({
          totalOrders: data.length,
          totalSpent,
          avgOrderValue: totalSpent / data.length,
          firstOrderDate: dates[0],
          lastOrderDate: dates[dates.length - 1],
        });
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
    }
  };

  // Fetch payments
  const fetchPayments = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .from("payments")
        .select(
          `
          id,
          order_id,
          amount,
          currency,
          payment_type,
          status,
          created_at,
          receipt_url,
          orders!inner(order_number, customer_id)
        `
        )
        .eq("orders.customer_id", id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const transformed = (data || []).map((p: any) => ({
        id: p.id,
        order_id: p.order_id,
        order_number: p.orders?.order_number || "",
        amount: p.amount || 0,
        currency: p.currency || "CAD",
        payment_type: p.payment_type || "",
        status: p.status || "",
        created_at: p.created_at,
        receipt_url: p.receipt_url,
      }));

      setPayments(transformed);
    } catch (error) {
      console.error("Error fetching payments:", error);
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    await Promise.all([
      fetchCustomer(),
      fetchQuotes(),
      fetchOrders(),
      fetchPayments(),
      fetchBranches(),
      fetchPaymentMethods(),
      fetchCustomerTypes(),
      fetchCurrencies(),
      fetchInvoiceReadiness(),
    ]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAllData();
  }, [id]);

  // Handle form changes
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value || null }));
  };

  // Save customer profile — only send changed fields
  const handleSave = async () => {
    if (!id || !formData) return;

    setSaving(true);
    try {
      const updatableFields = [
        "full_name", "email", "phone", "customer_type", "company_name",
        "billing_address_line1", "billing_address_line2", "billing_city",
        "billing_state", "billing_postal_code", "billing_country",
        "invoicing_branch_id", "tax_number", "preferred_payment_method_id",
        "backup_payment_method_id", "preferred_currency", "payment_terms",
        "is_ar_customer", "ar_contact_email", "accounting_contact_name",
        "accounting_contact_phone", "credit_limit", "ar_notes",
        "requires_po", "requires_client_project_number",
      ] as const;

      const changes: Record<string, unknown> = {};
      for (const field of updatableFields) {
        const newVal = (formData as any)[field] ?? null;
        const oldVal = (originalDataRef.current as any)[field] ?? null;
        if (newVal !== oldVal) {
          changes[field] = newVal;
        }
      }

      if (Object.keys(changes).length === 0) {
        toast.info("No changes to save");
        setEditing(false);
        setSaving(false);
        return;
      }

      await callAdminManageCustomer({
        action: "update",
        customer_id: id,
        ...changes,
      });

      toast.success("Customer updated");
      setEditing(false);
      await fetchCustomer();
      await fetchInvoiceReadiness();
    } catch (error: any) {
      console.error("Error saving customer:", error);
      toast.error(error.message || "Failed to save customer");
    } finally {
      setSaving(false);
    }
  };

  // Cancel editing
  const handleCancel = () => {
    setFormData(customer || {});
    setEditing(false);
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-6">
        <p className="text-center text-gray-500">Customer not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            to="/admin/customers"
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-900">
                {customer.full_name || "Unnamed Customer"}
              </h1>
              <CustomerTypeBadge type={customer.customer_type} />
            </div>
            <p className="text-sm text-gray-500 mt-1">{customer.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setDepositModalOpen(true);
              setDepositForm({ amount: '', notes: '' });
              setDepositError(null);
              setDepositResult(null);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
          >
            <Zap className="w-4 h-4" />
            Request Deposit
          </button>
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              Edit
            </button>
          ) : (
            <>
              <button
                onClick={handleCancel}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save
              </button>
            </>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <ShoppingCart className="w-4 h-4" />
            <span className="text-sm">Total Orders</span>
          </div>
          <p className="text-2xl font-semibold text-gray-900">{stats.totalOrders}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <DollarSign className="w-4 h-4" />
            <span className="text-sm">Total Spent</span>
          </div>
          <p className="text-2xl font-semibold text-green-600">
            ${stats.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">Avg Order Value</span>
          </div>
          <p className="text-2xl font-semibold text-blue-600">
            ${stats.avgOrderValue.toFixed(2)}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Calendar className="w-4 h-4" />
            <span className="text-sm">Customer Since</span>
          </div>
          <p className="text-2xl font-semibold text-gray-900">
            {format(parseISO(customer.created_at), "MMM yyyy")}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab("profile")}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "profile"
                  ? "border-teal-500 text-teal-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <User className="w-4 h-4 inline mr-2" />
              Profile
            </button>
            <button
              onClick={() => setActiveTab("quotes")}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "quotes"
                  ? "border-teal-500 text-teal-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <FileText className="w-4 h-4 inline mr-2" />
              Quotes
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                {quotes.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("orders")}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "orders"
                  ? "border-teal-500 text-teal-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <ShoppingCart className="w-4 h-4 inline mr-2" />
              Orders
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                {orders.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("payments")}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "payments"
                  ? "border-teal-500 text-teal-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <CreditCard className="w-4 h-4 inline mr-2" />
              Payments
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                {payments.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("files")}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "files"
                  ? "border-teal-500 text-teal-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Folder className="w-4 h-4 inline mr-2" />
              Files
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* Profile Tab */}
          {activeTab === "profile" && (
            <div className="space-y-8">
              {/* Section 1: Customer Info + Billing Address (2-col) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Contact Information */}
                <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-semibold text-gray-800 mb-4">
                    Contact Information
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                      {editing ? (
                        <input type="text" name="full_name" value={formData.full_name || ""} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500" />
                      ) : (
                        <p className="text-gray-900">{customer.full_name || "—"}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                      {editing ? (
                        <input type="email" name="email" value={formData.email || ""} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500" />
                      ) : (
                        <a href={`mailto:${customer.email}`} className="flex items-center gap-2 text-teal-600 hover:text-teal-700">
                          <Mail className="w-4 h-4" />{customer.email}
                        </a>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                      {editing ? (
                        <input type="tel" name="phone" value={formData.phone || ""} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500" />
                      ) : customer.phone ? (
                        <a href={`tel:${customer.phone}`} className="flex items-center gap-2 text-teal-600 hover:text-teal-700">
                          <Phone className="w-4 h-4" />{customer.phone}
                        </a>
                      ) : (
                        <p className="text-gray-400">—</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Customer Type</label>
                      {editing ? (
                        <>
                          <select name="customer_type" value={formData.customer_type || "individual"} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500">
                            {/* Keep legacy "business" as fallback if current value is "business" */}
                            {formData.customer_type === "business" && (
                              <option value="business">Business (legacy — select a specific type)</option>
                            )}
                            {(() => {
                              const groups = customerTypes.reduce<Record<string, CustomerTypeOption[]>>((acc, ct) => {
                                if (!acc[ct.group]) acc[ct.group] = [];
                                acc[ct.group].push(ct);
                                return acc;
                              }, {});
                              return Object.entries(groups).map(([group, types]) => (
                                <optgroup key={group} label={group}>
                                  {types.map((ct) => (
                                    <option key={ct.value} value={ct.value}>{ct.label}</option>
                                  ))}
                                </optgroup>
                              ));
                            })()}
                          </select>
                          {(formData.customer_type === "lsp" || formData.customer_type?.startsWith("government_")) && (
                            <p className="text-xs text-amber-600 mt-1">
                              This customer type typically requires PO numbers. Enable below in Invoicing Requirements.
                            </p>
                          )}
                        </>
                      ) : (
                        <CustomerTypeBadge type={customer.customer_type} />
                      )}
                    </div>
                    {(editing ? formData.customer_type !== "individual" : customer.customer_type !== "individual") && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                        {editing ? (
                          <input type="text" name="company_name" value={formData.company_name || ""} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500" />
                        ) : (
                          <div className="flex items-center gap-2 text-gray-900">
                            <Building2 className="w-4 h-4 text-gray-400" />
                            {customer.company_name || "—"}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Account Info */}
                    <div className="pt-4 mt-4 border-t border-gray-100">
                      <h4 className="text-sm font-medium text-gray-500 mb-2">Account Info</h4>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Created</span>
                          <span className="text-gray-900">{format(parseISO(customer.created_at), "MMM d, yyyy h:mm a")}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Last Updated</span>
                          <span className="text-gray-900">{format(parseISO(customer.updated_at), "MMM d, yyyy h:mm a")}</span>
                        </div>
                        {customer.last_login_at && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Last Login</span>
                            <span className="text-gray-900">{format(parseISO(customer.last_login_at), "MMM d, yyyy h:mm a")}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 2: Billing Address */}
                <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-semibold text-gray-800 mb-4">
                    <MapPin className="w-4 h-4 inline mr-2" />
                    Billing Address
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1</label>
                      {editing ? (
                        <input type="text" name="billing_address_line1" value={formData.billing_address_line1 || ""} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500" />
                      ) : (
                        <p className="text-gray-900">{customer.billing_address_line1 || "—"}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2</label>
                      {editing ? (
                        <input type="text" name="billing_address_line2" value={formData.billing_address_line2 || ""} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500" />
                      ) : (
                        <p className="text-gray-900">{customer.billing_address_line2 || "—"}</p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                        {editing ? (
                          <input type="text" name="billing_city" value={formData.billing_city || ""} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500" />
                        ) : (
                          <p className="text-gray-900">{customer.billing_city || "—"}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Province/State</label>
                        {editing ? (
                          <input type="text" name="billing_state" value={formData.billing_state || ""} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500" />
                        ) : (
                          <p className="text-gray-900">{customer.billing_state || "—"}</p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
                        {editing ? (
                          <input type="text" name="billing_postal_code" value={formData.billing_postal_code || ""} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500" />
                        ) : (
                          <p className="text-gray-900">{customer.billing_postal_code || "—"}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                        {editing ? (
                          <select name="billing_country" value={formData.billing_country || ""} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500">
                            <option value="">Select country</option>
                            <option value="Canada">Canada</option>
                            <option value="United States">United States</option>
                            <option value="United Kingdom">United Kingdom</option>
                            <option value="Australia">Australia</option>
                            <option value="Other">Other</option>
                          </select>
                        ) : (
                          <p className="text-gray-900">{customer.billing_country || "—"}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Invoicing & Accounting */}
              <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <h3 className="text-base font-semibold text-gray-800 mb-4">
                  <FileText className="w-4 h-4 inline mr-2" />
                  Invoicing & Accounting
                </h3>

                {/* Invoicing Requirements subsection */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-gray-600 border-b border-gray-100 pb-1 mb-3">Invoicing Requirements</h4>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      {editing ? (
                        <input
                          type="checkbox"
                          checked={!!formData.requires_po}
                          onChange={(e) => setFormData((prev) => ({ ...prev, requires_po: e.target.checked }))}
                          className="mt-0.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                        />
                      ) : (
                        <span className={`mt-0.5 text-sm ${customer.requires_po ? "text-teal-600" : "text-gray-400"}`}>
                          {customer.requires_po ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        </span>
                      )}
                      <div>
                        <label className="text-sm font-medium text-gray-700">Requires Purchase Order (PO) on all orders</label>
                        <p className="text-xs text-gray-500 ml-0">
                          When enabled, orders without a PO number cannot be included on invoices for this customer.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      {editing ? (
                        <input
                          type="checkbox"
                          checked={!!formData.requires_client_project_number}
                          onChange={(e) => setFormData((prev) => ({ ...prev, requires_client_project_number: e.target.checked }))}
                          className="mt-0.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                        />
                      ) : (
                        <span className={`mt-0.5 text-sm ${customer.requires_client_project_number ? "text-teal-600" : "text-gray-400"}`}>
                          {customer.requires_client_project_number ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        </span>
                      )}
                      <div>
                        <label className="text-sm font-medium text-gray-700">Requires Client Project Number on all orders</label>
                        <p className="text-xs text-gray-500 ml-0">
                          When enabled, orders without a client project number cannot be included on invoices for this customer.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left column */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Invoicing Branch *
                      </label>
                      {editing ? (
                        <select
                          name="invoicing_branch_id"
                          value={formData.invoicing_branch_id ?? ""}
                          onChange={(e) => setFormData((prev) => ({ ...prev, invoicing_branch_id: e.target.value ? Number(e.target.value) : null }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500"
                        >
                          <option value="">Select branch</option>
                          {branches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.legal_name}{b.division ? ` — ${b.division}` : ""}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-gray-900">
                          {(() => {
                            const branch = customer.invoicing_branch || branches.find(b => b.id === customer.invoicing_branch_id);
                            if (!branch) return "Not set";
                            return (
                              <>
                                {branch.legal_name}
                                {branch.division && (
                                  <span className="block text-xs text-gray-500">{branch.division}</span>
                                )}
                              </>
                            );
                          })()}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 italic mt-1">
                        All quote-flow orders are invoiced under 12537494 Canada Inc. regardless of this setting.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Billing Currency</label>
                      {editing ? (
                        <>
                          <select
                            name="preferred_currency"
                            value={formData.preferred_currency || "CAD"}
                            onChange={(e) => {
                              handleChange(e);
                              checkCurrencyWarning(e.target.value);
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500"
                          >
                            {currencies.length > 0 ? (
                              currencies.map((c) => (
                                <option key={c.code} value={c.code}>
                                  {c.code} — {c.name}
                                </option>
                              ))
                            ) : (
                              <>
                                <option value="CAD">CAD — Canadian Dollar</option>
                                <option value="USD">USD — US Dollar</option>
                                <option value="EUR">EUR — Euro</option>
                                <option value="GBP">GBP — British Pound</option>
                              </>
                            )}
                          </select>
                          <p className="text-xs text-gray-500 mt-1">
                            All invoices for this customer will be generated in this currency
                          </p>
                          {currencyWarning && (
                            <div className="flex items-start gap-1.5 mt-2 p-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-700">
                              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                              <span>{currencyWarning}</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-gray-900">{customer.preferred_currency || "CAD"}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            All invoices for this customer will be generated in this currency
                          </p>
                        </>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tax Number
                      </label>
                      {editing ? (
                        <input type="text" name="tax_number" value={formData.tax_number || ""} onChange={handleChange} placeholder="e.g. 123456789 RT0001" className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500" />
                      ) : (
                        <p className="text-gray-900">
                          {customer.tax_number || "—"}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-0.5">GST/HST registration</p>
                    </div>
                  </div>

                  {/* Right column — Payment */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-gray-600 border-b border-gray-100 pb-1">Payment</h4>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Method</label>
                      {editing ? (
                        <select
                          name="preferred_payment_method_id"
                          value={formData.preferred_payment_method_id || ""}
                          onChange={handleChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500"
                        >
                          <option value="">Not set</option>
                          {paymentMethods.filter(pm => !['stripe', 'online'].includes(pm.code)).map((pm) => (
                            <option key={pm.id} value={pm.id}>{pm.name}</option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-gray-900">{customer.preferred_payment_method?.name || "—"}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Backup Method</label>
                      {editing ? (
                        <select
                          name="backup_payment_method_id"
                          value={formData.backup_payment_method_id || ""}
                          onChange={handleChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500"
                        >
                          <option value="">Not set</option>
                          {paymentMethods.filter(pm => !['stripe', 'online'].includes(pm.code)).map((pm) => (
                            <option key={pm.id} value={pm.id}>{pm.name}</option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-gray-900">{customer.backup_payment_method?.name || "—"}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
                      {editing ? (
                        <select name="payment_terms" value={formData.payment_terms || ""} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500">
                          <option value="">Select terms</option>
                          <option value="due_on_receipt">Due on Receipt</option>
                          <option value="net_15">Net 15</option>
                          <option value="net_30">Net 30</option>
                          <option value="net_45">Net 45</option>
                          <option value="net_60">Net 60</option>
                        </select>
                      ) : (
                        <p className="text-gray-900">
                          {customer.payment_terms ? customer.payment_terms.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* AR Account section — collapsible */}
                <div className="mt-6 border-t border-gray-100 pt-4">
                  <div className="flex items-center gap-3 mb-3">
                    {editing ? (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!formData.is_ar_customer}
                          onChange={(e) => {
                            setFormData((prev) => ({ ...prev, is_ar_customer: e.target.checked }));
                            setArExpanded(e.target.checked);
                          }}
                          className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                        />
                        <span className="text-sm font-semibold text-gray-700">Accounts Receivable Customer</span>
                      </label>
                    ) : (
                      <button
                        onClick={() => setArExpanded(!arExpanded)}
                        className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900"
                      >
                        {arExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        AR Account
                        {customer.is_ar_customer && (
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">Active</span>
                        )}
                      </button>
                    )}
                  </div>

                  {arExpanded && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-0 md:pl-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">AR Contact Email</label>
                        {editing ? (
                          <input type="email" name="ar_contact_email" value={formData.ar_contact_email || ""} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500" />
                        ) : (
                          <p className="text-gray-900">{customer.ar_contact_email || "—"}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Accounting Contact</label>
                        {editing ? (
                          <input type="text" name="accounting_contact_name" value={formData.accounting_contact_name || ""} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500" />
                        ) : (
                          <p className="text-gray-900">{customer.accounting_contact_name || "—"}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Accounting Phone</label>
                        {editing ? (
                          <input type="tel" name="accounting_contact_phone" value={formData.accounting_contact_phone || ""} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500" />
                        ) : (
                          <p className="text-gray-900">{customer.accounting_contact_phone || "—"}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Credit Limit</label>
                        {editing ? (
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                            <input
                              type="number"
                              name="credit_limit"
                              value={formData.credit_limit ?? ""}
                              onChange={(e) => setFormData((prev) => ({ ...prev, credit_limit: e.target.value ? Number(e.target.value) : null }))}
                              className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500"
                            />
                          </div>
                        ) : (
                          <p className="text-gray-900">{customer.credit_limit != null ? `$${customer.credit_limit.toLocaleString()}` : "—"}</p>
                        )}
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">AR Notes</label>
                        {editing ? (
                          <textarea name="ar_notes" value={formData.ar_notes || ""} onChange={handleChange} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500 resize-none" />
                        ) : (
                          <p className="text-gray-900 whitespace-pre-wrap">{customer.ar_notes || "—"}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Invoice Readiness */}
                <div className="mt-6 border-t border-gray-100 pt-4">
                  <h4 className="text-sm font-semibold text-gray-600 mb-2">Invoice Readiness</h4>
                  {invoiceReadiness ? (
                    invoiceReadiness.ready ? (
                      <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-3 py-2 text-sm">
                        <CheckCircle className="w-4 h-4" />
                        Ready for invoicing
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 text-amber-700 bg-amber-50 rounded-lg px-3 py-2 text-sm">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-medium">Missing:</span>{" "}
                          {invoiceReadiness.missing.map((f) => f.replace(/_/g, " ")).join(", ")}
                        </div>
                      </div>
                    )
                  ) : (
                    <p className="text-sm text-gray-400">Checking...</p>
                  )}
                </div>
              </div>

              {/* Section: Accounts Receivable Summary */}
              <CustomerARSummary customerId={customer.id} customerName={customer.full_name} />

              {/* Section 4: XTRF Sync — only if customer has xtrf_customer_id */}
              {customer.xtrf_customer_id && (
                <div className="bg-blue-50 rounded-lg border border-blue-200 p-6 shadow-sm">
                  <h3 className="text-base font-semibold text-gray-800 mb-4">
                    <Link2 className="w-4 h-4 inline mr-2" />
                    XTRF Integration
                  </h3>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="text-sm text-gray-700">
                      <span className="font-medium">XTRF Customer ID:</span> {customer.xtrf_customer_id}
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                      <CheckCircle className="w-3 h-3" /> Linked
                    </span>
                  </div>
                  <button
                    onClick={handleXtrfSync}
                    disabled={xtrfSyncing}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                  >
                    {xtrfSyncing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Sync from XTRF
                  </button>
                  {xtrfSyncResult && (
                    <p className="text-sm text-gray-600 mt-3">
                      {xtrfSyncResult.length > 0
                        ? `Last synced fields: ${xtrfSyncResult.join(", ")}`
                        : "No new data found in XTRF"}
                    </p>
                  )}
                </div>
              )}

              {/* Save Button */}
              {editing && (
                <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 -mx-6 -mb-6 px-6 py-4 flex justify-end gap-3 rounded-b-xl">
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Changes
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Quotes Tab */}
          {activeTab === "quotes" && (
            <div className="overflow-x-auto">
              {quotes.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p>No quotes found for this customer</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Quote
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Total
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Created
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Expires
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {quotes.map((quote) => (
                      <tr key={quote.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Link
                            to={`/admin/quotes/${quote.id}`}
                            className="text-sm font-semibold text-gray-900 font-mono hover:text-teal-600"
                          >
                            {quote.quote_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <QuoteStatusBadge status={quote.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-semibold text-gray-900 tabular-nums">
                            ${(quote.total || 0).toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {format(parseISO(quote.created_at), "MMM d, yyyy")}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {quote.expires_at
                            ? format(parseISO(quote.expires_at), "MMM d, yyyy")
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Orders Tab */}
          {activeTab === "orders" && (
            <div className="overflow-x-auto">
              {orders.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <ShoppingCart className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p>No orders found for this customer</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Order
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Total
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Created
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Delivery
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {orders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Link
                            to={`/admin/orders/${order.id}`}
                            className="text-sm font-semibold text-gray-900 font-mono hover:text-teal-600"
                          >
                            {order.order_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <OrderStatusBadge status={order.status} />
                            {order.work_status && (
                              <WorkStatusBadge status={order.work_status} />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-semibold text-gray-900 tabular-nums">
                            ${(order.total_amount || 0).toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {format(parseISO(order.created_at), "MMM d, yyyy")}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {order.actual_delivery_date
                            ? format(parseISO(order.actual_delivery_date), "MMM d, yyyy")
                            : order.estimated_delivery_date
                              ? format(parseISO(order.estimated_delivery_date), "MMM d, yyyy")
                              : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Payments Tab */}
          {activeTab === "payments" && (
            <div className="overflow-x-auto">
              {payments.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <CreditCard className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p>No payments found for this customer</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Order
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Date
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-16">
                        Receipt
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {payments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Link
                            to={`/admin/orders/${payment.order_id}`}
                            className="text-sm font-semibold text-gray-900 font-mono hover:text-teal-600"
                          >
                            {payment.order_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`text-sm font-semibold tabular-nums ${
                              payment.payment_type === "refund"
                                ? "text-red-600"
                                : "text-gray-900"
                            }`}
                          >
                            {payment.payment_type === "refund" ? "-" : ""}$
                            {payment.amount.toFixed(2)}
                          </span>
                          <p className="text-xs text-gray-500">{payment.currency}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 capitalize">
                          {payment.payment_type}
                        </td>
                        <td className="px-4 py-3">
                          <PaymentStatusBadge status={payment.status} />
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-gray-700">
                            {format(parseISO(payment.created_at), "MMM d, yyyy")}
                          </p>
                          <p className="text-xs text-gray-500">
                            {format(parseISO(payment.created_at), "h:mm a")}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {payment.receipt_url && (
                            <a
                              href={payment.receipt_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700"
                            >
                              <ArrowUpRight className="w-4 h-4" />
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Files Tab */}
          {activeTab === "files" && customer?.id && (
            <CustomerFilesTab customerId={customer.id} />
          )}
        </div>
      </div>

      {/* Deposit Modal */}
      {depositModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">

            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Request Deposit</h2>
                <p className="text-sm text-gray-500 mt-0.5">{customer?.full_name} · {customer?.email}</p>
              </div>
              <button
                onClick={() => setDepositModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {depositResult ? (
                /* Success state */
                <div className="text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">Payment Link Sent!</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    A deposit link for ${depositResult.amount.toFixed(2)} CAD has been sent to {customer?.email}
                  </p>
                  <div className="bg-gray-50 rounded-lg p-3 mb-4 text-left">
                    <p className="text-xs text-gray-500 mb-1">Payment URL</p>
                    <p className="text-xs text-blue-600 break-all font-mono">{depositResult.payment_url}</p>
                  </div>
                  <button
                    onClick={() => {
                      setDepositModalOpen(false);
                      setDepositResult(null);
                      fetchCustomer();
                    }}
                    className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
                  >
                    Done
                  </button>
                </div>
              ) : (
                /* Form state */
                <div className="space-y-4">
                  {/* Customer info (read-only) */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-0.5">Sending to</p>
                    <p className="text-sm font-medium text-gray-900">{customer?.full_name}</p>
                    <p className="text-sm text-gray-500">{customer?.email}</p>
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Amount (CAD) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={depositForm.amount}
                      onChange={(e) => {
                        setDepositForm(f => ({ ...f, amount: e.target.value }));
                        setDepositError(null);
                      }}
                      placeholder="150.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {depositForm.amount && parseFloat(depositForm.amount) > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        ${parseFloat(depositForm.amount).toFixed(2)} CAD
                      </p>
                    )}
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notes / Description <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <textarea
                      rows={3}
                      value={depositForm.notes}
                      onChange={(e) => setDepositForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="e.g. 2 birth certificates, Spanish to English — IRCC spousal sponsorship"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    />
                    <p className="text-xs text-gray-400 mt-1">Shown in the customer's email</p>
                  </div>

                  {/* Error */}
                  {depositError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm text-red-700">{depositError}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setDepositModalOpen(false)}
                      className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (!depositForm.amount || parseFloat(depositForm.amount) <= 0) {
                          setDepositError('Please enter a valid amount');
                          return;
                        }
                        setDepositSubmitting(true);
                        setDepositError(null);
                        try {
                          const response = await fetch(
                            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-deposit-payment-link`,
                            {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                              },
                              body: JSON.stringify({
                                email: customer?.email,
                                full_name: customer?.full_name,
                                phone: customer?.phone || null,
                                amount: parseFloat(depositForm.amount),
                                notes: depositForm.notes?.trim() || null,
                                staff_id: session?.staffId,
                              }),
                            }
                          );
                          const data = await response.json();
                          if (!data.success) throw new Error(data.error || 'Failed to generate link');
                          setDepositResult({ payment_url: data.payment_url, amount: data.amount });
                        } catch (err: any) {
                          setDepositError(err.message || 'Something went wrong');
                        } finally {
                          setDepositSubmitting(false);
                        }
                      }}
                      disabled={depositSubmitting || !depositForm.amount || parseFloat(depositForm.amount) <= 0}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {depositSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4" />
                          Send Link
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Badge Components
const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  individual: "Individual",
  business: "Business",
  corporate: "Corporate",
  sme: "Small/Medium Business",
  lsp: "Language Service Provider",
  legal: "Law Firm / Legal",
  immigration: "Immigration Consultant",
  government_federal: "Government (Federal)",
  government_provincial: "Government (Provincial)",
  government_municipal: "Government (Municipal)",
  non_profit: "Non-Profit Organization",
  educational: "Educational Institution",
  registry: "Registry / Vital Stats",
};

const CUSTOMER_TYPE_STYLES: Record<string, string> = {
  individual: "bg-blue-100 text-blue-700",
  business: "bg-purple-100 text-purple-700",
  corporate: "bg-purple-100 text-purple-700",
  sme: "bg-purple-100 text-purple-700",
  lsp: "bg-indigo-100 text-indigo-700",
  legal: "bg-violet-100 text-violet-700",
  immigration: "bg-violet-100 text-violet-700",
  government_federal: "bg-amber-100 text-amber-700",
  government_provincial: "bg-amber-100 text-amber-700",
  government_municipal: "bg-amber-100 text-amber-700",
  non_profit: "bg-emerald-100 text-emerald-700",
  educational: "bg-emerald-100 text-emerald-700",
  registry: "bg-emerald-100 text-emerald-700",
};

function CustomerTypeBadge({ type }: { type: string }) {
  const label = CUSTOMER_TYPE_LABELS[type] || type;
  const style = CUSTOMER_TYPE_STYLES[type] || "bg-gray-100 text-gray-700";
  const Icon = type === "individual" ? User : Building2;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full ${style}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function QuoteStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    details_pending: "bg-amber-100 text-amber-700",
    quote_ready: "bg-blue-100 text-blue-700",
    awaiting_payment: "bg-amber-100 text-amber-700",
    paid: "bg-green-100 text-green-700",
    converted: "bg-green-100 text-green-700",
    expired: "bg-red-100 text-red-700",
  };

  const formatStatus = (s: string) =>
    s
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

  return (
    <span
      className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${styles[status] || "bg-gray-100 text-gray-700"}`}
    >
      {formatStatus(status)}
    </span>
  );
}

function OrderStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    paid: "bg-green-100 text-green-700",
    balance_due: "bg-red-100 text-red-700",
    in_production: "bg-blue-100 text-blue-700",
    delivered: "bg-green-100 text-green-700",
    completed: "bg-green-100 text-green-700",
    cancelled: "bg-gray-100 text-gray-700",
  };

  const formatStatus = (s: string) =>
    s
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

  return (
    <span
      className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${styles[status] || "bg-gray-100 text-gray-700"}`}
    >
      {formatStatus(status)}
    </span>
  );
}

function WorkStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    queued: "bg-gray-100 text-gray-600",
    in_progress: "bg-blue-100 text-blue-700",
    review: "bg-amber-100 text-amber-700",
    completed: "bg-green-100 text-green-700",
  };

  const formatStatus = (s: string) =>
    s
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

  return (
    <span
      className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${styles[status] || "bg-gray-100 text-gray-600"}`}
    >
      {formatStatus(status)}
    </span>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const config: Record<string, { style: string; icon: React.ReactNode }> = {
    succeeded: {
      style: "bg-green-100 text-green-700",
      icon: <CheckCircle className="w-3 h-3" />,
    },
    pending: {
      style: "bg-amber-100 text-amber-700",
      icon: <Clock className="w-3 h-3" />,
    },
    failed: {
      style: "bg-red-100 text-red-700",
      icon: <XCircle className="w-3 h-3" />,
    },
    refunded: {
      style: "bg-gray-100 text-gray-700",
      icon: <CreditCard className="w-3 h-3" />,
    },
  };

  const { style, icon } = config[status] || {
    style: "bg-gray-100 text-gray-700",
    icon: null,
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full capitalize ${style}`}
    >
      {icon}
      {status}
    </span>
  );
}
