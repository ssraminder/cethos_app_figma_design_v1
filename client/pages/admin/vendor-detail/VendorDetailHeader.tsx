import { useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Mail,
  Phone,
  Languages,
  DollarSign,
  Briefcase,
  Shield,
  MoreHorizontal,
  Power,
  Send,
  Bell,
  ExternalLink,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { VendorPageData } from "./types";
import { STATUS_COLORS, AVAILABILITY_COLORS } from "./constants";

interface VendorDetailHeaderProps {
  vendorData: VendorPageData;
  onRefresh: () => Promise<void>;
}

export default function VendorDetailHeader({
  vendorData,
  onRefresh,
}: VendorDetailHeaderProps) {
  const { vendor, summary } = vendorData;
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const handleToggleStatus = async () => {
    setActionLoading(true);
    const newStatus = vendor.status === "active" ? "inactive" : "active";
    const { error } = await supabase
      .from("vendors")
      .update({ status: newStatus })
      .eq("id", vendor.id);
    setActionLoading(false);
    setActionsOpen(false);
    if (error) {
      toast.error(`Failed to update status: ${error.message}`);
    } else {
      toast.success(`Vendor ${newStatus === "active" ? "activated" : "deactivated"}`);
      await onRefresh();
    }
  };

  const handleSendInvitation = async () => {
    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke("vendor-auth-otp-send", {
        body: { email: vendor.email, channel: "email" },
      });
      if (error) throw error;
      toast.success(`Invitation sent to ${vendor.email}`);
      await onRefresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to send invitation"
      );
    }
    setActionLoading(false);
    setActionsOpen(false);
  };

  // "View as vendor" — calls admin-impersonate-vendor to mint a fresh
  // 30-minute vendor session, then opens vendor.cethos.com with the
  // token in the URL. The vendor portal swaps it for a real session
  // and shows an impersonation banner. Mirrors XTRF's "Open in vendor
  // portal".
  const handleImpersonate = async () => {
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "admin-impersonate-vendor",
        { body: { action: "start", vendor_id: vendor.id } },
      );
      if (error) throw error;
      if (!data?.token) throw new Error(data?.error || "No token returned");
      const portalBase =
        (import.meta.env.VITE_VENDOR_PORTAL_URL as string | undefined) ||
        "https://vendor.cethos.com";
      const url = `${portalBase.replace(/\/$/, "")}/?impersonate_token=${encodeURIComponent(
        data.token,
      )}`;
      window.open(url, "_blank", "noopener,noreferrer");
      toast.success(`Opened vendor portal as ${vendor.full_name}`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to start impersonation");
    }
    setActionLoading(false);
    setActionsOpen(false);
  };

  const handleSendReminder = async () => {
    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke(
        "vendor-invitation-reminder",
        { body: { vendor_id: vendor.id } }
      );
      if (error) throw error;
      toast.success("Reminder sent");
      await onRefresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to send reminder"
      );
    }
    setActionLoading(false);
    setActionsOpen(false);
  };

  const portalLabel = summary.has_portal_access ? "Active" : "Inactive";

  return (
    <div className="mb-6">
      {/* Back link */}
      <Link
        to="/admin/vendors"
        className="inline-flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Vendors
      </Link>

      <div className="flex items-start justify-between">
        {/* Left: name, badges, contact */}
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-gray-900">
              {vendor.full_name}
            </h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[vendor.status] ?? "bg-gray-100 text-gray-600"}`}
            >
              {vendor.status.replace(/_/g, " ")}
            </span>
            <div className="flex items-center gap-1.5">
              <div
                className={`w-2 h-2 rounded-full ${AVAILABILITY_COLORS[vendor.availability_status] ?? "bg-gray-400"}`}
              />
              <span className="text-sm text-gray-500 capitalize">
                {vendor.availability_status.replace(/_/g, " ")}
              </span>
            </div>
          </div>

          {/* Contact line */}
          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <Mail className="w-3.5 h-3.5" />
              {vendor.email}
            </span>
            {vendor.phone && (
              <span className="flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" />
                {vendor.phone}
              </span>
            )}
          </div>

          {/* Quick stats */}
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <Languages className="w-3.5 h-3.5" />
              {summary.language_pairs_active} languages
            </span>
            <span className="flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5" />
              {summary.rates_active} rates
            </span>
            <span className="flex items-center gap-1">
              <Shield className="w-3.5 h-3.5" />
              Portal: {portalLabel}
            </span>
            <span className="flex items-center gap-1">
              <Briefcase className="w-3.5 h-3.5" />
              {summary.active_job_count} active jobs
            </span>
          </div>
        </div>

        {/* Right: actions dropdown */}
        <div className="relative shrink-0">
          <button
            onClick={() => setActionsOpen(!actionsOpen)}
            disabled={actionLoading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <MoreHorizontal className="w-4 h-4" />
            Actions
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          {actionsOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setActionsOpen(false)}
              />
              <div className="absolute right-0 mt-1 z-50 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                <button
                  onClick={handleImpersonate}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <ExternalLink className="w-4 h-4" />
                  View as vendor
                </button>
                <div className="border-t border-gray-100 my-1" />
                <button
                  onClick={handleToggleStatus}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Power className="w-4 h-4" />
                  {vendor.status === "active" ? "Deactivate" : "Activate"} Vendor
                </button>
                <button
                  onClick={handleSendInvitation}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Send className="w-4 h-4" />
                  Send Invitation
                </button>
                {vendor.invitation_sent_at && !vendor.invitation_accepted_at && (
                  <button
                    onClick={handleSendReminder}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Bell className="w-4 h-4" />
                    Send Reminder
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
