// supabase/functions/get-customer-files/index.ts
//
// Returns the authenticated customer's files from customer_files, with signed
// download URLs for any that passed scanning. Used by the customer portal
// /dashboard/documents and the upload success screen.
//
// Auth: customer_sessions token (custom token system) OR staff JWT (admin
// looking at a customer's library — pass `targetCustomerId`).
//
// Request body:
//   { customerToken?: string, targetCustomerId?: string, limit?: number }
//
// Response:
//   {
//     success: true,
//     files: [{
//       id, originalFilename, sizeBytes, mimeType,
//       uploadedByType, uploadedByStaffName?,
//       scanStatus, createdAt,
//       downloadUrl: string | null   // null if scan_pending or scan_infected
//     }]
//   }

// Uses Deno.serve (built-in) instead of std/http to avoid intermittent
// deno.land bundle failures.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "customer-files";
const SIGNED_URL_TTL_SECONDS = 300;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

Deno.serve(async (req) => {
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
    const customerToken = String(body.customerToken || "");
    const targetCustomerId = String(body.targetCustomerId || "");
    const limit = Math.min(
      typeof body.limit === "number" ? body.limit : DEFAULT_LIMIT,
      MAX_LIMIT,
    );

    let customerId: string | null = null;

    const staffId = await getStaffIdFromAuthHeader(supabaseAdmin, req);
    if (staffId && targetCustomerId) {
      if (!/^[0-9a-f-]{36}$/i.test(targetCustomerId)) {
        return jsonResponse(400, { success: false, error: "Invalid targetCustomerId" });
      }
      customerId = targetCustomerId;
    } else if (customerToken) {
      customerId = await getCustomerIdFromToken(supabaseAdmin, customerToken);
      if (!customerId) {
        return jsonResponse(401, {
          success: false,
          error: "Session expired",
        });
      }
    } else {
      return jsonResponse(401, { success: false, error: "Not authenticated" });
    }

    const { data: rows, error } = await supabaseAdmin
      .from("customer_files")
      .select(
        "id, storage_path, original_filename, size_bytes, mime_type, uploaded_by_type, uploaded_by_staff_id, scan_status, folder, created_at",
      )
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);

    // Resolve staff names for admin uploads
    const staffIds = Array.from(
      new Set(
        (rows || [])
          .map((r) => r.uploaded_by_staff_id)
          .filter((id): id is string => !!id),
      ),
    );
    let staffMap: Record<string, string> = {};
    if (staffIds.length > 0) {
      const { data: staff } = await supabaseAdmin
        .from("staff_users")
        .select("id, full_name")
        .in("id", staffIds);
      if (staff) {
        for (const s of staff as Array<{ id: string; full_name: string }>) {
          staffMap[s.id] = s.full_name;
        }
      }
    }

    const files = await Promise.all(
      (rows || []).map(async (r) => {
        let downloadUrl: string | null = null;
        if (r.scan_status === "scan_clean" || r.scan_status === "scan_error") {
          // scan_error files exist and didn't test malicious — admin can decide
          const { data: signed } = await supabaseAdmin.storage
            .from(BUCKET)
            .createSignedUrl(r.storage_path, SIGNED_URL_TTL_SECONDS);
          downloadUrl = signed?.signedUrl || null;
        }
        return {
          id: r.id,
          originalFilename: r.original_filename,
          sizeBytes: r.size_bytes,
          mimeType: r.mime_type,
          uploadedByType: r.uploaded_by_type,
          uploadedByStaffName: r.uploaded_by_staff_id
            ? staffMap[r.uploaded_by_staff_id] || null
            : null,
          scanStatus: r.scan_status,
          folder: r.folder || null,
          createdAt: r.created_at,
          downloadUrl,
        };
      }),
    );

    return jsonResponse(200, { success: true, files });
  } catch (err: unknown) {
    const msg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    console.error("get-customer-files error:", msg);
    return jsonResponse(500, { success: false, error: msg });
  }
});

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
    return data?.customer_id || null;
  } catch {
    return null;
  }
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
