import React from "react";
import { Mail, Phone, Clock } from "lucide-react";

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
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <div className="h-5 bg-gray-200 rounded animate-pulse w-2/3"></div>
        </div>
        <div className="p-4 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div className="h-4 bg-gray-200 rounded animate-pulse w-1/4"></div>
            <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!customerData) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Customer & Quote Information</h3>
        </div>
        <div className="p-4">
          <p className="text-sm text-gray-500 text-center py-4">
            No customer information available
          </p>
        </div>
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

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
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
        return "bg-yellow-100 text-yellow-700";
      case "paid":
        return "bg-green-100 text-green-700";
      case "in_review":
        return "bg-blue-100 text-blue-700";
      case "quote_ready":
        return "bg-green-100 text-green-700";
      case "approved":
        return "bg-green-100 text-green-700";
      case "rejected":
        return "bg-red-100 text-red-700";
      case "awaiting_payment":
        return "bg-yellow-100 text-yellow-700";
      default:
        return "bg-gray-100 text-gray-700";
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
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Customer & Quote Information</h3>
      </div>

      <div className="p-4 space-y-4">
        {/* Customer Card */}
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Customer
          </p>
          <p className="font-medium text-gray-900">{customerData.customer_name}</p>
          <a
            href={`mailto:${customerData.customer_email}`}
            className="text-sm text-teal-600 hover:underline flex items-center gap-1 mt-1"
          >
            <Mail className="w-3 h-3" />
            {customerData.customer_email}
          </a>
          {customerData.customer_phone && (
            <a
              href={`tel:${customerData.customer_phone}`}
              className="text-sm text-teal-600 hover:underline flex items-center gap-1 mt-1"
            >
              <Phone className="w-3 h-3" />
              {customerData.customer_phone}
            </a>
          )}
        </div>

        {/* Quote Details Card */}
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Quote Details
          </p>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Quote Number</span>
              <span className="font-mono font-medium">{customerData.quote_number}</span>
            </div>

            {customerData.entry_point && (
              <div className="flex justify-between">
                <span className="text-gray-500">Route</span>
                <span className="capitalize">
                  {customerData.entry_point.replace(/_/g, " ")}
                </span>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-gray-500">Total</span>
              <span className="font-semibold text-green-600">
                {formatCurrency(customerData.total)}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-500">Status</span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeColor(customerData.status)}`}
              >
                {formatStatus(customerData.status)}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">Created</span>
              <span>{formatDate(customerData.created_at)}</span>
            </div>

            {customerData.expires_at && (
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Expires</span>
                <span className="flex items-center gap-1">
                  {formatDate(customerData.expires_at)}
                  {daysLeft !== null && (
                    <span
                      className={`inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full ${
                        daysLeft < 0
                          ? "bg-red-100 text-red-700"
                          : daysLeft <= 7
                            ? "bg-amber-100 text-amber-700"
                            : "bg-green-100 text-green-700"
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      {daysLeft < 0 ? "Expired" : `${daysLeft}d left`}
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* View All Quotes Button */}
        <button
          onClick={() => onViewCustomerQuotes?.(customerData.customer_id)}
          className="w-full py-2 text-sm text-teal-600 hover:text-teal-700 hover:bg-gray-50 rounded-md transition-colors"
        >
          View All Customer Quotes
        </button>
      </div>
    </div>
  );
}
