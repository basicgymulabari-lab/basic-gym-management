import { defineConfig } from "@playwright/test";

// Isolated local route/auth checks on a dedicated port; no production backend or test data.
export default defineConfig({
  testDir: "../../tests/e2e",
  testMatch: "auth-entry.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:4176",
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    cwd: process.cwd(),
    command: "node node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port 4176 --strictPort",
    url: "http://127.0.0.1:4176/ceo",
    env: {
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_PUBLISHABLE_KEY: "",
      SUPABASE_URL: "",
      SUPABASE_PUBLISHABLE_KEY: "",
    },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
