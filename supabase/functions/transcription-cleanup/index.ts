// POST /functions/v1/transcription-cleanup
// Intended to run as a daily pg_cron job.
// Deletes expired transcription files from storage and marks jobs as expired.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  jsonResponse,
  preflight,
  getServiceClient,
  auditLog,
} from "../_shared/transcription.ts";

const BATCH_SIZE = 50;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const admin = getServiceClient();
    const now = new Date().toISOString();

    // Find jobs past their expiry that aren't already expired/deleted
    const { data: expiredJobs, error: fetchErr } = await admin
      .from("transcription_jobs")
      .select("id, file_path, pricing_tier")
      .lt("expires_at", now)
      .not("status", "eq", "expired")
      .is("deleted_at", null)
      .limit(BATCH_SIZE);

    if (fetchErr) {
      console.error("Failed to fetch expired jobs:", fetchErr);
      return jsonResponse({ success: false, error: "Fetch failed" }, 500);
    }

    if (!expiredJobs || expiredJobs.length === 0) {
      return jsonResponse({ success: true, expired: 0 });
    }

    let cleaned = 0;
    let errors = 0;

    for (const job of expiredJobs) {
      try {
        // Delete all files under this job's folder
        const jobPrefix = `${job.id}/`;

        // List files in the job folder
        const { data: files } = await admin.storage
          .from("transcription-uploads")
          .list(jobPrefix, { limit: 100 });

        if (files && files.length > 0) {
          // List files in subdirectories (source/ and output/)
          const allPaths: string[] = [];

          for (const subdir of ["source", "output"]) {
            const { data: subFiles } = await admin.storage
              .from("transcription-uploads")
              .list(`${job.id}/${subdir}`, { limit: 100 });

            if (subFiles) {
              for (const f of subFiles) {
                allPaths.push(`${job.id}/${subdir}/${f.name}`);
              }
            }
          }

          if (allPaths.length > 0) {
            await admin.storage
              .from("transcription-uploads")
              .remove(allPaths);
          }
        }

        // Mark job as expired and soft-delete
        await admin
          .from("transcription_jobs")
          .update({
            status: "expired",
            deleted_at: now,
            transcript_text: null,
            transcript_json: null,
            translated_text: null,
            human_reviewed_text: null,
          })
          .eq("id", job.id);

        await auditLog(admin, job.id, "expired_cleanup", "system", null, {
          tier: job.pricing_tier,
        });

        cleaned++;
      } catch (e) {
        console.error(`Cleanup failed for job ${job.id}:`, e);
        errors++;
      }
    }

    // Also clean up old OTPs (> 24 hours)
    const otpCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await admin
      .from("transcription_otps")
      .delete()
      .lt("created_at", otpCutoff);

    // Clean up old usage records (> 30 days)
    const usageCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    await admin
      .from("transcription_email_usage")
      .delete()
      .lt("usage_date", usageCutoff);

    return jsonResponse({
      success: true,
      expired: cleaned,
      errors,
      total_found: expiredJobs.length,
    });
  } catch (e) {
    console.error("transcription-cleanup error:", e);
    return jsonResponse({ success: false, error: "Internal error" }, 500);
  }
});
