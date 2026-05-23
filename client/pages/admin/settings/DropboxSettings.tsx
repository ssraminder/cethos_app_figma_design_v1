import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../../lib/supabase";

const DROPBOX_APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY;

export default function DropboxSettings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<{
    connected: boolean;
    account_email: string | null;
    connected_at: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const redirectUri = `${window.location.origin}/admin/settings/dropbox`;

  useEffect(() => {
    const code = searchParams.get("code");
    if (code) {
      exchangeCode(code);
    } else {
      checkStatus();
    }
  }, []);

  async function checkStatus() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("dropbox-oauth", {
        body: { action: "status" },
      });
      if (error) throw error;
      setStatus(data);
    } catch (err: any) {
      console.error("Status check error:", err);
      setMessage({ type: "error", text: "Failed to check Dropbox connection status" });
    } finally {
      setLoading(false);
    }
  }

  async function exchangeCode(code: string) {
    setLoading(true);
    setActing(true);
    try {
      const { data, error } = await supabase.functions.invoke("dropbox-oauth", {
        body: { action: "exchange", code, redirect_uri: redirectUri },
      });
      if (error) throw error;
      if (data?.success) {
        setMessage({ type: "success", text: `Connected to Dropbox as ${data.account_email}` });
        // Clean the URL
        window.history.replaceState({}, "", "/admin/settings/dropbox");
        await checkStatus();
      } else {
        setMessage({ type: "error", text: data?.error || "Failed to connect" });
      }
    } catch (err: any) {
      console.error("Exchange error:", err);
      setMessage({ type: "error", text: "Failed to exchange authorization code" });
    } finally {
      setActing(false);
      setLoading(false);
    }
  }

  function handleConnect() {
    if (!DROPBOX_APP_KEY) {
      setMessage({ type: "error", text: "VITE_DROPBOX_APP_KEY is not configured" });
      return;
    }
    const params = new URLSearchParams({
      client_id: DROPBOX_APP_KEY,
      redirect_uri: redirectUri,
      response_type: "code",
      token_access_type: "offline",
    });
    window.location.href = `https://www.dropbox.com/oauth2/authorize?${params}`;
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Dropbox? Existing shared links will remain active.")) return;
    setActing(true);
    try {
      const { data, error } = await supabase.functions.invoke("dropbox-oauth", {
        body: { action: "disconnect" },
      });
      if (error) throw error;
      setStatus({ connected: false, account_email: null, connected_at: null });
      setMessage({ type: "success", text: "Dropbox disconnected" });
    } catch (err: any) {
      setMessage({ type: "error", text: "Failed to disconnect" });
    } finally {
      setActing(false);
    }
  }

  if (loading && !status) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <button
        onClick={() => navigate("/admin/settings")}
        className="mb-4 text-blue-600 hover:text-blue-800 font-medium"
      >
        &larr; Back to Settings
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dropbox Integration</h1>

      {message && (
        <div
          className={`mb-6 p-4 rounded-lg border ${
            message.type === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        {status?.connected ? (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-3 h-3 bg-green-500 rounded-full" />
              <span className="text-lg font-medium text-gray-900">Connected</span>
            </div>
            <div className="space-y-2 mb-6 text-sm text-gray-600">
              <p>
                <span className="font-medium text-gray-700">Account:</span>{" "}
                {status.account_email}
              </p>
              {status.connected_at && (
                <p>
                  <span className="font-medium text-gray-700">Connected:</span>{" "}
                  {new Date(status.connected_at).toLocaleDateString()}
                </p>
              )}
            </div>
            <button
              onClick={handleDisconnect}
              disabled={acting}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {acting ? "Disconnecting..." : "Disconnect Dropbox"}
            </button>
          </div>
        ) : (
          <div>
            <p className="text-gray-600 mb-4">
              Connect your Dropbox account to save and share project files directly from the portal.
            </p>
            <button
              onClick={handleConnect}
              disabled={acting}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
            >
              {acting ? "Connecting..." : "Connect Dropbox"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
