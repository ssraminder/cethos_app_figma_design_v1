import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Loader2,
  MessageSquare,
  ExternalLink,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatDistanceToNow, format } from "date-fns";

const PAGE_SIZE = 25;

interface CallRow {
  id: string;
  direction: "Inbound" | "Outbound";
  from_number_e164: string | null;
  from_name: string | null;
  to_number_e164: string | null;
  to_name: string | null;
  staff_full_name: string | null;
  started_at: string;
  duration_sec: number | null;
  result: string | null;
  has_recording: boolean;
  note_count: number;
  total_count: number;
}

function formatDuration(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function directionIcon(row: CallRow) {
  if (row.result?.toLowerCase().includes("missed") || row.result === "Voicemail") {
    return <PhoneMissed className="w-4 h-4 text-red-500" />;
  }
  if (row.direction === "Inbound") return <PhoneIncoming className="w-4 h-4 text-emerald-600" />;
  return <PhoneOutgoing className="w-4 h-4 text-blue-600" />;
}

export default function CustomerCallsTab({ customerId }: { customerId: string }) {
  const [rows, setRows] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("comms_list_call_logs", {
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
      p_customer_id: customerId,
    });
    setLoading(false);
    if (error) {
      console.error("comms_list_call_logs failed", error);
      return;
    }
    const list = (data || []) as CallRow[];
    setRows(list);
    setTotal(list[0]?.total_count ?? 0);
  }, [customerId, page]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-10 text-gray-500">
        <Phone className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <div>No calls linked to this customer yet.</div>
        <div className="text-xs mt-1">
          Calls are auto-linked by phone number. To attach an existing call, open it from{" "}
          <Link to="/admin/calls" className="text-blue-600 hover:underline">/admin/calls</Link>.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-gray-600">
          <Phone className="w-4 h-4 inline mr-1" /> {total} call{total === 1 ? "" : "s"} linked
        </div>
        <Link
          to={`/admin/calls?customer=${customerId}`}
          className="text-sm text-blue-600 hover:underline"
        >
          Open in Calls view →
        </Link>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-3 py-2 w-8"></th>
            <th className="text-left px-3 py-2">When</th>
            <th className="text-left px-3 py-2">Counterparty</th>
            <th className="text-left px-3 py-2">Staff</th>
            <th className="text-left px-3 py-2">Duration</th>
            <th className="text-left px-3 py-2">Result</th>
            <th className="text-left px-3 py-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const counter = row.direction === "Inbound"
              ? { name: row.from_name, phone: row.from_number_e164 }
              : { name: row.to_name, phone: row.to_number_e164 };
            return (
              <tr key={row.id} className="border-b hover:bg-blue-50">
                <td className="px-3 py-2">{directionIcon(row)}</td>
                <td className="px-3 py-2 whitespace-nowrap" title={format(new Date(row.started_at), "PPpp")}>
                  {formatDistanceToNow(new Date(row.started_at), { addSuffix: true })}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{counter.name || "—"}</div>
                  <div className="text-xs text-gray-500 font-mono">{counter.phone || "—"}</div>
                </td>
                <td className="px-3 py-2 text-gray-700">{row.staff_full_name || "—"}</td>
                <td className="px-3 py-2 text-gray-700">{formatDuration(row.duration_sec)}</td>
                <td className="px-3 py-2 text-gray-700">{row.result || "—"}</td>
                <td className="px-3 py-2 text-gray-700">
                  {row.note_count > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" /> {row.note_count}
                    </span>
                  ) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-3 text-sm">
          <div>Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}</div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >Prev</button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= total}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
