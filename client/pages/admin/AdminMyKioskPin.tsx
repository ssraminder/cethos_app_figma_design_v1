import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import {
  KeyRound,
  CheckCircle,
  AlertCircle,
  Tablet,
  Info,
} from "lucide-react";
import { format } from "date-fns";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export default function AdminMyKioskPin() {
  const { session } = useAdminAuthContext();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinSetAt, setPinSetAt] = useState<string | null>(null);
  const [hasPin, setHasPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!session?.staffId) return;
      const { data } = await supabase
        .from("staff_users")
        .select("kiosk_pin_hash, kiosk_pin_set_at")
        .eq("id", session.staffId)
        .maybeSingle();
      if (data) {
        setHasPin(!!data.kiosk_pin_hash);
        setPinSetAt(data.kiosk_pin_set_at);
      }
    };
    load();
  }, [session?.staffId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!/^\d{4,6}$/.test(pin)) {
      setMessage({
        type: "error",
        text: "PIN must be 4–6 digits (numbers only).",
      });
      return;
    }
    if (pin !== confirmPin) {
      setMessage({ type: "error", text: "PINs do not match." });
      return;
    }

    setSaving(true);
    try {
      const resp = await fetch(
        `${SUPABASE_URL}/functions/v1/set-staff-kiosk-pin`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ staff_id: session?.staffId, pin }),
        },
      );
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || "Failed to set PIN");
      }
      setMessage({ type: "success", text: "Kiosk PIN updated." });
      setHasPin(true);
      setPinSetAt(new Date().toISOString());
      setPin("");
      setConfirmPin("");
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <KeyRound className="w-7 h-7 text-teal-600" />
          My Kiosk PIN
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          A short numeric PIN used to unlock paired office tablets during a
          walk-in quote session. This is separate from your admin login.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex gap-3">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900">
          <p className="font-medium mb-1">How the PIN is used</p>
          <p>
            When you start a kiosk quote, you'll enter your email + this PIN on
            the tablet. You'll re-enter it once more after the customer is done,
            to complete the handoff. The PIN never lets anyone into the full
            admin portal.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-6">
        <div className="mb-4 flex items-center gap-2 text-sm">
          <Tablet className="w-4 h-4 text-gray-400" />
          {hasPin ? (
            <span className="text-gray-600">
              PIN set{" "}
              {pinSetAt
                ? format(new Date(pinSetAt), "yyyy-MM-dd")
                : ""}
              . You can change it below.
            </span>
          ) : (
            <span className="text-amber-700 font-medium">
              You haven't set a PIN yet.
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New PIN (4–6 digits)
            </label>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="\d{4,6}"
              maxLength={6}
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="••••"
              className="w-full px-3 py-2 border rounded-lg text-lg tracking-widest font-mono focus:ring-2 focus:ring-teal-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="\d{4,6}"
              maxLength={6}
              value={confirmPin}
              onChange={(e) =>
                setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="••••"
              className="w-full px-3 py-2 border rounded-lg text-lg tracking-widest font-mono focus:ring-2 focus:ring-teal-500"
              required
            />
          </div>

          {message && (
            <div
              className={`flex items-start gap-2 text-sm px-3 py-2 rounded ${
                message.type === "success"
                  ? "bg-green-50 text-green-800"
                  : "bg-red-50 text-red-800"
              }`}
            >
              {message.type === "success" ? (
                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              )}
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !pin || !confirmPin}
            className="w-full bg-teal-600 text-white py-2 rounded-lg hover:bg-teal-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : hasPin ? "Update PIN" : "Set PIN"}
          </button>
        </form>
      </div>
    </div>
  );
}
