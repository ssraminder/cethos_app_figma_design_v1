import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CheckCircle, FileText, Loader2, Mail, Shield } from "lucide-react";

interface Props {
  staffUserId: string;
  staffEmail: string;
  onSigned: () => void;
}

type Step = "loading" | "show_nda" | "otp_sent" | "signing" | "done";

async function callFn(name: string, body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    },
  );
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

export default function StaffNdaGate({ staffUserId, staffEmail, onSigned }: Props) {
  const [step, setStep] = useState<Step>("loading");
  const [ndaHtml, setNdaHtml] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);

  useEffect(() => {
    checkNdaStatus();
  }, []);

  const checkNdaStatus = async () => {
    // Check if staff has a current NDA signature
    const { data } = await supabase
      .from("staff_nda_signatures")
      .select("id, signed_at")
      .eq("staff_user_id", staffUserId)
      .eq("is_current", true)
      .maybeSingle();

    if (data) {
      onSigned();
      return;
    }

    // Fetch NDA template HTML
    const { data: tmpl } = await supabase
      .from("nda_templates")
      .select("body_html")
      .eq("agreement_type", "staff_nda")
      .eq("is_active", true)
      .single();

    setNdaHtml(tmpl?.body_html ?? "");
    setStep("show_nda");
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
      setScrolledToBottom(true);
    }
  };

  const sendOtp = async () => {
    setBusy(true);
    setError("");
    try {
      await callFn("staff-nda-otp-send", { staff_user_id: staffUserId });
      setStep("otp_sent");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSign = async () => {
    if (!otpCode.trim() || otpCode.trim().length !== 6) {
      setError("Please enter the 6-digit code sent to your email.");
      return;
    }
    if (!fullName.trim()) {
      setError("Please type your full name to sign.");
      return;
    }
    if (!agreed) {
      setError("Please confirm you have read and agree to the agreement.");
      return;
    }
    setBusy(true);
    setError("");
    setStep("signing");
    try {
      await callFn("staff-nda-sign", {
        staff_user_id: staffUserId,
        otp_code: otpCode.trim(),
        full_name: fullName.trim(),
      });
      setStep("done");
      setTimeout(onSigned, 1800);
    } catch (err: any) {
      setError(err.message);
      setStep("otp_sent");
    } finally {
      setBusy(false);
    }
  };

  if (step === "loading") {
    return (
      <div className="fixed inset-0 bg-white z-[100] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="fixed inset-0 bg-white z-[100] flex items-center justify-center">
        <div className="text-center">
          <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-3" />
          <h2 className="text-xl font-semibold text-gray-900">Agreement signed</h2>
          <p className="text-gray-500 mt-1">Taking you to the portal…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b">
          <Shield className="w-6 h-6 text-teal-600 flex-shrink-0" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Staff Confidentiality Agreement required
            </h2>
            <p className="text-sm text-gray-500">
              You must sign this agreement before accessing the portal.
            </p>
          </div>
        </div>

        {/* NDA text */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-4 prose prose-sm max-w-none text-gray-700"
          dangerouslySetInnerHTML={{ __html: ndaHtml }}
        />

        {/* Scroll hint */}
        {!scrolledToBottom && (
          <div className="text-center text-xs text-gray-400 py-1 border-t bg-gray-50">
            Scroll to read the full agreement before signing ↓
          </div>
        )}

        {/* Footer — sign area */}
        <div className="border-t px-6 py-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {step === "show_nda" && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Signing as <strong>{staffEmail}</strong>
              </p>
              <button
                onClick={sendOtp}
                disabled={busy || !scrolledToBottom}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 text-sm"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Send verification code to my email
              </button>
            </div>
          )}

          {step === "otp_sent" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 flex items-center gap-1">
                <Mail className="w-4 h-4 text-teal-500" />
                A 6-digit code was sent to <strong>{staffEmail}</strong>. It expires in 15 minutes.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Verification code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="6-digit code"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 font-mono tracking-widest"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Type your full name to sign
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full legal name"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-teal-600"
                />
                I have read and agree to the Cethos Staff Confidentiality and Non-Solicitation Agreement.
                I understand this is a legally binding document.
              </label>
              <div className="flex items-center justify-between">
                <button
                  onClick={sendOtp}
                  disabled={busy}
                  className="text-sm text-gray-500 hover:text-teal-600 underline"
                >
                  Resend code
                </button>
                <button
                  onClick={handleSign}
                  disabled={busy || !agreed || !otpCode || !fullName.trim()}
                  className="flex items-center gap-2 px-5 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 text-sm font-medium"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  Sign Agreement
                </button>
              </div>
            </div>
          )}

          {step === "signing" && (
            <div className="flex items-center justify-center gap-2 py-2 text-teal-600">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Recording your signature…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
