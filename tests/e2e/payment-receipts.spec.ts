import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GymState } from "../../src/lib/gym/types";

const qaOwner = {
  id: "a1000000-0000-0000-0000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "receipt-owner@example.invalid",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { full_name: "Receipt QA", gym_name: "IRONVAULT Receipt QA" },
  factors: [],
  identities: [],
  created_at: "2026-01-01T00:00:00.000Z",
};

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
  sub: qaOwner.id,
  aud: "authenticated",
  role: "authenticated",
  email: qaOwner.email,
  exp: 4102444800,
  iat: 1791763200,
  aal: "aal1",
  app_metadata: qaOwner.app_metadata,
  user_metadata: qaOwner.user_metadata,
})}.receipt-test-signature`;

const member = {
  id: "receipt-member-1",
  type: "member" as const,
  name: "Anita Receipt QA",
  email: "anita@example.invalid",
  phone: "+977 9800000003",
  gender: "female" as const,
  dob: "1990-01-01",
  address: "",
  photo: null,
  joinDate: "2026-10-01T00:00:00.000Z",
  emergencyContact: "",
  notes: [],
  measurements: [],
  shift: "morning" as const,
  deletedAt: null,
};

const membership = {
  id: "receipt-membership-1",
  memberId: member.id,
  planId: "receipt-plan-1",
  startDate: "2026-10-01",
  endDate: "2027-01-01",
  price: 1000,
  discount: 200,
  joiningFee: 100,
  frozen: false,
  frozenAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
};

const unpaidMembership = {
  id: "receipt-membership-unpaid-1",
  memberId: member.id,
  planId: "receipt-plan-monthly",
  startDate: "2026-01-01",
  endDate: "2026-01-31",
  price: 400,
  discount: 0,
  joiningFee: 0,
  frozen: false,
  frozenAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const state: GymState = {
  version: 1,
  auth: { email: "", passwordHash: "" },
  staff: {},
  settings: {
    gymName: "IRONVAULT Receipt QA",
    tagline: "Strength Club",
    address: "",
    phone: "",
    email: qaOwner.email,
    currency: "₹",
    invoicePrefix: "INV-QA",
    lowStockAlerts: true,
    expiryReminderDays: 7,
    adminName: "Receipt QA",
    calendarSystem: "gregorian" as const,
    phoneCountry: "nepal" as const,
    timeZone: "Asia/Kathmandu" as const,
  },
  members: [member],
  plans: [
    {
      id: "receipt-plan-1",
      name: "QA Three Month Plan",
      price: 1000,
      joiningFee: 0,
      durationDays: 92,
      description: "Synthetic invoice receipt test",
      active: true,
    },
    {
      id: "receipt-plan-monthly",
      name: "QA Monthly Plan",
      price: 400,
      joiningFee: 0,
      durationDays: 30,
      description: "Synthetic unpaid history term",
      active: true,
    },
    {
      id: "receipt-plan-annual",
      name: "QA Annual Plan",
      price: 1200,
      joiningFee: 0,
      durationDays: 365,
      description: "Synthetic correction target",
      active: true,
    },
  ],
  memberships: [membership, unpaidMembership],
  payments: [
    {
      id: "receipt-payment-1",
      invoiceNo: "INV-QA-001",
      memberId: member.id,
      membershipId: membership.id,
      kind: "membership" as const,
      amount: 250,
      method: "cash" as const,
      date: "2026-10-14T10:00:00.000Z",
      note: "QA Three Month Plan — joining payment",
    },
    {
      id: "receipt-payment-2",
      invoiceNo: "INV-QA-002",
      memberId: member.id,
      membershipId: membership.id,
      kind: "membership" as const,
      amount: 350,
      method: "upi" as const,
      date: "2026-10-14T11:00:00.000Z",
      note: "QA Three Month Plan — balance payment",
    },
  ],
  attendance: [],
  products: [],
  sales: [],
  activities: [],
  expenses: [],
  inquiries: [],
  readNotifications: [],
  invoiceSeq: 2,
};

const context = {
  gym_id: "a2000000-0000-0000-0000-000000000001",
  role: "owner",
  permissions: {},
  display_name: "Receipt QA",
  email: qaOwner.email,
  enabled: true,
  gym_name: "IRONVAULT Receipt QA",
  account_status: "active",
  subscription_expired: false,
  subscription_status: "active",
  subscription_source: "manual",
  subscription_current_period_end: "2027-01-01T00:00:00.000Z",
};

type AuditEventRequest = {
  p_action: string;
  p_entity_type: string | null;
  p_entity_id: string | null;
  p_metadata: Record<string, unknown>;
};

type MockBackendHooks = {
  onWorkspaceLoad?: (loadedState: typeof state) => void;
  onWorkspaceSave?: (savedState: typeof state) => void;
  onAuditEvent?: (event: AuditEventRequest) => void;
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function installMockBackend(
  page: Page,
  hooks: MockBackendHooks = {},
  initialState: GymState = state,
) {
  const workspace: { state: GymState; revision: number } = {
    state: structuredClone(initialState),
    revision: 1,
  };
  const errors: string[] = [];
  await page.route("https://receipts-test.supabase.co/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (pathname.endsWith("/auth/v1/token")) {
      return json(route, {
        access_token: token,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: 4102444800,
        refresh_token: "receipt-test-refresh-token",
        user: qaOwner,
      });
    }
    if (pathname.endsWith("/auth/v1/user")) return json(route, qaOwner);
    if (pathname.endsWith("/auth/v1/logout")) return route.fulfill({ status: 204, body: "" });
    if (pathname.endsWith("/rest/v1/gym_users")) return json(route, []);
    if (pathname.endsWith("/rest/v1/rpc/get_current_gym_context")) return json(route, context);
    if (pathname.endsWith("/rest/v1/rpc/load_current_gym_workspace")) {
      hooks.onWorkspaceLoad?.(structuredClone(workspace.state));
      return json(route, { ...context, state: workspace.state, revision: workspace.revision });
    }
    if (pathname.endsWith("/rest/v1/rpc/save_current_gym_workspace")) {
      const args = route.request().postDataJSON() as { p_state?: typeof workspace.state };
      if (args.p_state) {
        workspace.state = args.p_state;
        hooks.onWorkspaceSave?.(structuredClone(args.p_state));
      }
      workspace.revision += 1;
      return json(route, { revision: workspace.revision });
    }
    if (pathname.endsWith("/rest/v1/rpc/record_audit_event")) {
      hooks.onAuditEvent?.(route.request().postDataJSON() as AuditEventRequest);
      return json(route, {});
    }
    if (pathname.endsWith("/rest/v1/rpc/platform_current_app_releases")) return json(route, []);
    errors.push(`${method} ${pathname}`);
    return json(route, { message: "Unhandled isolated payment receipt QA request" }, 404);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

test("recent sales link names to profiles while the eye keeps opening the invoice", async ({
  page,
}) => {
  const seededState: GymState = structuredClone(state);
  const soldProductId = "receipt-product-cm";
  const memberSaleId = "receipt-sale-member";
  const walkInSaleId = "receipt-sale-walkin";
  const now = Date.now();
  seededState.products.push({
    id: soldProductId,
    name: "CM",
    category: "Supplements",
    sku: "CM-QA",
    cost: 200,
    price: 500,
    stock: 4,
    lowStockAt: 1,
    createdAt: new Date(now - 86_400_000).toISOString(),
  });
  seededState.sales.push(
    {
      id: memberSaleId,
      invoiceNo: "INV-QA-SALE-001",
      productId: soldProductId,
      productName: "CM",
      qty: 1,
      unitPrice: 500,
      unitCost: 200,
      total: 500,
      paid: 500,
      buyer: member.name,
      memberId: member.id,
      date: new Date(now).toISOString(),
    },
    {
      id: walkInSaleId,
      invoiceNo: "INV-QA-SALE-002",
      productId: soldProductId,
      productName: "CM",
      qty: 1,
      unitPrice: 500,
      unitCost: 200,
      total: 500,
      paid: 500,
      buyer: "Walk-in customer",
      memberId: null,
      date: new Date(now - 60_000).toISOString(),
    },
  );

  const errors = await installMockBackend(page, {}, seededState);
  await signIn(page);
  await page.goto("/products");

  const memberSale = page.getByTestId(`recent-sale-${memberSaleId}`);
  await expect(memberSale).toBeVisible();
  await expect(memberSale).toContainText("Anita Receipt QA");

  // Incidental row clicks no longer open the old sale-details modal.
  await memberSale.getByText("INV-QA-SALE-001").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await memberSale.getByRole("button", { name: "View product details for CM" }).click();
  const productDialog = page.getByRole("dialog");
  await expect(productDialog.getByRole("heading", { name: "Product details" })).toBeVisible();
  await expect(productDialog).toContainText("Supplements");
  await productDialog.getByRole("button", { name: "Close" }).first().click();

  await memberSale
    .getByRole("button", { name: "Open member profile for Anita Receipt QA" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/members/${member.id}(?:\\?|$)`));
  await expect(page.getByRole("heading", { name: member.name })).toBeVisible();
  await expect(page.getByRole("link", { name: member.phone })).toHaveAttribute(
    "href",
    "tel:+9779800000003",
  );

  await page.goto("/products");
  const refreshedMemberSale = page.getByTestId(`recent-sale-${memberSaleId}`);
  await refreshedMemberSale.getByRole("button", { name: "View invoice" }).click();
  const invoiceDialog = page.getByRole("dialog");
  await expect(
    invoiceDialog.getByRole("heading", { name: "Sales Invoice INV-QA-SALE-001" }),
  ).toBeVisible();
  await invoiceDialog.getByRole("button", { name: "Close" }).first().click();

  const walkInSale = page.getByTestId(`recent-sale-${walkInSaleId}`);
  await expect(walkInSale).toContainText("Walk-in customer");
  await expect(walkInSale.getByRole("button", { name: /Open member profile/ })).toHaveCount(0);
  expect(errors, "recent sales profile links should not produce browser errors").toEqual([]);
});

