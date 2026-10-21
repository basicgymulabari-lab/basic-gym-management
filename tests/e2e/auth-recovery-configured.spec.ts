import { expect, test } from "@playwright/test";

test("configured password recovery submits safely and confirms generically", async ({ page }) => {
  const recoveryRequests: Array<{ email: string; redirectTo: string | null }> = [];

  await page.route("https://recovery-test.supabase.co/auth/v1/recover**", async (route) => {
    const request = route.request();
    const payload = request.postDataJSON() as { email?: string };
    recoveryRequests.push({
      email: payload.email ?? "",
      redirectTo: new URL(request.url()).searchParams.get("redirect_to"),
    });
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.goto("/login");
  await page.getByRole("button", { name: "Forgot password?" }).click();

  await expect(page.getByRole("heading", { name: "Forgot password?" })).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Password reset emails are unavailable" }),
  ).toHaveCount(0);
  const email = page.getByRole("textbox", { name: "Email address" });
  await expect(email).toBeEnabled();
  await email.fill("owner@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();

  await expect(page.getByRole("status")).toContainText(
    "If this email has an account, a reset link will arrive shortly.",
  );
  expect(recoveryRequests).toEqual([
    { email: "owner@example.test", redirectTo: "http://127.0.0.1:4185/login" },
  ]);
});

test("auth-service setup failures show actionable recovery guidance instead of a raw error", async ({
  page,
}, testInfo) => {
  await page.route("https://recovery-test.supabase.co/auth/v1/recover**", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        message:
          "Account recovery is temporarily unavailable because the authentication service is not configured.",
      }),
    });
  });

  await page.goto("/login");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("owner@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();

  await expect(page.getByRole("status")).toContainText(
    "Password reset isn't available right now. Please contact your gym administrator.",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reset unavailable" })).toBeDisabled();
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(page.getByRole("status")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset unavailable" })).toBeDisabled();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBe(viewport.width);
    await page.screenshot({
      path: testInfo.outputPath(`auth-provider-unavailable-${viewport.name}.png`),
      fullPage: true,
    });
  }

  await page.getByRole("textbox", { name: "Email address" }).fill("another-owner@example.test");
  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset unavailable" })).toBeDisabled();

  await page.getByRole("button", { name: "Already have an account? Sign in" }).click();
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send reset link" })).toBeEnabled();
});
