import { defineConfig } from "@playwright/test";

// Synthetic records and a fully intercepted fake Supabase origin; never hits production data.
export default defineConfig({
  testDir: "../../tests/e2e",
  testMatch: "reports.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: "http://127.0.0.1:4183",
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    cwd: process.cwd(),
    command: "node node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port 4183 --strictPort",
    url: "http://127.0.0.1:4183/reports",
    env: {
      VITE_SUPABASE_URL: "https://reports-test.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "reports-test-publishable-key",
      SUPABASE_URL: "https://reports-test.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "reports-test-publishable-key",
    },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
