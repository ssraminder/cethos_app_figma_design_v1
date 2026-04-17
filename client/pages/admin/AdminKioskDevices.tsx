import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import {
  Tablet,
  Plus,
  RefreshCw,
  CheckCircle,
  XCircle,
  Copy,
  X,
  ShieldOff,
  AlertCircle,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface StaffOption {
  id: string;
  full_name: string;
  email: string;
}

interface KioskDevice {
  id: string;
  name: string;
  is_active: boolean;
  default_staff_id: string | null;
  last_seen_at: string | null;
  created_at: string;
  revoked_at: string | null;
  staff?: StaffOption;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export default function AdminKioskDevices() {
  const { session } = useAdminAuthContext();
  const [devices, setDevices] = useState<KioskDevice[]>([]);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDefaultStaff, setFormDefaultStaff] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Pairing code display state
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingExpiresAt, setPairingExpiresAt] = useState<string | null>(null);
  const [pairingDeviceName, setPairingDeviceName] = useState("");

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: devs }, { data: staff }] = await Promise.all([
        supabase
          .from("kiosk_devices")
          .select(
            "id, name, is_active, default_staff_id, last_seen_at, created_at, revoked_at, staff:default_staff_id(id, full_name, email)",
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("staff_users")
          .select("id, full_name, email")
          .eq("is_active", true)
          .order("full_name"),
      ]);
      setDevices((devs as unknown as KioskDevice[]) || []);
      setStaffList((staff as StaffOption[]) || []);
    } catch (err) {
      console.error("Error loading kiosk devices:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    if (!formName.trim()) {
      setFormError("Device name is required");
      return;
    }
    if (!formDefaultStaff) {
      setFormError("Default staff is required");
      return;
    }
    setSaving(true);
    try {
      const resp = await fetch(
        `${SUPABASE_URL}/functions/v1/kiosk-pair-create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            name: formName.trim(),
            default_staff_id: formDefaultStaff,
            created_by_staff_id: session?.staffId,
          }),
        },
      );
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || "Failed to create device");
      }
      setPairingCode(data.pairing_code);
      setPairingExpiresAt(data.expires_at);
      setPairingDeviceName(data.name);
      setShowAddModal(false);
      setFormName("");
      setFormDefaultStaff("");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (device: KioskDevice) => {
    if (
      !confirm(
        `Revoke "${device.name}"? The tablet will be signed out on its next request and must be re-paired.`,
      )
    )
      return;
    try {
      const { error } = await supabase
        .from("kiosk_devices")
        .update({
          is_active: false,
          revoked_at: new Date().toISOString(),
        })
        .eq("id", device.id);
      if (error) throw error;
      await load();
    } catch (err) {
      alert(
        `Failed to revoke: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  };

  const copyPairingCode = () => {
    if (pairingCode) navigator.clipboard.writeText(pairingCode);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Tablet className="w-7 h-7 text-teal-600" />
            Kiosk Devices
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            Office tablets paired for front-desk fast-quote intake
          </p>
        </div>
        <button
          onClick={() => {
            setFormName("");
            setFormDefaultStaff("");
            setFormError("");
            setShowAddModal(true);
          }}
          className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Pair new device
        </button>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="p-10 text-center">
            <RefreshCw className="w-8 h-8 animate-spin text-teal-600 mx-auto" />
          </div>
        ) : devices.length === 0 ? (
          <div className="p-10 text-center text-gray-500">
            <Tablet className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            No paired devices yet. Click "Pair new device" to get started.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Device
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Default staff
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Last seen
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Paired
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {devices.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {d.name}
                  </td>
                  <td className="px-4 py-3">
                    {d.is_active ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded">
                        <CheckCircle className="w-3 h-3" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium bg-red-100 text-red-700 px-2 py-0.5 rounded">
                        <XCircle className="w-3 h-3" /> Revoked
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {d.staff?.full_name || d.staff?.email || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {d.last_seen_at
                      ? `${formatDistanceToNow(new Date(d.last_seen_at))} ago`
                      : "Never"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {format(new Date(d.created_at), "yyyy-MM-dd")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {d.is_active && (
                      <button
                        onClick={() => handleRevoke(d)}
                        className="text-red-600 hover:text-red-800 text-sm inline-flex items-center gap-1"
                      >
                        <ShieldOff className="w-4 h-4" /> Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ───────── Add device modal ───────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Pair new device</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Device name
                </label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Front desk iPad"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default staff
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Quotes created from this tablet are attributed to the unlocking
                  staff member. This is the fallback when no staff is unlocked.
                </p>
                <select
                  value={formDefaultStaff}
                  onChange={(e) => setFormDefaultStaff(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                  required
                >
                  <option value="">Select staff…</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name || s.email}
                    </option>
                  ))}
                </select>
              </div>
              {formError && (
                <div className="text-sm text-red-600 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {formError}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 disabled:opacity-60"
                >
                  {saving ? "Creating…" : "Create pairing code"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────── Pairing code reveal modal ───────── */}
      {pairingCode && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Pairing code</h2>
              <button
                onClick={() => setPairingCode(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              On <strong>{pairingDeviceName}</strong>, open{" "}
              <code className="bg-gray-100 px-1.5 py-0.5 rounded">/kiosk/pair</code>{" "}
              and enter:
            </p>
            <div className="my-6 text-center">
              <div className="text-5xl font-mono font-bold tracking-widest text-teal-700 bg-teal-50 py-6 rounded-lg select-all">
                {pairingCode}
              </div>
              <button
                onClick={copyPairingCode}
                className="mt-3 text-sm text-teal-600 hover:text-teal-800 inline-flex items-center gap-1"
              >
                <Copy className="w-4 h-4" /> Copy
              </button>
            </div>
            <p className="text-xs text-gray-500 text-center">
              Expires{" "}
              {pairingExpiresAt
                ? formatDistanceToNow(new Date(pairingExpiresAt), {
                    addSuffix: true,
                  })
                : "soon"}
              . This code can only be used once.
            </p>
            <button
              onClick={() => setPairingCode(null)}
              className="mt-5 w-full bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
