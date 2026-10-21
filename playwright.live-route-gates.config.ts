import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "live-route-gates-readonly.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "./qa/ironvault/live-public/route-gates-settled-2026-10-15",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "https://velvetgrip-gympro3r23re234r23423.basicgymulabari.workers.dev",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
});
