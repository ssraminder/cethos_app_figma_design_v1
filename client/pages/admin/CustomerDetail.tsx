import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
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
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

interface Customer {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  customer_type: "individual" | "business";
  company_name: string | null;
  billing_address_line1: string | null;
  billing_address_line2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_postal_code: string | null;
  billing_country: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
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

const TABS = ["profile", "quotes", "orders", "payments", "stats"] as const;
type Tab = (typeof TABS)[number];

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const [customer, setCustomer] = useState<Customer | null>(null);
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

  // Fetch customer profile
  const fetchCustomer = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      setCustomer(data);
      setFormData(data);
    } catch (error) {
      console.error("Error fetching customer:", error);
      toast.error("Failed to load customer");
      navigate("/admin/customers");
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
    await Promise.all([fetchCustomer(), fetchQuotes(), fetchOrders(), fetchPayments()]);
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

  // Save customer profile
  const handleSave = async () => {
    if (!id || !formData) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("customers")
        .update({
          full_name: formData.full_name,
          email: formData.email,
          phone: formData.phone,
          customer_type: formData.customer_type,
          company_name: formData.company_name,
          billing_address_line1: formData.billing_address_line1,
          billing_address_line2: formData.billing_address_line2,
          billing_city: formData.billing_city,
          billing_state: formData.billing_state,
          billing_postal_code: formData.billing_postal_code,
          billing_country: formData.billing_country,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

      toast.success("Customer updated successfully");
      setEditing(false);
      fetchCustomer();
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
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* Profile Tab */}
          {activeTab === "profile" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Contact Information */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Contact Information
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Full Name *
                    </label>
                    {editing ? (
                      <input
                        type="text"
                        name="full_name"
                        value={formData.full_name || ""}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                      />
                    ) : (
                      <p className="text-gray-900">{customer.full_name || "—"}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email *
                    </label>
                    {editing ? (
                      <input
                        type="email"
                        name="email"
                        value={formData.email || ""}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                      />
                    ) : (
                      <a
                        href={`mailto:${customer.email}`}
                        className="flex items-center gap-2 text-teal-600 hover:text-teal-700"
                      >
                        <Mail className="w-4 h-4" />
                        {customer.email}
                      </a>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone
                    </label>
                    {editing ? (
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone || ""}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                      />
                    ) : customer.phone ? (
                      <a
                        href={`tel:${customer.phone}`}
                        className="flex items-center gap-2 text-teal-600 hover:text-teal-700"
                      >
                        <Phone className="w-4 h-4" />
                        {customer.phone}
                      </a>
                    ) : (
                      <p className="text-gray-400">—</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Customer Type
                    </label>
                    {editing ? (
                      <select
                        name="customer_type"
                        value={formData.customer_type || "individual"}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="individual">Individual</option>
                        <option value="business">Business</option>
                      </select>
                    ) : (
                      <CustomerTypeBadge type={customer.customer_type} />
                    )}
                  </div>
                  {(editing || customer.customer_type === "business") && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Company Name
                      </label>
                      {editing ? (
                        <input
                          type="text"
                          name="company_name"
                          value={formData.company_name || ""}
                          onChange={handleChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                        />
                      ) : (
                        <div className="flex items-center gap-2 text-gray-900">
                          <Building2 className="w-4 h-4 text-gray-400" />
                          {customer.company_name || "—"}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Billing Address */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Billing Address
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Address Line 1
                    </label>
                    {editing ? (
                      <input
                        type="text"
                        name="billing_address_line1"
                        value={formData.billing_address_line1 || ""}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                      />
                    ) : (
                      <p className="text-gray-900">
                        {customer.billing_address_line1 || "—"}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Address Line 2
                    </label>
                    {editing ? (
                      <input
                        type="text"
                        name="billing_address_line2"
                        value={formData.billing_address_line2 || ""}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                      />
                    ) : (
                      <p className="text-gray-900">
                        {customer.billing_address_line2 || "—"}
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        City
                      </label>
                      {editing ? (
                        <input
                          type="text"
                          name="billing_city"
                          value={formData.billing_city || ""}
                          onChange={handleChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                        />
                      ) : (
                        <p className="text-gray-900">{customer.billing_city || "—"}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        State/Province
                      </label>
                      {editing ? (
                        <input
                          type="text"
                          name="billing_state"
                          value={formData.billing_state || ""}
                          onChange={handleChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                        />
                      ) : (
                        <p className="text-gray-900">{customer.billing_state || "—"}</p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Postal Code
                      </label>
                      {editing ? (
                        <input
                          type="text"
                          name="billing_postal_code"
                          value={formData.billing_postal_code || ""}
                          onChange={handleChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                        />
                      ) : (
                        <p className="text-gray-900">
                          {customer.billing_postal_code || "—"}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Country
                      </label>
                      {editing ? (
                        <input
                          type="text"
                          name="billing_country"
                          value={formData.billing_country || ""}
                          onChange={handleChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                        />
                      ) : (
                        <p className="text-gray-900">
                          {customer.billing_country || "—"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Account Info */}
                <div className="mt-8">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Account Info
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Created</span>
                      <span className="text-gray-900">
                        {format(parseISO(customer.created_at), "MMM d, yyyy h:mm a")}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Last Updated</span>
                      <span className="text-gray-900">
                        {format(parseISO(customer.updated_at), "MMM d, yyyy h:mm a")}
                      </span>
                    </div>
                    {customer.last_login_at && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Last Login</span>
                        <span className="text-gray-900">
                          {format(parseISO(customer.last_login_at), "MMM d, yyyy h:mm a")}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
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
        </div>
      </div>
    </div>
  );
}

// Badge Components
function CustomerTypeBadge({ type }: { type: "individual" | "business" }) {
  if (type === "business") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700">
        <Building2 className="w-3 h-3" />
        Business
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
      <User className="w-3 h-3" />
      Individual
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
