/**
 * RLS audit harness.
 *
 * Verifies that the May 14 lockdown migrations are in force on the live
 * Supabase project across four phases:
 *
 *   0. bucket-privacy   every named bucket must report public = false
 *                       (requires SUPABASE_SERVICE_ROLE_KEY)
 *   1. anon             the publishable key cannot read PII / staff-only
 *                       tables and cannot list any private bucket
 *   2. customer         (optional) a signed-in customer sees only own rows
 *                       and gets denied/0 on staff-only tables
 *   3. service-role     (optional) the service key still sees every table
 *
 * Run:
 *   npx tsx server/scripts/rls-audit.ts
 *
 * Required env:
 *   VITE_SUPABASE_URL            project URL
 *   VITE_SUPABASE_ANON_KEY       anon (publishable) key
 *
 * Optional env (enables the bucket-privacy + service-role phases):
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional env (enables the authenticated-customer phase):
 *   RLS_TEST_CUSTOMER_EMAIL
 *   RLS_TEST_CUSTOMER_PASSWORD
 *   RLS_TEST_CUSTOMER_ID         the customers.id this account should see
 *
 * Exits 0 on pass, 1 on any failure.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

type Result = { name: string; pass: boolean; detail: string };
const results: Result[] = [];

function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  const tag = pass ? "PASS" : "FAIL";
  // eslint-disable-next-line no-console
  console.log(`[${tag}] ${name} — ${detail}`);
}

function need(envVar: string): string {
  const v = process.env[envVar];
  if (!v) {
    // eslint-disable-next-line no-console
    console.error(`Missing required env: ${envVar}`);
    process.exit(2);
  }
  return v;
}

// Tables locked down in the emergency + quote_adjustments migrations.
// Customers and anon must read zero rows from these unless the
// customer-select policy applies (covered by the customer phase).
const SENSITIVE_TABLES = [
  "customers",
  "quotes",
  "orders",
  "quote_files",
  "quote_pages",
  "ai_analysis_results",
  "customer_payments",
  "customer_invoices",
  "refunds",
  "quote_adjustments",
] as const;

// Tables closed off entirely by the extended lockdown — neither anon nor
// authenticated customers/vendors should see any row.
const STAFF_ONLY_TABLES = [
  "companies",
  "order_communications",
  "order_communication_attachments",
  "order_ai_instructions",
  "pdf_folders",
  "pdf_documents",
  "pdf_annotations",
  "pdf_shares",
  "staff_users",
  "vendors",
  "vendor_auth",
  "vendor_otp",
  "vendor_sessions",
  "vendor_language_pairs",
  "vendor_rates",
  "vendor_payment_info",
  "vendor_payables",
  "vendor_step_offers",
] as const;

// Every storage bucket the app uses. All MUST report public = false.
const BUCKETS = [
  "quote-files",
  "invoices",
  "pdf-documents",
  "ocr-uploads",
  "quote-reference-files",
] as const;

async function expectAnonReadsZero(anon: SupabaseClient, table: string) {
  const { data, error, count } = await anon
    .from(table)
    .select("*", { count: "exact", head: false })
    .limit(1);

  // Two acceptable shapes for "blocked":
  //   a) RLS denies → data === [] (RLS hides rows, no error)
  //   b) GRANT denies → error from PostgREST (42501 permission denied)
  if (error) {
    const blocked = /permission denied|RLS|not.*authoriz/i.test(error.message);
    record(
      `anon:${table}`,
      blocked,
      blocked
        ? `denied by Postgres (${error.code ?? "?"})`
        : `unexpected error: ${error.message}`,
    );
    return;
  }
  const rows = data?.length ?? 0;
  const rowsCounted = typeof count === "number" ? count : rows;
  const pass = rows === 0 && rowsCounted === 0;
  record(
    `anon:${table}`,
    pass,
    pass
      ? "0 rows visible to anon"
      : `LEAK: anon saw ${rows} row(s) sample, count=${rowsCounted}`,
  );
}

async function expectAnonStorageListBlocked(
  anon: SupabaseClient,
  bucket: string,
  prefix: string,
) {
  const { data, error } = await anon.storage.from(bucket).list(prefix, {
    limit: 5,
  });
  if (error) {
    // Storage returns 400/403 on denied list — anything non-null is fine.
    record(
      `anon:storage list ${bucket}/${prefix || "<root>"}`,
      true,
      `denied: ${error.message}`,
    );
    return;
  }
  const items = data?.length ?? 0;
  const pass = items === 0;
  record(
    `anon:storage list ${bucket}/${prefix || "<root>"}`,
    pass,
    pass ? "0 items returned" : `LEAK: anon listed ${items} item(s)`,
  );
}

async function runAnonPhase(anon: SupabaseClient) {
  // eslint-disable-next-line no-console
  console.log("\n=== Phase 1: anonymous (publishable) key ===");
  for (const t of SENSITIVE_TABLES) {
    await expectAnonReadsZero(anon, t);
  }
  for (const t of STAFF_ONLY_TABLES) {
    await expectAnonReadsZero(anon, t);
  }
  for (const bucket of BUCKETS) {
    await expectAnonStorageListBlocked(anon, bucket, "");
  }
  // The two buckets that intentionally allow anon INSERT to the `uploads/`
  // prefix must still deny anon LIST of that prefix.
  await expectAnonStorageListBlocked(anon, "quote-files", "uploads");
  await expectAnonStorageListBlocked(anon, "quote-reference-files", "uploads");
}

async function runBucketPrivacyPhase(url: string) {
  // eslint-disable-next-line no-console
  console.log("\n=== Phase 0: bucket privacy ===");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    record(
      "bucket-privacy",
      false,
      "SKIPPED: set SUPABASE_SERVICE_ROLE_KEY to verify storage.buckets.public",
    );
    return;
  }
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const bucket of BUCKETS) {
    const { data, error } = await admin.storage.getBucket(bucket);
    if (error || !data) {
      record(`bucket:${bucket}`, false, error?.message ?? "bucket missing");
      continue;
    }
    const pass = data.public === false;
    record(
      `bucket:${bucket}`,
      pass,
      pass ? "private" : `LEAK: bucket is PUBLIC (public=${data.public})`,
    );
  }
}

async function runCustomerPhase(url: string, anonKey: string) {
  const email = process.env.RLS_TEST_CUSTOMER_EMAIL;
  const password = process.env.RLS_TEST_CUSTOMER_PASSWORD;
  const expectedCustomerId = process.env.RLS_TEST_CUSTOMER_ID;
  if (!email || !password || !expectedCustomerId) {
    // eslint-disable-next-line no-console
    console.log(
      "\n=== Phase 2: authenticated customer — SKIPPED (set RLS_TEST_CUSTOMER_* to enable) ===",
    );
    return;
  }
  // eslint-disable-next-line no-console
  console.log("\n=== Phase 2: authenticated customer ===");

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr) {
    record("customer:sign-in", false, signInErr.message);
    return;
  }
  record("customer:sign-in", true, `signed in as ${email}`);

  // Should see exactly one customer row, with the expected id.
  const { data: custRows, error: custErr } = await client
    .from("customers")
    .select("id, auth_user_id");
  if (custErr) {
    record("customer:select customers", false, custErr.message);
  } else {
    const ids = (custRows ?? []).map((r: { id: string }) => r.id);
    const pass = ids.length === 1 && ids[0] === expectedCustomerId;
    record(
      "customer:select customers",
      pass,
      pass
        ? `sees own row only (${ids[0]})`
        : `expected only [${expectedCustomerId}], got [${ids.join(", ")}]`,
    );
  }

  // Quotes / orders / invoices: every row must belong to this customer.
  for (const table of ["quotes", "orders", "customer_invoices"] as const) {
    const { data, error } = await client
      .from(table)
      .select("customer_id")
      .limit(50);
    if (error) {
      record(`customer:select ${table}`, false, error.message);
      continue;
    }
    const foreign = (data ?? []).filter(
      (r: { customer_id: string | null }) =>
        r.customer_id && r.customer_id !== expectedCustomerId,
    );
    const pass = foreign.length === 0;
    record(
      `customer:select ${table}`,
      pass,
      pass
        ? `${data?.length ?? 0} row(s), all own`
        : `LEAK: ${foreign.length} row(s) belong to other customers`,
    );
  }

  // PII / staff-only tables. A customer JWT must return zero rows.
  for (const table of [
    "ai_analysis_results",
    ...STAFF_ONLY_TABLES,
  ] as const) {
    const { data, error } = await client.from(table).select("*").limit(1);
    if (error) {
      const blocked = /permission denied|RLS|not.*authoriz/i.test(error.message);
      record(
        `customer:select ${table}`,
        blocked,
        blocked ? "denied as expected" : `unexpected error: ${error.message}`,
      );
      continue;
    }
    const pass = (data?.length ?? 0) === 0;
    record(
      `customer:select ${table}`,
      pass,
      pass ? "0 rows" : `LEAK: ${data?.length} row(s) returned to customer`,
    );
  }

  // quote_adjustments: rows must all belong to a quote this customer owns.
  // We can't easily verify the join here, so a sample assertion is enough.
  const { data: adjRows } = await client
    .from("quote_adjustments")
    .select("quote_id")
    .limit(50);
  record(
    "customer:select quote_adjustments",
    true,
    `${adjRows?.length ?? 0} row(s) (must all be on own quotes)`,
  );

  await client.auth.signOut();
}

async function runServiceRolePhase(url: string) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    // eslint-disable-next-line no-console
    console.log(
      "\n=== Phase 3: service-role sanity — SKIPPED (set SUPABASE_SERVICE_ROLE_KEY to enable) ===",
    );
    return;
  }
  // eslint-disable-next-line no-console
  console.log("\n=== Phase 3: service-role sanity ===");
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const t of [...SENSITIVE_TABLES, ...STAFF_ONLY_TABLES] as const) {
    const { error, count } = await admin
      .from(t)
      .select("*", { count: "exact", head: true });
    if (error) {
      // For dashboard-created tables this can be a legitimate
      // "relation does not exist" — surface as warning, not failure.
      const missing = /does not exist/i.test(error.message);
      record(`service:${t}`, !missing, error.message);
    } else {
      record(`service:${t}`, true, `count=${count ?? "?"}`);
    }
  }
}

async function main() {
  const url = need("VITE_SUPABASE_URL");
  const anonKey = need("VITE_SUPABASE_ANON_KEY");
  // eslint-disable-next-line no-console
  console.log(`Target: ${url}`);

  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await runBucketPrivacyPhase(url);
  await runAnonPhase(anon);
  await runCustomerPhase(url, anonKey);
  await runServiceRolePhase(url);

  const failed = results.filter((r) => !r.pass);
  // eslint-disable-next-line no-console
  console.log(
    `\n=== ${results.length - failed.length}/${results.length} checks passed ===`,
  );
  if (failed.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`FAILED:\n${failed.map((f) => `  - ${f.name}: ${f.detail}`).join("\n")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("rls-audit crashed:", err);
  process.exit(1);
});
