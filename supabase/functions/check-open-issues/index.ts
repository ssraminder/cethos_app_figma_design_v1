// ============================================================================
// check-open-issues
//
// Returns a combined view of:
//   1. New/open bug reports from the bug_reports table (vendor + admin)
//   2. Unresolved Sentry issues from both projects (admin + vendor portal)
//
// Used by Claude Code at session start to auto-surface issues worth working on.
// Also callable from the admin UI for a dashboard view.
//
// Auth: staff JWT via Authorization header.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SENTRY_ORG = "cethos-solutions-inc";
const SENTRY_AUTH_TOKEN = Deno.env.get("SENTRY_AUTH_TOKEN") ?? "";
const SENTRY_PROJECTS = ["cethos-portal-client", "cethos-vendor-portal"];

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

interface SentryIssue {
  id: string;
  title: string;
  culprit: string;
  shortId: string;
  project: { slug: string };
  level: string;
  count: string;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
  status: string;
  metadata: { type?: string; value?: string };
}

async function fetchSentryIssues(): Promise<SentryIssue[]> {
  if (!SENTRY_AUTH_TOKEN) return [];
  const all: SentryIssue[] = [];
  for (const project of SENTRY_PROJECTS) {
    try {
      const res = await fetch(
        `https://us.sentry.io/api/0/projects/${SENTRY_ORG}/${project}/issues/?query=is:unresolved&sort=date&limit=25`,
        { headers: { Authorization: `Bearer ${SENTRY_AUTH_TOKEN}` } },
      );
      if (res.ok) {
        const issues = await res.json() as SentryIssue[];
        all.push(...issues);
      }
    } catch (e) {
      console.warn(`Sentry fetch failed for ${project}:`, e);
    }
  }
  return all;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await anonClient.auth.getUser();
  if (!user) return json({ success: false, error: "unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // 1. Fetch open bug reports
  const { data: bugReports, error: brErr } = await supabase
    .from("bug_reports")
    .select("id, source, reporter_email, reporter_name, title, description, url, status, staff_notes, console_logs, created_at")
    .in("status", ["new", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (brErr) {
    return json({ success: false, error: "bug_reports_query_failed", detail: brErr.message }, 500);
  }

  // 2. Fetch Sentry issues
  const sentryIssues = await fetchSentryIssues();
  const sentryFormatted = sentryIssues.map((i) => ({
    id: i.id,
    shortId: i.shortId,
    project: i.project?.slug,
    title: i.title,
    culprit: i.culprit,
    level: i.level,
    count: i.count,
    firstSeen: i.firstSeen,
    lastSeen: i.lastSeen,
    permalink: i.permalink,
    errorType: i.metadata?.type,
    errorValue: i.metadata?.value?.slice(0, 300),
  }));

  // 3. Summary
  const newBugs = (bugReports ?? []).filter((b) => b.status === "new");
  const inProgressBugs = (bugReports ?? []).filter((b) => b.status === "in_progress");

  return json({
    success: true,
    summary: {
      new_bug_reports: newBugs.length,
      in_progress_bug_reports: inProgressBugs.length,
      unresolved_sentry_issues: sentryFormatted.length,
      sentry_configured: !!SENTRY_AUTH_TOKEN,
    },
    bug_reports: bugReports ?? [],
    sentry_issues: sentryFormatted,
  });
});
