import { defineConfig } from "@playwright/test";

// Isolated local app-wide visual sweep. Supabase is intercepted in the test;
// values below only let the local client initialize and never contact a real project.
export default defineConfig({
  testDir: "../../tests/e2e",
  testMatch: "application-wide-routes.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: "http://127.0.0.1:4184",
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    cwd: process.cwd(),
    command: "node node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port 4184 --strictPort",
    url: "http://127.0.0.1:4184/settings",
    env: {
      VITE_SUPABASE_URL: "https://application-wide-qa.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "application-wide-qa-publishable-key",
      SUPABASE_URL: "https://application-wide-qa.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "application-wide-qa-publishable-key",
    },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
