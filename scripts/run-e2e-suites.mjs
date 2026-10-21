import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const projectRoot = process.cwd();
const baseEnvironment = { ...process.env };
const require = createRequire(import.meta.url);
const playwrightCli = require.resolve("@playwright/test/cli");
const viteCli = resolve(projectRoot, "node_modules/vite/bin/vite.js");
const cspHashScript = resolve(projectRoot, "scripts/generate-pages-csp-hashes.mjs");
const runId = new Date().toISOString().replace(/[:.]/g, "-");

function run(script, args, env = baseEnvironment) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: projectRoot,
    env,
    stdio: "inherit",
    windowsHide: true,
  });

  if (result.error) {
    console.error(`Could not start ${script}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

function suiteEnvironment(url, key) {
  const env = { ...baseEnvironment };
  if (url && key) {
    env.VITE_SUPABASE_URL = url;
    env.VITE_SUPABASE_PUBLISHABLE_KEY = key;
  } else {
    delete env.VITE_SUPABASE_URL;
    delete env.VITE_SUPABASE_PUBLISHABLE_KEY;
  }
  return env;
}

const suites = [
  {
    name: "application-wide routes",
    spec: "tests/e2e/application-wide-routes.spec.ts",
    config: "qa/ironvault/playwright-application-wide.config.ts",
    auth: ["https://application-wide-qa.supabase.co", "sb_publishable_application-wide-qa"],
  },
  {
    name: "Trash lifecycle workflow",
    spec: "tests/e2e/application-wide-routes.spec.ts",
    config: "qa/ironvault/playwright-application-wide.config.ts",
    grep: "synthetic Trash lifecycle",
    auth: ["https://application-wide-qa.supabase.co", "sb_publishable_application-wide-qa"],
  },
  {
    name: "Settings backup and staff access workflow",
    spec: "tests/e2e/application-wide-routes.spec.ts",
    config: "qa/ironvault/playwright-application-wide.config.ts",
    grep: "synthetic Settings backup restore and receptionist access",
    auth: ["https://application-wide-qa.supabase.co", "sb_publishable_application-wide-qa"],
  },
  {
    name: "attendance workflows",
    spec: "tests/e2e/attendance.spec.ts",
    config: "playwright.attendance.config.ts",
  },
  {
    name: "attendance history search",
    spec: "tests/e2e/attendance-history-search.spec.ts",
    config: "playwright.attendance-search.config.ts",
  },
  {
    name: "unauthenticated entry and recovery",
    spec: "tests/e2e/auth-entry.spec.ts",
    config: "qa/ironvault/playwright-auth-audit.config.ts",
    auth: null,
  },
  {
    name: "configured password recovery request",
    spec: "tests/e2e/auth-recovery-configured.spec.ts",
    config: "playwright.auth-recovery.config.ts",
  },
  {
    name: "Worker routes and HTTP status",
    spec: "tests/e2e/not-found-hydration.spec.ts",
    config: "playwright.worker-attendance.config.ts",
  },
  {
    name: "notifications workflows",
    spec: "tests/e2e/notifications-qa.spec.ts",
    config: "qa/ironvault/playwright-notifications-qa.config.ts",
    auth: ["https://notifications-qa.supabase.co", "sb_publishable_notifications_qa"],
  },
  {
    name: "payment and receipt workflows",
    spec: "tests/e2e/payment-receipts.spec.ts",
    config: "qa/ironvault/playwright-payment-receipts.config.ts",
    auth: ["https://receipts-test.supabase.co", "sb_publishable_receipts_test"],
  },
  {
    name: "reports workflows",
    spec: "tests/e2e/reports.spec.ts",
    config: "qa/ironvault/playwright-reports-functional.config.ts",
    auth: ["https://reports-test.supabase.co", "sb_publishable_reports_test"],
  },
  {
    name: "Worker attendance route and assets",
    spec: "tests/e2e/worker-attendance-route.spec.ts",
    config: "playwright.worker-attendance.config.ts",
  },
  {
    name: "CEO release-center workflow",
    spec: "tests/e2e/release-center.spec.ts",
    config: "playwright.release.config.ts",
  },
];

const suiteFilterIndex = process.argv.indexOf("--suite");
const suiteFilter = suiteFilterIndex >= 0 ? process.argv[suiteFilterIndex + 1] : undefined;
const selectedSuites = suiteFilter ? suites.filter((suite) => suite.name === suiteFilter) : suites;

if (selectedSuites.length === 0) {
  console.error(
    `Unknown E2E suite${suiteFilter ? `: ${suiteFilter}` : ""}. Choose one of: ${suites.map((suite) => suite.name).join(", ")}`,
  );
  process.exitCode = 2;
} else {
  const requiresWorkerBuild = selectedSuites.some((suite) => suite.config?.includes("worker"));
  let failures = 0;

  if (requiresWorkerBuild) {
    console.log("Building current client assets for isolated Cloudflare Worker tests…");
    const buildExit = run(viteCli, ["build"]);
    if (buildExit !== 0) {
      console.error("Client build failed; Worker tests cannot use stale dist assets.");
      process.exitCode = buildExit;
      process.exit();
    }
    if (run(cspHashScript, []) !== 0) {
      console.error("CSP hash generation failed; Worker tests cannot be trusted.");
      process.exitCode = 1;
      process.exit();
    }
  }

  for (const suite of selectedSuites) {
    console.log(`\n=== ${suite.name} ===`);
    const outputName = suite.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const outputDir = resolve(projectRoot, "test-results", "isolated-e2e", runId, outputName);
    const args = ["test", suite.spec, "--output", outputDir];
    if (suite.grep) args.push("--grep", suite.grep);
    if (suite.config) args.push("--config", suite.config);
    const env =
      suite.auth === null
        ? suiteEnvironment()
        : suite.auth
          ? suiteEnvironment(suite.auth[0], suite.auth[1])
          : baseEnvironment;
    const exitCode = run(playwrightCli, args, env);
    if (exitCode !== 0) failures += 1;
  }

  if (failures > 0) {
    console.error(`\nE2E suite summary: ${failures} test group(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("\nE2E suite summary: all isolated groups passed.");
  }
}
