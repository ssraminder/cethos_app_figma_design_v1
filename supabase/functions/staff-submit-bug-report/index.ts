import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  detailsTable,
  emailShell,
  esc as escShell,
  lead,
  REPLY,
  statusBadge,
  title as titleHelper,
  C,
  type TemplateMeta,
} from "../_shared/email-shell.ts";

const TEMPLATE: TemplateMeta = {
  name: "Admin — Bug Report",
  version: "2.0",
  updatedAt: "2026-05-28",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STAFF_SUPPORT_EMAIL = Deno.env.get("BUG_REPORT_TO_EMAIL") ?? "vm@cethos.com";

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Resolve staff from JWT
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ success: false, error: "unauthorized" }, 401);
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  );
  const { data: { user } } = await anonClient.auth.getUser(jwt);
  if (!user) return json({ success: false, error: "unauthorized" }, 401);

  const { data: staff } = await supabase
    .from("staff_users")
    .select("id, full_name, email, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!staff) return json({ success: false, error: "staff_not_found" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }

  const title = String(body.title ?? "").trim().slice(0, 250);
  const description = String(body.description ?? "").trim().slice(0, 8000);
  const url = body.url ? String(body.url).slice(0, 1000) : null;
  const userAgent = body.user_agent ? String(body.user_agent).slice(0, 500) : null;
  const viewport = body.viewport ?? null;
  const consoleLogs = body.console_logs ?? null;

  if (!title) return json({ success: false, error: "title_required" }, 400);
  if (description.length < 10) return json({ success: false, error: "description_too_short" }, 400);

  const { data: inserted, error: insErr } = await supabase
    .from("bug_reports")
    .insert({
      staff_id: staff.id,
      reporter_email: staff.email,
      reporter_name: staff.full_name,
      source: "admin",
      title,
      description,
      url,
      user_agent: userAgent,
      viewport,
      console_logs: consoleLogs,
    })
    .select("id, created_at")
    .single();

  if (insErr || !inserted) {
    return json({ success: false, error: "insert_failed", detail: insErr?.message }, 500);
  }

  // Staff notification email
  try {
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    if (BREVO_API_KEY) {
      const consolePreview = Array.isArray(consoleLogs)
        ? (consoleLogs as Array<Record<string, unknown>>)
            .slice(-15)
            .map((e) => `[${e.level}] ${e.ts} — ${String(e.message).slice(0, 300)}`)
            .join("\n")
        : "(none)";
      const detailRows: Array<[string, string]> = [
        ["From", `${escShell(staff.full_name ?? staff.email)} <${escShell(staff.email)}> (${escShell(staff.role)})`],
        ["Bug ID", String(inserted.id)],
        ["Submitted", new Date(inserted.created_at).toLocaleString()],
      ];
      if (url) detailRows.push(["Page", String(url)]);

      const html = emailShell(
        [
          statusBadge("warn", "Admin bug report"),
          titleHelper(escShell(title)),
          lead(`A staff member submitted a bug report from the admin portal.`),
          detailsTable(detailRows),
          `<p style="margin:0 0 8px;font-size:13px;font-weight:600;color:${C.navy};">Description</p>`,
          `<pre style="margin:0 0 22px;white-space:pre-wrap;font-family:inherit;color:${C.gray};font-size:13px;line-height:1.55;background:${C.slate50};border:1px solid ${C.border};border-radius:8px;padding:14px 16px;">${escShell(description)}</pre>`,
          `<p style="margin:0 0 8px;font-size:13px;font-weight:600;color:${C.navy};">Recent console output (last 15)</p>`,
          `<pre style="margin:0 0 22px;white-space:pre-wrap;font-family:'SF Mono',Menlo,Monaco,'Courier New',monospace;font-size:11px;color:${C.gray};background:${C.slate50};padding:12px 14px;border:1px solid ${C.border};border-radius:8px;">${escShell(consolePreview)}</pre>`,
        ].join(""),
        { replyTo: staff.email, template: TEMPLATE, preheader: `Bug report from ${escShell(staff.full_name ?? staff.email)}: ${escShell(title)}` },
      );
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          to: [{ email: STAFF_SUPPORT_EMAIL }],
          sender: { name: "Cethos Admin Bug Reports", email: "donotreply@cethos.com" },
          replyTo: { email: staff.email, name: staff.full_name || staff.email },
          subject: `[Admin Bug] ${title.slice(0, 80)}`,
          htmlContent: html,
          tags: ["admin-bug-report"],
        }),
      });
    }
  } catch (e) {
    console.error("bug-report email failed", e);
  }

  return json({ success: true, data: { id: inserted.id } });
});
