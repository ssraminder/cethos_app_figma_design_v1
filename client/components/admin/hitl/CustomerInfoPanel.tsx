import React from "react";
import { Mail, Phone, User, Calendar, DollarSign } from "lucide-react";

interface CustomerData {
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  quote_number: string;
  total: number;
  status: string;
  created_at: string;
}

interface CustomerInfoPanelProps {
  customerData: CustomerData | null;
  loading?: boolean;
}

export default function CustomerInfoPanel({
  customerData,
  loading = false,
}: CustomerInfoPanelProps) {
  // Debug logging
  React.useEffect(() => {
    if (customerData) {
      console.log("👤 CustomerInfoPanel data:", customerData);
      console.log("👤 Customer name:", customerData.customer_name);
      console.log("👤 Customer email:", customerData.customer_email);
      console.log("👤 Total:", customerData.total);
      console.log("👤 Created at:", customerData.created_at);
    }
  }, [customerData]);

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3"></div>
        </div>
      </div>
    );
  }

  if (!customerData) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
        <p className="text-sm text-gray-500">
          No customer information available
        </p>
      </div>
    );
  }

  const createdDate = customerData.created_at
    ? new Date(customerData.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'N/A';

  const statusColor =
    customerData.status === "quote_ready"
      ? "bg-green-100 text-green-800"
      : customerData.status === "awaiting_payment"
        ? "bg-yellow-100 text-yellow-800"
        : "bg-blue-100 text-blue-800";

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      {/* Customer Header */}
      <div className="border-b pb-3">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Customer</h3>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-900">
              {customerData.customer_name}
            </span>
          </div>

          <a
            href={`mailto:${customerData.customer_email}`}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
          >
            <Mail className="w-4 h-4" />
            <span className="truncate">{customerData.customer_email}</span>
          </a>

          {customerData.customer_phone && (
            <a
              href={`tel:${customerData.customer_phone}`}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
            >
              <Phone className="w-4 h-4" />
              <span>{customerData.customer_phone}</span>
            </a>
          )}
        </div>
      </div>

      {/* Quote Summary */}
      <div className="border-b pb-3">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">
          Quote Summary
        </h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Quote Number:</span>
            <span className="text-sm font-medium text-gray-900">
              {customerData.quote_number}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Total:</span>
            <span className="text-sm font-medium text-gray-900">
              ${Number(customerData.total).toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Status:</span>
            <span
              className={`text-xs font-medium px-2 py-1 rounded capitalize ${statusColor}`}
            >
              {customerData.status.replace("_", " ")}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Created:</span>
            <span className="text-sm text-gray-500">{createdDate}</span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <button className="w-full px-3 py-2 text-gray-700 text-sm font-medium rounded border border-gray-300 hover:bg-gray-50 transition-colors">
          View All Customer Quotes
        </button>
      </div>
    </div>
  );
}
