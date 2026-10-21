import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "attendance-history-search.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  expect: { timeout: 15_000 },
  use: {
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
  },
});
