// supabase/functions/upload-start/index.ts
//
// Step 1/2 of the secure-upload flow. Validates the file manifest and returns
// a signed upload URL per file. Routes uploads into the right bucket + path
// based on the caller's context:
//
//   1. Anonymous (main_web /secure-upload):
//        bucket = public-submissions
//        path   = <submissionId>/<index>-<safeName>
//
//   2. Customer (portal /dashboard/upload, customerToken in body):
//        bucket = customer-files
//        path   = <customerId>/customer/<submissionId>/<index>-<safeName>
//
//   3. Admin (admin portal, staff JWT in Authorization, targetCustomerId in body):
//        bucket = customer-files
//        path   = <customerId>/admin/<submissionId>/<index>-<safeName>
//
// Request body:
//   {
//     files: [{ name, size, type }],
//     customerToken?: string,
//     targetCustomerId?: string  // required when admin uploading for a customer
//   }
//
// Response:
//   {
//     success: true,
//     submissionId,
//     bucket,
//     context: 'anon' | 'customer' | 'admin',
//     customerId?: string,        // present for customer / admin contexts
//     uploads: [{ index, originalName, path, signedUrl, token }]
//   }

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

interface FileRequest {
  name: string;
  size: number;
  type: string;
}

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
    const files = (body.files || []) as FileRequest[];
    const customerToken = (body.customerToken as string) || "";
    const targetCustomerId = (body.targetCustomerId as string) || "";
    const verificationToken = (body.verificationToken as string) || "";

    // Diagnostic: log the incoming manifest so production failures are debuggable
    try {
      const manifest = (files || []).slice(0, 5).map((f) => ({ name: f?.name, size: f?.size, type: f?.type }));
      console.log("upload-start incoming", JSON.stringify({ count: Array.isArray(files) ? files.length : null, manifest }));
    } catch {}

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
      if (!f.name || typeof f.name !== "string") {
        return jsonResponse(400, { success: false, error: "File missing name" });
      }
      if (typeof f.size !== "number" || f.size <= 0) {
        return jsonResponse(400, {
          success: false,
          error: `${f.name}: invalid size`,
        });
      }
      if (f.size > MAX_FILE_SIZE) {
        return jsonResponse(400, {
          success: false,
          error: `${f.name}: exceeds 100 MB`,
        });
      }
      // Browsers sometimes send an empty/odd content-type (especially for
      // .heic, .tif, older .doc). Fall back to file-extension lookup.
      const effectiveMime = ACCEPTED_MIME_TYPES.has(f.type)
        ? f.type
        : inferMimeFromName(f.name);
      if (!effectiveMime || !ACCEPTED_MIME_TYPES.has(effectiveMime)) {
        return jsonResponse(400, {
          success: false,
          error: `${f.name}: file type not allowed (received "${f.type || "unknown"}")`,
        });
      }
      f.type = effectiveMime;
    }

    // Resolve context. Order matters: explicit admin (staff JWT + targetCustomerId)
    // takes precedence over customer token, takes precedence over anon.
    let context: Context = "anon";
    let resolvedCustomerId: string | null = null;

    const staffId = await getStaffIdFromAuthHeader(supabaseAdmin, req);
    if (staffId && targetCustomerId) {
      // Verify the target customer exists
      const exists = await customerExists(supabaseAdmin, targetCustomerId);
      if (!exists) {
        return jsonResponse(400, {
          success: false,
          error: "Target customer not found",
        });
      }
      context = "admin";
      resolvedCustomerId = targetCustomerId;
    } else if (customerToken) {
      const customerId = await getCustomerIdFromToken(supabaseAdmin, customerToken);
      if (!customerId) {
        return jsonResponse(401, {
          success: false,
          error: "Session expired — please sign in again",
        });
      }
      context = "customer";
      resolvedCustomerId = customerId;
    }

    // If staff JWT was sent without targetCustomerId, that's a malformed admin
    // request — we don't allow staff to fall through to anon.
    if (staffId && !targetCustomerId) {
      return jsonResponse(400, {
        success: false,
        error: "Admin uploads require targetCustomerId",
      });
    }

    // Anon flow requires a fresh OTP-derived verification token. Customer and
    // admin contexts are already authenticated and skip this check.
    if (context === "anon") {
      if (!verificationToken) {
        return jsonResponse(401, {
          success: false,
          error: "Verification required — please verify your email or phone first",
        });
      }
      const ok = await isValidVerificationToken(supabaseAdmin, verificationToken);
      if (!ok) {
        return jsonResponse(401, {
          success: false,
          error: "Verification expired — please request a new code",
        });
      }
    }

    const submissionId = crypto.randomUUID();
    const bucket = context === "anon" ? ANON_BUCKET : CUSTOMER_BUCKET;
    const pathPrefix =
      context === "anon"
        ? `${submissionId}`
        : context === "customer"
          ? `${resolvedCustomerId}/customer/${submissionId}`
          : `${resolvedCustomerId}/admin/${submissionId}`;

    const uploads: Array<{
      index: number;
      originalName: string;
      path: string;
      signedUrl: string;
      token: string;
    }> = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const safeName = sanitizeFilename(f.name);
      const path = `${pathPrefix}/${i}-${safeName}`;
      const { data, error } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUploadUrl(path);
      if (error || !data?.signedUrl || !data?.token) {
        throw new Error(
          `Signed URL failed for ${f.name}: ${error?.message || "no token"}`,
        );
      }
      uploads.push({
        index: i,
        originalName: f.name.slice(0, 200),
        path,
        signedUrl: data.signedUrl,
        token: data.token,
      });
    }

    console.log(
      `📦 upload-start ${submissionId} context=${context} bucket=${bucket} customer=${resolvedCustomerId || "-"} files=${files.length}`,
    );

    return jsonResponse(200, {
      success: true,
      submissionId,
      bucket,
      context,
      customerId: resolvedCustomerId,
      uploads,
    });
  } catch (err: unknown) {
    const msg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    console.error("upload-start error:", msg);
    return jsonResponse(500, { success: false, error: msg });
  }
});

// ============================================================================
// Auth helpers
// ============================================================================

// Decodes the JWT in the Authorization header (already validated by Supabase
// when verify_jwt=true) and looks up the corresponding staff_users.id. Returns
// null if no JWT, anon JWT, or sub doesn't map to a staff record.
async function getStaffIdFromAuthHeader(
  supabaseAdmin: ReturnType<typeof createClient>,
  req: Request,
): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);

  const sub = decodeJwtSub(token);
  if (!sub) return null;

  const { data, error } = await supabaseAdmin
    .from("staff_users")
    .select("id")
    .eq("auth_user_id", sub)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data.id;
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
    return data?.customer_id || null;
  } catch {
    return null;
  }
}

async function isValidVerificationToken(
  supabaseAdmin: ReturnType<typeof createClient>,
  token: string,
): Promise<boolean> {
  try {
    const tokenHash = await sha256(token);
    const { data } = await supabaseAdmin
      .from("secure_upload_otps")
      .select("id, verification_expires_at")
      .eq("verification_token_hash", tokenHash)
      .gt("verification_expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
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

async function sha256(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\]/g, "_")
    .replace(/[()[\]]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 200)
    .toLowerCase();
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
