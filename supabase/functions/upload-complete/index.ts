// supabase/functions/upload-complete/index.ts
//
// Step 2/2 of the secure-upload flow. Persists the submission and triggers
// virus scanning. Routes to the right table based on the caller's context:
//
//   - anon:     inserts a single row into public_submissions (admin triage queue)
//   - customer: inserts one row per file into customer_files
//   - admin:    inserts one row per file into customer_files (uploaded_by_type='admin')
//
// Request body:
//   {
//     submissionId: string,                  // from upload-start
//     bucket: 'public-submissions' | 'customer-files',  // from upload-start
//     context: 'anon' | 'customer' | 'admin',           // from upload-start (advisory)
//
//     fullName, email, phone: string,        // required for anon
//     orderOrQuoteId?: string, message?: string,
//     companyWebsite?: string,               // honeypot (anon only)
//
//     files: [{ path, originalName, size, mimeType }],
//
//     customerToken?: string,                // customer context
//     targetCustomerId?: string,             // admin context
//     submittedFrom?: string                 // 'main_web' | 'customer_portal' | 'admin'
//   }
//
// Returns: { success, submissionId, context, customerId? } on success.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ANON_BUCKET = "public-submissions";
const CUSTOMER_BUCKET = "customer-files";
const MAX_FILES = 25;
const MAX_FILE_SIZE = 100 * 1024 * 1024;

const ACCEPTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
  "image/heic",
  "image/heif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

