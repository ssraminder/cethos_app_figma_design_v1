/**
 * Migration lint: every CREATE TABLE in `public` must be paired with
 * ALTER TABLE ... ENABLE ROW LEVEL SECURITY in the same or an earlier
 * migration file. Wired up after the May 2026 incident in which several
 * inherited tables had RLS disabled and leaked PII through the anon key.
 *
 * Run locally:
 *   npx tsx server/scripts/lint-migrations-rls.ts
 * Or via the package.json script:
 *   npm run lint:migrations
 *
 * CI: .github/workflows/lint-migrations.yml runs this on every PR that
 * touches `supabase/migrations/`.
 *
 * Exit codes:
 *   0  every public table has RLS enabled
 *   1  one or more tables are missing RLS — listed on stderr
 *   2  filesystem error (migrations directory missing, etc.)
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");

const TABLE_RE =
  /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(\w+)\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi;
const RLS_RE =
  /alter\s+table\s+(?:if\s+exists\s+)?(?:(\w+)\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+enable\s+row\s+level\s+security/gi;

function stripSqlComments(sql: string): string {
  // Drop /* … */ block comments and -- line comments. Good enough for our
  // single-purpose grep; we are NOT trying to parse SQL.
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
}

try {
  statSync(MIGRATIONS_DIR);
} catch {
  console.error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  process.exit(2);
}

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const createdIn = new Map<string, string>();
const rlsEnabled = new Set<string>();

for (const file of files) {
  const path = join(MIGRATIONS_DIR, file);
  const sql = stripSqlComments(readFileSync(path, "utf8"));

  TABLE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TABLE_RE.exec(sql)) !== null) {
    const schema = (m[1] ?? "public").toLowerCase();
    if (schema !== "public") continue;
    const name = m[2];
    if (!createdIn.has(name)) createdIn.set(name, file);
  }

  RLS_RE.lastIndex = 0;
  while ((m = RLS_RE.exec(sql)) !== null) {
    const schema = (m[1] ?? "public").toLowerCase();
    if (schema !== "public") continue;
    rlsEnabled.add(m[2]);
  }
}

const missing: Array<{ table: string; file: string }> = [];
for (const [table, file] of createdIn) {
  if (!rlsEnabled.has(table)) missing.push({ table, file });
}

if (missing.length > 0) {
  console.error(
    `\n❌ ${missing.length} public table(s) created without ENABLE ROW LEVEL SECURITY:\n`,
  );
  for (const { table, file } of missing) {
    console.error(`  - public.${table}   (created in ${file})`);
  }
  console.error(
    "\nAdd `ALTER TABLE public.<name> ENABLE ROW LEVEL SECURITY;` plus at least one policy to the same migration. See supabase/migrations/20260514_emergency_rls_lockdown.sql for the four-tier pattern.\n",
  );
  process.exit(1);
}

console.log(
  `OK: ${createdIn.size} public table(s) created across ${files.length} migration(s), all have RLS enabled.`,
);
