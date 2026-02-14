import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Users,
  Plus,
  Search,
  X,
  Copy,
  Check,
  Loader2,
  DollarSign,
  Activity,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────────────────

interface Partner {
  id: string;
  code: string;
  name: string;
  company_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  customer_rate: number;
  wholesale_rate: number;
  is_active: boolean;
  allow_portal_access: boolean;
  custom_logo_url: string | null;
  custom_welcome_message: string | null;
  allowed_embed_domains: string[] | null;
  payout_method: string | null;
  payout_email: string | null;
  payout_frequency: string | null;
  notes: string | null;
  created_at: string;
}

interface OrderSummary {
  partner_id: string;
  partner_margin: number;
  payout_status: string;
}

interface FormData {
  name: string;
  code: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  websiteUrl: string;
  customerRate: string;
  wholesaleRate: string;
  isActive: boolean;
  allowPortalAccess: boolean;
  logoUrl: string;
  welcomeMessage: string;
  embedDomains: string;
  payoutMethod: string;
  payoutEmail: string;
  payoutFrequency: string;
  notes: string;
}

const EMPTY_FORM: FormData = {
  name: "",
  code: "",
  companyName: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  websiteUrl: "",
  customerRate: "",
  wholesaleRate: "",
  isActive: true,
  allowPortalAccess: false,
  logoUrl: "",
  welcomeMessage: "",
  embedDomains: "",
  payoutMethod: "manual",
  payoutEmail: "",
  payoutFrequency: "monthly",
  notes: "",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function suggestCode(name: string): string {
  if (!name) return "";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  }
  // Take first few chars of first words + abbreviation of remaining
  const first = words[0].toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  const rest = words
    .slice(1)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("")
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
  return `${first}_${rest}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AdminPartners() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [orderSummaries, setOrderSummaries] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [sortField, setSortField] = useState<"name" | "code" | "customer_rate" | "wholesale_rate">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // ── Data Loading ─────────────────────────────────────────────────────────

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [partnersRes, summariesRes] = await Promise.all([
        supabase.from("partners").select("*").order("name"),
        supabase.from("partner_order_summary").select("partner_id, partner_margin, payout_status"),
      ]);

      setPartners(partnersRes.data || []);
      setOrderSummaries(summariesRes.data || []);
    } catch (err) {
      console.error("Error fetching partners:", err);
      toast.error("Failed to load partners");
    } finally {
      setLoading(false);
    }
  };

  // ── Computed Values ──────────────────────────────────────────────────────

  const partnerStats = (partnerId: string) => {
    const entries = orderSummaries.filter((s) => s.partner_id === partnerId);
    const orderCount = entries.length;
    const revenue = entries.reduce((sum, e) => sum + (e.partner_margin || 0), 0);
    return { orderCount, revenue };
  };

  const totalPartners = partners.length;
  const activePartners = partners.filter((p) => p.is_active).length;
  const totalRevenue = orderSummaries.reduce((sum, s) => sum + (s.partner_margin || 0), 0);
  const pendingPayouts = orderSummaries
    .filter((s) => s.payout_status === "pending")
    .reduce((sum, s) => sum + (s.partner_margin || 0), 0);

  // ── Filtering & Sorting ──────────────────────────────────────────────────

  const filteredPartners = partners
    .filter((p) => {
      if (statusFilter === "active" && !p.is_active) return false;
      if (statusFilter === "inactive" && p.is_active) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });

  // ── Modal Handlers ───────────────────────────────────────────────────────

  const openAddModal = () => {
    setEditingPartner(null);
    setFormData(EMPTY_FORM);
    setFormErrors({});
    setShowModal(true);
  };

  const openEditModal = (partner: Partner) => {
    setEditingPartner(partner);
    setFormData({
      name: partner.name,
      code: partner.code,
      companyName: partner.company_name || "",
      contactName: partner.contact_name || "",
      contactEmail: partner.contact_email || "",
      contactPhone: partner.contact_phone || "",
      websiteUrl: partner.website_url || "",
      customerRate: String(partner.customer_rate),
      wholesaleRate: String(partner.wholesale_rate),
      isActive: partner.is_active,
      allowPortalAccess: partner.allow_portal_access,
      logoUrl: partner.custom_logo_url || "",
      welcomeMessage: partner.custom_welcome_message || "",
      embedDomains: partner.allowed_embed_domains?.join(", ") || "",
      payoutMethod: partner.payout_method || "manual",
      payoutEmail: partner.payout_email || "",
      payoutFrequency: partner.payout_frequency || "monthly",
      notes: partner.notes || "",
    });
    setFormErrors({});
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingPartner(null);
    setFormData(EMPTY_FORM);
    setFormErrors({});
  };

  const updateField = (field: keyof FormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  // ── Validation ───────────────────────────────────────────────────────────

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) errors.name = "Partner name is required";
    if (!formData.code.trim()) errors.code = "Partner code is required";
    if (!/^[A-Z0-9_]+$/.test(formData.code.toUpperCase().trim())) {
      errors.code = "Code must be alphanumeric with underscores only";
    }
    if (!formData.customerRate || parseFloat(formData.customerRate) <= 0) {
      errors.customerRate = "Customer rate must be greater than 0";
    }
    if (!formData.wholesaleRate || parseFloat(formData.wholesaleRate) <= 0) {
      errors.wholesaleRate = "Wholesale rate must be greater than 0";
    }
    if (
      formData.customerRate &&
      formData.wholesaleRate &&
      parseFloat(formData.customerRate) <= parseFloat(formData.wholesaleRate)
    ) {
      errors.customerRate = "Customer rate must be greater than wholesale rate";
    }
    if (formData.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contactEmail)) {
      errors.contactEmail = "Invalid email address";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Save Handler ─────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);

    try {
      const code = formData.code.toUpperCase().trim();

      // Check code uniqueness
      const { data: existing } = await supabase
        .from("partners")
        .select("id")
        .eq("code", code)
        .neq("id", editingPartner?.id || "00000000-0000-0000-0000-000000000000")
        .limit(1);

      if (existing && existing.length > 0) {
        setFormErrors({ code: "This code is already in use" });
        setSaving(false);
        return;
      }

      const record = {
        code,
        name: formData.name.trim(),
        company_name: formData.companyName || null,
        contact_name: formData.contactName || null,
        contact_email: formData.contactEmail || null,
        contact_phone: formData.contactPhone || null,
        website_url: formData.websiteUrl || null,
        customer_rate: parseFloat(formData.customerRate),
        wholesale_rate: parseFloat(formData.wholesaleRate),
        is_active: formData.isActive,
        allow_portal_access: formData.allowPortalAccess,
        custom_logo_url: formData.logoUrl || null,
        custom_welcome_message: formData.welcomeMessage || null,
        allowed_embed_domains: formData.embedDomains
          ? formData.embedDomains.split(",").map((d) => d.trim()).filter(Boolean)
          : null,
        payout_method: formData.payoutMethod || "manual",
        payout_email: formData.payoutEmail || null,
        payout_frequency: formData.payoutFrequency || "monthly",
        notes: formData.notes || null,
      };

      if (editingPartner) {
        const { error } = await supabase
          .from("partners")
          .update(record)
          .eq("id", editingPartner.id);
        if (error) throw error;
        toast.success("Partner updated successfully");
      } else {
        const { error } = await supabase.from("partners").insert(record);
        if (error) throw error;
        toast.success("Partner created successfully");
      }

      closeModal();
      fetchData();
    } catch (err: any) {
      console.error("Error saving partner:", err);
      toast.error(err?.message || "Failed to save partner");
    } finally {
      setSaving(false);
    }
  };

  // ── Copy Referral Link ───────────────────────────────────────────────────

  const copyReferralLink = (code: string) => {
    const link = `https://portal.cethos.com/quote?ref=${code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedCode(code);
      toast.success("Referral link copied!");
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  // ── Column Sort Handler ──────────────────────────────────────────────────

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIndicator = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return null;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  const margin =
    formData.customerRate && formData.wholesaleRate
      ? parseFloat(formData.customerRate) - parseFloat(formData.wholesaleRate)
      : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Partners</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage referral partners and track revenue
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Partner
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-sm font-medium text-gray-500">Total Partners</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalPartners}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-green-600" />
            </div>
            <span className="text-sm font-medium text-gray-500">Active Partners</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{activePartners}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-indigo-600" />
            </div>
            <span className="text-sm font-medium text-gray-500">Total Partner Revenue</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <span className="text-sm font-medium text-gray-500">Pending Payouts</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(pendingPayouts)}</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(["all", "active", "inactive"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-3 py-1.5 text-sm rounded-md capitalize transition-colors ${
                  statusFilter === filter
                    ? "bg-white text-gray-900 font-medium shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th
                  className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                  onClick={() => toggleSort("name")}
                >
                  Name <SortIndicator field="name" />
                </th>
                <th
                  className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                  onClick={() => toggleSort("code")}
                >
                  Code <SortIndicator field="code" />
                </th>
                <th
                  className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                  onClick={() => toggleSort("customer_rate")}
                >
                  Customer Rate <SortIndicator field="customer_rate" />
                </th>
                <th
                  className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                  onClick={() => toggleSort("wholesale_rate")}
                >
                  Wholesale Rate <SortIndicator field="wholesale_rate" />
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Margin
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Orders
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Revenue
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredPartners.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-500">
                    {searchQuery || statusFilter !== "all"
                      ? "No partners match your filters"
                      : "No partners yet. Click \"Add Partner\" to create one."}
                  </td>
                </tr>
              ) : (
                filteredPartners.map((partner) => {
                  const stats = partnerStats(partner.id);
                  const partnerMargin = partner.customer_rate - partner.wholesale_rate;
                  return (
                    <tr key={partner.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">{partner.name}</span>
                        {partner.company_name && (
                          <span className="block text-xs text-gray-500">{partner.company_name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-700">
                          {partner.code}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-900">
                        {formatCurrency(partner.customer_rate)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-900">
                        {formatCurrency(partner.wholesale_rate)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-green-700">
                        {formatCurrency(partnerMargin)}/page
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-900">
                        {stats.orderCount}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-900">
                        {formatCurrency(stats.revenue)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${
                            partner.is_active
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {partner.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => copyReferralLink(partner.code)}
                            className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                            title="Copy referral link"
                          >
                            {copiedCode === partner.code ? (
                              <Check className="w-4 h-4 text-green-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => openEditModal(partner)}
                            className="px-3 py-1 text-sm text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors font-medium"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-8">
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingPartner ? "Edit Partner" : "Add Partner"}
              </h2>
              <button
                onClick={closeModal}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-4 max-h-[calc(100vh-200px)] overflow-y-auto space-y-6">
              {/* Identity Section */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
                  Identity
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Partner Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => {
                        updateField("name", e.target.value);
                        if (!editingPartner && !formData.code) {
                          updateField("code", suggestCode(e.target.value));
                        }
                      }}
                      className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none ${
                        formErrors.name ? "border-red-500" : "border-gray-300"
                      }`}
                      placeholder="ABC Immigration Services"
                    />
                    {formErrors.name && (
                      <p className="text-xs text-red-500 mt-1">{formErrors.name}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Partner Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.code}
                      onChange={(e) =>
                        updateField(
                          "code",
                          e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "")
                        )
                      }
                      className={`w-full px-3 py-2 border rounded-lg text-sm font-mono focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none ${
                        formErrors.code ? "border-red-500" : "border-gray-300"
                      }`}
                      placeholder="ABC_IMMI"
                    />
                    {formErrors.code && (
                      <p className="text-xs text-red-500 mt-1">{formErrors.code}</p>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Company Name
                    </label>
                    <input
                      type="text"
                      value={formData.companyName}
                      onChange={(e) => updateField("companyName", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                      placeholder="Optional company name"
                    />
                  </div>
                </div>
              </div>

              {/* Contact Section */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
                  Contact
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Name
                    </label>
                    <input
                      type="text"
                      value={formData.contactName}
                      onChange={(e) => updateField("contactName", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Email
                    </label>
                    <input
                      type="email"
                      value={formData.contactEmail}
                      onChange={(e) => updateField("contactEmail", e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none ${
                        formErrors.contactEmail ? "border-red-500" : "border-gray-300"
                      }`}
                    />
                    {formErrors.contactEmail && (
                      <p className="text-xs text-red-500 mt-1">{formErrors.contactEmail}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Phone
                    </label>
                    <input
                      type="text"
                      value={formData.contactPhone}
                      onChange={(e) => updateField("contactPhone", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Website URL
                    </label>
                    <input
                      type="text"
                      value={formData.websiteUrl}
                      onChange={(e) => updateField("websiteUrl", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                      placeholder="https://..."
                    />
                  </div>
                </div>
              </div>

              {/* Pricing Section */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
                  Pricing
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Customer Rate <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                        $
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.customerRate}
                        onChange={(e) => updateField("customerRate", e.target.value)}
                        className={`w-full pl-7 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none ${
                          formErrors.customerRate ? "border-red-500" : "border-gray-300"
                        }`}
                        placeholder="85.00"
                      />
                    </div>
                    {formErrors.customerRate && (
                      <p className="text-xs text-red-500 mt-1">{formErrors.customerRate}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Wholesale Rate <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                        $
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.wholesaleRate}
                        onChange={(e) => updateField("wholesaleRate", e.target.value)}
                        className={`w-full pl-7 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none ${
                          formErrors.wholesaleRate ? "border-red-500" : "border-gray-300"
                        }`}
                        placeholder="50.00"
                      />
                    </div>
                    {formErrors.wholesaleRate && (
                      <p className="text-xs text-red-500 mt-1">{formErrors.wholesaleRate}</p>
                    )}
                  </div>
                </div>
                {formData.customerRate && formData.wholesaleRate && margin > 0 && (
                  <p className="mt-2 text-sm font-medium text-green-700">
                    Partner earns: {formatCurrency(margin)}/page
                  </p>
                )}
              </div>

              {/* Settings Section */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
                  Settings
                </h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={formData.isActive}
                      onClick={() => updateField("isActive", !formData.isActive)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        formData.isActive ? "bg-teal-600" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          formData.isActive ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                    <span className="text-sm text-gray-700">Active</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={formData.allowPortalAccess}
                      onClick={() =>
                        updateField("allowPortalAccess", !formData.allowPortalAccess)
                      }
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        formData.allowPortalAccess ? "bg-teal-600" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          formData.allowPortalAccess ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                    <div>
                      <span className="text-sm text-gray-700">Allow Portal Access</span>
                      <span className="block text-xs text-gray-400">
                        Future — partner portal access
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Branding Section */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
                  Branding
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Custom Logo URL
                    </label>
                    <input
                      type="text"
                      value={formData.logoUrl}
                      onChange={(e) => updateField("logoUrl", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                      placeholder="https://example.com/logo.png"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Custom Welcome Message
                    </label>
                    <textarea
                      value={formData.welcomeMessage}
                      onChange={(e) => updateField("welcomeMessage", e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Embed Section */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
                  Embed
                </h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Allowed Embed Domains
                  </label>
                  <input
                    type="text"
                    value={formData.embedDomains}
                    onChange={(e) => updateField("embedDomains", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                    placeholder="abcimmigration.com, partner-site.ca"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Comma-separated domains. Leave empty to allow any domain.
                  </p>
                </div>
              </div>

              {/* Payout Section */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
                  Payout
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Payout Method
                    </label>
                    <select
                      value={formData.payoutMethod}
                      onChange={(e) => updateField("payoutMethod", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none bg-white"
                    >
                      <option value="manual">Manual</option>
                      <option value="e-transfer">E-Transfer</option>
                      <option value="cheque">Cheque</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Payout Email
                    </label>
                    <input
                      type="email"
                      value={formData.payoutEmail}
                      onChange={(e) => updateField("payoutEmail", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                      placeholder="For e-transfer payouts"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Payout Frequency
                    </label>
                    <select
                      value={formData.payoutFrequency}
                      onChange={(e) => updateField("payoutFrequency", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none bg-white"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="bi-weekly">Bi-weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Notes Section */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
                  Notes
                </h3>
                <textarea
                  value={formData.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none resize-none"
                  placeholder="Internal notes about this partner..."
                />
              </div>

              {/* Referral Link (edit mode only) */}
              {editingPartner && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
                    Referral Link
                  </h3>
                  <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
                    <code className="text-sm text-gray-700 flex-1 break-all">
                      https://portal.cethos.com/quote?ref={editingPartner.code}
                    </code>
                    <button
                      onClick={() => copyReferralLink(editingPartner.code)}
                      className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors flex-shrink-0"
                      title="Copy referral link"
                    >
                      {copiedCode === editingPartner.code ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? "Saving..." : "Save Partner"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
