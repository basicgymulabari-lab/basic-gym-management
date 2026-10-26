import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const qaOwner = {
  id: "e5000000-0000-0000-0000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "reports-owner@example.invalid",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { full_name: "Reports QA", gym_name: "IRONVAULT QA" },
  factors: [],
  identities: [],
  created_at: "2026-01-01T00:00:00.000Z",
};

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const testToken = () =>
  `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    sub: qaOwner.id,
    aud: "authenticated",
    role: "authenticated",
    email: qaOwner.email,
    exp: 4102444800,
    iat: 1791763200,
    aal: "aal1",
    app_metadata: qaOwner.app_metadata,
    user_metadata: qaOwner.user_metadata,
  })}.reports-test-signature`;

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function localDateInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function daysAgoDate(days: number, referenceDate = new Date()) {
  const date = new Date(referenceDate);
  date.setDate(date.getDate() - days);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
}

function testWorkspace(referenceDate = new Date()) {
  const today = localDateInput(referenceDate);
  const end = new Date(referenceDate);
  end.setDate(end.getDate() + 180);
  return {
    version: 1,
    auth: { email: "", passwordHash: "" },
    staff: {},
    settings: {
      gymName: "IRONVAULT QA",
      tagline: "Strength Club",
      address: "",
      phone: "",
      email: qaOwner.email,
      currency: "₹",
      invoicePrefix: "INV",
      lowStockAlerts: true,
      expiryReminderDays: 7,
      adminName: "Reports QA",
      calendarSystem: "gregorian",
      phoneCountry: "nepal",
    },
    members: [
      {
        id: "reports-member-1",
        type: "member",
        name: "Anita Reports QA",
        email: "anita@example.invalid",
        phone: "+977 9800000003",
        gender: "female",
        dob: "1990-01-01",
        address: "",
        photo: null,
        joinDate: `${today}T00:00:00`,
        emergencyContact: "",
        notes: [],
        measurements: [],
        shift: "morning",
        deletedAt: null,
      },
    ],
    plans: [
      {
        id: "reports-plan-1",
        name: "QA Monthly Plan",
        price: 5000,
        joiningFee: 0,
        durationDays: 180,
        description: "Synthetic report fixture",
        active: true,
      },
    ],
    memberships: [
      {
        id: "reports-membership-1",
        memberId: "reports-member-1",
        planId: "reports-plan-1",
        startDate: today,
        endDate: localDateInput(end),
        price: 5000,
        discount: 0,
        joiningFee: 0,
        frozen: false,
        frozenAt: null,
        createdAt: `${today}T00:00:00`,
      },
    ],
    payments: [
      {
        id: "reports-payment-1",
        invoiceNo: "INV-QA-001",
        memberId: "reports-member-1",
        membershipId: "reports-membership-1",
        kind: "membership",
        amount: 1250,
        method: "cash",
        date: `${today}T12:00:00`,
        note: "Synthetic report fixture",
      },
      {
        id: "reports-payment-balance",
        invoiceNo: "INV-QA-002",
        memberId: "reports-member-1",
        membershipId: "reports-membership-1",
        kind: "membership",
        purpose: "membership_balance",
        amount: 300,
        method: "upi",
        date: `${today}T13:15:00`,
        note: "Custom note for the collected balance",
      },
      {
        id: "reports-payment-product",
        invoiceNo: "INV-QA-003",
        memberId: "reports-member-1",
        saleId: "reports-sale-1",
        kind: "product",
        amount: 700,
        method: "cash",
        date: `${today}T14:30:00`,
        note: "Whey Protein partial payment",
      },
      {
        id: "reports-payment-weekly-balance",
        invoiceNo: "INV-QA-004",
        memberId: "reports-member-1",
        membershipId: "reports-membership-1",
        kind: "membership",
        purpose: "membership_balance",
        amount: 400,
        method: "cash",
        date: daysAgoDate(2, referenceDate),
        note: "Weekly balance payment",
      },
      {
        id: "reports-payment-monthly-balance",
        invoiceNo: "INV-QA-005",
        memberId: "reports-member-1",
        membershipId: "reports-membership-1",
        kind: "membership",
        purpose: "membership_balance",
        amount: 450,
        method: "cash",
        date: daysAgoDate(10, referenceDate),
        note: "Monthly balance payment",
      },
      {
        id: "reports-payment-yearly-balance",
        invoiceNo: "INV-QA-006",
        memberId: "reports-member-1",
        membershipId: "reports-membership-1",
        kind: "membership",
        purpose: "membership_balance",
        amount: 600,
        method: "cash",
        date: daysAgoDate(40, referenceDate),
        note: "Yearly balance payment",
      },
    ],
    attendance: [],
    products: [
      {
        id: "reports-product-1",
        name: "Whey Protein",
        category: "Supplements",
        sku: "QA-WHEY",
        cost: 200,
        price: 400,
        stock: 8,
        lowStockAt: 2,
        createdAt: `${today}T00:00:00`,
      },
    ],
    sales: [
      {
        id: "reports-sale-1",
        invoiceNo: "INV-QA-003",
        productId: "reports-product-1",
        productName: "Whey Protein",
        qty: 2,
        unitPrice: 400,
        unitCost: 200,
        total: 800,
        paid: 700,
        buyer: "Anita Reports QA",
        memberId: "reports-member-1",
        date: `${today}T14:30:00`,
      },
    ],
    activities: [],
    expenses: [],
    inquiries: [],
    readNotifications: [],
    invoiceSeq: 1,
  };
}

