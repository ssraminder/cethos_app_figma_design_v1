import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  Search,
  User,
  Building2,
  Mail,
  Phone,
  AlertCircle,
} from "lucide-react";

interface CustomerData {
  id?: string;
  email?: string;
  phone?: string;
  fullName: string;
  customerType: "individual" | "business";
  companyName?: string;
}

interface StaffCustomerFormProps {
  value: CustomerData | null;
  onChange: (customer: CustomerData) => void;
  entryPoint: "staff_manual" | "staff_phone" | "staff_walkin" | "staff_email";
  onEntryPointChange: (
    entryPoint: "staff_manual" | "staff_phone" | "staff_walkin" | "staff_email",
  ) => void;
}

export default function StaffCustomerForm({
  value,
  onChange,
  entryPoint,
  onEntryPointChange,
}: StaffCustomerFormProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [formMode, setFormMode] = useState<"search" | "create">("search");
  const [formData, setFormData] = useState<CustomerData>(
    value || {
      fullName: "",
      customerType: "individual",
    },
  );

  // Search for existing customers
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    if (!supabase) {
      console.error("Supabase client not initialized");
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .or(
          `email.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%`,
        )
        .limit(5);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error("Error searching customers:", error);
    } finally {
      setIsSearching(false);
    }
  };

  // Select existing customer
  const handleSelectCustomer = (customer: any) => {
    const customerData: CustomerData = {
      id: customer.id,
      email: customer.email,
      phone: customer.phone,
      fullName: customer.full_name,
      customerType: customer.customer_type || "individual",
      companyName: customer.company_name,
    };
    setFormData(customerData);
    onChange(customerData);
    setSearchQuery("");
    setSearchResults([]);
  };

  // Update form data
  const handleFormChange = (updates: Partial<CustomerData>) => {
    const updated = { ...formData, ...updates };
    setFormData(updated);
    onChange(updated);
  };

  // Validate form
  const isValid = () => {
    if (!formData.fullName) return false;
    if (!formData.email && !formData.phone) return false;
    if (formData.customerType === "business" && !formData.companyName)
      return false;
    return true;
  };

  useEffect(() => {
    if (value) {
      setFormData(value);
    }
  }, [value]);

  return (
    <div className="space-y-6">
      {/* Entry Point Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Entry Point *
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onEntryPointChange("staff_phone")}
            className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
              entryPoint === "staff_phone"
                ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
            }`}
          >
            <Phone className="h-4 w-4 mx-auto mb-1" />
            Phone Call
          </button>
          <button
            type="button"
            onClick={() => onEntryPointChange("staff_walkin")}
            className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
              entryPoint === "staff_walkin"
                ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
            }`}
          >
            <User className="h-4 w-4 mx-auto mb-1" />
            Walk-in
          </button>
          <button
            type="button"
            onClick={() => onEntryPointChange("staff_email")}
            className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
              entryPoint === "staff_email"
                ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
            }`}
          >
            <Mail className="h-4 w-4 mx-auto mb-1" />
            Email
          </button>
          <button
            type="button"
            onClick={() => onEntryPointChange("staff_manual")}
            className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
              entryPoint === "staff_manual"
                ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
            }`}
          >
            Manual Entry
          </button>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setFormMode("search")}
          className={`px-4 py-2 rounded-md text-sm font-medium ${
            formMode === "search"
              ? "bg-indigo-100 text-indigo-700"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Search Existing
        </button>
        <button
          type="button"
          onClick={() => {
            setFormMode("create");
            setSearchResults([]);
          }}
          className={`px-4 py-2 rounded-md text-sm font-medium ${
            formMode === "create"
              ? "bg-indigo-100 text-indigo-700"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Create New
        </button>
      </div>

      {/* Search Mode */}
      {formMode === "search" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search by email, phone, or name
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="john@example.com, 555-1234, or John Doe"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <button
                type="button"
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isSearching ? "Searching..." : "Search"}
              </button>
            </div>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="border border-gray-200 rounded-md divide-y divide-gray-200">
              {searchResults.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => handleSelectCustomer(customer)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1">
                      {customer.customer_type === "business" ? (
                        <Building2 className="h-5 w-5 text-gray-400" />
                      ) : (
                        <User className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {customer.full_name}
                      </p>
                      {customer.company_name && (
                        <p className="text-xs text-gray-500">
                          {customer.company_name}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-4 text-xs text-gray-500">
                        {customer.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {customer.email}
                          </span>
                        )}
                        {customer.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {customer.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {searchQuery && searchResults.length === 0 && !isSearching && (
            <div className="text-center py-8 text-gray-500">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">No customers found</p>
              <button
                type="button"
                onClick={() => setFormMode("create")}
                className="mt-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Create new customer instead
              </button>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Mode */}
      {(formMode === "create" || formData.id) && (
        <div className="space-y-4">
          {formData.id && (
            <div className="bg-green-50 border border-green-200 rounded-md p-3 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-green-800">
                <p className="font-medium">Existing Customer Selected</p>
                <p className="text-xs mt-1">
                  You can edit the details below if needed
                </p>
              </div>
            </div>
          )}

          {/* Customer Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Customer Type *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleFormChange({ customerType: "individual" })}
                className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                  formData.customerType === "individual"
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                }`}
              >
                <User className="h-4 w-4 mx-auto mb-1" />
                Individual
              </button>
              <button
                type="button"
                onClick={() => handleFormChange({ customerType: "business" })}
                className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                  formData.customerType === "business"
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                }`}
              >
                <Building2 className="h-4 w-4 mx-auto mb-1" />
                Business
              </button>
            </div>
          </div>

          {/* Full Name */}
          <div>
            <label
              htmlFor="fullName"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Full Name *
            </label>
            <input
              type="text"
              id="fullName"
              value={formData.fullName}
              onChange={(e) => handleFormChange({ fullName: e.target.value })}
              placeholder="John Doe"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Company Name (if business) */}
          {formData.customerType === "business" && (
            <div>
              <label
                htmlFor="companyName"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Company Name *
              </label>
              <input
                type="text"
                id="companyName"
                value={formData.companyName || ""}
                onChange={(e) =>
                  handleFormChange({ companyName: e.target.value })
                }
                placeholder="Acme Corporation"
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          )}

          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email {!formData.phone && "*"}
            </label>
            <input
              type="email"
              id="email"
              value={formData.email || ""}
              onChange={(e) => handleFormChange({ email: e.target.value })}
              placeholder="john@example.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            {!formData.email && !formData.phone && (
              <p className="mt-1 text-xs text-amber-600">
                Email or phone is required
              </p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label
              htmlFor="phone"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Phone {!formData.email && "*"}
            </label>
            <input
              type="tel"
              id="phone"
              value={formData.phone || ""}
              onChange={(e) => handleFormChange({ phone: e.target.value })}
              placeholder="+1 (555) 123-4567"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Validation Message */}
          {!isValid() && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">Missing Required Fields</p>
                <ul className="mt-1 text-xs list-disc list-inside">
                  {!formData.fullName && <li>Full name is required</li>}
                  {!formData.email && !formData.phone && (
                    <li>Either email or phone is required</li>
                  )}
                  {formData.customerType === "business" &&
                    !formData.companyName && <li>Company name is required</li>}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
