import { useState, useEffect, useRef } from "react";
import { Search, Mail, Phone, User, Building2, AlertCircle, X, CheckCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface CustomerData {
  id?: string;
  email: string;
  phone: string;
  fullName: string;
  customerType: "individual" | "business";
  companyName?: string;
}

interface CustomerSearchResult {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  customer_type: "individual" | "business";
  company_name: string | null;
}

interface StaffCustomerFormProps {
  value: CustomerData | null;
  onChange: (data: CustomerData) => void;
}

export default function StaffCustomerForm({
  value,
  onChange,
}: StaffCustomerFormProps) {
  const [formData, setFormData] = useState<CustomerData>({
    email: "",
    phone: "",
    fullName: "",
    customerType: "individual",
    companyName: "",
    ...value,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(
    value?.id ? {
      id: value.id,
      email: value.email,
      full_name: value.fullName,
      phone: value.phone,
      customer_type: value.customerType,
      company_name: value.companyName || null,
    } : null
  );
  
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Notify parent of form changes
  useEffect(() => {
    onChange(formData);
  }, [formData]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      await performSearch(searchQuery.trim());
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery]);

  const performSearch = async (query: string) => {
    setIsSearching(true);
    try {
      // Search across multiple fields using OR conditions
      const searchTerm = `%${query}%`;
      
      const { data, error } = await supabase
        .from("customers")
        .select("id, email, full_name, phone, customer_type, company_name")
        .or(`full_name.ilike.${searchTerm},email.ilike.${searchTerm},phone.ilike.${searchTerm},company_name.ilike.${searchTerm}`)
        .limit(8);

      if (error) {
        console.error("Search error:", error);
        setSearchResults([]);
      } else {
        setSearchResults(data || []);
        setShowDropdown((data || []).length > 0);
      }
    } catch (err) {
      console.error("Error searching customers:", err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectCustomer = (customer: CustomerSearchResult) => {
    setSelectedCustomer(customer);
    setFormData({
      id: customer.id,
      email: customer.email || "",
      fullName: customer.full_name || "",
      phone: customer.phone || "",
      customerType: customer.customer_type || "individual",
      companyName: customer.company_name || "",
    });
    setSearchQuery("");
    setShowDropdown(false);
    setErrors({});
  };

  const handleClearSelection = () => {
    setSelectedCustomer(null);
    setFormData({
      email: "",
      phone: "",
      fullName: "",
      customerType: "individual",
      companyName: "",
    });
    setSearchQuery("");
    setErrors({});
  };

  const validateField = (name: string, value: string) => {
    const newErrors = { ...errors };

    switch (name) {
      case "email":
        // Email is optional, but if provided must be valid format
        if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          newErrors.email = "Invalid email format";
        } else {
          delete newErrors.email;
        }
        // Check if at least one contact method is provided
        if (!value && !formData.phone) {
          newErrors.contact = "Please provide at least one contact method (email or phone)";
        } else {
          delete newErrors.contact;
        }
        break;
      case "phone":
        // Phone is optional, but if provided must be at least 10 digits
        if (value && value.length < 10) {
          newErrors.phone = "Phone number must be at least 10 digits";
        } else {
          delete newErrors.phone;
        }
        // Check if at least one contact method is provided
        if (!value && !formData.email) {
          newErrors.contact = "Please provide at least one contact method (email or phone)";
        } else {
          delete newErrors.contact;
        }
        break;
      case "fullName":
        if (!value) {
          newErrors.fullName = "Full name is required";
        } else if (value.length < 2) {
          newErrors.fullName = "Name must be at least 2 characters";
        } else {
          delete newErrors.fullName;
        }
        break;
      case "companyName":
        if (formData.customerType === "business" && !value) {
          newErrors.companyName =
            "Company name is required for business customers";
        } else {
          delete newErrors.companyName;
        }
        break;
    }

    setErrors(newErrors);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    validateField(name, value);
  };

  const handleTypeChange = (type: "individual" | "business") => {
    setFormData({ ...formData, customerType: type });
    if (type === "individual") {
      const newErrors = { ...errors };
      delete newErrors.companyName;
      setErrors(newErrors);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Customer Information
        </h2>
        <p className="text-sm text-gray-600">
          Search for an existing customer or enter new customer details
        </p>
      </div>

      {/* Customer Search */}
      <div ref={searchRef} className="relative">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Search Existing Customers
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
            placeholder="Search by name, email, phone, or company..."
            className="w-full pl-10 pr-4 py-2 text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            </div>
          )}
        </div>

        {/* Search Results Dropdown */}
        {showDropdown && searchResults.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-auto">
            {searchResults.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => handleSelectCustomer(customer)}
                className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0 focus:outline-none focus:bg-blue-50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {customer.full_name || "No name"}
                    </p>
                    <p className="text-sm text-gray-600 truncate">
                      {customer.email}
                    </p>
                  </div>
                  <div className="ml-4 text-right flex-shrink-0">
                    <p className="text-sm text-gray-500">
                      {customer.phone || "No phone"}
                    </p>
                    {customer.company_name && (
                      <p className="text-xs text-gray-400 truncate max-w-[150px]">
                        {customer.company_name}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* No Results */}
        {showDropdown && searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg p-4 text-center text-gray-500">
            No customers found matching "{searchQuery}"
          </div>
        )}
      </div>

      {/* Selected Customer Banner */}
      {selectedCustomer && (
        <div className="bg-green-50 border border-green-200 rounded-md p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-green-800">Existing Customer Selected</p>
              <p className="text-sm text-green-700">
                {selectedCustomer.full_name} • {selectedCustomer.email}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClearSelection}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-green-700 hover:text-green-900 hover:bg-green-100 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
            Clear
          </button>
        </div>
      )}

      <div className="space-y-4">
        {/* Customer Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Customer Type *
          </label>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="customerType"
                value="individual"
                checked={formData.customerType === "individual"}
                onChange={() => handleTypeChange("individual")}
                className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700 flex items-center gap-2">
                <User className="w-4 h-4" />
                Individual
              </span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="customerType"
                value="business"
                checked={formData.customerType === "business"}
                onChange={() => handleTypeChange("business")}
                className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700 flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Business
              </span>
            </label>
          </div>
        </div>

        {/* Company Name (conditional) */}
        {formData.customerType === "business" && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Name *
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                name="companyName"
                value={formData.companyName || ""}
                onChange={handleChange}
                onBlur={(e) => validateField("companyName", e.target.value)}
                placeholder="Acme Corporation"
                className={`w-full pl-10 pr-4 py-2 text-base border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.companyName ? "border-red-300" : "border-gray-300"
                }`}
              />
            </div>
            {errors.companyName && (
              <p className="mt-1 text-sm text-red-600">{errors.companyName}</p>
            )}
          </div>
        )}

        {/* Full Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Full Name *
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              onBlur={(e) => validateField("fullName", e.target.value)}
              placeholder="John Doe"
              className={`w-full pl-10 pr-4 py-2 text-base border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.fullName ? "border-red-300" : "border-gray-300"
              }`}
            />
          </div>
          {errors.fullName && (
            <p className="mt-1 text-sm text-red-600">{errors.fullName}</p>
          )}
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email Address <span className="text-gray-400 font-normal">(Optional)</span>
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              onBlur={(e) => validateField("email", e.target.value)}
              placeholder="customer@example.com"
              className={`w-full pl-10 pr-4 py-2 text-base border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.email ? "border-red-300" : "border-gray-300"
              }`}
            />
          </div>
          {errors.email && (
            <p className="mt-1 text-sm text-red-600">{errors.email}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Quote and order updates will be sent here
          </p>
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Phone Number <span className="text-gray-400 font-normal">(Optional)</span>
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              onBlur={(e) => validateField("phone", e.target.value)}
              placeholder="+1 (555) 123-4567"
              className={`w-full pl-10 pr-4 py-2 text-base border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.phone ? "border-red-300" : "border-gray-300"
              }`}
            />
          </div>
          {errors.phone && (
            <p className="mt-1 text-sm text-red-600">{errors.phone}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            For urgent order updates only
          </p>
        </div>

        {/* Contact method validation error */}
        {errors.contact && (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
            <p className="text-sm text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {errors.contact}
            </p>
          </div>
        )}
      </div>

      <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-600">
        <p className="font-medium text-gray-700 mb-1">Note:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Full name is required</li>
          <li>At least one contact method (email or phone) is required</li>
          <li>Search to find and select existing customers</li>
          <li>Or enter details manually for new customers</li>
        </ul>
      </div>
    </div>
  );
}