type Context = "anon" | "customer" | "admin";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = await req.json().catch(() => ({}));

    const submissionId = String(body.submissionId || "");
    const bucket = String(body.bucket || "");
    const advertisedContext = String(body.context || "") as Context;
    const fullName = String(body.fullName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const orderOrQuoteId = String(body.orderOrQuoteId || "").trim();
    const message = String(body.message || "").trim();
    const companyWebsite = String(body.companyWebsite || "").trim();
    const customerToken = String(body.customerToken || "");
    const targetCustomerId = String(body.targetCustomerId || "");
    const submittedFrom = String(body.submittedFrom || "unknown");
    const files = (body.files || []) as Array<{
      path: string;
      originalName: string;
      size: number;
      mimeType: string;
      folder?: string;
    }>;

    if (!submissionId || !/^[0-9a-f-]{36}$/i.test(submissionId)) {
      return jsonResponse(400, { success: false, error: "Invalid submissionId" });
    }
    if (bucket !== ANON_BUCKET && bucket !== CUSTOMER_BUCKET) {
      return jsonResponse(400, { success: false, error: "Invalid bucket" });
    }
    if (!Array.isArray(files) || files.length === 0) {
      return jsonResponse(400, { success: false, error: "No files specified" });
    }
    if (files.length > MAX_FILES) {
      return jsonResponse(400, {
        success: false,
        error: `Up to ${MAX_FILES} files per submission`,
      });
    }
    for (const f of files) {
      if (typeof f.size !== "number" || f.size <= 0 || f.size > MAX_FILE_SIZE) {
        return jsonResponse(400, {
          success: false,
          error: `${f.originalName}: invalid size`,
        });
      }
      const effectiveMime = ACCEPTED_MIME_TYPES.has(f.mimeType)
        ? f.mimeType
        : inferMimeFromName(f.originalName);
      if (!effectiveMime || !ACCEPTED_MIME_TYPES.has(effectiveMime)) {
        return jsonResponse(400, {
          success: false,
          error: `${f.originalName}: file type not allowed (received "${f.mimeType || "unknown"}")`,
        });
      }
      f.mimeType = effectiveMime;
    }

    // Re-derive context server-side from auth/tokens. We don't trust the
    // advertisedContext from the body for routing — only as a sanity hint.
    let context: Context = "anon";
    let customerId: string | null = null;

    const staffId = await getStaffIdFromAuthHeader(supabaseAdmin, req);
    if (staffId && targetCustomerId) {
      const exists = await customerExists(supabaseAdmin, targetCustomerId);
      if (!exists) {
        return jsonResponse(400, {
          success: false,
          error: "Target customer not found",
        });
      }
      context = "admin";
      customerId = targetCustomerId;
    } else if (customerToken) {
      const id = await getCustomerIdFromToken(supabaseAdmin, customerToken);
      if (!id) {
        return jsonResponse(401, {
          success: false,
          error: "Session expired — please sign in again",
        });
      }
      context = "customer";
      customerId = id;
    } else if (staffId && !targetCustomerId) {
      return jsonResponse(400, {
        success: false,
        error: "Admin uploads require targetCustomerId",
      });
    }

    // Sanity: bucket should match context
    const expectedBucket = context === "anon" ? ANON_BUCKET : CUSTOMER_BUCKET;
    if (bucket !== expectedBucket) {
      return jsonResponse(400, {
        success: false,
        error: "Bucket / context mismatch",
      });
    }

    // Verify each declared path is scoped to this submission's expected prefix
    const expectedPrefix =
      context === "anon"
        ? `${submissionId}/`
        : context === "customer"
          ? `${customerId}/customer/${submissionId}/`
          : `${customerId}/admin/${submissionId}/`;
    for (const f of files) {
      if (!f.path?.startsWith(expectedPrefix)) {
        return jsonResponse(400, {
          success: false,
          error: "File path does not belong to this submission",
        });
      }
    }

    // Verify each file actually exists in storage (proves the upload completed)
    for (const f of files) {
      const lastSlash = f.path.lastIndexOf("/");
      const folder = f.path.slice(0, lastSlash);
      const filename = f.path.slice(lastSlash + 1);
      const { data: list, error: listErr } = await supabaseAdmin.storage
        .from(bucket)
        .list(folder, { search: filename, limit: 1 });
      if (listErr) {
        throw new Error(`Storage list failed: ${listErr.message}`);
      }
      if (!list || list.length === 0) {
        return jsonResponse(400, {
          success: false,
          error: `${f.originalName}: not uploaded — please retry`,
        });
      }
    }

    const ipHeader =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      null;
    const userAgent = req.headers.get("user-agent") || null;

    if (context === "anon") {
      // Anonymous submission — honeypot enforcement and contact info required.
      if (companyWebsite.length > 0) {
        console.log(`🪤 honeypot tripped, dropping anon ${submissionId}`);
        return jsonResponse(200, { success: true, ok: true });
      }
      if (!fullName || !email || !phone) {
        return jsonResponse(400, {
          success: false,
          error: "Name, email and phone are required",
        });
      }

      const filePathsMeta = files.map((f) => ({
        path: f.path,
        originalName: f.originalName.slice(0, 200),
        size: f.size,
        mimeType: f.mimeType,
        folder: (f.folder || "").slice(0, 80) || null,
        scanStatus: "scan_pending" as const,
      }));

      const { error: insertErr } = await supabaseAdmin
        .from("public_submissions")
        .insert({
          id: submissionId,
          full_name: fullName,
          email,
          phone,
          order_or_quote_id: orderOrQuoteId || null,
          message: message || null,
          file_paths: filePathsMeta,
          submitted_from:
            submittedFrom === "customer_portal" || submittedFrom === "main_web"
              ? submittedFrom
              : "main_web",
          ip_address: ipHeader,
          user_agent: userAgent,
          scan_status: "scan_pending",
          customer_id: null,
        });

      if (insertErr) {
        console.error("upload-complete (anon) insert failed:", insertErr);
        throw new Error(insertErr.message);
      }

      // Trigger scan
      fetch(`${supabaseUrl}/functions/v1/scan-public-submission`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ kind: "submission", submissionId }),
      }).catch(() => {});

      // Email the admin team. Fire-and-forget so a Brevo hiccup doesn't fail
      // the whole submission. Recipient comes from ADMIN_NOTIFICATION_EMAIL
      // (comma-separated allowed); falls back to support@cethos.com.
      void notifyAdminOfSubmission({
        brevoKey: Deno.env.get("BREVO_API_KEY") ?? "",
        to:
          Deno.env.get("ADMIN_NOTIFICATION_EMAIL") ||
          "support@cethos.com",
        siteUrl:
          Deno.env.get("ADMIN_PORTAL_URL") || "https://portal.cethos.com",
        submissionId,
        fullName,
        email,
        phone,
        orderOrQuoteId,
        message,
        files: filePathsMeta,
      });
    } else {
      // Customer or admin context — one customer_files row per file
      const rows = files.map((f) => ({
        customer_id: customerId,
        storage_path: f.path,
        original_filename: f.originalName.slice(0, 200),
        size_bytes: f.size,
        mime_type: f.mimeType,
        uploaded_by_type: context === "admin" ? "admin" : "customer",
        uploaded_by_staff_id: context === "admin" ? staffId : null,
        upload_session_id: submissionId,
        scan_status: "scan_pending",
        folder: (f.folder || "").slice(0, 80) || null,
        notes: message ? message.slice(0, 5000) : null,
      }));

      const { error: insertErr } = await supabaseAdmin
        .from("customer_files")
        .insert(rows);

      if (insertErr) {
        console.error(
          `upload-complete (${context}) insert failed:`,
          insertErr,
        );
        throw new Error(insertErr.message);
      }

      // Trigger scan with kind=customer-batch so the scan function knows
      // which table to update.
      fetch(`${supabaseUrl}/functions/v1/scan-public-submission`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          kind: "customer-batch",
          uploadSessionId: submissionId,
          customerId,
        }),
      }).catch(() => {});
    }

    console.log(
      `✅ upload-complete ${submissionId} context=${context} customer=${customerId || "-"} files=${files.length}`,
    );

    return jsonResponse(200, {
      success: true,
      submissionId,
      context,
      customerId,
    });
  } catch (err: unknown) {
    const msg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    console.error("upload-complete error:", msg);
    return jsonResponse(500, { success: false, error: msg });
  }
});

