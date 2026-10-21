import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { addDays, buildSeed, iso } from "../../src/lib/gym/seed";

const owner = {
  id: "f3000000-0000-0000-0000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "qa-notifications-owner@example.invalid",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { full_name: "Notifications QA Owner", gym_name: "Notifications QA Gym" },
  factors: [],
  identities: [],
  created_at: "2026-01-01T00:00:00.000Z",
};

const context = {
  gym_id: "f4000000-0000-0000-0000-000000000001",
  role: "owner",
  permissions: {},
  display_name: "Notifications QA Owner",
  email: owner.email,
  enabled: true,
  gym_name: "Notifications QA Gym",
  account_status: "active",
  subscription_expired: false,
  subscription_status: "active",
  subscription_source: "manual",
  subscription_current_period_end: "2027-01-01T00:00:00.000Z",
};

const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(
  JSON.stringify({
    sub: owner.id,
    aud: "authenticated",
    role: "authenticated",
    email: owner.email,
    exp: 4102444800,
    iat: 1791763200,
    aal: "aal1",
    app_metadata: owner.app_metadata,
    user_metadata: owner.user_metadata,
  }),
).toString("base64url")}.qa-signature`;

function makeSyntheticState() {
  const state = buildSeed(1);
  const member = state.members[0]!;
  member.name = "QA Notification Member";
  member.email = "qa-notification-member@example.invalid";
  member.phone = "+9779801234567";
  state.activities.unshift(
    {
      id: "qa-member-payment-activity",
      type: "payment_received",
      title: "Payment received",
      description: "₹500 from QA Notification Member",
      date: iso(new Date()),
      memberId: member.id,
    },
    {
      id: "qa-legacy-invoice-activity",
      type: "invoice_generated",
      title: "Invoice generated",
      description: "INV-QA-MEMBER created for QA Notification Member · ₹500",
      date: iso(new Date()),
    },
  );
  state.settings.gymName = "Notifications QA Gym";
  state.settings.expiryReminderDays = 7;
  state.inquiries = [];
  state.readNotifications = [];
  const membership = state.memberships
    .filter((item) => item.memberId === member.id)
    .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime())[0];
  if (membership) membership.endDate = iso(addDays(new Date(), 1));
  return state;
}

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function installSyntheticBackend(page: Page) {
  const workspace = { state: makeSyntheticState(), revision: 1 };
  const unexpectedRequests: string[] = [];
  await page.route("https://notifications-qa.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    if (pathname.endsWith("/auth/v1/token")) {
      return fulfillJson(route, {
        access_token: token,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: 4102444800,
        refresh_token: "notifications-qa-refresh-token",
        user: owner,
      });
    }
    if (pathname.endsWith("/auth/v1/user")) return fulfillJson(route, owner);
    if (pathname.endsWith("/auth/v1/logout")) return route.fulfill({ status: 204, body: "" });
    if (pathname.endsWith("/rest/v1/rpc/get_current_gym_context")) {
      return fulfillJson(route, context);
    }
    if (pathname.endsWith("/rest/v1/rpc/load_current_gym_workspace")) {
      return fulfillJson(route, { ...context, revision: workspace.revision, state: workspace.state });
    }
    if (pathname.endsWith("/rest/v1/rpc/save_current_gym_workspace")) {
      const body = route.request().postDataJSON() as { p_state?: typeof workspace.state };
      if (body.p_state) workspace.state = body.p_state;
      workspace.revision += 1;
      return fulfillJson(route, { revision: workspace.revision });
    }
    if (pathname.endsWith("/rest/v1/rpc/record_audit_event")) return fulfillJson(route, {});
    if (pathname.endsWith("/rest/v1/gym_users")) return fulfillJson(route, []);
    if (pathname.startsWith("/rest/v1/rpc/")) return fulfillJson(route, null);
    if (pathname.startsWith("/rest/v1/")) return fulfillJson(route, []);
    if (pathname.startsWith("/functions/v1/")) return fulfillJson(route, { success: true });

    unexpectedRequests.push(`${route.request().method()} ${url.pathname}${url.search}`);
    return fulfillJson(route, { message: "Unexpected synthetic Supabase request" }, 404);
  });

  await page.addInitScript(() => {
    const openedUrls: string[] = [];
    Object.defineProperty(window, "__qaOpenedUrls", {
      configurable: true,
      value: openedUrls,
    });
    Object.defineProperty(window, "open", {
      configurable: true,
      value: (url?: string | URL | null) => {
        if (url) openedUrls.push(String(url));
        return null;
      },
    });
  });

  return { workspace, unexpectedRequests };
}

test("notifications handoffs, read persistence, keyboard access, and responsive layouts", async ({ page }) => {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = resolve(process.cwd(), "qa/ironvault/notifications", `focused-qa-${runId}`);
  mkdirSync(outputDir, { recursive: true });

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });

  const { workspace, unexpectedRequests } = await installSyntheticBackend(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByRole("textbox", { name: "Email address" }).fill(owner.email);
  await page.getByRole("textbox", { name: "Password" }).fill("synthetic-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await page.locator("button").filter({ hasText: /^Skip tour$/ }).last().click();
  await expect(page.getByRole("button", { name: "Skip tour" })).toHaveCount(0);
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent notifications", exact: true })).toBeVisible();
  await expect(page.getByText("QA Notification Member").first()).toBeVisible();

  const recentNotifications = page.locator("ul.divide-y").last();
  const memberActivityLink = recentNotifications
    .getByRole("link")
    .filter({ hasText: "INV-QA-MEMBER" });
  await expect(memberActivityLink).toHaveAttribute("href", `/members/${workspace.state.members[0]!.id}`);
  await memberActivityLink.click();
  await expect(page).toHaveURL(new RegExp(`/members/${workspace.state.members[0]!.id}$`));
  await expect(
    page.getByRole("heading", { name: "QA Notification Member", exact: true }),
  ).toBeVisible();

  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "Recent notifications", exact: true })).toBeVisible();
  const explicitMemberActivity = page
    .locator("ul.divide-y")
    .last()
    .getByRole("link")
    .filter({ hasText: "₹500 from QA Notification Member" });
  await expect(explicitMemberActivity).toHaveAttribute(
    "href",
    `/members/${workspace.state.members[0]!.id}`,
  );
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  const bellMemberActivity = page
    .locator('[data-radix-popper-content-wrapper]')
    .getByRole("link")
    .filter({ hasText: "₹500 from QA Notification Member" });
  await expect(bellMemberActivity).toHaveAttribute(
    "href",
    `/members/${workspace.state.members[0]!.id}`,
  );
  await bellMemberActivity.click();
  await expect(page).toHaveURL(new RegExp(`/members/${workspace.state.members[0]!.id}$`));
  await expect(
    page.getByRole("heading", { name: "QA Notification Member", exact: true }),
  ).toBeVisible();
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "Recent notifications", exact: true })).toBeVisible();

  const reminder = page.locator("article").filter({ hasText: "QA Notification Member" }).first();
  await expect(reminder).toBeVisible();
  const whatsappButton = reminder.getByRole("button", { name: /WhatsApp/ });
  const smsButton = reminder.getByRole("button", { name: /SMS/ });
  const emailButton = reminder.getByRole("button", { name: /Email/ });
  await expect(whatsappButton).toBeEnabled();
  await expect(smsButton).toBeEnabled();
  await expect(emailButton).toBeVisible();
  await expect(emailButton).toBeEnabled();

  // Keyboard focus and activation are used while window.open is safely stubbed.
  await whatsappButton.focus();
  await expect(whatsappButton).toBeFocused();
  await page.keyboard.press("Enter");
  const whatsappUrl = await page.evaluate(
    () => (window as Window & { __qaOpenedUrls?: string[] }).__qaOpenedUrls?.at(-1) ?? "",
  );
  const whatsapp = new URL(whatsappUrl);
  expect(whatsapp.hostname).toBe("wa.me");
  expect(whatsapp.pathname).toBe("/9779801234567");
  expect(whatsapp.searchParams.get("text")).toContain("Hi QA Notification Member");
  expect(whatsapp.searchParams.get("text")).toContain("Notifications QA Gym");
  await expect(page.getByRole("status")).toHaveText("WhatsApp message prepared for QA Notification Member");

  await smsButton.focus();
  await expect(smsButton).toBeFocused();
  await page.keyboard.press("Enter");
  const smsUrl = await page.evaluate(
    () => (window as Window & { __qaOpenedUrls?: string[] }).__qaOpenedUrls?.at(-1) ?? "",
  );
  const sms = new URL(smsUrl);
  expect(sms.protocol).toBe("sms:");
  expect(sms.pathname).toBe("+9779801234567");
  expect(sms.searchParams.get("body")).toContain("Hi QA Notification Member");
  expect(sms.searchParams.get("body")).toContain("Notifications QA Gym");
  const handoffStatus = page.getByRole("status");
  await expect(handoffStatus).toHaveText("SMS message prepared for QA Notification Member");

  const viewportResults: Array<Record<string, unknown>> = [];
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => document.fonts.ready);
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
    await expect(reminder.getByRole("button", { name: /WhatsApp/ })).toBeVisible();
    await expect(reminder.getByRole("button", { name: /SMS/ })).toBeVisible();
    await expect(reminder.getByRole("button", { name: /Email/ })).toBeVisible();
    await expect(handoffStatus).toBeVisible();
    const cardWidth = await reminder.evaluate((element) => element.getBoundingClientRect().width);
    const statusBox = await handoffStatus.boundingBox();
    const reminderBox = await reminder.boundingBox();
    const notificationsList = page.locator("ul.divide-y").last();
    await expect(notificationsList).toBeVisible();
    const listBox = await notificationsList.boundingBox();
    const overlaps = (first: NonNullable<typeof statusBox>, second: NonNullable<typeof statusBox>) =>
      first.x < second.x + second.width &&
      first.x + first.width > second.x &&
      first.y < second.y + second.height &&
      first.y + first.height > second.y;
    expect(statusBox && reminderBox ? overlaps(statusBox, reminderBox) : true).toBe(false);
    expect(statusBox && listBox ? overlaps(statusBox, listBox) : true).toBe(false);
    await page.screenshot({ path: resolve(outputDir, `notifications-${viewport.name}-viewport.png`) });
    await page.screenshot({
      path: resolve(outputDir, `notifications-${viewport.name}-full.png`),
      fullPage: true,
    });
    viewportResults.push({
      ...viewport,
      documentWidth,
      noHorizontalOverflow: documentWidth <= viewport.width,
      reminderCardWidth: cardWidth,
      inlineStatusVisible: true,
      statusDoesNotOverlapReminder: true,
      statusDoesNotOverlapNotificationList: true,
      keyControlsVisible: true,
    });
    expect(documentWidth, `${viewport.name} page should not overflow horizontally`).toBeLessThanOrEqual(
      viewport.width,
    );
  }

  // Email button is verified as enabled; do not invoke mailto because it delegates
  // to an external mail client which is intentionally outside this isolated test.
  const emailHandoff = "not invoked; external mail client intentionally not opened";

  const readAllButton = page.getByRole("button", { name: "Mark all read" });
  await readAllButton.focus();
  await expect(readAllButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("All notifications marked as read.");
  await expect(page.getByText(/0 unread of \d+ alerts/)).toBeVisible();
  await expect(readAllButton).toBeDisabled();
  await expect.poll(() => workspace.state.readNotifications.length).toBeGreaterThan(0);

  // The in-memory fake backend survives document reload to exercise a real
  // persistence round-trip without touching production storage.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
  await expect(page.getByText(/0 unread of \d+ alerts/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark all read" })).toBeDisabled();
  await page.screenshot({ path: resolve(outputDir, "notifications-after-read-reload-desktop.png") });

  const metadata = {
    capturedAt: new Date().toISOString(),
    route: "/notifications",
    environment: "isolated local Vite + fully intercepted fake Supabase + synthetic workspace",
    productionDataTouched: false,
    emailHandoff,
    whatsapp: { recipient: whatsapp.pathname.slice(1), message: whatsapp.searchParams.get("text") },
    sms: { recipient: sms.pathname, message: sms.searchParams.get("body") },
    markAllRead: {
      persistedCount: workspace.state.readNotifications.length,
      afterReloadUnreadText: await page.getByText(/0 unread of \d+ alerts/).innerText(),
    },
    viewports: viewportResults,
    pageErrors,
    consoleErrors,
    failedResponses,
    unexpectedSupabaseRequests: unexpectedRequests,
  };
  writeFileSync(resolve(outputDir, "metadata.json"), JSON.stringify(metadata, null, 2));
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedResponses).toEqual([]);
  expect(unexpectedRequests).toEqual([]);
  expect(viewportResults).toHaveLength(3);
});