function qaMember(id: string, name: string) {
  return {
    id,
    type: "member" as const,
    name,
    email: `${id}@example.invalid`,
    phone: "+977 9800000004",
    gender: "other" as const,
    dob: "1990-01-01",
    address: "",
    photo: null,
    joinDate: `${localDateInput(new Date())}T00:00:00`,
    emergencyContact: "",
    notes: [],
    measurements: [],
    shift: "morning" as const,
    deletedAt: null,
  };
}

const gymContext = {
  gym_id: "e6000000-0000-0000-0000-000000000001",
  role: "owner",
  permissions: {},
  display_name: "Reports QA",
  email: qaOwner.email,
  enabled: true,
  gym_name: "IRONVAULT QA",
  account_status: "active",
  subscription_status: "active",
  subscription_source: "manual",
  subscription_current_period_end: "2099-01-01T00:00:00.000Z",
  subscription_expired: false,
};

async function installMockBackend(page: Page, referenceDate = new Date()) {
  const data = { state: testWorkspace(referenceDate), revision: 1 };
  const errors: string[] = [];
  await page.route("https://reports-test.supabase.co/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (pathname.endsWith("/auth/v1/token")) {
      return json(route, {
        access_token: testToken(),
        token_type: "bearer",
        expires_in: 3600,
        expires_at: 4102444800,
        refresh_token: "reports-test-refresh-token",
        user: qaOwner,
      });
    }
    if (pathname.endsWith("/auth/v1/user")) return json(route, qaOwner);
    if (pathname.endsWith("/auth/v1/logout")) return route.fulfill({ status: 204, body: "" });
    if (pathname.endsWith("/rest/v1/gym_users")) return json(route, []);
    if (pathname.endsWith("/functions/v1/staff-receptionist"))
      return json(route, { account: null });
    if (pathname.endsWith("/rest/v1/rpc/get_current_gym_context")) return json(route, gymContext);
    if (pathname.endsWith("/rest/v1/rpc/load_current_gym_workspace")) {
      return json(route, { ...gymContext, state: data.state, revision: data.revision });
    }
    if (pathname.endsWith("/rest/v1/rpc/save_current_gym_workspace")) {
      const args = route.request().postDataJSON() as { p_state: typeof data.state };
      data.state = args.p_state;
      data.revision += 1;
      return json(route, { revision: data.revision });
    }
    if (pathname.endsWith("/rest/v1/rpc/record_audit_event")) return json(route, {});
    if (pathname.endsWith("/rest/v1/rpc/platform_current_app_releases")) return json(route, []);
    errors.push(`${method} ${pathname}`);
    return json(route, { message: "Unhandled isolated reports QA request" }, 404);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return { data, errors };
}

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

