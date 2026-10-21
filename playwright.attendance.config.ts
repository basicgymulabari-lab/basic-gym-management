import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "attendance.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:4181",
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port 4181 --strictPort",
    url: "http://127.0.0.1:4181/attendance",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      VITE_SUPABASE_URL: "https://attendance-test.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_attendance_browser_test",
    },
  },
});