test("payment history payer names open linked and uniquely matched member profiles", async ({
  page,
}) => {
  const seededState: GymState = structuredClone(state);
  const abcMember = { ...member, id: "receipt-member-abc", name: "ABC" };
  const duplicateMember = { ...member, id: "receipt-member-duplicate", name: member.name };
  seededState.members.push(abcMember, duplicateMember);
  seededState.payments.push(
    {
      id: "receipt-payment-legacy-abc",
      invoiceNo: "INV-QA-LEGACY-ABC",
      payerName: "ABC",
      kind: "other",
      amount: 75,
      method: "cash",
      date: new Date().toISOString(),
      note: "Legacy walk-in payment with a unique member name",
    },
    {
      id: "receipt-payment-ambiguous-name",
      invoiceNo: "INV-QA-AMBIGUOUS",
      payerName: member.name,
      kind: "other",
      amount: 50,
      method: "cash",
      date: new Date(Date.now() - 60_000).toISOString(),
      note: "Ambiguous legacy payer name",
    },
  );

  const errors = await installMockBackend(page, {}, seededState);
  await signIn(page);
  await page.goto("/payments?tab=collected");
  await expect(page.getByRole("heading", { name: "Payment Management" })).toBeVisible();

  const linkedPayment = page.getByRole("row").filter({ hasText: "INV-QA-001" });
  const payerLink = linkedPayment.getByRole("link", {
    name: "Open member profile for Anita Receipt QA",
  });
  await expect(payerLink).toHaveCSS("text-decoration-line", "none");
  await payerLink.click();
  await expect(page).toHaveURL(new RegExp(`/members/${member.id}(?:\\?|$)`));
  await expect(page.getByRole("heading", { name: member.name })).toBeVisible();

  await page.goto("/payments?tab=collected");
  const linkedPaymentAgain = page.getByRole("row").filter({ hasText: "INV-QA-001" });
  await linkedPaymentAgain.getByRole("button", { name: "Print invoice" }).click();
  const invoiceDialog = page.getByRole("dialog");
  await expect(
    invoiceDialog.getByRole("heading", {
      name: "Membership Payment Receipt INV-QA-001",
    }),
  ).toBeVisible();
  await invoiceDialog.getByRole("button", { name: "Close" }).first().click();

  const legacyPayment = page.getByRole("row").filter({ hasText: "INV-QA-LEGACY-ABC" });
  await legacyPayment.getByRole("link", { name: "Open member profile for ABC" }).click();
  await expect(page).toHaveURL(new RegExp(`/members/${abcMember.id}(?:\\?|$)`));
  await expect(page.getByRole("heading", { name: "ABC" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/payments?tab=collected");
  const ambiguousPayment = page.locator("article").filter({ hasText: "INV-QA-AMBIGUOUS" });
  await expect(ambiguousPayment).toBeVisible();
  await expect(ambiguousPayment.getByRole("link", { name: /Open member profile/ })).toHaveCount(0);
  const mobileLegacyPayment = page.locator("article").filter({ hasText: "INV-QA-LEGACY-ABC" });
  await mobileLegacyPayment.getByRole("link", { name: "Open member profile for ABC" }).click();
  await expect(page).toHaveURL(new RegExp(`/members/${abcMember.id}(?:\\?|$)`));
  await expect(page.getByRole("heading", { name: "ABC" })).toBeVisible();
  expect(errors, "payment history profile links should not produce browser errors").toEqual([]);
});

test("gym time zone setting updates payment timestamps across the workspace", async ({ page }) => {
  let savedSettings: GymState["settings"] | undefined;
  const errors = await installMockBackend(
    page,
    { onWorkspaceSave: (savedState) => (savedSettings = savedState.settings) },
    state,
  );
  await signIn(page);
  await page.goto("/settings");

  const timeZoneSelect = page.getByRole("combobox", { name: "Time zone" });
  await expect(timeZoneSelect).toContainText("Nepal — Kathmandu (NPT)");
  await timeZoneSelect.click();
  await page.getByRole("option", { name: "USA — Pacific (Los Angeles)" }).click();
  await expect.poll(() => savedSettings?.timeZone).toBe("America/Los_Angeles");

  await page.goto(`/members/${member.id}?tab=payments`);
  const receiptRow = page.getByRole("row").filter({ hasText: "INV-QA-001" });
  await expect(receiptRow).toContainText("3:00 am");
  expect(errors, "changing the workspace time zone should not produce browser errors").toEqual([]);
});

async function signIn(page: Page) {
  await page.addInitScript((email) => {
    window.localStorage.setItem(`ironvault.app-tour.v1.${email.toLowerCase()}`, "done");
  }, qaOwner.email);
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill(qaOwner.email);
  await page.getByRole("textbox", { name: "Password" }).fill("mock-only-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  if (await skipTour.isVisible().catch(() => false)) await skipTour.click();
}

async function capturePaidReceipt(page: Page, evidenceDir: string, label: string) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/members/${member.id}?tab=payments`);
  const receiptRow = page.getByRole("row").filter({ hasText: "INV-QA-001" });
  await expect(receiptRow).toContainText("₹250");
  const rowText = await receiptRow.innerText();
  const expectedPaymentTime = await page.evaluate(() =>
    new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Kathmandu",
    }).format(new Date("2026-10-14T10:00:00.000Z")),
  );
  await expect(receiptRow).toContainText(expectedPaymentTime);
  await receiptRow.getByRole("button", { name: "View invoice" }).click();
  const receiptDialog = page.getByRole("dialog");
  await expect(
    receiptDialog.getByRole("heading", {
      name: "Membership Payment Receipt INV-QA-001",
    }),
  ).toBeVisible();
  await expect(receiptDialog).toContainText("QA Three Month Plan — joining payment");
  await expect(receiptDialog).toContainText("Payment method: cash");
  await expect(receiptDialog).toContainText(expectedPaymentTime);
  await expect(receiptDialog.getByText("₹250", { exact: true })).toHaveCount(4);
  await expect(receiptDialog).not.toContainText("QA Annual Plan");
  await expect
    .poll(() => receiptDialog.evaluate((element) => getComputedStyle(element).opacity))
    .toBe("1");
  const invoiceText = await receiptDialog.innerText();
  await page.screenshot({
    path: path.join(evidenceDir, `paid-invoice-${label}.png`),
    animations: "disabled",
  });
  await receiptDialog.getByRole("button", { name: "Close" }).first().click();
  return { rowText, invoiceText };
}

test("membership payment invoices show only the payment on that receipt", async ({ page }) => {
  test.setTimeout(60_000);
  const errors = await installMockBackend(page);
  const evidenceDir = path.resolve(
    "qa/ironvault/payments",
    `round-1-payment-receipts-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  await mkdir(evidenceDir, { recursive: true });
  await signIn(page);

  const viewports = [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ];
  const layouts: Array<{ name: string; width: number; height: number; documentWidth: number }> = [];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`/members/${member.id}?tab=payments`);
    if (viewport.name === "mobile") {
      const firstReceipt = page.locator("article").filter({ hasText: "INV-QA-001" });
      const secondReceipt = page.locator("article").filter({ hasText: "INV-QA-002" });
      await expect(firstReceipt).toBeVisible();
      await expect(secondReceipt).toBeVisible();
      await expect(firstReceipt).toContainText("₹250");
      await expect(
        firstReceipt.getByRole("button", { name: "View invoice INV-QA-001" }),
      ).toBeVisible();
    } else {
      await expect(page.getByRole("row").filter({ hasText: "INV-QA-001" })).toBeVisible();
      await expect(page.getByRole("row").filter({ hasText: "INV-QA-002" })).toBeVisible();
    }
    await page.evaluate(() => document.fonts.ready);
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(documentWidth).toBeLessThanOrEqual(viewport.width + 1);
    layouts.push({ ...viewport, documentWidth });
    await page.screenshot({ path: path.join(evidenceDir, `member-payments-${viewport.name}.png`) });
    await page.screenshot({
      path: path.join(evidenceDir, `member-payments-${viewport.name}-full.png`),
      fullPage: true,
    });
    if (viewport.name === "mobile") {
      await page
        .locator("article")
        .filter({ hasText: "INV-QA-001" })
        .getByRole("button", { name: "View invoice INV-QA-001" })
        .click();
      const mobileMemberDialog = page.getByRole("dialog");
      await expect(
        mobileMemberDialog.getByRole("heading", {
          name: "Membership Payment Receipt INV-QA-001",
        }),
      ).toBeVisible();
      await expect(mobileMemberDialog.getByText("₹250", { exact: true })).toHaveCount(4);
      await expect
        .poll(() => mobileMemberDialog.evaluate((element) => getComputedStyle(element).opacity))
        .toBe("1");
      await page.screenshot({
        path: path.join(evidenceDir, "member-invoice-mobile.png"),
        animations: "disabled",
      });
      const mobileMemberPrintButton = mobileMemberDialog.getByRole("button", {
        name: "Print invoice",
      });
      await mobileMemberPrintButton.scrollIntoViewIfNeeded();
      await expect(mobileMemberPrintButton).toBeInViewport();
      await page.screenshot({
        path: path.join(evidenceDir, "member-invoice-mobile-actions.png"),
        animations: "disabled",
      });
      await mobileMemberDialog.getByRole("button", { name: "Close" }).first().click();
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/members/${member.id}?tab=payments`);
  await expect(page.getByRole("heading", { name: "Payment History" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "INV-QA-001" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(evidenceDir, "member-payments-desktop-fresh.png") });
  const memberPayment = page.getByRole("row").filter({ hasText: "INV-QA-001" });
  await memberPayment.getByRole("button", { name: "View invoice" }).click();
  let invoiceDialog = page.getByRole("dialog");
  await expect(
    invoiceDialog.getByRole("heading", { name: "Membership Payment Receipt INV-QA-001" }),
  ).toBeVisible();
  await expect(invoiceDialog.getByText("₹250", { exact: true })).toHaveCount(4);
  await expect(invoiceDialog).not.toContainText("₹600");
  await expect
    .poll(() => invoiceDialog.evaluate((element) => getComputedStyle(element).opacity))
    .toBe("1");
  await page.screenshot({
    path: path.join(evidenceDir, "member-invoice-INV-QA-001.png"),
    animations: "disabled",
  });
  await invoiceDialog.getByRole("button", { name: "Close" }).first().click();

  await page.goto("/payments?tab=collected");
  await expect(page.getByRole("heading", { name: "Payment Management" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "INV-QA-001" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(evidenceDir, "payments-desktop.png") });
  await page.screenshot({
    path: path.join(evidenceDir, "payments-desktop-full.png"),
    fullPage: true,
  });
  const collectedPayment = page.getByRole("row").filter({ hasText: "INV-QA-001" });
  await collectedPayment.getByRole("button", { name: "Print invoice" }).click();
  invoiceDialog = page.getByRole("dialog");
  await expect(
    invoiceDialog.getByRole("heading", { name: "Membership Payment Receipt INV-QA-001" }),
  ).toBeVisible();
  await expect(invoiceDialog.getByText("₹250", { exact: true })).toHaveCount(4);
  await expect(invoiceDialog).not.toContainText("₹600");
  await expect
    .poll(() => invoiceDialog.evaluate((element) => getComputedStyle(element).opacity))
    .toBe("1");
  await page.screenshot({
    path: path.join(evidenceDir, "payments-invoice-INV-QA-001.png"),
    animations: "disabled",
  });
  await invoiceDialog.getByRole("button", { name: "Close" }).first().click();

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/payments?tab=collected");
  await expect(page.getByRole("heading", { name: "Payment Management" })).toBeVisible();
  const tabletPaymentCard = page.locator("article").filter({ hasText: "INV-QA-001" });
  await expect(tabletPaymentCard).toBeVisible();
  await expect(tabletPaymentCard).toContainText("₹250");
  await expect(
    tabletPaymentCard.getByRole("button", { name: "Print invoice INV-QA-001" }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const paymentsTabletDocumentWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(paymentsTabletDocumentWidth).toBeLessThanOrEqual(769);
  await page.screenshot({ path: path.join(evidenceDir, "payments-tablet.png") });
  await page.screenshot({
    path: path.join(evidenceDir, "payments-tablet-full.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/payments?tab=collected");
  await expect(page.getByRole("heading", { name: "Payment Management" })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: "INV-QA-001" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const mobileWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(mobileWidth).toBeLessThanOrEqual(391);
  await page.screenshot({ path: path.join(evidenceDir, "payments-mobile.png") });
  await page.screenshot({
    path: path.join(evidenceDir, "payments-mobile-full.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Print invoice INV-QA-001" }).click();
  invoiceDialog = page.getByRole("dialog");
  await expect(
    invoiceDialog.getByRole("heading", { name: "Membership Payment Receipt INV-QA-001" }),
  ).toBeVisible();
  await expect(invoiceDialog.getByText("₹250", { exact: true })).toHaveCount(4);
  await expect(invoiceDialog).not.toContainText("₹600");
  await expect
    .poll(() => invoiceDialog.evaluate((element) => getComputedStyle(element).opacity))
    .toBe("1");
  await page.screenshot({
    path: path.join(evidenceDir, "payments-mobile-invoice.png"),
    animations: "disabled",
  });
  const printButton = invoiceDialog.getByRole("button", { name: "Print invoice" });
  await printButton.scrollIntoViewIfNeeded();
  await expect(printButton).toBeInViewport();
  await page.screenshot({
    path: path.join(evidenceDir, "payments-mobile-invoice-actions.png"),
    animations: "disabled",
  });
  await invoiceDialog.getByRole("button", { name: "Close" }).first().click();

  expect(
    errors,
    "receipt routes should not produce page, console, or unhandled API errors",
  ).toEqual([]);
  await writeFile(
    path.join(evidenceDir, "metadata.json"),
    JSON.stringify(
      {
        route: ["/members/$memberId?tab=payments", "/payments?tab=collected"],
        capturedAt: new Date().toISOString(),
        environment: "local app with fully intercepted synthetic Supabase workspace",
        test: "A transaction-specific membership receipt shows the amount paid on that invoice, not the sum of all payments for the term.",
        syntheticPayments: [250, 350],
        expectedFirstReceiptAmount: 250,
        viewportLayouts: layouts,
        paymentsTabletDocumentWidth,
        mobilePaymentsDocumentWidth: mobileWidth,
        consoleAndRequestErrors: errors,
        productionDataTouched: false,
      },
      null,
      2,
    ),
  );
});

test("membership history itemizes discounts and joining fees across responsive sizes", async ({
  page,
}) => {
  const errors = await installMockBackend(page);
  const evidenceDir = path.resolve(
    "qa/ironvault/memberships",
    `round-3-membership-price-breakdown-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  await mkdir(evidenceDir, { recursive: true });
  await signIn(page);

  const viewports = [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ];
  const layouts: Array<{ name: string; width: number; height: number; documentWidth: number }> = [];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`/members/${member.id}?tab=history`);
    await expect(page.getByRole("heading", { name: "Membership History" })).toBeVisible();
    await expect(page.getByText("QA Three Month Plan", { exact: true }).first()).toBeVisible();
    const paidTerm = page.locator("article").filter({ hasText: "QA Three Month Plan" });
    await expect(paidTerm.getByText("Due ₹300", { exact: true })).toBeVisible();
    const breakdown = paidTerm.locator("dl");
    await expect(breakdown.locator("dt")).toHaveText([
      "Base plan price",
      "Discount",
      "Joining fee",
      "Total payable",
      "Paid",
    ]);
    await expect(breakdown.locator("dd")).toHaveText(["₹1,000", "−₹200", "₹100", "₹900", "₹600"]);
    await page.evaluate(() => document.fonts.ready);
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(documentWidth).toBeLessThanOrEqual(viewport.width + 1);
    layouts.push({ ...viewport, documentWidth });
    await page.screenshot({
      path: path.join(evidenceDir, `membership-history-${viewport.name}.png`),
    });
    await page.screenshot({
      path: path.join(evidenceDir, `membership-history-${viewport.name}-full.png`),
      fullPage: true,
    });
  }

  expect(errors, "membership history baseline should not produce browser errors").toEqual([]);
  await writeFile(
    path.join(evidenceDir, "metadata.json"),
    JSON.stringify(
      {
        route: `/members/${member.id}?tab=history`,
        capturedAt: new Date().toISOString(),
        environment: "local app with fully intercepted synthetic Supabase workspace",
        test: "Membership history displays a reconciled plan price, discount, joining fee, total payable, paid amount, and due across desktop, tablet, and mobile.",
        syntheticPayments: [250, 350],
        syntheticPricing: {
          basePlanPrice: 1000,
          discount: 200,
          joiningFee: 100,
          totalPayable: 900,
          paid: 600,
          balance: 300,
        },
        viewportLayouts: layouts,
        consoleAndRequestErrors: errors,
        productionDataTouched: false,
      },
      null,
      2,
    ),
  );
});

