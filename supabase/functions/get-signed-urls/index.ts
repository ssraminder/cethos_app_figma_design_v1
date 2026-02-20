import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();
    const { file_ids } = body;

    if (!Array.isArray(file_ids) || file_ids.length === 0) {
      return jsonResponse({ error: "file_ids must be a non-empty array" }, 400);
    }

    const { data: files, error: queryError } = await supabase
      .from("quote_files")
      .select(
        "id, original_filename, storage_path, file_size, file_category_id, review_status, review_version, deleted_at"
      )
      .in("id", file_ids)
      .is("deleted_at", null);

    if (queryError) {
      console.error("Database query error:", queryError);
      return jsonResponse({ error: "Failed to fetch files" }, 500);
    }

    let successCount = 0;

    const results = await Promise.all(
      (files || []).map(async (file) => {
        let signed_url: string | null = null;

        if (file.storage_path) {
          const { data, error } = await supabase.storage
            .from("quote-files")
            .createSignedUrl(file.storage_path, 7 * 24 * 60 * 60);

          if (data?.signedUrl) {
            signed_url = data.signedUrl;
            successCount++;
          } else if (error) {
            console.error(
              `Signed URL failed for file ${file.id} (path: ${file.storage_path}):`,
              error.message
            );
          }
        }

        return {
          id: file.id,
          original_filename: file.original_filename,
          storage_path: file.storage_path,
          file_size: file.file_size,
          file_category_id: file.file_category_id,
          review_status: file.review_status,
          review_version: file.review_version,
          signed_url,
        };
      })
    );

    console.log(
      `Generated ${successCount} signed URLs successfully out of ${results.length} files`
    );

    return jsonResponse({ files: results });
  } catch (err) {
    console.error("get-signed-urls error:", err);
    return jsonResponse({ error: err.message || "Internal server error" }, 500);
  }
});