test("reports period selectors, custom range, print, CSV, and responsive states", async ({
  page,
}) => {
  const referenceDate = new Date("2026-10-21T12:00:00+05:30");
  await page.clock.setFixedTime(referenceDate);
  const { errors } = await installMockBackend(page, referenceDate);
  const evidenceRound = `round-4-functional-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const evidenceDir = path.resolve("qa/ironvault/reports", evidenceRound);
  await mkdir(evidenceDir, { recursive: true });
  await signIn(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Reports & Analytics" })).toBeVisible();
  const topProducts = page.getByRole("list", {
    name: "Top selling products ranked by sales revenue",
  });
  await expect(topProducts).toBeVisible();
  await expect(topProducts.getByRole("listitem")).toHaveCount(1);
  const firstTopProduct = topProducts.getByRole("listitem").first();
  await expect(firstTopProduct).toContainText("Whey Protein");
  await expect(firstTopProduct).toContainText("2 units sold");
  await expect(firstTopProduct).toContainText("₹800");
  await page.screenshot({ path: path.join(evidenceDir, "desktop-initial-viewport.png") });
  await page.screenshot({
    path: path.join(evidenceDir, "desktop-initial-full.png"),
    fullPage: true,
  });

  const rangeCases = [
    ["daily", "Today's Revenue", 2250, 300, [false, false, false]],
    ["weekly", "Weekly Revenue", 2650, 700, [true, false, false]],
    ["monthly", "Monthly Revenue", 3100, 1150, [true, true, false]],
    ["yearly", "Yearly Revenue", 3700, 1750, [true, true, true]],
  ] as const;
  for (const [range, label, revenue, balanceTotal, includedBalancePayments] of rangeCases) {
    await page.getByRole("button", { name: range, exact: true }).click();
    await expect(page.getByRole("img", { name: `Revenue chart for ${range}` })).toBeVisible();
    await expect(page.getByText(`Revenue — ${range}`, { exact: true })).toBeVisible();
    const revenueCard = page.getByRole("link", { name: /collection details/i });
    await expect(revenueCard).toContainText(label);
    await expect(revenueCard).toContainText(`₹${revenue.toLocaleString("en-IN")}`);
    const collectionTitle =
      range === "daily"
        ? "Today's collection details"
        : `${range[0]!.toUpperCase()}${range.slice(1)} collection details`;
    const details = page
      .locator("section.surface-panel")
      .filter({ has: page.getByRole("heading", { name: collectionTitle }) });
    await expect(details).toBeVisible();
    await expect(details).toContainText("Membership received");
    await expect(details).toContainText("Product payments");
    await expect(details).toContainText("₹700");
    await expect(details).toContainText(`1 · ₹${balanceTotal.toLocaleString("en-IN")}`);
    await expect(details).toContainText("Whey Protein");
    await expect(details).toContainText("Anita Reports QA");
    await expect(details).toContainText("Custom note for the collected balance");
    await expect(details).toContainText("2 units");
    for (const [note, included] of [
      ["Weekly balance payment", includedBalancePayments[0]],
      ["Monthly balance payment", includedBalancePayments[1]],
      ["Yearly balance payment", includedBalancePayments[2]],
    ] as const) {
      if (included) await expect(details).toContainText(note);
      else await expect(details).not.toContainText(note);
    }
    if (range === "daily") {
      await page.screenshot({
        path: path.join(evidenceDir, "today-collections.png"),
        fullPage: true,
      });
    }
  }

  await page.getByRole("button", { name: "daily", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileDetails = page
    .locator("section.surface-panel")
    .filter({ has: page.getByRole("heading", { name: "Today's collection details" }) });
  await expect(mobileDetails).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Top selling products ranked by sales revenue" }),
  ).toBeVisible();
  await expect(mobileDetails).toContainText("Whey Protein");
  await expect(mobileDetails).toContainText("Membership dues collected");
  const mobileLayout = await page.evaluate(async () => {
    // A viewport resize can update the document and responsive charts across
    // separate animation frames. Sample after layout settles and keep the
    // assertion and its diagnostics in one snapshot.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const elements = Array.from(document.querySelectorAll<HTMLElement>("html, body, body *"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          element: `${element.tagName.toLowerCase()}${element.className ? `.${String(element.className).replace(/\s+/g, ".")}` : ""}`,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          overflowX: style.overflowX,
          transform: style.transform,
        };
      })
      .filter(
        (element) =>
          element.right > window.innerWidth + 1 ||
          element.left < -1 ||
          element.scrollWidth > element.clientWidth + 1,
      )
      .sort((left, right) => right.scrollWidth - left.scrollWidth || right.right - left.right)
      .slice(0, 12);
    return {
      viewportWidth: window.innerWidth,
      document: {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      },
      elements,
    };
  });
  await page.screenshot({
    path: path.join(evidenceDir, "today-collections-mobile.png"),
    fullPage: true,
  });
  expect(
    mobileLayout.document.scrollWidth,
    `daily collection details should fit a mobile viewport; diagnostics: ${JSON.stringify(mobileLayout)}`,
  ).toBeLessThanOrEqual(mobileLayout.viewportWidth + 1);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const dailyDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const dailyDownload = await dailyDownloadPromise;
  const dailyCsvPath = await dailyDownload.path();
  expect(dailyCsvPath).not.toBeNull();
  const dailyCsv = await readFile(dailyCsvPath!, "utf8");
  expect(dailyCsv).toContain("Today's collection details");
  expect(dailyCsv).toContain("Members who paid membership dues,1");
  expect(dailyCsv).toContain("Whey Protein (2 units)");

  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await expect(page.getByText("Start date", { exact: true })).toBeVisible();
  await expect(page.getByText("End date", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Revenue chart for custom" })).toBeVisible();
  const customCard = page.getByRole("link", { name: /collection details/i });
  await expect(customCard).toContainText("Custom revenue");
  await expect(customCard).toContainText("₹3,100");
  const customDetails = page
    .locator("section.surface-panel")
    .filter({ has: page.getByRole("heading", { name: "Custom range collection details" }) });
  await expect(customDetails).toBeVisible();
  await expect(customDetails).toContainText("Weekly balance payment");
  await expect(customDetails).toContainText("Monthly balance payment");
  await expect(customDetails).not.toContainText("Yearly balance payment");
  await page.screenshot({ path: path.join(evidenceDir, "custom-range.png"), fullPage: true });

  await page.evaluate(() => {
    window.name = "print-not-called";
    window.print = () => {
      window.name = "print-called";
    };
  });
  await page.getByRole("button", { name: "Print" }).click();
  await expect.poll(() => page.evaluate(() => window.name)).toBe("print-called");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^ironvault-report-custom-\d{4}-\d{2}-\d{2}\.csv$/);
  const csvPath = await download.path();
  expect(csvPath).not.toBeNull();
  const csv = await readFile(csvPath!, "utf8");
  expect(csv).toContain("Period,Revenue");
  expect(csv).toContain("Selected revenue,3100");
  expect(csv).toContain("Custom range collection details");
  expect(csv).toContain("INV-QA-004");
  expect(csv).toContain("Active members,1");
  await writeFile(path.join(evidenceDir, "exported-report.csv"), csv);
  const exportNotice = page.getByRole("status").filter({ hasText: "CSV exported" });
  await expect(exportNotice).toBeVisible();

  const viewports = [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ];
  const layouts: Array<{ name: string; width: number; height: number; documentWidth: number }> = [];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(page.getByRole("heading", { name: "Reports & Analytics" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
    await expect(exportNotice).toBeVisible();
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(
      documentWidth,
      `${viewport.name} report layout should not overflow horizontally`,
    ).toBeLessThanOrEqual(viewportWidth + 1);
    const statusBox = await exportNotice.boundingBox();
    const productProfitBox = await page
      .locator(".surface-panel")
      .filter({ hasText: "Product profit" })
      .boundingBox();
    expect(statusBox).not.toBeNull();
    expect(productProfitBox).not.toBeNull();
    const overlaps =
      statusBox!.x < productProfitBox!.x + productProfitBox!.width &&
      statusBox!.x + statusBox!.width > productProfitBox!.x &&
      statusBox!.y < productProfitBox!.y + productProfitBox!.height &&
      statusBox!.y + statusBox!.height > productProfitBox!.y;
    expect(overlaps, `${viewport.name} CSV feedback must not cover the Product Profit card`).toBe(
      false,
    );
    layouts.push({ ...viewport, documentWidth });
    await page.screenshot({ path: path.join(evidenceDir, `${viewport.name}-final-viewport.png`) });
    await page.screenshot({
      path: path.join(evidenceDir, `${viewport.name}-final-full.png`),
      fullPage: true,
    });
  }
  expect(
    errors,
    "reports route should not produce console/page errors or unexpected backend calls",
  ).toEqual([]);
  await writeFile(
    path.join(evidenceDir, "metadata.json"),
    JSON.stringify(
      {
        route: "/reports",
        environment: "isolated local Vite server with mocked Supabase and synthetic records",
        capturedAt: new Date().toISOString(),
        scores: {
          verifiedInteractions: ["daily", "weekly", "monthly", "yearly", "custom", "print", "CSV"],
        },
        layouts,
        consoleAndRequestErrors: errors,
        productionDataTouched: false,
      },
      null,
      2,
    ),
  );
});

test("report summary cards open the matching details and member filters", async ({ page }) => {
  await installMockBackend(page);
  await signIn(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/reports");

  await page
    .getByRole("link", { name: "View products to review product sales and profit" })
    .click();
  await expect(page).toHaveURL(/\/products(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Products & Sales" })).toBeVisible();

  await page.goto("/reports");
  await page.getByRole("link", { name: "View members with pending dues" }).click();
  await expect(page).toHaveURL(/\/members\/?[^#]*filter=due/);
  await expect(page.getByRole("heading", { name: "Member Management" })).toBeVisible();
  await expect(page.locator("tr").filter({ hasText: "Anita Reports QA" })).toBeVisible();

  await page.goto("/reports");
  await page.getByRole("link", { name: "View active members" }).click();
  await expect(page).toHaveURL(/\/members\/?[^#]*filter=active/);
  await expect(page.getByRole("heading", { name: "Member Management" })).toBeVisible();
  await expect(page.locator("tr").filter({ hasText: "Anita Reports QA" })).toBeVisible();

  await page.goto("/reports");
  await page.getByRole("button", { name: "daily", exact: true }).click();
  await page.getByRole("link", { name: "View today's revenue collection details" }).click();
  await expect(page).toHaveURL(/\/reports#collection-details$/);
  await expect(page.locator("#collection-details")).toBeInViewport();
  await expect(
    page.locator("#collection-details").getByRole("heading", {
      name: "Today's collection details",
    }),
  ).toBeVisible();
});

test("collection balance recipients and product buyers open their member profile", async ({
  page,
}) => {
  const { errors } = await installMockBackend(page);
  await signIn(page);
  await page.goto("/reports");
  await page.getByRole("button", { name: "daily", exact: true }).click();

  const details = page
    .locator("section.surface-panel")
    .filter({ has: page.getByRole("heading", { name: "Today's collection details" }) });
  await expect(details).toBeVisible();

  const balanceSection = details.locator('section[aria-labelledby="period-dues-payments-heading"]');
  await balanceSection
    .getByRole("link", { name: "Open member profile for Anita Reports QA" })
    .click();
  await expect(page).toHaveURL(/\/members\/reports-member-1$/);
  await expect(page.getByRole("heading", { name: "Anita Reports QA" })).toBeVisible();

  await page.goto("/reports");
  await page.getByRole("button", { name: "daily", exact: true }).click();
  await expect(details).toBeVisible();
  const productSection = details.locator('section[aria-labelledby="period-product-sales-heading"]');
  const buyerLink = productSection.getByRole("link", {
    name: "Open member profile for Anita Reports QA",
  });
  await buyerLink.hover();
  await expect(buyerLink).toHaveCSS("text-decoration-line", "none");
  await buyerLink.click();
  await expect(page).toHaveURL(/\/members\/reports-member-1$/);
  await expect(page.getByRole("heading", { name: "Anita Reports QA" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("membership status summary names open member profiles on desktop and mobile", async ({
  page,
}) => {
  const { errors } = await installMockBackend(page);
  await signIn(page);
  await page.goto("/reports");

  const summary = page
    .locator("section.surface-panel")
    .filter({ has: page.getByRole("heading", { name: "Membership status summary", exact: true }) });
  const desktopMemberLink = summary.getByRole("link", {
    name: "Open member profile for Anita Reports QA",
  });
  await expect(desktopMemberLink).toHaveAttribute("href", "/members/reports-member-1");
  await desktopMemberLink.click();
  await expect(page).toHaveURL(/\/members\/reports-member-1$/);
  await expect(page.getByRole("heading", { name: "Anita Reports QA" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/reports");
  const mobileSummary = page
    .locator("section.surface-panel")
    .filter({ has: page.getByRole("heading", { name: "Membership status summary", exact: true }) });
  await mobileSummary
    .getByRole("link", { name: "Open member profile for Anita Reports QA" })
    .click();
  await expect(page).toHaveURL(/\/members\/reports-member-1$/);
  await expect(page.getByRole("heading", { name: "Anita Reports QA" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("legacy buyer and payer names without member IDs open the unique matching profile", async ({
  page,
}) => {
  const { data, errors } = await installMockBackend(page);
  const today = localDateInput(new Date());
  data.state.members.push(
    qaMember("reports-member-abc", "ABC"),
    qaMember("reports-member-ishwor", "Ishwor Uddas"),
    qaMember("reports-member-adarsh", "Adarsh Thiwi"),
  );
  const sale = data.state.sales.find((candidate) => candidate.id === "reports-sale-1");
  expect(sale).toBeDefined();
  sale!.memberId = null;
  sale!.buyer = "ABC";
  const salePayment = data.state.payments.find(
    (candidate) => candidate.id === "reports-payment-product",
  );
  expect(salePayment).toBeDefined();
  salePayment!.memberId = null;
  data.state.payments.push(
    {
      id: "reports-payment-legacy-ishwor",
      invoiceNo: "INV-QA-LEGACY-001",
      payerName: "Ishwor Uddas",
      kind: "membership",
      amount: 250,
      method: "cash",
      date: `${today}T15:00:00`,
      note: "Legacy renewal payment",
    },
    {
      id: "reports-payment-legacy-adarsh",
      invoiceNo: "INV-QA-LEGACY-002",
      payerName: "Adarsh Thiwi",
      kind: "membership",
      amount: 300,
      method: "cash",
      date: `${today}T15:05:00`,
      note: "Legacy balance payment",
    },
  );

  await signIn(page);
  await page.goto("/reports");
  await page.getByRole("button", { name: "daily", exact: true }).click();
  const details = page
    .locator("section.surface-panel")
    .filter({ has: page.getByRole("heading", { name: "Today's collection details" }) });
  const products = details.locator('section[aria-labelledby="period-product-sales-heading"]');
  await products.getByRole("link", { name: "Open member profile for ABC" }).click();
  await expect(page).toHaveURL(/\/members\/reports-member-abc$/);
  await expect(page.getByRole("heading", { name: "ABC" })).toBeVisible();

  await page.goto("/reports");
  await page.getByRole("button", { name: "daily", exact: true }).click();
  const paymentDetails = page
    .locator("section.surface-panel")
    .filter({ has: page.getByRole("heading", { name: "Today's collection details" }) });
  await paymentDetails.getByText("View all 5 payment records").click();
  await paymentDetails.getByRole("link", { name: "Open member profile for Ishwor Uddas" }).click();
  await expect(page).toHaveURL(/\/members\/reports-member-ishwor$/);
  await expect(page.getByRole("heading", { name: "Ishwor Uddas" })).toBeVisible();

  await page.goto("/reports");
  await page.getByRole("button", { name: "daily", exact: true }).click();
  const adarshDetails = page
    .locator("section.surface-panel")
    .filter({ has: page.getByRole("heading", { name: "Today's collection details" }) });
  await adarshDetails.getByText("View all 5 payment records").click();
  await adarshDetails
    .locator("details")
    .getByRole("link", { name: "Open member profile for Adarsh Thiwi" })
    .click();
  await expect(page).toHaveURL(/\/members\/reports-member-adarsh$/);
  await expect(page.getByRole("heading", { name: "Adarsh Thiwi" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("daily collection time window filters receipts, due payments and product sales", async ({
  page,
}) => {
  const { data, errors } = await installMockBackend(page);
  const today = localDateInput(new Date());
  data.state.payments.push(
    {
      id: "reports-payment-morning-balance",
      invoiceNo: "INV-QA-AM-001",
      memberId: "reports-member-1",
      membershipId: "reports-membership-1",
      kind: "membership",
      purpose: "membership_balance",
      amount: 125,
      method: "cash",
      // Keep fixtures independent of the runner's local timezone. This represents
      // the same India-local instant used by the original developer machine.
      date: `${today}T09:15:00+05:30`,
      note: "Morning balance payment",
    },
    {
      id: "reports-payment-morning-product",
      invoiceNo: "INV-QA-AM-002",
      memberId: "reports-member-1",
      saleId: "reports-sale-morning",
      kind: "product",
      amount: 180,
      method: "cash",
      date: `${today}T10:30:00+05:30`,
      note: "Morning Snack sale",
    },
  );
  data.state.sales.push({
    id: "reports-sale-morning",
    invoiceNo: "INV-QA-AM-002",
    productId: "reports-product-1",
    productName: "Morning Snack",
    qty: 1,
    unitPrice: 180,
    unitCost: 70,
    total: 180,
    paid: 180,
    buyer: "Anita Reports QA",
    memberId: "reports-member-1",
    date: `${today}T10:30:00+05:30`,
  });

  await signIn(page);
  await page.goto("/reports");
  await page.getByRole("button", { name: "daily", exact: true }).click();
  const details = page
    .locator("section.surface-panel")
    .filter({ has: page.getByRole("heading", { name: "Today's collection details" }) });
  const startTime = details.getByLabel("Collection start time");
  await expect(startTime).toHaveValue("00:00");
  const timePickerTheme = await startTime.evaluate((input) => {
    const style = getComputedStyle(input);
    return { colorScheme: style.colorScheme, accentColor: style.accentColor };
  });
  expect(timePickerTheme.colorScheme.split(/\s+/)).toContain("dark");
  expect(timePickerTheme.accentColor).not.toBe("auto");
  await expect(details.getByLabel("Collection end time")).toHaveValue("23:59");

  await startTime.fill("04:00");
  await details.getByLabel("Collection end time").fill("11:45");
  await expect(details).toContainText("today from 04:00 to 11:45 (gym time)");
  await expect(details).toContainText("2 payments recorded");
  await expect(details).toContainText("1 · ₹125");

  const products = details.locator('section[aria-labelledby="period-product-sales-heading"]');
  await expect(products).toContainText("Morning Snack");
  await expect(products).toContainText(/10:45\s?AM/i);
  await expect(products).not.toContainText("Whey Protein");
  const balances = details.locator('section[aria-labelledby="period-dues-payments-heading"]');
  await expect(balances).toContainText("Morning balance payment");
  await expect(balances).not.toContainText("Weekly balance payment");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  const csvPath = await download.path();
  expect(csvPath).not.toBeNull();
  const csv = await readFile(csvPath!, "utf8");
  expect(csv).toContain("Collection time window,04:00–11:45 gym time");
  expect(csv).toContain("Morning Snack (1 units)");
  expect(csv).not.toContain("INV-QA-003");
  expect(errors).toEqual([]);
});
