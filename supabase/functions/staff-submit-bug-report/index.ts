import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
      const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;padding:20px;">
<div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;">
  <h1 style="font-size:16px;color:#0f766e;margin:0 0 12px;">Admin Bug Report — ${escapeHtml(title)}</h1>
  <p style="margin:0 0 8px;font-size:13px;color:#374151;">
    From: <strong>${escapeHtml(staff.full_name ?? staff.email)}</strong>
    &lt;${escapeHtml(staff.email)}&gt; (${escapeHtml(staff.role)})
  </p>
  <p style="margin:0 0 12px;font-size:12px;color:#6b7280;">
    ${url ? `Page: ${escapeHtml(url)}<br/>` : ""}
    Bug ID: <code>${inserted.id}</code> · ${new Date(inserted.created_at).toLocaleString()}
  </p>
  <hr/>
  <h2 style="font-size:13px;color:#111827;">Description</h2>
  <pre style="white-space:pre-wrap;font-family:inherit;color:#1f2937;font-size:13px;">${escapeHtml(description)}</pre>
  <h2 style="font-size:13px;color:#111827;">Recent console output (last 15)</h2>
  <pre style="white-space:pre-wrap;font-family:Consolas,monospace;font-size:11px;color:#374151;background:#f9fafb;padding:8px;border:1px solid #e5e7eb;border-radius:4px;">${escapeHtml(consolePreview)}</pre>
</div></body></html>`;
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