test("invoice deletion confirms, persists in Trash, and restores without reversing payment", async ({
  page,
}) => {
  const saved: GymState[] = [];
  const errors = await installMockBackend(page, { onWorkspaceSave: (value) => saved.push(value) });
  await signIn(page);
  await page.goto(`/members/${member.id}?tab=payments`);
  const row = page.getByRole("row").filter({ hasText: "INV-QA-001" });
  await row.getByRole("button", { name: "Delete invoice INV-QA-001", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("does not reverse or refund the payment");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Delete invoice INV-QA-001", exact: true }).click();
  await dialog.getByRole("button", { name: "Move invoice to Trash", exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect
    .poll(() =>
      Boolean(
        saved.at(-1)?.payments.find((payment) => payment.invoiceNo === "INV-QA-001")
          ?.invoiceDeletedAt,
      ),
    )
    .toBe(true);
  expect(
    saved.at(-1)?.payments.map(({ invoiceDeletedAt, invoiceDeletedBy, ...payment }) => payment),
  ).toEqual(state.payments);
  await page.reload();
  await expect(row).toHaveCount(0);
  await page.goto("/payments");
  await expect(row).toHaveCount(0);
  await page.goto(`/members/${member.id}?tab=history`);
  await expect(
    page
      .locator("article")
      .filter({ hasText: "QA Three Month Plan" })
      .getByText("Due ₹300", { exact: true }),
  ).toBeVisible();
  await page.goto("/trash");
  const receipt = page.locator("article").filter({ hasText: "INV-QA-001" });
  await expect(receipt).toContainText("Payment retained in financial totals");
  await receipt.getByRole("button", { name: "Restore invoice" }).click();
  await expect
    .poll(
      () =>
        saved.at(-1)?.payments.find((payment) => payment.invoiceNo === "INV-QA-001")
          ?.invoiceDeletedAt,
    )
    .toBeNull();
  await page.goto(`/members/${member.id}?tab=payments`);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "View invoice", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Membership Payment Receipt");
  expect(errors).toEqual([]);
});

test("paid membership terms confirm deletion, persist in Trash, and restore with receipts intact", async ({
  page,
}) => {
  const saved: GymState[] = [];
  const errors = await installMockBackend(page, { onWorkspaceSave: (value) => saved.push(value) });
  await signIn(page);
  await page.goto(`/members/${member.id}?tab=history`);
  const card = page.locator("article").filter({ hasText: "QA Three Month Plan" });
  await card.getByRole("button", { name: "Delete term" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Existing payments and invoices are preserved");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Delete term" }).click();
  await dialog.getByLabel("Reason").fill("Duplicate membership entered by mistake");
  await dialog.getByRole("button", { name: "Delete term" }).click();
  await expect(card).toHaveCount(0);
  await expect
    .poll(() =>
      Boolean(saved.at(-1)?.memberships.find((item) => item.id === membership.id)?.deletedAt),
    )
    .toBe(true);
  expect(saved.at(-1)?.payments).toEqual(state.payments);
  await page.goto(`/members/${member.id}?tab=payments`);
  await expect(page.getByRole("row").filter({ hasText: "INV-QA-001" })).toContainText(
    "Membership in Trash · payment retained",
  );
  await page
    .getByRole("row")
    .filter({ hasText: "INV-QA-001" })
    .getByRole("button", { name: "View invoice" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Membership Payment Receipt");
  await page.keyboard.press("Escape");
  await page.goto("/payments");
  await expect(page.getByRole("row").filter({ hasText: "INV-QA-001" })).toContainText(
    "Membership in Trash · payment retained",
  );
  await page.goto(`/members/${member.id}?tab=history`);
  await page.reload();
  await expect(card).toHaveCount(0);
  await page.goto("/trash");
  const trashed = page.locator("article").filter({ hasText: "QA Three Month Plan" });
  await expect(trashed).toContainText("Duplicate membership entered by mistake");
  await trashed.getByRole("button", { name: "Restore term" }).click();
  await expect(trashed).toHaveCount(0);
  await expect
    .poll(() => saved.at(-1)?.memberships.find((item) => item.id === membership.id)?.deletedAt)
    .toBeNull();
  await page.goto(`/members/${member.id}?tab=history`);
  await expect(card).toBeVisible();
  await expect(card.getByText("Due ₹300", { exact: true })).toBeVisible();
  expect(saved.at(-1)?.payments).toEqual(state.payments);
  await page.goto(`/members/${member.id}?tab=payments`);
  await expect(page.getByText("Membership in Trash · payment retained")).toHaveCount(0);
  await page.goto(`/members/${member.id}?tab=history`);
  await page.reload();
  await expect(card).toBeVisible();
  expect(errors).toEqual([]);
});

test("correct or remove unpaid membership terms while protecting paid receipts", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const savedWorkspaces: (typeof state)[] = [];
  const loadedWorkspaces: (typeof state)[] = [];
  const auditEvents: AuditEventRequest[] = [];
  const errors = await installMockBackend(page, {
    onWorkspaceLoad: (loadedState) => loadedWorkspaces.push(loadedState),
    onWorkspaceSave: (savedState) => savedWorkspaces.push(savedState),
    onAuditEvent: (event) => auditEvents.push(event),
  });
  const evidenceDir = path.resolve(
    "qa/ironvault/memberships",
    `round-2-membership-history-correction-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  await mkdir(evidenceDir, { recursive: true });
  await signIn(page);
  const receiptBeforeCorrection = await capturePaidReceipt(page, evidenceDir, "before-correction");
  const paidPaymentBaseline = structuredClone(
    state.payments.filter((payment) => payment.membershipId === membership.id),
  );

  const viewports = [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ];
  const layouts: Array<{ name: string; width: number; height: number; documentWidth: number }> = [];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`/members/${member.id}?tab=history`);
    const paidCard = page.locator("article").filter({ hasText: "QA Three Month Plan" });
    const unpaidCard = page.locator("article").filter({ hasText: "QA Monthly Plan" });
    await expect(paidCard).toContainText("This term has payment history");
    await expect(paidCard.getByRole("button", { name: "Correct term" })).toHaveCount(0);
    await expect(paidCard.getByRole("button", { name: "Delete term" })).toBeEnabled();
    await expect(unpaidCard.getByRole("button", { name: "Correct term" })).toBeVisible();
    await expect(unpaidCard.getByRole("button", { name: "Delete term" })).toBeEnabled();
    await page.evaluate(() => document.fonts.ready);
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(documentWidth).toBeLessThanOrEqual(viewport.width + 1);
    layouts.push({ ...viewport, documentWidth });
    await page.screenshot({
      path: path.join(evidenceDir, `membership-history-${viewport.name}.png`),
    });
    await page.screenshot({
      path: path.join(evidenceDir, `membership-history-${viewport.name}-full.png`),
      fullPage: true,
    });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/members/${member.id}?tab=history`);
  const unpaidCard = page.locator("article").filter({ hasText: "QA Monthly Plan" });
  await unpaidCard.getByRole("button", { name: "Correct term" }).click();
  const correctionDialog = page.getByRole("dialog");
  await expect(
    correctionDialog.getByRole("heading", { name: "Correct unpaid membership" }),
  ).toBeVisible();
  await correctionDialog.getByRole("combobox", { name: "Membership plan" }).click();
  await page.getByRole("option", { name: /QA Annual Plan/ }).click();
  await expect(correctionDialog).toContainText("Corrected plan price");
  await expect(correctionDialog).toContainText("₹1,200");
  await correctionDialog
    .getByLabel("Reason for correction")
    .fill("Member was assigned the wrong plan");
  await page.screenshot({
    path: path.join(evidenceDir, "membership-correction-dialog-desktop.png"),
    animations: "disabled",
  });
  const correctionDialogLayouts: Array<{
    name: string;
    width: number;
    height: number;
    documentWidth: number;
    dialogWidth: number;
    dialogScrollHeight: number;
    dialogClientHeight: number;
    saveActionReachable: boolean;
  }> = [
    {
      name: "desktop",
      width: 1440,
      height: 1000,
      documentWidth: await page.evaluate(() => document.documentElement.scrollWidth),
      dialogWidth: await correctionDialog.evaluate(
        (element) => element.getBoundingClientRect().width,
      ),
      dialogScrollHeight: await correctionDialog.evaluate((element) => element.scrollHeight),
      dialogClientHeight: await correctionDialog.evaluate((element) => element.clientHeight),
      saveActionReachable: true,
    },
  ];
  for (const viewport of viewports.filter((item) => item.name !== "desktop")) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(correctionDialog).toBeVisible();
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const overflowingElements = await page.evaluate(() =>
      Array.from(document.querySelectorAll("body *"))
        .map((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            className: typeof element.className === "string" ? element.className : "",
            left: Math.round(bounds.left),
            right: Math.round(bounds.right),
            width: Math.round(bounds.width),
          };
        })
        .filter((element) => element.right > window.innerWidth + 1)
        .sort((left, right) => right.right - left.right)
        .slice(0, 8),
    );
    const dialogWidth = await correctionDialog.evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    expect(
      documentWidth,
      `Horizontal overflow at ${viewport.width}px: ${JSON.stringify(overflowingElements)}`,
    ).toBeLessThanOrEqual(viewport.width + 1);
    expect(dialogWidth).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({
      path: path.join(evidenceDir, `membership-correction-dialog-${viewport.name}.png`),
      animations: "disabled",
    });

    const reasonField = correctionDialog.getByLabel("Reason for correction");
    await reasonField.scrollIntoViewIfNeeded();
    await expect(reasonField).toBeInViewport();
    const saveButton = correctionDialog.getByRole("button", { name: "Save correction" });
    await saveButton.scrollIntoViewIfNeeded();
    await expect(saveButton).toBeInViewport();
    await page.screenshot({
      path: path.join(evidenceDir, `membership-correction-dialog-${viewport.name}-footer.png`),
      animations: "disabled",
    });
    correctionDialogLayouts.push({
      ...viewport,
      documentWidth,
      dialogWidth,
      dialogScrollHeight: await correctionDialog.evaluate((element) => element.scrollHeight),
      dialogClientHeight: await correctionDialog.evaluate((element) => element.clientHeight),
      saveActionReachable: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await correctionDialog.getByRole("button", { name: "Save correction" }).click();
  await expect(
    page.getByText("Membership term corrected; its history was recorded."),
  ).toBeVisible();
  // Verify the correction reaches the persistence boundary, not just the
  // optimistic in-memory UI state. Sync status is intentionally not exposed
  // as a permanent button when the workspace is already synchronized.
  const correctedCard = page.locator("article").filter({ hasText: "QA Annual Plan" });
  await expect(correctedCard).toContainText("Due ₹1,200");
  await expect(correctedCard).toContainText("01 Jan 26 → 01 Jan 27");

  await expect
    .poll(() =>
      savedWorkspaces
        .at(-1)
        ?.memberships.some(
          (item) => item.id === unpaidMembership.id && item.planId === "receipt-plan-annual",
        ),
    )
    .toBe(true);
  const correctedPersistedState = savedWorkspaces.at(-1);
  const correctedPersistedTerm = correctedPersistedState?.memberships.find(
    (item) => item.id === unpaidMembership.id,
  );
  const correctedTermIdPreserved = correctedPersistedTerm?.id === unpaidMembership.id;
  const expectedStartDate = new Date(`${unpaidMembership.startDate}T00:00:00`).toISOString();
  const expectedEndDate = new Date("2027-01-01T00:00:00").toISOString();
  expect(correctedTermIdPreserved).toBe(true);
  expect(correctedPersistedTerm).toMatchObject({
    memberId: member.id,
    planId: "receipt-plan-annual",
    startDate: expectedStartDate,
    endDate: expectedEndDate,
    price: 1200,
    discount: 0,
    joiningFee: 0,
  });
  expect(
    correctedPersistedState?.payments.filter((payment) => payment.membershipId === membership.id),
  ).toEqual(paidPaymentBaseline);
  await expect
    .poll(() => auditEvents.some((event) => event.p_action === "membership_corrected"))
    .toBe(true);
  expect(auditEvents.find((event) => event.p_action === "membership_corrected")).toMatchObject({
    p_entity_type: "membership",
    p_entity_id: unpaidMembership.id,
    p_metadata: { reason: "Member was assigned the wrong plan" },
  });

  await page.reload();
  await expect(page.locator("article").filter({ hasText: "QA Annual Plan" })).toBeVisible();
  await expect
    .poll(
      () =>
        loadedWorkspaces.at(-1)?.memberships.find((item) => item.id === unpaidMembership.id)
          ?.planId,
    )
    .toBe("receipt-plan-annual");
  const reloadedCorrectedTermId = loadedWorkspaces
    .at(-1)
    ?.memberships.find((item) => item.planId === "receipt-plan-annual")?.id;
  expect(reloadedCorrectedTermId).toBe(unpaidMembership.id);
  const receiptAfterCorrection = await capturePaidReceipt(page, evidenceDir, "after-correction");
  expect(receiptAfterCorrection.rowText).toBe(receiptBeforeCorrection.rowText);
  expect(receiptAfterCorrection.invoiceText).toBe(receiptBeforeCorrection.invoiceText);
  await expect(page.getByRole("row").filter({ hasText: "INV-QA-002" })).toContainText("₹350");

  await page.goto(`/members/${member.id}?tab=history`);
  const correctedTermCard = page.locator("article").filter({ hasText: "QA Annual Plan" });
  const removalDialogLayouts: Array<{
    name: string;
    width: number;
    height: number;
    dialogWidth: number;
    dialogHeight: number;
    reasonReachable: boolean;
    cancelReachable: boolean;
    removeReachable: boolean;
    canceledWithoutChanges: boolean;
  }> = [];
  for (const viewport of viewports.filter((item) => item.name !== "desktop")) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await correctedTermCard.getByRole("button", { name: "Delete term" }).click();
    const cancelDialog = page.getByRole("dialog");
    await expect(
      cancelDialog.getByRole("heading", { name: "Delete membership term?" }),
    ).toBeVisible();
    const dialogWidth = await cancelDialog.evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    const dialogHeight = await cancelDialog.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    expect(dialogWidth).toBeLessThanOrEqual(viewport.width);
    expect(dialogHeight).toBeLessThanOrEqual(viewport.height);
    const reasonInput = cancelDialog.getByLabel("Reason");
    await reasonInput.scrollIntoViewIfNeeded();
    await expect(reasonInput).toBeInViewport();
    await reasonInput.fill("Duplicate term created by mistake");
    const cancelButton = cancelDialog.getByRole("button", { name: "Cancel" });
    const removeButton = cancelDialog.getByRole("button", { name: "Delete term" });
    await cancelButton.scrollIntoViewIfNeeded();
    await removeButton.scrollIntoViewIfNeeded();
    await expect(cancelButton).toBeInViewport();
    await expect(removeButton).toBeInViewport();
    await page.screenshot({
      path: path.join(evidenceDir, `membership-removal-dialog-${viewport.name}.png`),
      animations: "disabled",
    });
    const saveCountBeforeCancel = savedWorkspaces.length;
    const voidAuditCountBeforeCancel = auditEvents.filter(
      (event) => event.p_action === "membership_voided",
    ).length;
    await cancelButton.click();
    await expect(cancelDialog).toHaveCount(0);
    await expect(correctedTermCard).toBeVisible();
    const canceledWithoutChanges =
      savedWorkspaces.length === saveCountBeforeCancel &&
      auditEvents.filter((event) => event.p_action === "membership_voided").length ===
        voidAuditCountBeforeCancel;
    expect(canceledWithoutChanges).toBe(true);
    removalDialogLayouts.push({
      name: viewport.name,
      width: viewport.width,
      height: viewport.height,
      dialogWidth,
      dialogHeight,
      reasonReachable: true,
      cancelReachable: true,
      removeReachable: true,
      canceledWithoutChanges,
    });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await correctedTermCard.getByRole("button", { name: "Delete term" }).click();
  const voidDialog = page.getByRole("dialog");
  await expect(voidDialog.getByRole("heading", { name: "Delete membership term?" })).toBeVisible();
  await voidDialog.getByLabel("Reason").fill("Duplicate term created by mistake");
  await voidDialog.getByRole("button", { name: "Delete term" }).click();
  await expect(
    page.getByText("Membership term moved to Trash. You can restore it there."),
  ).toBeVisible();
  await expect(page.locator("article").filter({ hasText: "QA Annual Plan" })).toHaveCount(0);

  await expect
    .poll(() =>
      savedWorkspaces
        .at(-1)
        ?.memberships.some((item) => item.id === unpaidMembership.id && !item.deletedAt),
    )
    .toBe(false);
  const removedPersistedState = savedWorkspaces.at(-1);
  const removedTermHadNoPayments =
    !removedPersistedState?.memberships.some(
      (item) => item.id === unpaidMembership.id && !item.deletedAt,
    ) &&
    !removedPersistedState?.payments.some(
      (payment) => payment.membershipId === unpaidMembership.id,
    );
  expect(removedTermHadNoPayments).toBe(true);
  expect(
    removedPersistedState?.payments.filter((payment) => payment.membershipId === membership.id),
  ).toEqual(paidPaymentBaseline);
  await expect
    .poll(() => auditEvents.some((event) => event.p_action === "membership_voided"))
    .toBe(true);
  expect(auditEvents.find((event) => event.p_action === "membership_voided")).toMatchObject({
    p_entity_type: "membership",
    p_entity_id: unpaidMembership.id,
    p_metadata: { reason: "Duplicate term created by mistake" },
  });

  await page.reload();
  await expect(page.locator("article").filter({ hasText: "QA Annual Plan" })).toHaveCount(0);
  await expect
    .poll(() =>
      loadedWorkspaces
        .at(-1)
        ?.memberships.some((item) => item.id === unpaidMembership.id && !item.deletedAt),
    )
    .toBe(false);

  const receiptAfterRemoval = await capturePaidReceipt(page, evidenceDir, "after-removal");
  expect(receiptAfterRemoval.rowText).toBe(receiptBeforeCorrection.rowText);
  expect(receiptAfterRemoval.invoiceText).toBe(receiptBeforeCorrection.invoiceText);
  await expect(page.getByRole("row").filter({ hasText: "INV-QA-002" })).toContainText("₹350");
  await page.evaluate(() => document.fonts.ready);
  expect(errors, "membership correction routes should not produce browser errors").toEqual([]);
  await writeFile(
    path.join(evidenceDir, "metadata.json"),
    JSON.stringify(
      {
        route: `/members/${member.id}?tab=history`,
        capturedAt: new Date().toISOString(),
        environment: "local app with fully intercepted synthetic Supabase workspace",
        test: "Only zero-payment membership terms can be corrected or removed. Linked payment rows, invoice IDs, amounts, and original receipt descriptions remain unchanged.",
        syntheticPayments: [250, 350],
        viewportLayouts: layouts,
        correctionDialogLayouts,
        removalDialogLayouts,
        correctedTermIdPreserved,
        reloadedCorrectedTermId,
        removedTermHadNoPayments,
        paidReceiptExactlyUnchangedAfterCorrectionAndRemoval:
          receiptAfterCorrection.invoiceText === receiptBeforeCorrection.invoiceText &&
          receiptAfterRemoval.invoiceText === receiptBeforeCorrection.invoiceText,
        paidPaymentRowsExactlyUnchangedAfterCorrectionAndRemoval:
          JSON.stringify(
            removedPersistedState?.payments.filter(
              (payment) => payment.membershipId === membership.id,
            ),
          ) === JSON.stringify(paidPaymentBaseline),
        correctionAuditRecorded: auditEvents.some(
          (event) =>
            event.p_action === "membership_corrected" &&
            event.p_entity_id === unpaidMembership.id &&
            event.p_metadata.reason === "Member was assigned the wrong plan",
        ),
        removalAuditRecorded: auditEvents.some(
          (event) =>
            event.p_action === "membership_voided" &&
            event.p_entity_id === unpaidMembership.id &&
            event.p_metadata.reason === "Duplicate term created by mistake",
        ),
        productionDataTouched: false,
        consoleAndRequestErrors: errors,
      },
      null,
      2,
    ),
  );
});
