import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["worker-attendance-route.spec.ts", "not-found-hydration.spec.ts"],
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:8789",
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx wrangler dev --local --port 8789 --ip 127.0.0.1",
    url: "http://127.0.0.1:8789/login",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
