import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Tablet, Loader2, AlertCircle } from "lucide-react";
import {
  getDeviceCreds,
  kioskPost,
  setDeviceCreds,
} from "./KioskApi";

export default function KioskPairing() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // If already paired, go straight to kiosk home
  useEffect(() => {
    const creds = getDeviceCreds();
    if (creds) navigate("/kiosk", { replace: true });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const clean = code.trim().toUpperCase();
    if (clean.length < 6) {
      setError("Enter the 6-character pairing code from the admin portal.");
      return;
    }
    setSubmitting(true);
    try {
      const data = await kioskPost<{
        success: true;
        device_id: string;
        device_name: string;
        device_secret: string;
      }>(
        "kiosk-pair-redeem",
        { code: clean },
        { includeDevice: false },
      );
      setDeviceCreds({
        device_id: data.device_id,
        device_name: data.device_name,
        device_secret: data.device_secret,
      });
      navigate("/kiosk", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pairing failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-cyan-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-teal-600 rounded-xl flex items-center justify-center">
            <Tablet className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Pair this tablet
            </h1>
            <p className="text-sm text-gray-500">
              Ask an admin for the 6-character code
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Pairing code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/[^A-Z0-9]/gi, "").slice(0, 6))
              }
              maxLength={6}
              autoFocus
              placeholder="XXXXXX"
              className="w-full px-4 py-4 text-center text-3xl font-mono tracking-widest uppercase border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || code.length < 6}
            className="w-full bg-teal-600 text-white py-4 rounded-xl text-lg font-semibold hover:bg-teal-700 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
            Pair tablet
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-6">
          To create a pairing code, an admin goes to
          <br />
          Admin Portal → Kiosk Devices → "Pair new device"
        </p>
      </div>
    </div>
  );
}
