/**
 * VendorActivationEmailModal
 *
 * Replaces the old "Send activation emails" one-shot button with a
 * comprehensive control surface:
 *
 *  • Edit the email subject + body (live preview alongside).
 *  • Send a test email to a chosen address (preserves any edits).
 *  • Send all eligible now (manual override; uses the dedup window).
 *  • Configure the recurring cron: enable, batch size, interval.
 *
 * Reads/writes the singleton vendor_activation_email_schedule row.
 * The trigger on that table re-applies the pg_cron schedule on every
 * UPDATE — so changing batch_size or interval immediately reschedules.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Loader2,
  Send,
  X as XIcon,
  Eye,
  Clock,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

const DEFAULT_SUBJECT = "We're moving to a new vendor portal — your sign-in is ready";
const DEFAULT_BODY_HTML = `<h1 style="font-size:18px;font-weight:600;color:#0f766e;margin:0 0 16px;">We're moving to a new vendor portal</h1>
<p>Hi %FIRSTNAME%,</p>
<p>We're writing to let you know that <strong>CETHOS</strong> is moving to a new Translation Management System — our own <strong>CETHOS Vendor Portal</strong>. You're in one of the first language pools we're rolling this out to, because your work matters to us and we want you set up early.</p>

<h2 style="font-size:15px;color:#0f766e;margin:22px 0 8px;">The move is phased — over the next 2–3 weeks</h2>
<p style="margin:0 0 6px;">During this window, please expect the following:</p>
<ul style="padding-left:18px;margin:0 0 12px;">
  <li>You may receive <strong>job offers from the new Vendor Portal</strong> at <a href="https://vendor.cethos.com" style="color:#0891B2;">vendor.cethos.com</a>.</li>
  <li>You may still receive offers from <strong>XTRF</strong> for some projects until we complete the cutover.</li>
  <li>Both are real CETHOS offers — please continue to accept and deliver through whichever system the offer arrives in. We'll confirm by email once XTRF is retired for your language pair.</li>
</ul>

<h2 style="font-size:15px;color:#0f766e;margin:22px 0 8px;">Three quick things we'd like you to do this week</h2>
<ol style="padding-left:18px;margin:0 0 16px;">
  <li style="margin-bottom:10px;"><strong>Sign in to the Vendor Portal</strong> — go to <a href="https://vendor.cethos.com" style="color:#0891B2;">vendor.cethos.com</a> and enter the email address this message was sent to. You'll receive a <strong>one-time code by email</strong> — paste it in and you're in. <strong>No password needed.</strong></li>
  <li style="margin-bottom:10px;"><strong>Complete the two activation steps</strong> (about 2 minutes). After sign-in we'll ask you to <strong>upload a current CV</strong> (PDF, up to 10 MB) and <strong>sign the NDA</strong> in the portal. These two are required before job offers route to you — both can be done in a single sitting from the onboarding page.</li>
  <li style="margin-bottom:10px;"><strong>Complete your profile.</strong> Confirm or update your <strong>rates, language pairs, specializations, certifications, availability, and payout method</strong>. This is what we use to route offers to you, so a complete profile means more relevant jobs and faster turnaround on assignment.</li>
</ol>

<p style="margin:18px 0;text-align:center;"><a href="https://vendor.cethos.com/login" style="display:inline-block;padding:11px 22px;background:#0891B2;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Sign in to the Vendor Portal</a></p>

<h2 style="font-size:15px;color:#0f766e;margin:24px 0 8px;">A note on why we're doing this</h2>
<p>Building our own Portal lets us pay faster, brief you better on each job, and reduce the back and forth that XTRF often creates. Concretely, that means:</p>
<ul style="padding-left:18px;margin:0 0 12px;">
  <li><strong>Faster payment</strong> — invoices generate automatically when your delivery is approved, on a shorter payment window than XTRF's defaults.</li>
  <li><strong>One place for everything on a job</strong> — source files, reference materials, glossary, deadline in your timezone, and special instructions on a single screen.</li>
  <li><strong>Self-serve profile</strong> — update rates, language pairs, certifications, and payout details whenever you want, without waiting on a vendor manager.</li>
  <li><strong>Counter-offers in one click</strong> — propose a different rate or deadline and it routes straight to the project manager with full context, no email threads.</li>
  <li><strong>No more passwords</strong> — sign in with a one-time code emailed to you. Your email is your account.</li>
  <li><strong>Better records</strong> — your full work history, quality feedback, certifications, and earnings all in one place. Useful for you when invoicing or reapplying anywhere; useful for us when matching the right linguist to a job quickly.</li>
</ul>
<p>It's a meaningful investment, and your early feedback in these first weeks will directly shape what comes next. If something's clunky or missing, please tell us.</p>

<h2 style="font-size:15px;color:#0f766e;margin:24px 0 8px;">If anything goes wrong</h2>
<p>Reply to this email or write to <a href="mailto:vm@cethos.com" style="color:#0891B2;">vm@cethos.com</a> and we'll sort it out the same day. If you don't receive your one-time code within a couple of minutes, please check spam — and let us know if it's still not arriving.</p>
<p>Thank you for the work you do with us. We're glad to have you with us on this next chapter.</p>

<p style="margin:18px 0 0;">Warm regards,<br/><strong>Vendor Manager</strong><br/>Cethos Solutions Inc.<br/><a href="mailto:vm@cethos.com" style="color:#0891B2;">vm@cethos.com</a></p>

<p style="color:#6B7280;font-size:12px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:12px;">Sent by Cethos Solutions Inc. You're receiving this because you've worked with CETHOS as a freelance linguist. Prefer not to receive announcements like this? <a href="%UNSUBSCRIBE_URL%" style="color:#0891B2;">Unsubscribe in one click</a> — note that unsubscribing will also deactivate your vendor profile, so we won't route new job offers to you until you ask us to reactivate it.</p>`;

interface ScheduleRow {
  enabled: boolean;
  batch_size: number;
  cron_expression: string;
  subject_override: string | null;
  body_html_override: string | null;
  last_run_at: string | null;
  last_run_sent: number | null;
  total_sent: number;
}

const CRON_PRESETS: { value: string; label: string }[] = [
  { value: "*/5 * * * *", label: "Every 5 minutes" },
  { value: "*/15 * * * *", label: "Every 15 minutes" },
  { value: "*/30 * * * *", label: "Every 30 minutes" },
  { value: "0 * * * *", label: "Every hour (on the hour)" },
  { value: "0 */2 * * *", label: "Every 2 hours" },
  { value: "0 */6 * * *", label: "Every 6 hours" },
  { value: "0 14 * * *", label: "Daily at 14:00 UTC" },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function VendorActivationEmailModal({ open, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_BODY_HTML);
  const [testEmail, setTestEmail] = useState("");

  const [enabled, setEnabled] = useState(false);
  const [batchSize, setBatchSize] = useState(10);
  const [cronExpression, setCronExpression] = useState("*/15 * * * *");
  const [scheduleStats, setScheduleStats] = useState<{
    last_run_at: string | null;
    last_run_sent: number | null;
    total_sent: number;
  }>({ last_run_at: null, last_run_sent: null, total_sent: 0 });

  // Load schedule row on open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setSuccess(null);
      try {
        const { data, error: e } = await supabase
          .from("vendor_activation_email_schedule")
          .select("*")
          .eq("id", 1)
          .maybeSingle<ScheduleRow>();
        if (e) throw e;
        if (cancelled) return;
        if (data) {
          setEnabled(data.enabled);
          setBatchSize(data.batch_size);
          setCronExpression(data.cron_expression);
          setSubject(data.subject_override?.trim() || DEFAULT_SUBJECT);
          setBodyHtml(data.body_html_override?.trim() || DEFAULT_BODY_HTML);
          setScheduleStats({
            last_run_at: data.last_run_at,
            last_run_sent: data.last_run_sent,
            total_sent: data.total_sent,
          });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load schedule");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  async function saveSchedule() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const { error: e } = await supabase
        .from("vendor_activation_email_schedule")
        .update({
          enabled,
          batch_size: batchSize,
          cron_expression: cronExpression,
          subject_override: subject.trim() === DEFAULT_SUBJECT ? null : subject.trim(),
          body_html_override: bodyHtml.trim() === DEFAULT_BODY_HTML ? null : bodyHtml.trim(),
        })
        .eq("id", 1);
      if (e) throw e;
      setSuccess(
        enabled
          ? `Schedule saved. Cron will fire ${CRON_PRESETS.find((p) => p.value === cronExpression)?.label.toLowerCase() ?? `(${cronExpression})`} and send up to ${batchSize} email(s) per run.`
          : "Schedule saved. Cron is currently OFF — no recurring sends.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (!testEmail.trim()) { setError("Enter a test email address."); return; }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const { data, error: e } = await supabase.functions.invoke("vendor-send-activation-emails", {
        body: {
          test_email: testEmail.trim(),
          subject_override: subject !== DEFAULT_SUBJECT ? subject : undefined,
          body_html_override: bodyHtml !== DEFAULT_BODY_HTML ? bodyHtml : undefined,
        },
      });
      if (e) throw e;
      if (!data?.success) throw new Error(data?.error ?? "Test send failed");
      setSuccess(`Test email sent to ${testEmail.trim()}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test send failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendAllNow(force_resend: boolean) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      // Dry-run first to surface candidate count.
      const dry = await supabase.functions.invoke("vendor-send-activation-emails", {
        body: { dry_run: true, force_resend },
      });
      if (dry.error) throw dry.error;
      const candidates = (dry.data?.data?.candidates ?? 0) as number;
      const skipped = (dry.data?.data?.skipped_recently_emailed ?? 0) as number;
      if (candidates === 0) {
        setSuccess(
          skipped > 0
            ? `${skipped} vendor(s) emailed in the last 7 days — none currently due. Toggle "Force resend" to override.`
            : "No vendors are missing CV or NDA — nothing to send.",
        );
        return;
      }
      const confirmed = window.confirm(
        `Send activation emails to ${candidates} vendor(s) right now?` +
          (skipped > 0 ? `\n\n${skipped} vendor(s) skipped (emailed in the last 7 days).` : "") +
          (force_resend ? "\n\n⚠️ Force-resend is ON — ignoring the 7-day dedup window." : ""),
      );
      if (!confirmed) return;
      const real = await supabase.functions.invoke("vendor-send-activation-emails", {
        body: {
          force_resend,
          subject_override: subject !== DEFAULT_SUBJECT ? subject : undefined,
          body_html_override: bodyHtml !== DEFAULT_BODY_HTML ? bodyHtml : undefined,
        },
      });
      if (real.error) throw real.error;
      const sent = (real.data?.data?.sent ?? 0) as number;
      const failed = (real.data?.data?.failed ?? 0) as number;
      setSuccess(`Sent ${sent} activation email(s).${failed > 0 ? ` ${failed} failed.` : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  function resetToDefault() {
    setSubject(DEFAULT_SUBJECT);
    setBodyHtml(DEFAULT_BODY_HTML);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Vendor activation emails</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Email vendors missing CV or NDA. Preview, edit, test, and schedule recurring sends.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 p-6 space-y-6">
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
              </div>
            )}
            {success && (
              <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded text-sm text-emerald-900">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> {success}
              </div>
            )}

            {/* Email content + preview */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-gray-900">Email content</h4>
                <button type="button" onClick={resetToDefault} className="text-xs text-gray-500 hover:text-gray-700">
                  Reset to default
                </button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Subject"
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <textarea
                    value={bodyHtml}
                    onChange={(e) => setBodyHtml(e.target.value)}
                    rows={16}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                  />
                  <p className="text-[11px] text-gray-500">
                    HTML. <code>%FIRSTNAME%</code> and <code>%UNSUBSCRIBE_URL%</code> are substituted per vendor.
                  </p>
                </div>
                <div className="border border-gray-200 rounded bg-gray-50 overflow-hidden">
                  <div className="px-3 py-1.5 bg-gray-100 text-[11px] text-gray-500 uppercase tracking-wide flex items-center gap-1">
                    <Eye className="w-3 h-3" /> Preview
                  </div>
                  <div
                    className="p-3 max-h-[440px] overflow-auto text-sm bg-white"
                    // Preview renders the raw HTML. Safe — only staff sees this.
                    dangerouslySetInnerHTML={{
                      __html: bodyHtml.replace(/%FIRSTNAME%/g, "Alex"),
                    }}
                  />
                </div>
              </div>
            </section>

            {/* Test send */}
            <section className="border-t border-gray-100 pt-5">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Send a test</h4>
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="you@cethos.com"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={sendTest}
                  disabled={busy || !testEmail.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send test
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                Subject is prefixed with <code>[TEST]</code> on test sends. Preserves your edits above.
              </p>
            </section>

            {/* Send all now */}
            <section className="border-t border-gray-100 pt-5">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Send all eligible now</h4>
              <p className="text-xs text-gray-600 mb-2">
                One-shot blast. Emails every non-suspended vendor missing CV or NDA, dedup'd against the last 7 days.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => sendAllNow(false)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send all now
                </button>
                <button
                  type="button"
                  onClick={() => sendAllNow(true)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-amber-300 text-amber-700 rounded text-sm font-medium hover:bg-amber-50 disabled:opacity-50"
                >
                  Force resend (ignore 7-day dedup)
                </button>
              </div>
            </section>

            {/* Recurring schedule */}
            <section className="border-t border-gray-100 pt-5">
              <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-500" /> Recurring schedule
              </h4>
              <p className="text-xs text-gray-600 mb-3">
                Drip the queue at a controlled rate. The cron picks up to <em>batch size</em> eligible vendors per run.
              </p>
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  />
                  Enable recurring drip
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-xs font-medium text-gray-700 mb-1">Batch size per run</span>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={batchSize}
                      onChange={(e) => setBatchSize(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                      disabled={!enabled}
                      className="w-32 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-medium text-gray-700 mb-1">Interval</span>
                    <select
                      value={cronExpression}
                      onChange={(e) => setCronExpression(e.target.value)}
                      disabled={!enabled}
                      className="w-full max-w-xs px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                      {CRON_PRESETS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded p-2.5">
                  <div><strong>Last run:</strong> {scheduleStats.last_run_at ? new Date(scheduleStats.last_run_at).toLocaleString() : "never"}</div>
                  <div><strong>Last run sent:</strong> {scheduleStats.last_run_sent ?? 0}</div>
                  <div><strong>Total sent (all-time):</strong> {scheduleStats.total_sent}</div>
                </div>
              </div>
            </section>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={saveSchedule}
            disabled={busy || loading}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white rounded text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Save schedule &amp; template
          </button>
        </div>
      </div>
    </div>
  );
}
