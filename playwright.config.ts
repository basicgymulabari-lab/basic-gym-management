import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["release-center.spec.ts"],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173/@vite/client",
    // Each isolated E2E suite injects a different synthetic auth URL/state.
    // Never reuse a dev server launched with a different suite's environment.
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      VITE_SUPABASE_URL: "https://application-wide-qa.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_application_wide_browser_test",
    },
  },
});
