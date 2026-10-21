import { expect, test } from "@playwright/test";

test.describe("unauthenticated application entry points", () => {
  test("CEO console explains missing auth configuration without presenting a dead form", async ({
    page,
  }) => {
    await page.goto("/ceo");

    await expect(page.getByRole("heading", { name: "CEO sign in" })).toBeVisible();
    const cloudAuthNotice = page.getByRole("status").filter({
      hasText: "Cloud authentication is not configured in this deployment.",
    });
    if (await cloudAuthNotice.isVisible()) {
      await expect(
        page.getByRole("heading", { name: "Platform-owner sign-in is paused" }),
      ).toBeVisible();
      await expect(
        page.getByText(/do not enter account details here until access is enabled/i),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Retry secure check" })).toHaveCount(0);
      await expect(page.getByRole("textbox", { name: "Platform-owner email" })).toHaveCount(0);
      await expect(page.getByRole("textbox", { name: "Password" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Show password" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Forgot password?" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Sign in to CEO console" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Gym workspace sign in" })).toBeVisible();
    } else {
      await expect(page.getByRole("textbox", { name: "Platform-owner email" })).toHaveJSProperty(
        "required",
        true,
      );
      const password = page.getByRole("textbox", { name: "Password" });
      await expect(password).toHaveJSProperty("required", true);
      await expect(password).toHaveAttribute("type", "password");
      await page.getByRole("button", { name: "Show password" }).click();
      await expect(password).toHaveAttribute("type", "text");
      await page.getByRole("button", { name: "Hide password" }).click();
      await expect(password).toHaveAttribute("type", "password");
    }
  });

  test("gym workspace deep links return unauthenticated visitors to the owner login", async ({
    page,
  }) => {
    await page.goto("/members");

    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("gym login can switch receptionist mode and open/close password recovery", async ({
    page,
  }) => {
    await page.goto("/login");
    const recoveryRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/auth/v1/recover")) recoveryRequests.push(request.url());
    });

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Gym owner" })).toBeVisible();
    await page.getByRole("button", { name: "Receptionist" }).click();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByRole("heading", { name: "Forgot password?" })).toBeVisible();
    await expect(
      page.getByText("Ask your gym owner to reset your receptionist password."),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Email address" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Show recovery steps" })).toBeVisible();
    recoveryRequests.length = 0;
    await page.getByRole("button", { name: "Show recovery steps" }).click();
    await expect(
      page.getByRole("status").filter({
        hasText: "Ask the gym owner to reset the receptionist password in Settings → Staff Access.",
      }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Hide recovery steps" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await page.waitForTimeout(250);
    expect(recoveryRequests).toEqual([]);
    await page.getByRole("button", { name: "Hide recovery steps" }).click();
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Show recovery steps" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    // Return without sending an email or invoking the auth backend.
    await page.getByRole("button", { name: "Already have an account? Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("unconfigured cloud authentication is explained and blocks owner login and signup", async ({
    page,
  }) => {
    await page.goto("/login");
    const cloudAuthNotice = page.getByRole("status").filter({
      hasText: "Sign-in is unavailable because cloud authentication is not configured",
    });
    await expect(cloudAuthNotice).toBeVisible();

    await expect(page.getByRole("button", { name: "Sign in" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Forgot password?" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "New here? Sign up" })).toBeDisabled();

    // Let the owner see why recovery is unavailable, without offering a dead submission.
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByRole("heading", { name: "Forgot password?" })).toBeVisible();
    await expect(
      page.getByText("Contact your site administrator to enable password recovery."),
    ).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({
        hasText:
          "Password reset emails are unavailable until this site's authentication is configured. Contact the site administrator.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("alert").filter({
        hasText:
          "Account recovery is temporarily unavailable because the authentication service is not configured.",
      }),
    ).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Email address" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send reset link" })).toHaveCount(0);
    const recoveryRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/auth/v1/recover")) recoveryRequests.push(request.url());
    });
    await page.locator("form").evaluate((form) => (form as HTMLFormElement).requestSubmit());
    await expect(
      page.getByRole("status").filter({
        hasText:
          "Password reset emails are unavailable until this site's authentication is configured. Contact the site administrator.",
      }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(recoveryRequests).toEqual([]);
    await page.getByRole("button", { name: "Already have an account? Sign in" }).click();

    await page.getByRole("button", { name: "Receptionist" }).click();
    await expect(page.getByRole("button", { name: "Forgot password?" })).toBeEnabled();
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByRole("button", { name: "Show recovery steps" })).toBeEnabled();
    await page.getByRole("button", { name: "Already have an account? Sign in" }).click();
    await page.getByRole("button", { name: "Gym owner" }).click();
    await expect(page.getByRole("button", { name: "New here? Sign up" })).toBeDisabled();

    // Configuration-required account creation remains unavailable and cannot be opened.
    await expect(page.getByRole("button", { name: "Create account" })).toHaveCount(0);
  });
});

test.describe("public user-guide downloads", () => {
  test("both guides are served as downloadable PDF files", async ({ request }) => {
    for (const path of ["/guides/gym-management-guide.pdf", "/guides/ceo-dashboard-guide.pdf"]) {
      const response = await request.get(path);
      expect(response.ok(), `${path} should be publicly downloadable`).toBeTruthy();
      expect(response.headers()["content-type"]).toContain("application/pdf");
      expect((await response.body()).subarray(0, 5).toString("ascii")).toBe("%PDF-");
    }
  });
});
