import { expect, test } from "@playwright/test";

test("deployed password-reset form submits through the mocked client path without sending an email", async ({
  page,
}, testInfo) => {
  const recoveryRequests: Array<{ email: string; redirectTo: string | null }> = [];
  // Intercept the reset call before it reaches Supabase. This verifies the
  // deployed client submit path without sending an actual email or changing an account.
  await page.route("**/auth/v1/recover**", async (route) => {
    const request = route.request();
    const payload = request.postDataJSON() as { email?: string };
    recoveryRequests.push({
      email: payload.email ?? "",
      redirectTo: new URL(request.url()).searchParams.get("redirect_to"),
    });
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/login");
    await page.getByRole("button", { name: "Forgot password?" }).click();

    await expect(page.getByRole("heading", { name: "Forgot password?" })).toBeVisible();
    await expect(
      page.getByText("Enter your account email to request a secure password reset."),
    ).toBeVisible();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: /authentication.*not configured|reset emails are unavailable/i }),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole("alert")
        .filter({
          hasText: /account recovery is temporarily unavailable because the authentication service is not configured/i,
        }),
    ).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Email address" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Send reset link" })).toBeEnabled();

    await page.screenshot({
      path: testInfo.outputPath(`forgot-password-${viewport.name}.png`),
      fullPage: true,
    });

    await page.getByRole("textbox", { name: "Email address" }).fill("qa-live-no-email@example.invalid");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText(
      "If this email has an account, a reset link will arrive shortly.",
    );
  }

  expect(recoveryRequests).toEqual([
    {
      email: "qa-live-no-email@example.invalid",
      redirectTo: "https://velvetgrip-gympro3r23re234r23423.basicgymulabari.workers.dev/login",
    },
    {
      email: "qa-live-no-email@example.invalid",
      redirectTo: "https://velvetgrip-gympro3r23re234r23423.basicgymulabari.workers.dev/login",
    },
    {
      email: "qa-live-no-email@example.invalid",
      redirectTo: "https://velvetgrip-gympro3r23re234r23423.basicgymulabari.workers.dev/login",
    },
  ]);

  const attendanceResponse = await page.goto("/attendance");
  expect(attendanceResponse?.status()).toBe(200);
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("live recovery handles an auth-service setup error without showing a raw failure", async ({
  page,
}, testInfo) => {
  // This response is fulfilled inside the browser. No reset request reaches
  // Supabase and no email is sent.
  await page.route("**/auth/v1/recover**", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Account recovery is temporarily unavailable because the authentication service is not configured.",
      }),
    });
  });

  await page.goto("/login");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("qa-no-send@example.invalid");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.screenshot({
    path: testInfo.outputPath("mocked-auth-configuration-failure.png"),
    fullPage: true,
  });

  await expect(page.getByRole("status")).toContainText(
    "Password reset isn't available right now. Please contact your gym administrator.",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reset unavailable" })).toBeDisabled();
});
