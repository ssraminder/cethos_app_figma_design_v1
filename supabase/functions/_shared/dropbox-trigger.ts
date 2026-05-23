/**
 * dropbox-trigger.ts — Fire-and-forget helper for triggering Dropbox sync
 * from other edge functions.
 *
 * Usage:
 *   import { triggerDropboxSync } from "../_shared/dropbox-trigger.ts";
 *   // After uploading a file to Supabase Storage:
 *   await triggerDropboxSync({
 *     order_id: "...",
 *     source_bucket: "quote-files",
 *     source_path: "workflows/abc/def/v1/file.pdf",
 *     sync_trigger: "staff_delivery",
 *     filename: "file.pdf",
 *   });
 *
 * Non-blocking: errors are logged but never thrown. The calling function's
 * response is never delayed or failed by a Dropbox sync issue.
 */

interface SyncOrderFileParams {
  order_id: string;
  source_bucket: string;
  source_path: string;
  sync_trigger: string;
  filename?: string; // extracted from source_path if omitted
  quote_id?: string;
  quote_file_id?: string;
  step_delivery_id?: string;
  step_id?: string; // routes file to the step's Dropbox folder
}

/**
 * Trigger a Dropbox file sync for an order file. The `dropbox-sync` function
 * resolves the Dropbox folder path from the order's project, customer, and
 * target language — callers don't need to know the folder structure.
 *
 * Silently no-ops if:
 * - Dropbox is not connected
 * - SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are missing
 * - The sync request fails for any reason
 */
export async function triggerDropboxSync(params: SyncOrderFileParams): Promise<void> {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SRK) {
      console.warn("[dropbox-trigger] SUPABASE_URL or SRK missing, skipping sync");
      return;
    }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/dropbox-sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SRK}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "sync_order_file",
        ...params,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[dropbox-trigger] sync returned ${res.status}: ${text}`);
    }
  } catch (err: any) {
    console.warn("[dropbox-trigger] sync failed (non-blocking):", err?.message ?? err);
  }
}

/**
 * Trigger Dropbox folder creation for an order. Called when a workflow is
 * first assigned. Also batch-syncs existing source documents from the quote.
 */
export async function triggerDropboxOrderSetup(params: {
  order_id: string;
  quote_id?: string;
}): Promise<void> {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SRK) return;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/dropbox-sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SRK}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "setup_order",
        ...params,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[dropbox-trigger] setup returned ${res.status}: ${text}`);
    }
  } catch (err: any) {
    console.warn("[dropbox-trigger] setup failed (non-blocking):", err?.message ?? err);
  }
}
