import { defineConfig } from "@playwright/test";

// Focused Notifications QA. All Supabase traffic is intercepted by the test;
// these synthetic values never point at a real project.
export default defineConfig({
  testDir: "../../tests/e2e",
  testMatch: "notifications-qa.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:4186",
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    cwd: process.cwd(),
    command: "node node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port 4186 --strictPort",
    url: "http://127.0.0.1:4186/notifications",
    env: {
      VITE_SUPABASE_URL: "https://notifications-qa.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "notifications-qa-publishable-key",
      SUPABASE_URL: "https://notifications-qa.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "notifications-qa-publishable-key",
    },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
