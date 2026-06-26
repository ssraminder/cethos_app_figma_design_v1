import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../../lib/supabase";

const DROPBOX_APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY;

type Purpose = "legacy" | "team";

interface ConnRow {
  purpose: Purpose;
  connected: boolean;
  account_email: string | null;
  connected_at: string | null;
}

const SLOTS: { purpose: Purpose; title: string; blurb: string }[] = [
  {
    purpose: "team",
    title: "Cethos Team Dropbox",
    blurb:
      "The team account that holds the per-workflow project folders (dropbox-team-sync). This is the canonical store going forward.",
  },
  {
    purpose: "legacy",
    title: "Legacy Dropbox",
    blurb:
      "The original personal account used by the old dropbox-sync. Kept as a backup during cutover; will be retired once the team sync is verified.",
  },
];

export default function DropboxSettings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [connections, setConnections] = useState<ConnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<Purpose | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const redirectUri = `${window.location.origin}/admin/settings/dropbox`;

  useEffect(() => {
    const code = searchParams.get("code");
    if (code) {
      const purpose = (searchParams.get("state") as Purpose) || "legacy";
      exchangeCode(code, purpose);
    } else {
      checkStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkStatus() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("dropbox-oauth", {
        body: { action: "status" },
      });
      if (error) throw error;
      setConnections(Array.isArray(data?.connections) ? data.connections : []);
    } catch (err: any) {
      console.error("Status check error:", err);
      setMessage({ type: "error", text: "Failed to check Dropbox connection status" });
    } finally {
      setLoading(false);
    }
  }

  async function exchangeCode(code: string, purpose: Purpose) {
    setLoading(true);
    setActing(purpose);
    try {
      const { data, error } = await supabase.functions.invoke("dropbox-oauth", {
        body: { action: "exchange", code, redirect_uri: redirectUri, purpose },
      });
      if (error) throw error;
      if (data?.success) {
        setMessage({
          type: "success",
          text: `Connected ${purpose === "team" ? "Team" : "Legacy"} Dropbox as ${data.account_email}`,
        });
        window.history.replaceState({}, "", "/admin/settings/dropbox");
        await checkStatus();
      } else {
        setMessage({ type: "error", text: data?.error || "Failed to connect" });
      }
    } catch (err: any) {
      console.error("Exchange error:", err);
      let detail = "Failed to exchange authorization code";
      try {
        const body = err?.context ? await err.context.json() : null;
        if (body?.error) detail = body.error;
      } catch {
        /* use default */
      }
      setMessage({ type: "error", text: detail });
    } finally {
      setActing(null);
      setLoading(false);
    }
  }

  function handleConnect(purpose: Purpose) {
    if (!DROPBOX_APP_KEY) {
      setMessage({ type: "error", text: "VITE_DROPBOX_APP_KEY is not configured" });
      return;
    }
    const params = new URLSearchParams({
      client_id: DROPBOX_APP_KEY,
      redirect_uri: redirectUri,
      response_type: "code",
      token_access_type: "offline",
      state: purpose, // carried back on the callback so we know which slot
    });
    window.location.href = `https://www.dropbox.com/oauth2/authorize?${params}`;
  }

  async function handleDisconnect(purpose: Purpose) {
    if (!confirm(`Disconnect the ${purpose === "team" ? "Team" : "Legacy"} Dropbox? Existing shared links remain active.`)) return;
    setActing(purpose);
    try {
      const { error } = await supabase.functions.invoke("dropbox-oauth", {
        body: { action: "disconnect", purpose },
      });
      if (error) throw error;
      setMessage({ type: "success", text: `${purpose === "team" ? "Team" : "Legacy"} Dropbox disconnected` });
      await checkStatus();
    } catch (err: any) {
      setMessage({ type: "error", text: "Failed to disconnect" });
    } finally {
      setActing(null);
    }
  }

  const slotFor = (purpose: Purpose): ConnRow | undefined =>
    connections.find((c) => c.purpose === purpose);

  if (loading && connections.length === 0) {
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

      <h1 className="text-2xl font-bold text-gray-900 mb-2">Dropbox Integration</h1>
      <p className="text-gray-600 mb-6">
        Two slots: the <strong>Team</strong> account holds the per-workflow project folders; the{" "}
        <strong>Legacy</strong> account is the retiring backup.
      </p>

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

      <div className="space-y-4">
        {SLOTS.map(({ purpose, title, blurb }) => {
          const slot = slotFor(purpose);
          const connected = !!slot?.connected;
          const busy = acting === purpose;
          return (
            <div key={purpose} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <div className={`w-3 h-3 rounded-full ${connected ? "bg-green-500" : "bg-gray-300"}`} />
                    <span className="text-lg font-medium text-gray-900">{title}</span>
                    {connected && (
                      <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5">
                        Connected
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mb-3">{blurb}</p>
                  {connected && (
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>
                        <span className="font-medium text-gray-700">Account:</span> {slot?.account_email}
                      </p>
                      {slot?.connected_at && (
                        <p>
                          <span className="font-medium text-gray-700">Connected:</span>{" "}
                          {new Date(slot.connected_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {connected ? (
                    <button
                      onClick={() => handleDisconnect(purpose)}
                      disabled={busy}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      {busy ? "Disconnecting..." : "Disconnect"}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnect(purpose)}
                      disabled={busy}
                      className={`px-5 py-2 text-white rounded-lg font-medium disabled:opacity-50 ${
                        purpose === "team" ? "bg-teal-600 hover:bg-teal-700" : "bg-blue-600 hover:bg-blue-700"
                      }`}
                    >
                      {busy ? "Connecting..." : `Connect ${purpose === "team" ? "Team" : "Legacy"}`}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
