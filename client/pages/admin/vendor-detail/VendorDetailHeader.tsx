import { useEffect, useState } from "react";
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
  // Recruitment application linked via vendors.cvp_translator_id. The
  // get-vendor-detail edge function doesn't expose this field today, so we
  // read it directly. Two extra single-row queries — cheap and keeps the
  // backend untouched.
  const [linkedApp, setLinkedApp] = useState<{ id: string; number: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: vRow } = await supabase
        .from("vendors")
        .select("cvp_translator_id")
        .eq("id", vendor.id)
        .maybeSingle();
      const tId = (vRow as { cvp_translator_id: string | null } | null)?.cvp_translator_id ?? null;
      if (!tId) return;
      const { data: tRow } = await supabase
        .from("cvp_translators")
        .select("application_id")
        .eq("id", tId)
        .maybeSingle();
      const appId = (tRow as { application_id: string | null } | null)?.application_id ?? null;
      if (!appId) return;
      const { data: aRow } = await supabase
        .from("cvp_applications")
        .select("id, application_number")
        .eq("id", appId)
        .maybeSingle();
      if (!cancelled && aRow) {
        setLinkedApp({
          id: (aRow as { id: string }).id,
          number: ((aRow as { application_number: string | null }).application_number) ?? null,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vendor.id]);

  const handleToggleStatus = async () => {
    const activating = vendor.status !== "active";
    // Gate: a vendor can only be marked active once CV + signed NDA are on
    // file (agencies are exempt from the CV requirement — handled server-side
    // in get-vendor-detail). `=== false` so we only block when the backend
    // positively reports the vendor ineligible; undefined (stale deploy) fails
    // open rather than locking out every activation.
    if (activating && summary.activation_eligible === false) {
      const missing =
        summary.missing_for_activation?.length > 0
          ? summary.missing_for_activation.join(" and ")
          : "CV and signed NDA";
      toast.error(
        `Can't activate ${vendor.full_name} — missing ${missing}. Upload the CV and signed NDA first.`,
      );
      setActionsOpen(false);
      return;
    }
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

  // Manually email the vendor a portal invitation (the "set up your account"
  // link, expires in 72h). `mode: "invitation"` routes vendor-auth-otp-send to
  // sendInvitationForVendor, which also stamps invitation_sent_at.
  const handleSendInvitation = async () => {
    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke("vendor-auth-otp-send", {
        body: { email: vendor.email, mode: "invitation" },
      });
      if (error) throw error;
      toast.success(`Invitation sent to ${vendor.email}`);
      await onRefresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to send invitation",
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
          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 flex-wrap">
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
            {linkedApp && (
              <a
                href={`/admin/recruitment/${linkedApp.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-800"
                title="Open the original recruitment application in a new tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {linkedApp.number ? `View application ${linkedApp.number}` : "View application"}
              </a>
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

          {/* Profile completeness */}
          {(() => {
            const pct = summary.profile_completeness ?? 0;
            const missing = summary.missing_for_activation ?? [];
            const barColor =
              pct >= 100
                ? "bg-green-500"
                : pct >= 60
                  ? "bg-teal-500"
                  : "bg-amber-500";
            return (
              <div className="mt-3 max-w-md">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500">
                    Profile completeness
                  </span>
                  <span className="text-xs font-semibold text-gray-700">
                    {pct}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {vendor.status !== "active" && missing.length > 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    Not yet activatable — missing {missing.join(" and ")}.
                  </p>
                )}
              </div>
            );
          })()}
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
                  title="Email the vendor an invitation link to set up their portal account."
                >
                  <Send className="w-4 h-4" />
                  {vendor.invitation_sent_at ? "Resend Invitation" : "Send Invitation"}
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
