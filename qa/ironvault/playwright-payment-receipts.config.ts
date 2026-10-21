import { defineConfig } from "@playwright/test";

// Fully intercepted, synthetic-only workspace for receipt correctness and responsiveness.
export default defineConfig({
  testDir: "../../tests/e2e",
  testMatch: "payment-receipts.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 120_000,
  expect: { timeout: 45_000 },
  use: {
    baseURL: "http://127.0.0.1:4187",
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    cwd: process.cwd(),
    command: "node node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port 4187 --strictPort",
    // Probe Vite itself; SSR of the payments route can wait for app-level auth
    // and is not a reliable signal that the dev server has started.
    url: "http://127.0.0.1:4187/@vite/client",
    env: {
      VITE_SUPABASE_URL: "https://receipts-test.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "receipts-test-publishable-key",
      SUPABASE_URL: "https://receipts-test.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "receipts-test-publishable-key",
    },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
