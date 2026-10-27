import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const runtimeRoots = ["src", "supabase/functions"];
const migrationRoot = path.join(projectRoot, "supabase", "migrations");
const rawDatabasePackages = /^(?:pg|postgres|postgresql|mysql|mysql2|mariadb|better-sqlite3|sqlite3|knex|sequelize|typeorm|kysely)$/i;
const unsafePostgrestFilterMethods = new Set(["or"]);
const reviewedDynamicSqlMigrations = new Set([
  "20261008100000_platform_admin_realtime.sql",
  "20261011160000_fix_member_migration_idempotent_retries.sql",
  "20261011200000_transfer_full_member_history_and_plans.sql",
  "20261011210000_fix_member_migration_preview_counts.sql",
  "20261011220000_fix_member_migration_batch_duplicate_detection.sql",
  "20261021200000_remove_postgres_lint_warnings.sql",
]);
const rpcCalls = [];

async function sourceFiles(relativeDirectory) {
  const directory = path.join(projectRoot, relativeDirectory);
  const files = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (/\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) files.push(fullPath);
    }
  }
  await walk(directory);
  return files;
}

for (const root of runtimeRoots) {
  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

    function visit(node) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const packageName = node.moduleSpecifier.text.split("/")[0].replace(/^@[^/]+\//, "");
        assert.equal(
          rawDatabasePackages.test(packageName),
          false,
          `${path.relative(projectRoot, file)} imports a direct SQL driver (${packageName}); keep database access on parameterized Supabase APIs or vetted parameterized queries`,
        );
      }

      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text;
        if (method === "rpc") {
          const [functionName, parameters] = node.arguments;
          assert.ok(
            functionName && ts.isStringLiteral(functionName),
            `${path.relative(projectRoot, file)} must use a fixed Supabase RPC function name`,
          );
          assert.ok(
            !parameters || ts.isObjectLiteralExpression(parameters),
            `${path.relative(projectRoot, file)} must pass RPC inputs as a structured object, not assembled SQL/filter text`,
          );
          rpcCalls.push({ file, functionName: functionName.text });
        }

        assert.equal(
          unsafePostgrestFilterMethods.has(method),
          false,
          `${path.relative(projectRoot, file)} uses PostgREST .${method}(); do not build its filter grammar from user input`,
        );
      }
      ts.forEachChild(node, visit);
    }

    visit(ast);
  }
}

assert.ok(rpcCalls.length > 0, "the application should exercise its existing Supabase RPC integration");

// Dynamic SQL exists only in reviewed, migration-time maintenance blocks.
// Fail closed if a runtime migration adds another EXECUTE statement so it gets
// a manual injection review before becoming part of the application schema.
const migrationEntries = await readdir(migrationRoot, { withFileTypes: true });
const dynamicSqlMigrations = new Set();
for (const entry of migrationEntries) {
  if (!entry.isFile() || !entry.name.endsWith(".sql")) continue;
  const sql = await readFile(path.join(migrationRoot, entry.name), "utf8");
  if (/^\s*execute\s+(?!function\b)[\w]+/gim.test(sql)) {
    dynamicSqlMigrations.add(entry.name);
  }
}
assert.deepEqual(
  [...dynamicSqlMigrations].sort(),
  [...reviewedDynamicSqlMigrations].sort(),
  "new dynamic SQL in a migration must be explicitly reviewed for identifier/value parameterization",
);

const triggerMigration = await readFile(
  path.join(migrationRoot, "20261008100000_platform_admin_realtime.sql"),
  "utf8",
);
assert.match(triggerMigration, /foreach v_table in array array\[/i);
assert.match(triggerMigration, /on public\.%I/i);
assert.doesNotMatch(triggerMigration, /on public\.%s/i);
for (const migrationName of [...reviewedDynamicSqlMigrations].filter((name) => name !== "20261008100000_platform_admin_realtime.sql")) {
  const sql = await readFile(path.join(migrationRoot, migrationName), "utf8");
  assert.match(sql, /pg_get_functiondef\s*\(/i, `${migrationName} must patch a fixed existing function definition`);
  assert.match(sql, /'public\.[a-z_]+\([^']*\)'::regprocedure/i, `${migrationName} must identify its target function statically`);
}

// Prove the Supabase RPC client serializes hostile-looking text as JSON data.
// The stubbed fetch is local to this test and cannot contact Supabase.
const attackString = "x'); DROP TABLE gym_workspaces; --";
let capturedRequest;
const localClient = createClient("https://supabase.invalid", "sb_publishable_test_only", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: async (input, init) => {
      capturedRequest = { url: String(input), body: String(init?.body ?? "") };
      return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
    },
  },
});

const { error } = await localClient.rpc("platform_list_gyms", { p_search: attackString });
assert.equal(error, null, "the local RPC serialization probe should complete without network access");
assert.match(capturedRequest.url, /\/rest\/v1\/rpc\/platform_list_gyms$/);
assert.deepEqual(JSON.parse(capturedRequest.body), { p_search: attackString });
assert.equal(
  capturedRequest.body.includes("DROP TABLE"),
  true,
  "attack-looking input must remain an ordinary JSON value, not become a separate SQL statement",
);

console.log(`SQL injection surface checks passed (${rpcCalls.length} fixed-name, structured RPC calls audited; ${dynamicSqlMigrations.size} migration-only dynamic SQL sources reviewed; hostile input serialization stayed parameter data).`);
