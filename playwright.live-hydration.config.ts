import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "live-hydration-diagnostic.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "./qa/ironvault/live-public/hydration-diagnostic-2026-10-15",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "https://velvetgrip-gympro3r23re234r23423.basicgymulabari.workers.dev",
    browserName: "chromium",
    headless: true,
  },
});
