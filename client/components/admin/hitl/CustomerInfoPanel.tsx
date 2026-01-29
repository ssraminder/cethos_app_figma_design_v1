import React from "react";
import { Mail, Phone, Clock, User, FileText, Calendar } from "lucide-react";

interface CustomerData {
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  quote_number: string;
  total: number;
  status: string;
  created_at: string;
  expires_at?: string;
  entry_point?: string;
}

interface CustomerInfoPanelProps {
  customerData: CustomerData | null;
  loading?: boolean;
  onViewCustomerQuotes?: (customerId: string) => void;
}

export default function CustomerInfoPanel({
  customerData,
  loading = false,
  onViewCustomerQuotes,
}: CustomerInfoPanelProps) {
  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-gray-100 rounded-lg p-3 h-20"></div>
          <div className="bg-gray-100 rounded-lg p-3 h-20"></div>
          <div className="bg-gray-100 rounded-lg p-3 h-20"></div>
        </div>
      </div>
    );
  }

  if (!customerData) {
    return (
      <div className="text-sm text-gray-500 text-center py-4">
        No customer information available
      </div>
    );
  }

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(amount);
  };

  // Format date short
  const formatDateShort = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  // Format status for display
  const formatStatus = (status: string) => {
    return status
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Get status badge color
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "pending_payment":
      case "awaiting_payment":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "paid":
      case "quote_ready":
      case "approved":
        return "bg-green-100 text-green-700 border-green-200";
      case "in_review":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "rejected":
        return "bg-red-100 text-red-700 border-red-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  // Calculate days until expiry
  const getDaysLeft = (expiresAt: string | null | undefined) => {
    if (!expiresAt) return null;
    const expiry = new Date(expiresAt);
    const now = new Date();
    return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const daysLeft = getDaysLeft(customerData.expires_at);

  return (
    <div className="space-y-3">
      {/* Compact Multi-Column Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Customer Capsule */}
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
            Customer
          </p>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
              <User className="w-3.5 h-3.5 text-teal-600" />
            </div>
            <span className="font-medium text-gray-900 truncate">
              {customerData.customer_name}
            </span>
          </div>
          <div className="space-y-1 text-sm">
            <a
              href={`mailto:${customerData.customer_email}`}
              className="text-teal-600 hover:text-teal-700 hover:underline flex items-center gap-1.5 truncate"
            >
              <Mail className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{customerData.customer_email}</span>
            </a>
            {customerData.customer_phone && (
              <a
                href={`tel:${customerData.customer_phone}`}
                className="text-teal-600 hover:text-teal-700 hover:underline flex items-center gap-1.5"
              >
                <Phone className="w-3 h-3 flex-shrink-0" />
                {customerData.customer_phone}
              </a>
            )}
          </div>
        </div>

        {/* Quote Capsule */}
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
            Quote
          </p>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <FileText className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <span className="font-mono font-medium text-gray-900">
              {customerData.quote_number}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-green-600">
              {formatCurrency(customerData.total)}
            </span>
            {customerData.entry_point && (
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded capitalize">
                {customerData.entry_point.replace(/_/g, " ")}
              </span>
            )}
          </div>
        </div>

        {/* Status & Dates Capsule */}
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm md:col-span-2 lg:col-span-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
            Status & Dates
          </p>
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusBadgeColor(customerData.status)}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
              {formatStatus(customerData.status)}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-gray-400" />
              <span>Created {formatDateShort(customerData.created_at)}</span>
            </div>
            {customerData.expires_at && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-gray-400" />
                <span>Exp {formatDateShort(customerData.expires_at)}</span>
                {daysLeft !== null && (
                  <span
                    className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                      daysLeft < 0
                        ? "bg-red-100 text-red-700"
                        : daysLeft <= 7
                          ? "bg-amber-100 text-amber-700"
                          : "bg-green-100 text-green-700"
                    }`}
                  >
                    {daysLeft < 0 ? "Expired" : `${daysLeft}d`}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* View All Quotes Button */}
      {customerData.customer_id && onViewCustomerQuotes && (
        <button
          onClick={() => onViewCustomerQuotes(customerData.customer_id)}
          className="w-full py-2 text-sm text-teal-600 hover:text-teal-700 hover:bg-teal-50 rounded-lg border border-teal-200 transition-colors font-medium"
        >
          View All Customer Quotes
        </button>
      )}
    </div>
  );
}
