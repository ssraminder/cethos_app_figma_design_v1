import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  CheckCircle,
  XCircle,
  Clock,
  Key,
  Shield,
  AlertTriangle,
  Mail,
  Send,
  Bell,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { TabProps } from "./types";
import { formatDate, formatDateTime } from "./constants";

export default function VendorAuthTab({ vendorData, onRefresh }: TabProps) {
  const { vendor, auth, activeSessions, summary } = vendorData;
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  const hasPortalAuth = summary.has_portal_access;

  const executeAction = async (
    action: string,
    fn: () => Promise<void>,
    successMsg: string
  ) => {
    setActionLoading(action);
    try {
      await fn();
      toast.success(successMsg);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed: ${action}`);
    }
    setActionLoading(null);
    setConfirmAction(null);
  };

  const handleSendInvitation = () =>
    executeAction(
      "invite",
      async () => {
        const { error } = await supabase.functions.invoke(
          "vendor-auth-otp-send",
          { body: { email: vendor.email, channel: "email" } }
        );
        if (error) throw error;
      },
      `Invitation sent to ${vendor.email}`
    );

  const handleSendReminder = () =>
    executeAction(
      "reminder",
      async () => {
        const { error } = await supabase.functions.invoke(
          "vendor-auth-otp-send",
          { body: { email: vendor.email, is_reminder: true } }
        );
        if (error) throw error;
      },
      `Reminder sent to ${vendor.email}`
    );

  const handleForceReset = () =>
    executeAction(
      "reset",
      async () => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const response = await fetch(
          `${supabaseUrl}/functions/v1/vendor-set-password`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${anonKey}`,
              apikey: anonKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              vendor_id: vendor.id,
              action: "force_reset",
            }),
          }
        );
        const result = await response.json();
        if (!result.success) throw new Error(result.error || "Failed");
      },
      "Password reset flag set — vendor must reset on next login"
    );

  const handleTerminateSessions = () =>
    executeAction(
      "terminate",
      async () => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const response = await fetch(
          `${supabaseUrl}/functions/v1/vendor-set-password`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${anonKey}`,
              apikey: anonKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              vendor_id: vendor.id,
              action: "terminate_sessions",
            }),
          }
        );
        const result = await response.json();
        if (!result.success) throw new Error(result.error || "Failed");
      },
      "All sessions terminated"
    );

  const handleRevokeAccess = () =>
    executeAction(
      "revoke",
      async () => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const response = await fetch(
          `${supabaseUrl}/functions/v1/vendor-set-password`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${anonKey}`,
              apikey: anonKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              vendor_id: vendor.id,
              action: "revoke_access",
            }),
          }
        );
        const result = await response.json();
        if (!result.success) throw new Error(result.error || "Failed");
      },
      "Portal access revoked"
    );

  const isLoading = (action: string) => actionLoading === action;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Portal Access Status */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
        <h3 className="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wider">
          Portal Access Status
        </h3>

        {hasPortalAuth ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-sm font-medium text-green-700">
                Active
              </span>
            </div>

            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex justify-between py-1.5 border-b border-gray-50">
                <span className="flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-gray-400" />
                  Has Password
                </span>
                <span className="font-medium">
                  {auth ? (
                    <span className="text-green-600">Yes</span>
                  ) : (
                    <span className="text-gray-400">No</span>
                  )}
                </span>
              </div>
              {auth?.password_set_at && (
                <div className="flex justify-between py-1.5 border-b border-gray-50">
                  <span>Password Set At</span>
                  <span>{formatDateTime(auth.password_set_at)}</span>
                </div>
              )}
              <div className="flex justify-between py-1.5 border-b border-gray-50">
                <span>Must Reset</span>
                <span>
                  {auth?.must_reset ? (
                    <span className="flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="w-3.5 h-3.5" /> Yes
                    </span>
                  ) : (
                    "No"
                  )}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-50">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  Active Sessions
                </span>
                <span className="font-medium">{activeSessions}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-gray-400" />
            <span className="text-sm text-gray-500">No portal access</span>
          </div>
        )}
      </div>

      {/* Invitation Status */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
        <h3 className="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wider">
          Invitation Status
        </h3>

        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex justify-between py-1.5 border-b border-gray-50">
            <span>Invitation Sent</span>
            <span className="font-medium">
              {vendor.invitation_sent_at
                ? formatDateTime(vendor.invitation_sent_at)
                : "Never"}
            </span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-gray-50">
            <span>Invitation Accepted</span>
            <span className="font-medium">
              {vendor.invitation_accepted_at
                ? formatDateTime(vendor.invitation_accepted_at)
                : vendor.invitation_sent_at
                  ? "Pending"
                  : "—"}
            </span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-gray-50">
            <span>Reminders Sent</span>
            <span className="font-medium">
              {vendor.invitation_reminder_count}
            </span>
          </div>
          {vendor.last_reminder_sent_at && (
            <div className="flex justify-between py-1.5 border-b border-gray-50">
              <span>Last Reminder</span>
              <span>{formatDateTime(vendor.last_reminder_sent_at)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-100 p-5">
        <h3 className="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wider">
          Actions
        </h3>

        <div className="flex flex-wrap gap-3">
          {/* Send / Resend Invitation */}
          <button
            onClick={handleSendInvitation}
            disabled={!!actionLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
          >
            {isLoading("invite") ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {vendor.invitation_sent_at ? "Resend Invitation" : "Send Invitation"}
          </button>

          {/* Send Reminder */}
          {vendor.invitation_sent_at && !vendor.invitation_accepted_at && (
            <button
              onClick={handleSendReminder}
              disabled={!!actionLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {isLoading("reminder") ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Bell className="w-4 h-4" />
              )}
              Send Reminder
            </button>
          )}

          {/* Force Password Reset */}
          {hasPortalAuth && auth && (
            <button
              onClick={() => {
                if (confirmAction === "reset") {
                  handleForceReset();
                } else {
                  setConfirmAction("reset");
                }
              }}
              disabled={!!actionLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-50"
            >
              {isLoading("reset") ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Shield className="w-4 h-4" />
              )}
              {confirmAction === "reset"
                ? "Click again to confirm"
                : "Force Password Reset"}
            </button>
          )}

          {/* Terminate Sessions */}
          <button
            onClick={() => {
              if (confirmAction === "terminate") {
                handleTerminateSessions();
              } else {
                setConfirmAction("terminate");
              }
            }}
            disabled={!!actionLoading || activeSessions === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {isLoading("terminate") ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            {confirmAction === "terminate"
              ? "Click again to confirm"
              : `Terminate All Sessions (${activeSessions})`}
          </button>

          {/* Revoke Access */}
          {hasPortalAuth && (
            <button
              onClick={() => {
                if (confirmAction === "revoke") {
                  handleRevokeAccess();
                } else {
                  setConfirmAction("revoke");
                }
              }}
              disabled={!!actionLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {isLoading("revoke") ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              {confirmAction === "revoke"
                ? "Click again to confirm"
                : "Revoke Portal Access"}
            </button>
          )}
        </div>

        {confirmAction && (
          <p className="text-xs text-amber-600 mt-2">
            Click the highlighted button again to confirm, or{" "}
            <button
              onClick={() => setConfirmAction(null)}
              className="underline hover:text-amber-800"
            >
              cancel
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