// ============================================================================
// Auth helpers (mirror upload-start)
// ============================================================================

async function getStaffIdFromAuthHeader(
  supabaseAdmin: ReturnType<typeof createClient>,
  req: Request,
): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const sub = decodeJwtSub(token);
  if (!sub) return null;
  const { data } = await supabaseAdmin
    .from("staff_users")
    .select("id")
    .eq("auth_user_id", sub)
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}

function decodeJwtSub(jwt: string): string | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const json = atob(padded);
    const decoded = JSON.parse(json);
    if (decoded?.role && decoded.role !== "authenticated") return null;
    return typeof decoded?.sub === "string" ? decoded.sub : null;
  } catch {
    return null;
  }
}

async function getCustomerIdFromToken(
  supabaseAdmin: ReturnType<typeof createClient>,
  token: string,
): Promise<string | null> {
  try {
    const tokenHash = await sha256(token);
    const { data } = await supabaseAdmin
      .from("customer_sessions")
      .select("customer_id, expires_at")
      .eq("token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (data?.customer_id) {
      void supabaseAdmin
        .from("customer_sessions")
        .update({ last_accessed_at: new Date().toISOString() })
        .eq("token_hash", tokenHash);
      return data.customer_id;
    }
    return null;
  } catch {
    return null;
  }
}

async function customerExists(
  supabaseAdmin: ReturnType<typeof createClient>,
  customerId: string,
): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(customerId)) return false;
  const { data } = await supabaseAdmin
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .limit(1)
    .maybeSingle();
  return !!data;
}

const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
  docx:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
};

function inferMimeFromName(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return EXT_TO_MIME[ext] || null;
}

