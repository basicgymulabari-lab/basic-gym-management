import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "auth-recovery-live-readonly.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "./qa/ironvault/live-public/round-5-password-recovery-2026-10-15/playwright-results",
  expect: { timeout: 20_000 },
  use: {
    baseURL: "https://velvetgrip-gympro3r23re234r23423.basicgymulabari.workers.dev",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
});
