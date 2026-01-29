import { useState, useEffect } from "react";
import { Mail, Phone, User, Building2, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface CustomerData {
  id?: string;
  email: string;
  phone: string;
  fullName: string;
  customerType: "individual" | "business";
  companyName?: string;
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
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [existingCustomer, setExistingCustomer] = useState<any>(null);

  useEffect(() => {
    onChange(formData);
  }, [formData]);

  const handleEmailBlur = async () => {
    if (!formData.email || !formData.email.includes("@")) return;

    setIsCheckingEmail(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("email", formData.email.toLowerCase())
        .single();

      if (data && !error) {
        setExistingCustomer(data);
        setFormData({
          ...formData,
          id: data.id,
          fullName: data.full_name || formData.fullName,
          phone: data.phone || formData.phone,
          customerType: data.customer_type || formData.customerType,
          companyName: data.company_name || formData.companyName,
        });
      } else {
        setExistingCustomer(null);
      }
    } catch (err) {
      console.error("Error checking customer:", err);
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const validateField = (name: string, value: string) => {
    const newErrors = { ...errors };

    switch (name) {
      case "email":
        if (!value) {
          newErrors.email = "Email is required";
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          newErrors.email = "Invalid email format";
        } else {
          delete newErrors.email;
        }
        break;
      case "phone":
        if (!value) {
          newErrors.phone = "Phone is required";
        } else if (value.length < 10) {
          newErrors.phone = "Phone number must be at least 10 digits";
        } else {
          delete newErrors.phone;
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
          Enter the customer's details or search by email for existing customers
        </p>
      </div>

      {existingCustomer && (
        <div className="bg-green-50 border border-green-200 rounded-md p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-green-800">
            <p className="font-medium">Existing Customer Found</p>
            <p className="mt-1">
              Customer information has been automatically filled from previous
              records.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Customer Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Customer Type *
          </label>
          <div className="flex gap-4">
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

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email Address *
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              onBlur={handleEmailBlur}
              placeholder="customer@example.com"
              className={`w-full pl-10 pr-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.email ? "border-red-300" : "border-gray-300"
              }`}
            />
            {isCheckingEmail && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              </div>
            )}
          </div>
          {errors.email && (
            <p className="mt-1 text-sm text-red-600">{errors.email}</p>
          )}
        </div>

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
              className={`w-full pl-10 pr-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.fullName ? "border-red-300" : "border-gray-300"
              }`}
            />
          </div>
          {errors.fullName && (
            <p className="mt-1 text-sm text-red-600">{errors.fullName}</p>
          )}
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Phone Number *
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
              className={`w-full pl-10 pr-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.phone ? "border-red-300" : "border-gray-300"
              }`}
            />
          </div>
          {errors.phone && (
            <p className="mt-1 text-sm text-red-600">{errors.phone}</p>
          )}
        </div>

        {/* Company Name (conditional) */}
        {formData.customerType === "business" && (
          <div>
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
                className={`w-full pl-10 pr-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.companyName ? "border-red-300" : "border-gray-300"
                }`}
              />
            </div>
            {errors.companyName && (
              <p className="mt-1 text-sm text-red-600">{errors.companyName}</p>
            )}
          </div>
        )}
      </div>

      <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-600">
        <p className="font-medium text-gray-700 mb-1">Note:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>All fields marked with * are required</li>
          <li>
            Entering an email will automatically check for existing customers
          </li>
          <li>Existing customer details will be pre-filled automatically</li>
        </ul>
      </div>
    </div>
  );
}