async function notifyAdminOfSubmission(args: {
  brevoKey: string;
  to: string;
  siteUrl: string;
  submissionId: string;
  fullName: string;
  email: string;
  phone: string;
  orderOrQuoteId: string;
  message: string;
  files: Array<{
    originalName: string;
    size: number;
    folder?: string | null;
  }>;
}): Promise<void> {
  if (!args.brevoKey) {
    console.warn("BREVO_API_KEY not configured — skipping admin email");
    return;
  }
  try {
    const recipients = args.to
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((email) => ({ email, name: "Cethos Team" }));
    if (recipients.length === 0) return;

    // Group files by folder for the email body
    type Group = { folder: string; files: Array<{ name: string; size: number }> };
    const byFolder = new Map<string, Group>();
    for (const f of args.files) {
      const key = f.folder || "(no folder)";
      if (!byFolder.has(key)) byFolder.set(key, { folder: key, files: [] });
      byFolder.get(key)!.files.push({ name: f.originalName, size: f.size });
    }

    const folderHtml = Array.from(byFolder.values())
      .map((g) => {
        const fileLines = g.files
          .map(
            (f) =>
              `<li style="margin: 2px 0; font-size: 13px;">${escapeHtml(f.name)} <span style="color:#94a3b8;">(${formatBytes(f.size)})</span></li>`,
          )
          .join("");
        return `
          <div style="margin: 16px 0;">
            <div style="font-weight:600; color:#0f172a; font-size:13px; margin-bottom:6px;">
              ${escapeHtml(g.folder)} <span style="color:#94a3b8; font-weight:400;">(${g.files.length})</span>
            </div>
            <ul style="margin:0; padding-left:18px; color:#475569;">${fileLines}</ul>
          </div>`;
      })
      .join("");

    const reviewUrl = `${args.siteUrl.replace(/\/$/, "")}/admin/public-submissions`;
    const totalCount = args.files.length;

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 580px; margin: 0 auto; background-color: #ffffff;">
        <div style="padding: 36px 32px 28px; text-align: center; border-bottom: 3px solid #0891b2;">
          <h1 style="margin:0; font-size:20px; color:#0f172a;">New secure upload</h1>
        </div>
        <div style="padding: 32px;">
          <p style="color:#475569; font-size:14px; line-height:1.7;">
            A new submission just came in via <code style="background:#f1f5f9; padding:2px 6px; border-radius:4px;">/secure-upload</code>.
          </p>
          <table style="width:100%; border-collapse:collapse; margin: 16px 0;">
            <tr><td style="padding:6px 0; color:#64748b; font-size:13px; width:120px;">From</td><td style="padding:6px 0; color:#0f172a; font-size:13px;"><strong>${escapeHtml(args.fullName)}</strong></td></tr>
            <tr><td style="padding:6px 0; color:#64748b; font-size:13px;">Email</td><td style="padding:6px 0;"><a href="mailto:${escapeHtml(args.email)}" style="color:#0891b2; text-decoration:none;">${escapeHtml(args.email)}</a></td></tr>
            <tr><td style="padding:6px 0; color:#64748b; font-size:13px;">Phone</td><td style="padding:6px 0;"><a href="tel:${escapeHtml(args.phone)}" style="color:#0891b2; text-decoration:none;">${escapeHtml(args.phone)}</a></td></tr>
            ${args.orderOrQuoteId ? `<tr><td style="padding:6px 0; color:#64748b; font-size:13px;">Order / Quote ID</td><td style="padding:6px 0; color:#0f172a; font-size:13px;"><code>${escapeHtml(args.orderOrQuoteId)}</code></td></tr>` : ""}
            <tr><td style="padding:6px 0; color:#64748b; font-size:13px;">Files</td><td style="padding:6px 0; color:#0f172a; font-size:13px;">${totalCount}</td></tr>
          </table>
          ${args.message ? `<div style="background:#f8fafc; border:1px solid #e2e8f0; padding:12px 14px; border-radius:8px; margin: 12px 0;"><div style="font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">Message</div><div style="color:#0f172a; font-size:13px; white-space:pre-wrap;">${escapeHtml(args.message)}</div></div>` : ""}
          <div style="margin-top:8px;">${folderHtml}</div>
          <div style="text-align:center; margin: 28px 0 8px;">
            <a href="${reviewUrl}" style="display:inline-block; padding:12px 32px; background-color:#0f172a; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:600; font-size:14px;">Open in admin portal</a>
          </div>
          <p style="color:#94a3b8; font-size:11px; margin: 16px 0 0; text-align:center;">
            Files are scanning. Downloads unlock once the scan completes.<br/>
            Submission ID: <code style="font-size:11px;">${args.submissionId}</code>
          </p>
        </div>
      </div>`;

    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": args.brevoKey,
      },
      body: JSON.stringify({
        sender: { name: "Cethos Secure Upload", email: "donotreply@cethos.com" },
        to: recipients,
        replyTo: { email: args.email, name: args.fullName },
        subject: `New secure upload: ${args.fullName} (${totalCount} file${totalCount === 1 ? "" : "s"})`,
        htmlContent,
      }),
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      console.warn(`Admin notification email failed: ${resp.status} ${t}`);
    } else {
      console.log(`Admin notification sent for submission ${args.submissionId}`);
    }
  } catch (err) {
    console.warn("notifyAdminOfSubmission threw:", err);
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function sha256(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
