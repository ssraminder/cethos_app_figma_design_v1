import React, { useState } from "react";
import { User, ChevronDown, ChevronUp, Mail, Phone } from "lucide-react";

interface ContactInfoData {
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
}

interface ContactInfoPanelProps {
  contactData: ContactInfoData | null;
  loading?: boolean;
}

export default function ContactInfoPanel({
  contactData,
  loading = false,
}: ContactInfoPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
        </div>
      </div>
    );
  }

  if (!contactData) {
    return null;
  }

  // Check if contact info is same as customer info
  const isSameAsCustomer =
    contactData.contact_email === contactData.customer_email ||
    !contactData.contact_email;

  return (
    <div className="bg-white border border-gray-200 rounded-lg divide-y">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-purple-600" />
          <h3 className="text-sm font-semibold text-gray-900">
            Contact Information
          </h3>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 py-3 space-y-3 text-sm">
          {isSameAsCustomer ? (
            <div className="bg-blue-50 border border-blue-200 rounded p-2">
              <p className="text-xs text-blue-800">
                ✓ Same as customer information
              </p>
            </div>
          ) : (
            <>
              {/* Name */}
              <div>
                <p className="text-xs text-gray-500 mb-1">Name</p>
                <p className="font-medium text-gray-900">
                  {contactData.contact_name || contactData.customer_name || (
                    <span className="text-gray-400 italic">Not specified</span>
                  )}
                </p>
              </div>

              {/* Email */}
              <div>
                <p className="text-xs text-gray-500 mb-1">Email</p>
                {contactData.contact_email || contactData.customer_email ? (
                  <a
                    href={`mailto:${contactData.contact_email || contactData.customer_email}`}
                    className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    {contactData.contact_email || contactData.customer_email}
                  </a>
                ) : (
                  <span className="text-gray-400 italic">Not specified</span>
                )}
              </div>

              {/* Phone */}
              <div>
                <p className="text-xs text-gray-500 mb-1">Phone</p>
                {contactData.contact_phone || contactData.customer_phone ? (
                  <a
                    href={`tel:${contactData.contact_phone || contactData.customer_phone}`}
                    className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    {contactData.contact_phone || contactData.customer_phone}
                  </a>
                ) : (
                  <span className="text-gray-400 italic">Not specified</span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
