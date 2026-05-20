import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  MessageSquare,
  Loader2,
  Send,
  ExternalLink,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useStaffAuth } from "@/context/StaffAuthContext";
import { formatDistanceToNow, format } from "date-fns";

interface CustomerSms {
  id: string;
  direction: "inbound" | "outbound";
  from_number: string;
  to_number: string;
  body: string;
  status: string;
  sent_at: string | null;
  received_at: string | null;
  read_at: string | null;
  template_key: string | null;
  staff_full_name: string | null;
  created_at: string;
}

export default function CustomerSmsTab({
  customerId,
  customerPhone,
}: {
  customerId: string;
  customerPhone?: string | null;
}) {
  const { staff } = useStaffAuth();
  const [messages, setMessages] = useState<CustomerSms[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("comms_list_customer_sms", { p_customer_id: customerId });
    setLoading(false);
    if (error) {
      console.error("comms_list_customer_sms failed", error);
      return;
    }
    setMessages((data || []) as CustomerSms[]);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const peerNumber = customerPhone || messages.find((m) => m.direction === "inbound")?.from_number || messages.find((m) => m.direction === "outbound")?.to_number || null;

  const send = async () => {
    if (!reply.trim() || !peerNumber) return;
    setSending(true);
    setSmsError(null);
    const { data, error } = await supabase.functions.invoke("rc-send-sms", {
      body: {
        custom_body: reply.trim(),
        to_number: peerNumber,
        staff_user_id: staff?.id,
        customer_id: customerId,
      },
    });
    setSending(false);
    if (error || !data?.ok) {
      setSmsError(data?.error || error?.message || "Failed");
      return;
    }
    setReply("");
    await load();
  };

  // Show oldest → newest (chronological, like a real conversation)
  const chronological = [...messages].reverse();

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-gray-600 flex items-center gap-2">
          <MessageSquare className="w-4 h-4" /> {messages.length} message{messages.length === 1 ? "" : "s"}
        </div>
        <Link
          to={`/admin/sms`}
          className="text-sm text-blue-600 hover:underline"
        >
          Open in SMS inbox →
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : chronological.length === 0 ? (
        <div className="text-center py-10 text-gray-500 border border-dashed rounded">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <div>No SMS history with this customer yet.</div>
          {peerNumber && (
            <div className="text-xs mt-1">Reply box below sends to {peerNumber}.</div>
          )}
        </div>
      ) : (
        <div className="space-y-2 mb-4 max-h-[500px] overflow-y-auto p-2 border rounded bg-gray-50">
          {chronological.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-md rounded-lg px-3 py-2 ${
                  m.direction === "outbound"
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-gray-200 text-gray-900"
                }`}
              >
                <div className="whitespace-pre-wrap text-sm">{m.body}</div>
                <div
                  className={`text-[10px] mt-1 ${
                    m.direction === "outbound" ? "text-blue-100" : "text-gray-400"
                  }`}
                  title={format(new Date(m.received_at || m.sent_at || m.created_at), "PPpp")}
                >
                  {formatDistanceToNow(new Date(m.received_at || m.sent_at || m.created_at), { addSuffix: true })}
                  {m.direction === "outbound" && (
                    <>
                      <span> · {m.status}</span>
                      {m.staff_full_name && <span> · {m.staff_full_name}</span>}
                      {m.template_key && <span> · {m.template_key}</span>}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {peerNumber ? (
        <div>
          {smsError && <div className="mb-2 text-xs text-red-600">{smsError}</div>}
          <div className="flex items-end gap-2">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder={`Send SMS to ${peerNumber}…`}
              className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm resize-none"
            />
            <button
              onClick={send}
              disabled={!reply.trim() || sending}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send
            </button>
          </div>
          <div className="text-[10px] text-gray-400 mt-1">
            {reply.length} chars{reply.length > 160 && <span className="text-orange-500"> · over 160 chars, may be multiple segments</span>}
          </div>
        </div>
      ) : (
        <div className="text-xs text-gray-500 italic">
          No phone number on customer profile — can't send SMS until one is added.
        </div>
      )}
    </div>
  );
}
