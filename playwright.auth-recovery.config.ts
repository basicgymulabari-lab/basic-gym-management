import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "auth-recovery-configured.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:4185",
    browserName: "chromium",
    headless: true,
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port 4185 --strictPort",
    url: "http://127.0.0.1:4185/login",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      VITE_SUPABASE_URL: "https://recovery-test.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_recovery_test",
    },
  },
});
