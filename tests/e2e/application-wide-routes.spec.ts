import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSeed } from "../../src/lib/gym/seed";
import { formatShortDate } from "../../src/lib/gym/calendar";
import { dueFor } from "../../src/lib/gym/selectors";

const owner = {
  id: "f1000000-0000-0000-0000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "qa-owner@example.invalid",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { full_name: "QA Gym Owner", gym_name: "Ironvault QA Gym" },
  factors: [],
  identities: [],
  created_at: "2026-01-01T00:00:00.000Z",
};

const context = {
  gym_id: "f2000000-0000-0000-0000-000000000001",
  role: "owner",
  permissions: {},
  display_name: "QA Gym Owner",
  email: owner.email,
  enabled: true,
  gym_name: "Ironvault QA Gym",
  account_status: "active",
  subscription_expired: false,
  subscription_status: "active",
  subscription_source: "manual",
  subscription_current_period_end: "2027-01-01T00:00:00.000Z",
};

const sampleState = buildSeed();
type SyntheticReceptionist = {
  enabled: boolean;
  name: string;
  email: string;
  permissions: Record<string, boolean>;
};
type SyntheticWorkspace = {
  state: typeof sampleState;
  revision: number;
  receptionist?: SyntheticReceptionist;
  receptionistSaves: Array<{
    enabled: boolean;
    name: string;
    email: string;
    permissions: Record<string, boolean>;
    passwordProvided: boolean;
  }>;
};
const stateByPage = new WeakMap<Page, SyntheticWorkspace>();
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

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function installSyntheticSupabase(page: Page) {
  const workspace: SyntheticWorkspace = {
    state: structuredClone(sampleState),
    revision: 1,
    receptionistSaves: [],
  };
  stateByPage.set(page, workspace);
  await page.route("https://application-wide-qa.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const pathname = url.pathname;

    if (pathname.endsWith("/auth/v1/token")) {
      return json(route, {
        access_token: token,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: 4102444800,
        refresh_token: "application-wide-qa-refresh-token",
        user: owner,
      });
    }
    if (pathname.endsWith("/auth/v1/user")) return json(route, owner);
    if (pathname.endsWith("/auth/v1/logout")) return route.fulfill({ status: 204, body: "" });
    if (pathname.endsWith("/rest/v1/rpc/get_current_gym_context")) return json(route, context);
    if (pathname.endsWith("/rest/v1/rpc/load_current_gym_workspace")) {
      return json(route, { ...context, revision: workspace.revision, state: workspace.state });
    }
    if (pathname.endsWith("/rest/v1/rpc/save_current_gym_workspace")) {
      const body = route.request().postDataJSON() as { p_state?: typeof sampleState };
      if (body.p_state) workspace.state = body.p_state;
      workspace.revision += 1;
      return json(route, { revision: workspace.revision });
    }
    if (pathname.endsWith("/rest/v1/rpc/record_audit_event")) return json(route, {});
    if (pathname === "/storage/v1/object/ironvault-private" && method === "DELETE") {
      return json(route, { data: [] });
    }
    if (pathname.startsWith("/storage/v1/object/ironvault-private/") && method === "POST") {
      return json(route, { Key: pathname.slice("/storage/v1/object/".length) });
    }
    if (pathname.startsWith("/storage/v1/object/sign/ironvault-private/")) {
      if (method === "POST") {
        return json(route, {
          signedURL: `${pathname.replace("/storage/v1", "")}?token=synthetic`,
        });
      }
      if (method === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/3ioAAAAASUVORK5CYII=",
            "base64",
          ),
        });
      }
    }
    if (pathname.endsWith("/rest/v1/gym_users"))
      return json(
        route,
        workspace.receptionist
          ? [
              {
                display_name: workspace.receptionist.name,
                email: workspace.receptionist.email,
                enabled: workspace.receptionist.enabled,
                permissions: workspace.receptionist.permissions,
              },
            ]
          : [],
      );
    if (pathname.startsWith("/rest/v1/rpc/")) return json(route, null);
    if (pathname.startsWith("/rest/v1/")) return json(route, []);
    if (pathname.endsWith("/functions/v1/staff-receptionist")) {
      const body = route.request().postDataJSON() as {
        enabled: boolean;
        name: string;
        email: string;
        password?: string;
        permissions: Record<string, boolean>;
      };
      workspace.receptionist = {
        enabled: body.enabled,
        name: body.name,
        email: body.email,
        permissions: body.permissions,
      };
      workspace.receptionistSaves.push({
        ...workspace.receptionist,
        passwordProvided: typeof body.password === "string",
      });
      return json(route, { account: workspace.receptionist });
    }
    if (pathname.startsWith("/functions/v1/")) return json(route, { success: true });
    return json(route, { message: "Unexpected synthetic Supabase request" }, 404);
  });
}

async function waitForPage(page: Page, isNotFound = false) {
  await expect(page.locator("body")).not.toContainText("Loading workspace…");
  if (isNotFound) await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  else await expect(page.locator("main").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function waitForViewportTransitions(page: Page) {
  await page.evaluate(async () => {
    const finiteTransitions = document
      .getAnimations({ subtree: true })
      .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime));
    await Promise.all(
      finiteTransitions.map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}

async function scrollPageToTop(page: Page) {
  await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    const htmlScrollBehavior = html.style.scrollBehavior;
    const bodyScrollBehavior = body.style.scrollBehavior;
    html.style.scrollBehavior = "auto";
    body.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    html.style.scrollBehavior = htmlScrollBehavior;
    body.style.scrollBehavior = bodyScrollBehavior;
  });
  await page.waitForFunction(() => window.scrollY === 0);
}

async function waitForStableSvgGeometry(page: Page, selector: string) {
  await page.waitForFunction(
    async ({ shapeSelector, stableSamples, sampleIntervalMs }) => {
      const signature = () =>
        Array.from(document.querySelectorAll<SVGElement>(shapeSelector))
          .map((shape) =>
            ["d", "x", "y", "width", "height", "cx", "cy", "rx", "ry", "transform"]
              .map((attribute) => shape.getAttribute(attribute) ?? "")
              .join(","),
          )
          .join("|");
      let previous = signature();
      if (!previous) return false;
      let stableCount = 0;
      while (stableCount < stableSamples) {
        await new Promise((resolve) => window.setTimeout(resolve, sampleIntervalMs));
        const current = signature();
        if (current === previous) stableCount += 1;
        else stableCount = 0;
        previous = current;
      }
      return true;
    },
    { shapeSelector: selector, stableSamples: 3, sampleIntervalMs: 100 },
    { timeout: 6_000 },
  );
}

const dashboardChartShapes =
  ".recharts-area path, .recharts-pie .recharts-sector, .recharts-bar-rectangle path, .recharts-bar-rectangle rect";

test("captures every discovered application route at desktop, tablet, and mobile", async ({
  page,
}) => {
  // This single test deliberately captures all discovered routes at five responsive widths.
  // Keep the aggregate browser-capture budget separate from the default 30s workflow budget.
  test.setTimeout(300_000);
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = resolve(
    process.cwd(),
    "qa/ironvault/application-wide",
    `follow-up-local-auth-mock-${runId}`,
  );
  mkdirSync(outputDir, { recursive: true });

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const unexpectedResponses: string[] = [];
  const routeResults: Array<Record<string, unknown>> = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (
      response.status() >= 400 &&
      !new URL(response.url()).pathname.endsWith("/qa-not-a-real-route")
    ) {
      unexpectedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await installSyntheticSupabase(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const loginViewports: Array<Record<string, unknown>> = [];
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await waitForViewportTransitions(page);
    await scrollPageToTop(page);
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    await page.screenshot({ path: resolve(outputDir, `login-${viewport.name}-viewport.png`) });
    await page.screenshot({
      path: resolve(outputDir, `login-${viewport.name}-full.png`),
      fullPage: true,
    });
    loginViewports.push({
      ...viewport,
      documentWidth,
      noHorizontalOverflow: documentWidth <= viewport.width,
    });
  }
  routeResults.push({
    route: "/login",
    name: "login",
    finalUrl: "/login",
    viewports: loginViewports,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("textbox", { name: "Email address" }).fill(owner.email);
  await page.getByRole("textbox", { name: "Password" }).fill("synthetic-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
  const skipTourButton = page
    .locator("button")
    .filter({ hasText: /^Skip tour$/ })
    .last();
  await skipTourButton.waitFor({ state: "visible" });
  await page.screenshot({ path: resolve(outputDir, "dashboard-first-login-tour-desktop.png") });
  await skipTourButton.click();
  await expect(page.getByRole("button", { name: "Skip tour" })).toHaveCount(0);

  const routes = [
    { path: "/", name: "dashboard" },
    { path: "/members", name: "members" },
    { path: `/members/${sampleState.members[0]?.id ?? "missing-member"}`, name: "member-detail" },
    { path: "/attendance", name: "attendance" },
    { path: "/memberships", name: "memberships" },
    { path: "/payments", name: "payments" },
    { path: "/products", name: "products" },
    { path: "/expenses", name: "expenses" },
    { path: "/reports", name: "reports" },
    { path: "/inquiries", name: "inquiries" },
    { path: "/notifications", name: "notifications" },
    { path: "/trash", name: "trash" },
    { path: "/settings", name: "settings" },
    { path: "/ceo", name: "ceo-gate" },
    { path: "/ceo/demo", name: "ceo-demo-redirect" },
    { path: "/qa-not-a-real-route", name: "not-found" },
  ];
  const viewports = [
    { name: "desktop", width: 1280, height: 900 },
    { name: "desktop", width: 1440, height: 1000 },
    { name: "desktop", width: 1920, height: 1080 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ];

  for (const route of routes) {
    const result: Record<string, unknown> = { route: route.path, name: route.name, viewports: [] };
    try {
      await page.setViewportSize(viewports[0]);
      if (route.name === "ceo-gate") {
        // The CEO gate should be captured as a first-time, signed-out visitor—not as the
        // synthetic gym owner used to audit the rest of the authenticated workspace.
        await page.evaluate(() => {
          localStorage.clear();
          sessionStorage.clear();
        });
      }
      const routeOpenedAt = Date.now();
      await page.goto(route.path);
      await waitForPage(page, route.name === "not-found");
      if (route.name === "ceo-gate") {
        await expect(page.getByRole("heading", { name: "CEO sign in" })).toBeVisible();
        await expect(
          page.getByText(/sign in with the invited platform-owner account/i),
        ).toBeVisible();
        await expect(page.getByText(/this account is not a platform administrator/i)).toHaveCount(
          0,
        );
      }
      if (route.name === "ceo-demo-redirect") {
        await expect(page).toHaveURL(/\/ceo\/?$/);
        await expect(page.getByRole("heading", { name: "CEO sign in" })).toBeVisible();
      }
      if (route.name === "not-found") {
        await expect(page).toHaveTitle(/Page not found/);
      }
      const finalUrl = new URL(page.url()).pathname;
      result.finalUrl = finalUrl;
      if (route.path !== "/ceo/demo" && finalUrl !== route.path) {
        result.error = `Redirected to ${finalUrl}`;
      }
      if (route.name === "expenses") {
        // Keep an early desktop capture so a missing chart is preserved as evidence,
        // then require the category series to have painted before the route is scored.
        await page.screenshot({
          path: resolve(outputDir, "expenses-desktop-before-chart-settle.png"),
        });
        const categorySectors = page.locator(".recharts-pie .recharts-sector");
        await expect(
          categorySectors.first(),
          "the category distribution chart must render at the initial desktop viewport",
        ).toBeVisible();
        expect(await categorySectors.count()).toBeGreaterThan(0);
        await waitForStableSvgGeometry(page, ".recharts-pie .recharts-sector");
        result.categoryChartVisibleAfterMs = Date.now() - routeOpenedAt;
        result.categoryChartSettled = true;
      }
      if (route.name === "dashboard") {
        await waitForStableSvgGeometry(page, dashboardChartShapes);
      }
      await scrollPageToTop(page);
      // Keep the full desktop evidence; only the viewport capture is performed in
      // the responsive loop below, avoiding a duplicate write at the same size.
      await page.screenshot({
        path: resolve(outputDir, `${route.name}-desktop-${viewports[0].width}px-full.png`),
        fullPage: true,
      });

      const viewportsSeen: Array<Record<string, unknown>> = [];
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.evaluate(() => document.fonts.ready);
        await waitForViewportTransitions(page);
        if (route.name === "ceo-demo-redirect") {
          await expect(page).toHaveURL(/\/ceo\/?$/);
          await expect(
            page.getByRole("heading", { name: "CEO sign in" }),
            `the CEO redirect target must be visible at ${viewport.name} size`,
          ).toBeVisible();
        }
        const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(
          documentWidth,
          `${route.name} should not create page-level horizontal overflow at ${viewport.width}px`,
        ).toBeLessThanOrEqual(viewport.width);
        if (viewport.name !== "desktop" && route.name === "products") {
          const cards = page.getByTestId("product-responsive-card");
          await expect(cards).toHaveCount(
            sampleState.products.filter((product) => !product.deletedAt).length,
          );
          const firstCard = cards.first();
          await expect(firstCard.getByText("Price", { exact: true })).toBeVisible();
          await expect(firstCard.getByText("Stock", { exact: true })).toBeVisible();
          await expect(firstCard.getByRole("button", { name: "Sell" })).toBeVisible();
          await expect(firstCard.getByRole("button", { name: /Edit product/ })).toBeVisible();
          await expect(firstCard.getByRole("button", { name: /Delete product/ })).toBeVisible();
          const search = page.getByPlaceholder("Search products");
          await expect(search).toBeInViewport();
          const searchBox = await search.boundingBox();
          const firstCardBox = await firstCard.boundingBox();
          expect(searchBox && firstCardBox ? searchBox.y : Number.POSITIVE_INFINITY).toBeLessThan(
            searchBox && firstCardBox ? firstCardBox.y : 0,
          );
          expect(firstCardBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(viewport.height);
          const lowStockAlert = page.getByTestId("product-low-stock-alert");
          await expect(lowStockAlert).toBeVisible();
          await expect(lowStockAlert).toBeInViewport();
          const productSummary = page.getByTestId("product-summary-metrics");
          await expect(productSummary).toBeInViewport();
          const summaryBox = await productSummary.boundingBox();
          const alertBox = await lowStockAlert.boundingBox();
          expect(
            summaryBox && firstCardBox ? summaryBox.y : Number.POSITIVE_INFINITY,
            "product summaries should appear before the catalog on narrow screens",
          ).toBeLessThan(summaryBox && firstCardBox ? firstCardBox.y : 0);
          expect(alertBox && firstCardBox ? alertBox.y : Number.POSITIVE_INFINITY).toBeLessThan(
            alertBox && firstCardBox ? firstCardBox.y : 0,
          );
        }
        if (route.name === "dashboard") {
          const dashboardAnalyticsPanels = [
            "Membership Statistics",
            "Sales Statistics",
            "Recent Activities",
            "Financial Overview",
            "Due Aging",
            "Member Lifecycle",
            "Today’s Summary",
            "More Metrics",
          ];
          for (const title of dashboardAnalyticsPanels) {
            await expect(
              page.getByRole("heading", { name: title }),
              `${title} should remain visible without a Hide/Show control`,
            ).toBeVisible();
          }
          if (viewport.name === "desktop") {
            const salesPanel = page
              .getByRole("heading", { name: "Sales Statistics" })
              .locator("xpath=ancestor::section[1]");
            const salesPanelBox = await salesPanel.boundingBox();
            expect(
              salesPanelBox?.height ?? Number.POSITIVE_INFINITY,
              "Sales Statistics should fit its chart instead of stretching to the taller activity list",
            ).toBeLessThan(460);
          }
          await expect(
            page.getByRole("button", { name: /^(Hide|Show)(\s|$)/ }),
            "dashboard analytics should not expose collapse controls",
          ).toHaveCount(0);
          await expect(page.getByRole("heading", { name: "Revenue Chart" })).toBeVisible();

          if (viewport.name === "mobile") {
            const lifecycleGrid = page.getByTestId("dashboard-lifecycle-grid");
            const frozenMetric = page.getByTestId("dashboard-frozen-metric");
            await expect(lifecycleGrid).toBeVisible();
            const lifecycleBox = await lifecycleGrid.boundingBox();
            const frozenBox = await frozenMetric.boundingBox();
            expect(lifecycleBox && frozenBox ? frozenBox.width : 0).toBeGreaterThanOrEqual(
              lifecycleBox && frozenBox ? lifecycleBox.width - 2 : Number.POSITIVE_INFINITY,
            );

            const overviewGrid = page.locator('[data-tour="dashboard-overview"]');
            const overviewColumns = await overviewGrid.evaluate(
              (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
            );
            const quickActionsGrid = page.getByTestId("dashboard-quick-actions-grid");
            const quickActionColumns = await quickActionsGrid.evaluate(
              (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
            );
            const todayGrid = page.getByTestId("dashboard-today-summary-grid");
            const bottomGrid = page.getByTestId("dashboard-bottom-summary-grid");
            await expect(todayGrid).toBeVisible();
            await expect(bottomGrid).toBeVisible();
            await expect(todayGrid.locator(":scope > *").first()).toBeVisible();
            const todayColumns = await todayGrid.evaluate(
              (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
            );
            await expect(bottomGrid.locator(":scope > *").first()).toBeVisible();
            const bottomColumns = await bottomGrid.evaluate(
              (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
            );
            expect(todayColumns).toBe(2);
            expect(bottomColumns).toBe(2);
            expect(overviewColumns).toBe(2);
            expect(quickActionColumns).toBe(2);
          } else {
            const lifecycleGrid = page.getByTestId("dashboard-lifecycle-grid");
            const frozenMetric = page.getByTestId("dashboard-frozen-metric");
            const lifecycleBox = await lifecycleGrid.boundingBox();
            const frozenBox = await frozenMetric.boundingBox();
            expect(lifecycleBox && frozenBox ? frozenBox.width : 0).toBeGreaterThanOrEqual(
              lifecycleBox && frozenBox ? lifecycleBox.width - 2 : Number.POSITIVE_INFINITY,
            );
          }
        }
        if (!new Set(["ceo-gate", "ceo-demo-redirect", "not-found"]).has(route.name)) {
          const globalSearch = page.getByRole("button", {
            name: "Search members, products, and invoices",
          });
          await expect(globalSearch).toBeVisible();
          if (viewport.name === "mobile") {
            await expect(globalSearch.getByText("Search…", { exact: true })).toBeVisible();
            await expect(
              globalSearch.getByText("Search members, products, invoices…", { exact: true }),
            ).toBeHidden();
          } else {
            await expect(
              globalSearch.getByText("Search members, products, invoices…", { exact: true }),
            ).toBeVisible();
            await expect(globalSearch.getByText("Search…", { exact: true })).toBeHidden();
          }
        }
        if (route.name === "settings" && viewport.name !== "mobile") {
          const tagline = page.getByText("Tagline", { exact: true }).locator("..").locator("input");
          const gymName = page
            .getByText("Gym name", { exact: true })
            .locator("..")
            .locator("input");
          const taglineBox = await tagline.boundingBox();
          const gymNameBox = await gymName.boundingBox();
          expect(taglineBox && gymNameBox ? taglineBox.width : 0).toBeGreaterThan(
            gymNameBox ? gymNameBox.width + 80 : Number.POSITIVE_INFINITY,
          );
          const profilePanel = page
            .getByRole("button", { name: /Gym Profile/ })
            .locator("xpath=ancestor::section[1]");
          const invoicingPanel = page
            .getByRole("button", { name: /Invoicing & Alerts/ })
            .locator("xpath=ancestor::section[1]");
          const profileBox = await profilePanel.boundingBox();
          const invoicingBox = await invoicingPanel.boundingBox();
          expect(profileBox && invoicingBox ? invoicingBox.height : 0).toBeLessThan(
            profileBox ? profileBox.height : Number.POSITIVE_INFINITY,
          );
          if (viewport.name === "desktop") {
            const columns = await page
              .getByTestId("settings-sections")
              .evaluate((element) => getComputedStyle(element).columnCount);
            expect(columns).toBe("2");
          }
        }
        if (route.name === "settings" && viewport.name === "mobile") {
          const sectionToggles = page
            .getByTestId("settings-sections")
            .locator(":scope > section > div > button[aria-expanded]");
          await expect(sectionToggles).toHaveCount(9);
          const expandedSections = await sectionToggles.evaluateAll((elements) =>
            elements.map((element) => element.getAttribute("aria-expanded") === "true"),
          );
          expect(expandedSections).toEqual([
            true,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
          ]);
          const getCollapsedPanelContentHeights = () =>
            page
              .getByTestId("settings-sections")
              .locator(":scope > section")
              .evaluateAll((sections) =>
                sections.flatMap((section) => {
                  const toggle = section.querySelector<HTMLButtonElement>(
                    "button[aria-expanded='false']",
                  );
                  const contentId = toggle?.getAttribute("aria-controls");
                  const content = contentId ? document.getElementById(contentId) : null;
                  return content ? [content.getBoundingClientRect().height <= 1] : [];
                }),
              );
          await expect
            .poll(getCollapsedPanelContentHeights, {
              message: "collapsed Settings panels should not leave hidden content taking up space",
              timeout: 2_000,
            })
            .toEqual(Array(8).fill(true));
        }
        if (route.name === "expenses") {
          const revenueHint = page.getByText("Collected membership and product payments", {
            exact: true,
          });
          await expect(revenueHint).toBeVisible();
          const hintFitsCard = await revenueHint.evaluate((element) => {
            const card = element.parentElement?.parentElement;
            if (!card) return false;
            const hintBox = element.getBoundingClientRect();
            const cardBox = card.getBoundingClientRect();
            return (
              element.scrollWidth <= element.clientWidth + 1 &&
              hintBox.bottom <= cardBox.bottom + 1 &&
              hintBox.left >= cardBox.left
            );
          });
          expect(
            hintFitsCard,
            `the revenue helper text must fit inside its metric at ${viewport.name} width`,
          ).toBe(true);
          if (viewport.name === "mobile") {
            const periodControls = page.getByTestId("expense-period-controls");
            const columnCount = await periodControls.evaluate(
              (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
            );
            expect(columnCount).toBe(3);
            for (const label of ["daily", "weekly", "monthly", "yearly", "Custom"]) {
              await expect(
                periodControls.getByRole("button", { name: label, exact: true }),
              ).toBeVisible();
            }
            const chart = page.getByTestId("expense-chart");
            const chartTicks = chart.locator(".recharts-cartesian-axis-tick-value");
            await expect(chartTicks.first()).toBeVisible();
            const tickFontSize = await chartTicks
              .first()
              .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
            expect(tickFontSize).toBeGreaterThanOrEqual(12);
            const yTicks = await chart
              .locator(".recharts-yAxis .recharts-cartesian-axis-tick-value")
              .allTextContents();
            expect(yTicks.length).toBeGreaterThan(0);
            expect(yTicks.every((tick) => tick.trim().startsWith("₹"))).toBe(true);
          }
        }
        if (route.name === "attendance" && viewport.name === "mobile") {
          const emptyState = page.getByText("No attendance found", { exact: true }).locator("..");
          await expect(emptyState).toBeVisible();
          const emptyStateBox = await emptyState.boundingBox();
          expect(emptyStateBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(150);
        }
        if (viewport.name !== "desktop" && route.name === "expenses") {
          const cards = page.getByTestId("expense-responsive-card");
          await expect(cards.first()).toBeVisible();
          for (const label of ["Category", "Method", "Date", "Attachment"]) {
            await expect(cards.first().getByText(label, { exact: true })).toBeVisible();
          }
          await expect(cards.first().getByRole("button", { name: /Edit expense/ })).toBeVisible();
        }
        if ((viewport.name !== "desktop" || viewport.width < 1536) && route.name === "inquiries") {
          const cards = page.getByTestId("inquiry-responsive-card");
          await expect(cards).toHaveCount(sampleState.inquiries.length);
          const firstCard = cards.first();
          for (const label of [
            "Interest · opportunity",
            "Source",
            "Stage",
            "Next follow-up",
            "Activity",
          ]) {
            await expect(firstCard.getByText(label, { exact: true })).toBeVisible();
          }
          await expect(firstCard.getByRole("combobox")).toBeVisible();
          await expect(firstCard.getByRole("link", { name: /Call/ })).toBeVisible();
          await expect(firstCard.getByRole("button", { name: /Edit inquiry/ })).toBeVisible();
          await expect(firstCard.getByRole("button", { name: /Delete inquiry/ })).toBeVisible();
          const cardBox = await firstCard.boundingBox();
          const intelligenceBox = await page
            .getByRole("heading", { name: "CRM Intelligence" })
            .boundingBox();
          expect(cardBox && intelligenceBox ? cardBox.y : Number.POSITIVE_INFINITY).toBeLessThan(
            cardBox && intelligenceBox ? intelligenceBox.y : 0,
          );
          if (viewport.name === "mobile") {
            const searchBox = await page
              .getByPlaceholder("Search leads, phone, source or interest")
              .boundingBox();
            const search = page.getByPlaceholder("Search leads, phone, source or interest");
            await expect(search).toBeVisible();
            const listView = page.getByRole("button", { name: "List view" });
            const toggleBox = await listView.boundingBox();
            expect(searchBox?.width ?? 0).toBeGreaterThan(viewport.width * 0.75);
            expect(
              searchBox && toggleBox ? toggleBox.y : Number.NEGATIVE_INFINITY,
              "mobile search should have its own full-width row above the view switch",
            ).toBeGreaterThan(searchBox ? searchBox.y : Number.POSITIVE_INFINITY);
            const metricsBox = await page.getByTestId("inquiry-summary-metrics").boundingBox();
            expect(metricsBox && searchBox ? metricsBox.y : Number.POSITIVE_INFINITY).toBeLessThan(
              metricsBox && searchBox ? searchBox.y : 0,
            );
            const summaryColumns = await page
              .getByTestId("inquiry-summary-metrics")
              .evaluate(
                (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
              );
            expect(summaryColumns).toBe(2);
            await expect(page.getByRole("button", { name: "List view" })).toBeVisible();
            await expect(page.getByRole("button", { name: "Pipeline view" })).toBeVisible();
          }
        }
        if (viewport.name === "desktop" && route.name === "inquiries") {
          const resultsBox = await page.getByTestId("inquiry-results-panel").boundingBox();
          const intelligenceBox = await page
            .getByRole("heading", { name: "CRM Intelligence" })
            .boundingBox();
          expect(
            resultsBox && intelligenceBox ? resultsBox.y : Number.POSITIVE_INFINITY,
            "the lead queue should precede analytics on desktop",
          ).toBeLessThan(
            resultsBox && intelligenceBox ? intelligenceBox.y : Number.NEGATIVE_INFINITY,
          );

          if (viewport.width >= 1536) {
            const tableWrapper = page.getByTestId("inquiry-desktop-table-wrapper");
            const table = tableWrapper.locator("table");
            const lastAction = page
              .getByTestId("inquiry-actions-cell")
              .first()
              .locator("button")
              .last();
            await expect(tableWrapper).toBeVisible();
            const wrapperBox = await tableWrapper.boundingBox();
            const tableBox = await table.boundingBox();
            const actionBox = await lastAction.boundingBox();
            const overflow = await tableWrapper.evaluate(
              (element) => element.scrollWidth - element.clientWidth,
            );
            expect(
              overflow,
              `the desktop lead table should fit without horizontal scrolling at ${viewport.width}px`,
            ).toBeLessThanOrEqual(2);
            expect(
              wrapperBox && tableBox ? tableBox.x + tableBox.width : Number.POSITIVE_INFINITY,
            ).toBeLessThanOrEqual(wrapperBox ? wrapperBox.x + wrapperBox.width + 1 : 0);
            expect(
              wrapperBox && actionBox ? actionBox.x + actionBox.width : Number.POSITIVE_INFINITY,
            ).toBeLessThanOrEqual(wrapperBox ? wrapperBox.x + wrapperBox.width + 1 : 0);
          } else {
            await expect(page.getByTestId("inquiry-desktop-table-wrapper")).toBeHidden();
            await expect(page.getByTestId("inquiry-responsive-card").first()).toBeVisible();
          }
        }
        if (route.name === "trash" && viewport.name === "mobile") {
          const emptyStates = page.locator("section.surface-panel .border-dashed");
          await expect(emptyStates).toHaveCount(5);
          await expect(
            page.getByRole("heading", { name: "Deleted Members", exact: true }),
          ).toBeVisible();
          for (const emptyState of await emptyStates.all()) {
            const bounds = await emptyState.boundingBox();
            expect(bounds?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(90);
          }
        }
        if (route.name === "payments" && viewport.name === "tablet") {
          const metricValues = page.getByTestId("payments-metric-value");
          await expect(metricValues).toHaveCount(3);
          const clippedValues = await metricValues.evaluateAll((elements) =>
            elements
              .filter((element) => element.scrollWidth > element.clientWidth + 1)
              .map((element) => element.textContent?.trim() ?? ""),
          );
          expect(clippedValues, "tablet payment totals should not be clipped").toEqual([]);
        }
        if (route.name === "memberships" && viewport.name !== "desktop") {
          const summary = page.getByTestId("membership-unassigned-summary");
          const summaryBox = await summary.boundingBox();
          const grid = summary.locator("xpath=..");
          const gridBox = await grid.boundingBox();
          expect(summaryBox && gridBox ? summaryBox.width : 0).toBeGreaterThanOrEqual(
            gridBox ? gridBox.width - 2 : Number.POSITIVE_INFINITY,
          );
        }
        if (route.name === "members") {
          const searchInput = page.getByPlaceholder("Search by name, phone or email");
          const searchIcon = searchInput.locator("xpath=..").locator("svg").first();
          await expect(searchIcon).toBeVisible({ timeout: 5_000 });
          const iconCenter = await searchIcon.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return rect.top + rect.height / 2;
          });
          const inputCenter = await searchInput.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return rect.top + rect.height / 2;
          });
          expect(
            Math.abs(iconCenter - inputCenter),
            `${viewport.name} member search icon should be vertically centered in its input`,
          ).toBeLessThanOrEqual(2);
        }
        if (route.name === "dashboard" && viewport.name === "desktop") {
          const membershipStats = page.getByRole("heading", { name: "Membership Statistics" });
          await expect(membershipStats).toBeVisible();
          const statsPanel = membershipStats.locator("xpath=ancestor::section[1]");
          const statsBounds = await statsPanel.boundingBox();
          expect(statsBounds?.height ?? 0).toBeGreaterThan(120);
        }
        if (route.name === "reports") {
          const tickLabels = page.locator(
            '[aria-label^="Revenue chart"] .recharts-yAxis .recharts-cartesian-axis-tick-value',
          );
          const topSellingProducts = page.getByRole("list", {
            name: "Top selling products ranked by sales revenue",
          });
          const productRows = topSellingProducts.getByRole("listitem");
          const productRevenueBars = topSellingProducts.getByRole("progressbar");
          await expect(topSellingProducts).toBeVisible();
          await expect(productRows.first()).toBeVisible();
          await expect(productRevenueBars.first()).toBeVisible();
          const productRowOverflows = await productRows.evaluateAll((elements) =>
            elements
              .filter((element) => element.scrollWidth > element.clientWidth + 1)
              .map((element) => element.textContent?.trim() ?? ""),
          );
          await expect(tickLabels.first()).toBeVisible();
          const ticks = await tickLabels.allTextContents();
          expect(ticks.length).toBeGreaterThan(0);
          expect(ticks.every((tick) => tick.trim().startsWith("₹"))).toBe(true);
          expect(productRowOverflows, "top-selling product rows should fit their cards").toEqual(
            [],
          );
          if (viewport.name === "mobile") {
            const fontSizes = await tickLabels.evaluateAll((elements) =>
              elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
            );
            expect(fontSizes.every((fontSize) => fontSize >= 12)).toBe(true);
          }
        }
        if (route.name === "expenses") {
          const categorySectors = page.locator(".recharts-pie .recharts-sector");
          await expect(
            categorySectors.first(),
            `category distribution chart should be visible at ${viewport.name}`,
          ).toBeVisible();
          expect(await categorySectors.count()).toBeGreaterThan(0);
          await waitForStableSvgGeometry(page, ".recharts-pie .recharts-sector");
        }
        if (route.name === "notifications" && viewport.name === "tablet") {
          await expect(
            page.getByRole("heading", { name: "Recent notifications", exact: true }),
          ).toBeVisible();
          const reminderRows = page.locator("article");
          const readyText = await page.getByText(/\d+ ready/).innerText();
          const readyCount = Number(readyText.match(/\d+/)?.[0]);
          await expect(reminderRows).toHaveCount(readyCount);
          const unreadableFields = await reminderRows.evaluateAll((rows) =>
            rows.flatMap((row) =>
              Array.from(row.querySelectorAll("p.font-semibold, span.rounded-full"))
                .filter((element) => element.scrollWidth > element.clientWidth + 1)
                .map((element) => element.textContent?.trim() ?? ""),
            ),
          );
          expect(
            unreadableFields,
            "tablet reminders should show complete names and categories",
          ).toEqual([]);
          const reminderListIsNestedScrollable = await reminderRows
            .first()
            .locator("xpath=..")
            .evaluate((element) => {
              const style = getComputedStyle(element);
              return style.overflowY === "auto" || style.overflowY === "scroll";
            });
          expect(
            reminderListIsNestedScrollable,
            "reminders should remain in the natural page flow",
          ).toBe(false);
        }
        if (route.name === "dashboard") {
          await waitForStableSvgGeometry(page, dashboardChartShapes);
        }
        if (route.name === "reports" && [1280, 1440, 1920].includes(viewport.width)) {
          const saleValueHeader = page.getByRole("columnheader", {
            name: "Sale value",
            exact: true,
          });
          const tableViewport = saleValueHeader.locator(
            "xpath=ancestor::div[contains(@class, 'overflow-x-auto')]",
          );
          const headerBox = await saleValueHeader.boundingBox();
          const viewportBox = await tableViewport.boundingBox();
          expect(headerBox).not.toBeNull();
          expect(viewportBox).not.toBeNull();
          expect(
            headerBox!.x + headerBox!.width,
            `the Reports product sales table should show its Sale value column without horizontal scrolling at ${viewport.width}px`,
          ).toBeLessThanOrEqual(viewportBox!.x + viewportBox!.width + 1);
        }
        await scrollPageToTop(page);
        await page.screenshot({
          path: resolve(
            outputDir,
            `${route.name}-${viewport.name}-${viewport.width}px-viewport.png`,
          ),
        });
        if (route.name === "dashboard" && viewport.name === "desktop") {
          // Verify lower dashboard charts in a normal scrolled viewport as well. A
          // full-page screenshot resizes the document and can omit animated SVG series.
          await page.getByRole("heading", { name: "Sales Statistics" }).scrollIntoViewIfNeeded();
          const dashboardSalesBars = page.locator(
            ".recharts-bar-rectangle path, .recharts-bar-rectangle rect",
          );
          await expect(
            dashboardSalesBars.first(),
            `sales chart bars should render at ${viewport.width}px after scrolling into view`,
          ).toBeVisible();
          await waitForStableSvgGeometry(
            page,
            ".recharts-bar-rectangle path, .recharts-bar-rectangle rect",
          );
          expect(await dashboardSalesBars.count()).toBeGreaterThan(0);
          await page.screenshot({
            path: resolve(
              outputDir,
              `dashboard-desktop-sales-scrolled-${viewport.width}px-viewport.png`,
            ),
          });
          await scrollPageToTop(page);
        }
        if (viewport.name !== "desktop") {
          await page.screenshot({
            path: resolve(outputDir, `${route.name}-${viewport.name}-${viewport.width}px-full.png`),
            fullPage: true,
          });
        }
        viewportsSeen.push({
          ...viewport,
          documentWidth,
          noHorizontalOverflow: documentWidth <= viewport.width,
          ...(route.name === "expenses" ? { categoryChartSettled: true } : {}),
        });
      }
      if (route.name === "expenses") {
        await page.getByRole("button", { name: "Custom", exact: true }).click();
        await expect(page.getByText("Start date", { exact: true })).toBeVisible();
        await expect(page.getByText("End date", { exact: true })).toBeVisible();
        await expect(page.getByText("Revenue · Custom range", { exact: true })).toBeVisible();
        await page.screenshot({
          path: resolve(outputDir, "expenses-custom-range-mobile-viewport.png"),
        });

        await page.getByRole("button", { name: "yearly", exact: true }).click();
        await expect(page.getByText("Start date", { exact: true })).toHaveCount(0);
        await expect(page.getByText("Revenue · This year", { exact: true })).toBeVisible();
      }
      if (route.name === "ceo-gate") {
        // Verify that the denial text is reserved for an account that actually fails the
        // platform-admin check. The synthetic owner is intentionally not a platform admin.
        await page.getByRole("textbox", { name: "Platform-owner email" }).fill(owner.email);
        await page.getByLabel("Password", { exact: true }).fill("synthetic-only-password");
        await page.getByRole("button", { name: "Sign in to CEO console" }).click();
        await expect(page.getByText(/this account is not a platform administrator/i)).toBeVisible();
      }
      result.viewports = viewportsSeen;
      result.pageTitle = await page.title();
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }
    routeResults.push(result);
  }

  const metadata = {
    capturedAt: new Date().toISOString(),
    environment:
      "isolated local Vite app with fully intercepted Supabase and synthetic seeded workspace",
    productionDataTouched: false,
    routeCount: routeResults.length,
    routes: routeResults,
    pageErrors,
    consoleErrors,
    unexpectedResponses,
  };
  writeFileSync(resolve(outputDir, "metadata.json"), JSON.stringify(metadata, null, 2));
  expect(routeResults.filter((route) => route.error)).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(unexpectedResponses).toEqual([]);
  expect(routeResults).toHaveLength(17);
});

test("dashboard member metric and quick action reach the correct member workflows", async ({
  page,
}) => {
  await installSyntheticSupabase(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill(owner.email);
  await page.getByRole("textbox", { name: "Password" }).fill("synthetic-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  const tourDialog = page.getByRole("dialog", { name: "Application tour" });
  await expect(tourDialog).toBeVisible();
  const skipTourButton = page
    .locator("button")
    .filter({ hasText: /^Skip tour$/ })
    .last();
  await skipTourButton.click();
  await expect(tourDialog).toBeHidden();

  await page.locator('[data-tour="dashboard-overview"]').getByRole("link").first().click();
  await expect(page).toHaveURL(/\/members(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Member Management" })).toBeVisible();

  await page.goto("/");
  await page.getByTestId("dashboard-quick-actions-grid").waitFor();
  // The welcome tour checks localStorage after a 450 ms delay; wait past it
  // before asserting that the user's previous dismissal was persisted.
  await page.waitForTimeout(500);
  await expect(tourDialog).toHaveCount(0);
  await page
    .getByTestId("dashboard-quick-actions-grid")
    .getByRole("link", { name: "Add Member" })
    .click();
  const memberDialog = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: "Add New Member" }) });
  await expect(memberDialog.getByRole("heading", { name: "Add New Member" })).toBeVisible();
  await memberDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(memberDialog).toBeHidden();
  await expect(
    page.evaluate(() => document.documentElement.scrollWidth),
  ).resolves.toBeLessThanOrEqual(390);
});

test("global search finds no-plan members beyond the first 40 and opens their profile", async ({
  page,
}) => {
  await installSyntheticSupabase(page);
  const workspace = stateByPage.get(page);
  const baseMember = workspace?.state.members[0];
  if (!workspace || !baseMember) throw new Error("Synthetic search workspace is missing a member.");

  const fillers = Array.from({ length: 50 }, (_, index) => ({
    ...baseMember,
    id: `global-search-filler-${index}`,
    name: `Global Search Filler ${index}`,
    email: `global-search-filler-${index}@example.invalid`,
    phone: `980009${String(index).padStart(4, "0")}`,
    deletedAt: null,
  }));
  const noPlanMember = {
    ...baseMember,
    id: "global-search-no-plan-sabita",
    name: "Sabita Thimal",
    email: "sabita.thimal@example.invalid",
    phone: "9800012345",
    deletedAt: null,
  };
  workspace.state.members = [...fillers, noPlanMember, ...workspace.state.members];

  await page.addInitScript((email) => {
    window.localStorage.setItem(`ironvault.app-tour.v1.${email.toLowerCase()}`, "done");
  }, owner.email);
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill(owner.email);
  await page.getByRole("textbox", { name: "Password" }).fill("synthetic-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole("button", { name: "Search members, products, and invoices" }).click();
  const searchInput = page.getByPlaceholder("Search members, products, invoices, pages…");
  await searchInput.fill("Sabita Thimal");
  const result = page.getByRole("option", { name: /Sabita Thimal/ });
  await expect(result).toBeVisible();
  await result.click();

  await expect(page).toHaveURL(/\/members\/global-search-no-plan-sabita/);
  await expect(page.getByRole("heading", { name: "Sabita Thimal" })).toBeVisible();
  await expect(page.getByText("No active membership", { exact: true })).toBeVisible();
});

test("member roster names open the same profile as the view action", async ({ page }) => {
  await installSyntheticSupabase(page);
  const workspace = stateByPage.get(page);
  const member = workspace?.state.members.find(
    (candidate) => candidate.type !== "walk_in" && !candidate.deletedAt,
  );
  if (!member) throw new Error("Synthetic workspace is missing a registered member.");

  await page.addInitScript((email) => {
    window.localStorage.setItem(`ironvault.app-tour.v1.${email.toLowerCase()}`, "done");
  }, owner.email);
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill(owner.email);
  await page.getByRole("textbox", { name: "Password" }).fill("synthetic-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  const profileLinkName = `Open member profile for ${member.name}`;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/members");
  const memberRow = page.locator("table tbody tr").filter({ hasText: member.name });
  const nameLink = memberRow.getByRole("link", { name: profileLinkName });
  const viewLink = memberRow.getByRole("link", { name: "View profile" });
  await expect(nameLink).toBeVisible();
  await expect(nameLink).toHaveAttribute("href", await viewLink.getAttribute("href"));
  await nameLink.click();
  await expect(page).toHaveURL(new RegExp(`/members/${member.id}(?:\\?|$)`));
  await expect(page.getByRole("heading", { name: member.name })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/members");
  const memberCard = page.locator("article").filter({ hasText: member.name }).first();
  const mobileNameLink = memberCard.getByRole("link", { name: profileLinkName });
  const mobileViewLink = memberCard.getByRole("link", { name: "View" });
  await expect(mobileNameLink).toBeVisible();
  await expect(mobileNameLink).toHaveAttribute("href", await mobileViewLink.getAttribute("href"));
  await mobileNameLink.click();
  await expect(page).toHaveURL(new RegExp(`/members/${member.id}(?:\\?|$)`));
  await expect(page.getByRole("heading", { name: member.name })).toBeVisible();
});

test("member roster shows last visits and filters members with no visit in 30 days", async ({
  page,
}) => {
  await installSyntheticSupabase(page);
  const workspace = stateByPage.get(page);
  const baseMember = workspace?.state.members.find(
    (candidate) => candidate.type !== "walk_in" && !candidate.deletedAt,
  );
  if (!workspace || !baseMember) throw new Error("Synthetic workspace is missing a member.");

  const dateDaysAgo = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const members = ["Never", "Stale", "Recent"].map((kind) => ({
    ...baseMember,
    id: `last-visit-${kind.toLowerCase()}-qa`,
    name: `${kind} Visit QA Member`,
    email: `${kind.toLowerCase()}.visit.qa@example.invalid`,
    phone: `980001${kind.length}234`,
    type: "member" as const,
    deletedAt: null,
  }));
  workspace.state.members.push(...members);
  const attendanceFor = (member: (typeof members)[number], daysAgo: number) => {
    const date = dateDaysAgo(daysAgo);
    return {
      id: `${date}:${member.id}`,
      memberId: member.id,
      memberName: member.name,
      memberPhone: member.phone,
      shift: member.shift ?? null,
      date,
      checkedInAt: `${date}T12:00:00.000Z`,
    };
  };
  workspace.state.attendance = [attendanceFor(members[1], 38), attendanceFor(members[2], 7)];

  await page.addInitScript((email) => {
    window.localStorage.setItem(`ironvault.app-tour.v1.${email.toLowerCase()}`, "done");
  }, owner.email);
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill(owner.email);
  await page.getByRole("textbox", { name: "Password" }).fill("synthetic-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/members");

  const search = page.getByPlaceholder("Search by name, phone or email");
  await search.fill("Never Visit QA Member");
  const neverVisitRow = page.locator("table tbody tr").filter({ hasText: "Never Visit QA Member" });
  await expect(neverVisitRow).toContainText("Last visit: No visits yet");
  await page.getByRole("button", { name: "No visit · 30 days" }).click();
  await expect(neverVisitRow).toBeVisible();

  await search.fill("Stale Visit QA Member");
  const staleVisitRow = page.locator("table tbody tr").filter({ hasText: "Stale Visit QA Member" });
  await expect(staleVisitRow).toContainText("Last visit:");
  await expect(staleVisitRow).not.toContainText("No visits yet");

  await search.fill("Recent Visit QA Member");
  await expect(page.getByText("No people found")).toBeVisible();
});

test("member profiles no longer expose body measurements", async ({ page }) => {
  await installSyntheticSupabase(page);
  const workspace = stateByPage.get(page);
  if (!workspace) throw new Error("Synthetic workspace is missing.");
  const member = workspace.state.members.find(
    (candidate) =>
      candidate.type !== "walk_in" &&
      !candidate.deletedAt &&
      dueFor(workspace.state, candidate.id) > 0 &&
      workspace.state.sales.some((sale) => sale.memberId === candidate.id),
  );
  if (!member) throw new Error("Synthetic workspace is missing a registered member.");
  const sale = workspace.state.sales.find((item) => item.memberId === member.id);
  if (!sale) throw new Error("Synthetic workspace is missing a member product sale.");
  const salePayment = workspace.state.payments.find((item) => item.saleId === sale.id);
  if (!salePayment) throw new Error("Synthetic workspace is missing its product payment.");
  sale.paid = Math.max(0, sale.total - 10);
  salePayment.amount = sale.paid;

  await page.addInitScript((email) => {
    window.localStorage.setItem(`ironvault.app-tour.v1.${email.toLowerCase()}`, "done");
  }, owner.email);
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill(owner.email);
  await page.getByRole("textbox", { name: "Password" }).fill("synthetic-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto(`/members/${member.id}?tab=measurements`);
  await expect(page.getByRole("heading", { name: member.name })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Body Measurements" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Progress Notes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Membership History" })).toBeVisible();
  await expect(page.getByText(/^Due /).first()).toBeVisible();
  await expect(page.getByText(/Balance/)).toHaveCount(0);

  await page.goto(`/members/${member.id}?tab=purchases`);
  await expect(page.getByRole("heading", { name: "Product Purchases" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Due", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Balance", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Collect due" })).toBeVisible();

  await page.goto("/payments");
  await page.getByRole("button", { name: "Pending payments", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "Due", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Balance", exact: true })).toHaveCount(0);

  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Membership dues collected" })).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Due Aging" })).toBeVisible();
  expect(member.measurements).toBeDefined();
});

test("dashboard navigation stays responsive with a production-sized roster", async ({ page }) => {
  test.setTimeout(60_000);
  await installSyntheticSupabase(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const workspace = stateByPage.get(page);
  if (!workspace) throw new Error("Synthetic performance workspace was not initialized.");

  const now = new Date();
  const timestamp = now.toISOString();
  const endDate = new Date(now.getTime() + 365 * 86_400_000).toISOString();
  const baseMember = workspace.state.members[0];
  const plan = workspace.state.plans.find((item) => item.active);
  if (!baseMember || !plan)
    throw new Error("Performance fixture requires a member and active plan.");

  const count = 1105;
  workspace.state.members = Array.from({ length: count }, (_, index) => ({
    ...baseMember,
    id: `dashboard-perf-member-${index}`,
    name: `Dashboard QA Member ${index}`,
    email: `dashboard-perf-${index}@example.invalid`,
    phone: `980000${String(index).padStart(4, "0")}`,
    type: "member",
    joinDate: timestamp,
    notes: [],
    measurements: [],
    deletedAt: null,
  }));
  workspace.state.memberships = workspace.state.members.map((member, index) => ({
    id: `dashboard-perf-membership-${index}`,
    memberId: member.id,
    planId: plan.id,
    startDate: timestamp,
    endDate,
    price: 1000,
    discount: 0,
    joiningFee: 0,
    frozen: false,
    createdAt: timestamp,
  }));
  workspace.state.payments = workspace.state.memberships.map((membership, index) => ({
    id: `dashboard-perf-payment-${index}`,
    invoiceNo: `INV-DASHBOARD-PERF-${index}`,
    memberId: membership.memberId,
    membershipId: membership.id,
    kind: "membership",
    amount: 500,
    method: "cash",
    date: timestamp,
    note: "Synthetic performance-only payment",
  }));
  workspace.state.sales = [];

  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill(owner.email);
  await page.getByRole("textbox", { name: "Password" }).fill("synthetic-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  const tourDialog = page.getByRole("dialog", { name: "Application tour" });
  await expect(tourDialog).toBeVisible();
  const skipTour = page
    .locator("button")
    .filter({ hasText: /^Skip tour$/ })
    .last();
  await skipTour.waitFor({ state: "visible" });
  await skipTour.click();
  await expect(tourDialog).toHaveCount(0);

  await page.goto("/members");
  await expect(page.getByRole("heading", { name: "Member Management" })).toBeVisible();
  await expect(page.locator("table tbody tr")).toHaveCount(25);
  await expect(page.getByText("Showing 1–25 of 1105")).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.locator("table tbody tr")).toHaveCount(25);
  await expect(page.getByText("Showing 26–50 of 1105")).toBeVisible();
  await page.getByRole("button", { name: "Previous page" }).click();
  await expect(page.getByText("Showing 1–25 of 1105")).toBeVisible();
  await page.evaluate(() => performance.mark("dashboard-navigation-start"));
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  const elapsed = await page.evaluate(() => {
    performance.mark("dashboard-navigation-ready");
    return performance.measure(
      "dashboard-navigation",
      "dashboard-navigation-start",
      "dashboard-navigation-ready",
    ).duration;
  });
  console.log(`Dashboard mount after navigation with ${count} members: ${elapsed.toFixed(1)} ms`);
  expect(elapsed, "dashboard calculations should not block route navigation").toBeLessThan(1500);
});

test("member registration supports past membership dates and an explicit no-plan member", async ({
  page,
}) => {
  test.setTimeout(30_000);
  await installSyntheticSupabase(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill(owner.email);
  await page.getByRole("textbox", { name: "Password" }).fill("synthetic-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  const tourDialog = page.getByRole("dialog", { name: "Application tour" });
  await expect(tourDialog).toBeVisible();
  const skipTourButton = page
    .locator("button")
    .filter({ hasText: /^Skip tour$/ })
    .last();
  await skipTourButton.click();
  await expect(tourDialog).toBeHidden();
  await page.goto("/members");
  await expect(page.getByRole("heading", { name: "Member Management" })).toBeVisible();

  const enterPersonalDetails = async (name: string) => {
    await page.getByRole("button", { name: "Add Member" }).last().click();
    const dialog = page
      .getByRole("dialog")
      .filter({ has: page.getByRole("heading", { name: "Add New Member" }) });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox").first().fill(name);
    await dialog
      .getByRole("textbox", { name: /Phone number after/ })
      .first()
      .fill("9812345678");

    await dialog.getByRole("button", { name: "Date of birth" }).click();
    await page.getByRole("button", { name: /previous month/i }).click();
    await page.getByRole("grid").getByRole("gridcell").getByRole("button").first().click();
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    return dialog;
  };

  const plannedMemberName = "QA Historical Start Member";
  const plannedDialog = await enterPersonalDetails(plannedMemberName);
  const plan = sampleState.plans.find((item) => !item.deletedAt);
  expect(plan).toBeTruthy();
  await plannedDialog.getByRole("combobox").first().click();
  await page.getByRole("option", { name: new RegExp(plan!.name) }).click();

  await plannedDialog.getByRole("button", { name: "Membership start date" }).click();
  await page.getByRole("button", { name: /previous month/i }).click();
  const firstPastDay = page.getByRole("grid").getByRole("gridcell").getByRole("button").first();
  await expect(firstPastDay).toBeEnabled();
  await firstPastDay.click();
  await plannedDialog.getByRole("button", { name: "Add member" }).click();
  await expect(plannedDialog).toBeHidden();
  await expect(page.getByText(`${plannedMemberName} added to the roster`)).toBeVisible();

  const workspace = stateByPage.get(page);
  expect(workspace).toBeTruthy();
  await expect
    .poll(() => workspace!.state.members.some((member) => member.name === plannedMemberName))
    .toBe(true);
  const plannedMember = workspace!.state.members.find(
    (member) => member.name === plannedMemberName,
  );
  const historicalTerm = workspace!.state.memberships.find(
    (membership) => membership.memberId === plannedMember?.id,
  );
  expect(historicalTerm).toBeTruthy();
  expect(new Date(historicalTerm!.startDate).getTime()).toBeLessThan(Date.now());

  const noPlanMemberName = "QA No Plan Member";
  const noPlanDialog = await enterPersonalDetails(noPlanMemberName);
  await noPlanDialog.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "No plan — assign membership later" }).click();
  await expect(noPlanDialog.getByText(/added without a membership plan/i)).toBeVisible();
  await noPlanDialog.getByRole("button", { name: "Add member" }).click();
  await expect(noPlanDialog).toBeHidden();
  await expect(page.getByText(`${noPlanMemberName} added to the roster`)).toBeVisible();

  await expect
    .poll(() => workspace!.state.members.some((member) => member.name === noPlanMemberName))
    .toBe(true);
  const noPlanMember = workspace!.state.members.find((member) => member.name === noPlanMemberName);
  expect(noPlanMember).toBeTruthy();
  expect(workspace!.state.memberships.some((item) => item.memberId === noPlanMember?.id)).toBe(
    false,
  );
  expect(workspace!.state.payments.some((item) => item.memberId === noPlanMember?.id)).toBe(false);
});

function linkedMemberRecordIds(state: typeof sampleState, memberId: string) {
  const membershipIds = new Set(
    state.memberships.filter((membership) => membership.memberId === memberId).map(({ id }) => id),
  );
  const saleIds = new Set(
    state.sales.filter((sale) => sale.memberId === memberId).map(({ id }) => id),
  );
  return {
    memberships: [...membershipIds].sort(),
    sales: [...saleIds].sort(),
    attendance: state.attendance
      .filter((record) => record.memberId === memberId)
      .map(({ id }) => id)
      .sort(),
    payments: state.payments
      .filter(
        (payment) =>
          payment.memberId === memberId ||
          membershipIds.has(payment.membershipId ?? "") ||
          saleIds.has(payment.saleId ?? ""),
      )
      .map(({ id }) => id)
      .sort(),
  };
}

test("synthetic Trash lifecycle preserves restore, cancel, and permanent-delete safeguards", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const outputDir = resolve(
    process.cwd(),
    "qa/ironvault/application-wide",
    `round-5-trash-lifecycle-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  mkdirSync(outputDir, { recursive: true });

  await installSyntheticSupabase(page);
  const workspace = stateByPage.get(page);
  expect(workspace).toBeDefined();
  if (!workspace) throw new Error("Synthetic workspace was not installed.");

  const [restoreTarget, deleteTarget] = workspace.state.members.slice(0, 2);
  expect(restoreTarget).toBeDefined();
  expect(deleteTarget).toBeDefined();
  if (!restoreTarget || !deleteTarget)
    throw new Error("Trash lifecycle needs two synthetic members.");

  const deletedAt = "2026-10-15T08:00:00.000Z";
  for (const member of [restoreTarget, deleteTarget]) {
    member.deletedAt = deletedAt;
    member.deletedBy = "Synthetic QA fixture";
    workspace.state.attendance.push({
      id: `qa-attendance-${member.id}`,
      memberId: member.id,
      memberName: member.name,
      memberPhone: member.phone,
      shift: "morning",
      date: "2026-10-15",
      checkedInAt: deletedAt,
      deletedAt,
      deletedBy: "Synthetic QA fixture",
    });
  }

  const [planTarget] = workspace.state.plans;
  const [productTarget] = workspace.state.products;
  const [expenseTarget] = workspace.state.expenses;
  expect(planTarget).toBeDefined();
  expect(productTarget).toBeDefined();
  expect(expenseTarget).toBeDefined();
  if (!planTarget || !productTarget || !expenseTarget) {
    throw new Error("Trash detail coverage needs a plan, product, and expense.");
  }
  planTarget.deletedAt = deletedAt;
  productTarget.deletedAt = deletedAt;
  expenseTarget.deletedAt = deletedAt;
  workspace.state.sales.push({
    id: "qa-sale-for-deleted-member",
    invoiceNo: "QA-INV-TRASH-001",
    productId: productTarget.id,
    productName: productTarget.name,
    qty: 2,
    unitPrice: productTarget.price,
    unitCost: productTarget.cost,
    total: productTarget.price * 2,
    paid: productTarget.price,
    buyer: restoreTarget.name,
    memberId: restoreTarget.id,
    date: deletedAt,
  });
  workspace.state.payments.push({
    id: "qa-payment-for-deleted-member-sale",
    invoiceNo: "QA-PAY-TRASH-001",
    memberId: restoreTarget.id,
    saleId: "qa-sale-for-deleted-member",
    kind: "product",
    amount: productTarget.price,
    method: "cash",
    date: deletedAt,
    note: "Synthetic Trash detail payment",
  });

  const restoreRecordsBefore = linkedMemberRecordIds(workspace.state, restoreTarget.id);
  const deleteRecordsBefore = linkedMemberRecordIds(workspace.state, deleteTarget.id);
  expect(restoreRecordsBefore.memberships.length).toBeGreaterThan(0);
  expect(restoreRecordsBefore.payments.length).toBeGreaterThan(0);
  expect(deleteRecordsBefore.memberships.length).toBeGreaterThan(0);
  expect(deleteRecordsBefore.payments.length).toBeGreaterThan(0);
  expect(restoreRecordsBefore.attendance).toEqual([`qa-attendance-${restoreTarget.id}`]);
  expect(deleteRecordsBefore.attendance).toEqual([`qa-attendance-${deleteTarget.id}`]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill(owner.email);
  await page.getByRole("textbox", { name: "Password" }).fill("synthetic-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("link", { name: "Trash" })).toBeVisible();

  const tourDialog = page.getByRole("dialog", { name: "Application tour" });
  await expect(tourDialog).toBeVisible();
  await tourDialog.getByRole("button", { name: "Skip tour" }).last().click();
  await expect(tourDialog).toBeHidden();

  await page.goto("/trash");
  await expect(page.getByRole("heading", { name: "Deleted Members", exact: true })).toBeVisible();
  const restoreCard = page
    .locator("article")
    .filter({ hasText: restoreTarget.name })
    .filter({ hasText: /days left/ });
  await expect(restoreCard).toBeVisible();
  await page.screenshot({ path: resolve(outputDir, "mobile-populated-trash.png"), fullPage: true });

  await restoreCard
    .getByRole("button", { name: `View deleted-record details for ${restoreTarget.name}` })
    .click();
  let detailsDialog = page.getByRole("dialog", { name: restoreTarget.name });
  await expect(detailsDialog.getByRole("heading", { name: "Membership history" })).toBeVisible();
  await expect(detailsDialog.getByRole("heading", { name: "Product purchases" })).toBeVisible();
  await expect(detailsDialog.getByRole("heading", { name: "Payments" })).toBeVisible();
  await expect(detailsDialog.getByText("QA-INV-TRASH-001")).toBeVisible();
  await expect(detailsDialog.getByText(productTarget.name).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detailsDialog).toBeHidden();

  const attendanceDetailsButton = page
    .getByRole("button", { name: `View deleted-record details for ${restoreTarget.name}` })
    .last();
  await attendanceDetailsButton.click();
  detailsDialog = page.getByRole("dialog", { name: `${restoreTarget.name} · Attendance` });
  await expect(detailsDialog.getByText("morning", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detailsDialog).toBeHidden();

  await page
    .getByRole("button", { name: `View deleted-record details for ${planTarget.name}` })
    .click();
  detailsDialog = page.getByRole("dialog", { name: planTarget.name });
  await expect(
    detailsDialog.getByRole("heading", { name: "Membership records using this plan" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detailsDialog).toBeHidden();

  await page
    .getByRole("button", { name: `View deleted-record details for ${productTarget.name}` })
    .click();
  detailsDialog = page.getByRole("dialog", { name: productTarget.name });
  await expect(detailsDialog.getByRole("heading", { name: "Recorded sales" })).toBeVisible();
  await expect(detailsDialog.getByText("QA-INV-TRASH-001")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detailsDialog).toBeHidden();

  await page
    .getByRole("button", { name: `View deleted-record details for ${expenseTarget.title}` })
    .click();
  detailsDialog = page.getByRole("dialog", { name: expenseTarget.title });
  await expect(detailsDialog.getByRole("heading", { name: "Expense information" })).toBeVisible();
  await expect(detailsDialog.getByText(expenseTarget.expenseNo)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detailsDialog).toBeHidden();

  const revisionBeforeRestore = workspace.revision;
  await restoreCard.getByRole("button", { name: /Restore/ }).click();
  await expect
    .poll(() => workspace.state.members.find(({ id }) => id === restoreTarget.id)?.deletedAt)
    .toBeNull();
  await expect.poll(() => workspace.revision).toBeGreaterThan(revisionBeforeRestore);
  expect(linkedMemberRecordIds(workspace.state, restoreTarget.id)).toEqual(restoreRecordsBefore);
  await expect(restoreCard).toHaveCount(0);

  await page.setViewportSize({ width: 1440, height: 1000 });
  const deleteRow = page
    .locator("table")
    .first()
    .locator("tbody tr")
    .filter({ hasText: deleteTarget.name });
  await expect(deleteRow).toBeVisible();
  const revisionBeforeCancel = workspace.revision;
  await deleteRow.getByRole("button", { name: /Delete forever/ }).click();

  let dialog = page.getByRole("dialog");
  const deleteButton = dialog.getByRole("button", { name: "Delete permanently" });
  await expect(deleteButton).toBeDisabled();
  await page.screenshot({ path: resolve(outputDir, "desktop-delete-confirmation-locked.png") });
  await dialog.getByPlaceholder("DELETE").fill("delete");
  await expect(deleteButton).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(workspace.state.members.some(({ id }) => id === deleteTarget.id)).toBe(true);
  expect(workspace.revision).toBe(revisionBeforeCancel);
  expect(linkedMemberRecordIds(workspace.state, deleteTarget.id)).toEqual(deleteRecordsBefore);

  await deleteRow.getByRole("button", { name: /Delete forever/ }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("DELETE").fill("DELETE");
  const revisionBeforeDelete = workspace.revision;
  await expect(dialog.getByRole("button", { name: "Delete permanently" })).toBeEnabled();
  await page.screenshot({ path: resolve(outputDir, "desktop-delete-confirmation-unlocked.png") });
  await dialog.getByRole("button", { name: "Delete permanently" }).click();

  await expect.poll(() => workspace.revision).toBeGreaterThan(revisionBeforeDelete);
  await expect
    .poll(() => workspace.state.members.some(({ id }) => id === deleteTarget.id))
    .toBe(false);
  expect(linkedMemberRecordIds(workspace.state, deleteTarget.id)).toEqual({
    memberships: [],
    sales: [],
    attendance: [],
    payments: [],
  });
  expect(linkedMemberRecordIds(workspace.state, restoreTarget.id)).toEqual(restoreRecordsBefore);
  await expect(page.getByText(deleteTarget.name, { exact: true })).toHaveCount(0);
  await expect(page.getByText("No deleted members", { exact: true })).toBeVisible();
  await page.screenshot({
    path: resolve(outputDir, "desktop-trash-after-delete.png"),
    fullPage: true,
  });

  testInfo.annotations.push({
    type: "synthetic-workspace",
    description:
      "All member, membership, payment, sale, and attendance changes were intercepted and persisted only in the isolated Playwright fixture.",
  });
});

test("synthetic Settings backup restore and receptionist access workflows", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const outputDir = resolve(
    process.cwd(),
    "qa/ironvault/application-wide",
    `round-5-settings-workflows-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  mkdirSync(outputDir, { recursive: true });

  await installSyntheticSupabase(page);
  const workspace = stateByPage.get(page);
  expect(workspace).toBeDefined();
  if (!workspace) throw new Error("Synthetic workspace was not installed.");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill(owner.email);
  await page.getByRole("textbox", { name: "Password" }).fill("synthetic-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();

  const tourDialog = page.getByRole("dialog", { name: "Application tour" });
  await expect(tourDialog).toBeVisible();
  await tourDialog.getByRole("button", { name: "Skip tour" }).last().click();
  await expect(tourDialog).toBeHidden();

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  const backupPanel = page.getByRole("button", { name: /Backup & Restore/ });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(backupPanel).toHaveAttribute("aria-expanded", "false");
  await page.screenshot({ path: resolve(outputDir, "mobile-settings-panels.png"), fullPage: true });
  await backupPanel.click();
  await expect(page.getByRole("button", { name: "Export backup" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore backup" })).toBeVisible();
  await waitForViewportTransitions(page);
  await page.screenshot({ path: resolve(outputDir, "mobile-backup-controls.png"), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await waitForViewportTransitions(page);
  await expect(backupPanel).toHaveAttribute("aria-expanded", "true");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^ironvault-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const backupPath = await download.path();
  expect(backupPath).not.toBeNull();
  if (!backupPath) throw new Error("Backup export did not produce a file.");
  const exportedBackup = JSON.parse(readFileSync(backupPath, "utf8")) as typeof sampleState;
  expect(exportedBackup.settings.gymName).toBe("IRONVAULT");
  expect(exportedBackup.members.length).toBeGreaterThan(0);
  for (const collection of [
    "members",
    "plans",
    "memberships",
    "payments",
    "attendance",
    "products",
    "sales",
    "expenses",
    "inquiries",
  ] as const) {
    expect(exportedBackup[collection]).toEqual(workspace.state[collection]);
  }
  expect(exportedBackup.auth.passwordHash).toBe(workspace.state.auth.passwordHash);
  await expect(page.getByText("Backup downloaded", { exact: true })).toBeHidden();
  await page.screenshot({
    path: resolve(outputDir, "desktop-backup-controls.png"),
    fullPage: true,
  });

  const restoredBackup = structuredClone(exportedBackup);
  restoredBackup.settings.gymName = "QA Restored Gym";
  const revisionBeforeRestore = workspace.revision;
  await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
    name: "qa-valid-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(restoredBackup)),
  });
  await expect(page.getByText("Backup restored", { exact: true })).toBeVisible();
  await expect.poll(() => workspace.state.settings.gymName).toBe("QA Restored Gym");
  await expect.poll(() => workspace.revision).toBeGreaterThan(revisionBeforeRestore);
  expect(workspace.state).toEqual(restoredBackup);
  await expect(
    page.getByText("Gym name", { exact: true }).locator("..").locator("input"),
  ).toHaveValue("QA Restored Gym");
  await expect(page.getByText("Backup restored", { exact: true })).toBeHidden();
  await page.screenshot({
    path: resolve(outputDir, "desktop-backup-restored.png"),
    fullPage: true,
  });

  const invalidBackup = structuredClone(restoredBackup);
  const firstMembership = invalidBackup.memberships[0];
  expect(firstMembership).toBeDefined();
  if (!firstMembership) throw new Error("Backup validation needs a synthetic membership.");
  invalidBackup.memberships[0] = { ...firstMembership, memberId: "missing-synthetic-member" };
  const revisionBeforeInvalidRestore = workspace.revision;
  const stateBeforeInvalidRestore = structuredClone(workspace.state);
  await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
    name: "qa-invalid-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalidBackup)),
  });
  await expect(page.getByText("Could not read that file", { exact: true })).toBeVisible();
  expect(workspace.state).toEqual(stateBeforeInvalidRestore);
  expect(workspace.revision).toBe(revisionBeforeInvalidRestore);
  const invalidRestoreToast = page
    .locator("[data-sonner-toast]")
    .filter({ hasText: "Could not read that file" });
  await expect(invalidRestoreToast).toBeVisible();
  await waitForViewportTransitions(page);
  await invalidRestoreToast.screenshot({
    path: resolve(outputDir, "desktop-invalid-backup-rejected.png"),
  });
  await expect(page.getByText("Could not read that file", { exact: true })).toBeHidden();

  const staffPanel = page.getByRole("button", { name: /Staff Access/ });
  await expect(staffPanel).toHaveAttribute("aria-expanded", "true");
  await page.screenshot({
    path: resolve(outputDir, "desktop-staff-access-form.png"),
    fullPage: true,
  });
  await page.getByLabel("Receptionist name").fill("QA Front Desk");
  await page.getByLabel("Login email").fill("qa-front-desk@example.invalid");
  await page.getByLabel("Receptionist password").fill("Synthetic-QA-Password-2026!");
  await page.getByLabel("Confirm password").fill("Synthetic-QA-Password-mismatch!");
  await page.getByRole("button", { name: "Save receptionist" }).click();
  await expect(page.getByText("Receptionist passwords do not match.")).toBeVisible();
  expect(workspace.receptionistSaves).toHaveLength(0);
  await page.screenshot({ path: resolve(outputDir, "desktop-staff-password-validation.png") });

  await page.getByLabel("Confirm password").fill("Synthetic-QA-Password-2026!");
  const enableReceptionist = page.getByRole("switch", { name: "Enable receptionist account" });
  await expect(enableReceptionist).toHaveAttribute("aria-checked", "false");
  await enableReceptionist.click();
  const reportsPermission = page.getByRole("switch", { name: "Reports" });
  await expect(reportsPermission).toHaveAttribute("aria-checked", "false");
  await reportsPermission.click();
  await expect(reportsPermission).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Save receptionist" }).click();
  const savedDialog = page.getByRole("dialog", { name: "Receptionist saved successfully" });
  await expect(savedDialog).toBeVisible();
  await expect(savedDialog.getByText("qa-front-desk@example.invalid")).toBeVisible();
  expect(workspace.receptionistSaves).toHaveLength(1);
  expect(workspace.receptionistSaves[0]).toMatchObject({
    enabled: true,
    name: "QA Front Desk",
    email: "qa-front-desk@example.invalid",
    passwordProvided: true,
  });
  expect(workspace.receptionistSaves[0]?.permissions.reports).toBe(true);
  await waitForViewportTransitions(page);
  await page.screenshot({ path: resolve(outputDir, "desktop-staff-access-saved.png") });
  await savedDialog.getByRole("button", { name: "Done" }).click();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByText("Receptionist password saved", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Gym name", { exact: true }).locator("..").locator("input"),
  ).toHaveValue("QA Restored Gym");
  await expect(page.getByRole("switch", { name: "Reports" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect.poll(() => workspace.receptionist?.email).toBe("qa-front-desk@example.invalid");
  await page.screenshot({
    path: resolve(outputDir, "desktop-staff-access-after-reload.png"),
    fullPage: true,
  });

  const postStaffBackupDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup" }).click();
  const postStaffBackup = await postStaffBackupDownload;
  const postStaffBackupPath = await postStaffBackup.path();
  expect(postStaffBackupPath).not.toBeNull();
  if (!postStaffBackupPath) throw new Error("Post-staff backup export did not produce a file.");
  const postStaffBackupContents = readFileSync(postStaffBackupPath, "utf8");
  const exportedWithStaff = JSON.parse(postStaffBackupContents) as typeof sampleState;
  expect(exportedWithStaff.staff?.receptionist?.passwordHash).toBe("cloud-managed");
  expect(postStaffBackupContents).not.toContain("Synthetic-QA-Password-2026!");

  writeFileSync(
    resolve(outputDir, "settings-workflow-evidence.json"),
    JSON.stringify(
      {
        route: "/settings",
        timestamp: new Date().toISOString(),
        viewports: [
          { name: "desktop", width: 1440, height: 1000 },
          { name: "mobile", width: 390, height: 844 },
        ],
        checks: [
          "mobile backup panel starts collapsed and opens on demand",
          "backup exports a valid JSON workspace snapshot",
          "backup deep-compares all seeded business record collections and preserves the seed auth hash",
          "valid backup replaces the isolated synthetic workspace and persists the complete restored state through the mocked workspace RPC",
          "broken member references are rejected without changing any workspace state or revision",
          "receptionist password mismatch is rejected before any Edge Function request",
          "selected receptionist access settings reach the mocked Edge Function and reappear after a synthetic reload",
          "re-exported backup uses only the cloud-managed credential sentinel and excludes the entered password",
        ],
        networkIsolation:
          "All Supabase requests were intercepted at application-wide-qa.supabase.co.",
        productionDataTouched: false,
      },
      null,
      2,
    ),
  );
  testInfo.annotations.push({
    type: "synthetic-workspace",
    description:
      "Backup/restore and receptionist workflows used intercepted test fixtures only; no production data, account or email was touched.",
  });
});

test("membership renewal lets an owner choose and records a custom start date", async ({
  page,
}) => {
  const member = sampleState.members.find((item) => !item.deletedAt);
  const plan = sampleState.plans.find((item) => !item.deletedAt);
  expect(member, "the synthetic workspace needs a regular member").toBeTruthy();
  expect(plan, "the synthetic workspace needs an active membership plan").toBeTruthy();
  if (!member || !plan) return;

  await installSyntheticSupabase(page);
  await page.addInitScript((email) => {
    window.localStorage.setItem(`ironvault.app-tour.v1.${email.toLowerCase()}`, "done");
  }, owner.email);
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill(owner.email);
  await page.getByRole("textbox", { name: "Password" }).fill("synthetic-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();

  await page.goto(`/members/${member.id}`);
  await expect(page.getByRole("button", { name: "Renew", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Renew", exact: true }).click();
  const renewalDialog = page.getByRole("dialog");
  await expect(renewalDialog.getByRole("heading", { name: "Renew Membership" })).toBeVisible();
  const startDateButton = renewalDialog.getByRole("button", { name: "Membership start date" });
  await expect(startDateButton).toBeVisible();

  await renewalDialog.getByRole("combobox").first().click();
  await page.getByRole("option", { name: new RegExp(plan.name) }).click();
  await startDateButton.click();
  const calendar = page.locator('[data-slot="calendar"]');
  await expect(calendar).toBeVisible();
  await page.getByRole("button", { name: "Go to the Previous Month" }).click();
  const dayButton = calendar.getByRole("button", { name: /, \w+ 1st, \d{4}$/ }).first();
  await expect(dayButton).toBeEnabled();
  await dayButton.click();
  await expect(calendar).toBeHidden();
  await expect(renewalDialog.getByText(/Membership period:/)).toBeVisible();
  const selectedStart = (await startDateButton.innerText()).trim();

  const workspace = stateByPage.get(page);
  expect(workspace).toBeTruthy();
  const existingMembershipIds = new Set(workspace!.state.memberships.map((item) => item.id));
  await renewalDialog.getByRole("button", { name: "Confirm renewal" }).click();
  await expect(page.getByText("Membership renewed", { exact: true })).toBeVisible();
  let renewedMembership: (typeof sampleState.memberships)[number] | undefined;
  await expect
    .poll(
      () => {
        renewedMembership = workspace!.state.memberships.find(
          (item) => item.memberId === member.id && !existingMembershipIds.has(item.id),
        );
        return Boolean(renewedMembership);
      },
      { message: "the custom start date must persist in the membership-history record" },
    )
    .toBe(true);
  expect(renewedMembership).toBeTruthy();
  expect(formatShortDate(renewedMembership!.startDate)).toBe(selectedStart);
  await expect(page.getByRole("heading", { name: "Membership History" })).toBeVisible();
});

test("membership summary cards open their matching plans and roster filters", async ({ page }) => {
  await installSyntheticSupabase(page);
  await page.addInitScript((email) => {
    window.localStorage.setItem(`ironvault.app-tour.v1.${email.toLowerCase()}`, "done");
  }, owner.email);
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill(owner.email);
  await page.getByRole("textbox", { name: "Password" }).fill("synthetic-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();

  await page.goto("/memberships");
  await page.getByRole("tab", { name: /^Active plans \(/ }).click();
  await expect(page.getByRole("tab", { name: /^Active plans \(/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel").getByText("FROZEN", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("tabpanel").getByText("EXPIRED", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("tabpanel").getByText("UNASSIGNED", { exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search membership list by member name, phone or email" }).fill("no-such-member-987654");
  await expect(page.getByRole("tabpanel")).toContainText("No matching members");
  await page.getByRole("button", { name: "Clear membership search" }).click();
  const plansSection = page.locator("#membership-plans-section");
  await expect(plansSection.getByRole("button", { name: /Show .* plans/ })).toBeVisible();
  await page.getByRole("button", { name: "View active membership plans" }).click();
  await expect(plansSection).toBeInViewport();
  await expect(plansSection.getByRole("button", { name: /Hide plans/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(plansSection.getByText("Membership Plans", { exact: true })).toBeVisible();

  const statusCards = [
    { card: "View members with expiring memberships", tab: /Renewal reminders/ },
    { card: "View members with expired memberships", tab: /Expired/ },
    { card: "View members with frozen memberships", tab: /Frozen/ },
    { card: "View members without a plan", tab: /No plan/ },
  ];
  for (const { card, tab } of statusCards) {
    await page.getByRole("button", { name: card }).click();
    await expect(page.locator("#membership-roster")).toBeInViewport();
    await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
  }
});

test("product categories include S/K and support adding and renaming categories", async ({
  page,
}) => {
  await installSyntheticSupabase(page);
  const workspace = stateByPage.get(page);
  expect(workspace).toBeTruthy();
  if (!workspace) throw new Error("Synthetic workspace was not installed.");
  // Exercise default category migration for workspaces created before this feature.
  workspace.state.productCategories = undefined;

  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill(owner.email);
  await page.getByRole("textbox", { name: "Password" }).fill("synthetic-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
  const tourDialog = page.getByRole("dialog", { name: "Application tour" });
  await expect(tourDialog).toBeVisible();
  await tourDialog.getByRole("button", { name: "Skip tour" }).last().click();
  await expect(tourDialog).toBeHidden();

  await page.goto("/products");
  await page.getByRole("button", { name: "Manage categories" }).click();
  const manager = page.getByRole("dialog");
  await expect(manager.getByRole("heading", { name: "Manage product categories" })).toBeVisible();
  await expect(manager.getByText("S/K", { exact: true })).toBeVisible();

  await manager.getByRole("button", { name: "Edit category Supplements" }).click();
  await manager
    .getByRole("textbox", { name: "Rename category Supplements" })
    .fill("Sports Nutrition");
  await manager.getByRole("button", { name: "Save category" }).click();
  await expect
    .poll(
      () =>
        workspace!.state.products.filter((product) => product.category === "Sports Nutrition")
          .length,
      { message: "renaming a category must update its existing products" },
    )
    .toBe(5);

  await manager.getByRole("textbox", { name: "New category name" }).fill("Personal Care");
  await manager.getByRole("button", { name: "Add category" }).click();
  await expect(manager.getByText("Personal Care", { exact: true })).toBeVisible();
  await expect.poll(() => workspace!.state.productCategories).toContain("Personal Care");
  await manager.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Add Product" }).click();
  const productDialog = page.getByRole("dialog");
  await productDialog.getByRole("combobox").first().click();
  await expect(page.getByRole("option", { name: "S/K", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Personal Care", exact: true })).toBeVisible();
});

test("synthetic Gym Profile uploads, displays and removes a private gym logo", async ({ page }) => {
  test.setTimeout(60_000);
  await installSyntheticSupabase(page);
  const workspace = stateByPage.get(page);
  expect(workspace).toBeDefined();
  if (!workspace) throw new Error("Synthetic workspace was not installed.");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill(owner.email);
  await page.getByRole("textbox", { name: "Password" }).fill("synthetic-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const tourDialog = page.getByRole("dialog", { name: "Application tour" });
  await expect(tourDialog).toBeVisible();
  await tourDialog.getByRole("button", { name: "Skip tour" }).last().click();
  await page.goto("/settings");

  await page.locator('input[type="file"][aria-label="Choose gym logo"]').setInputFiles({
    name: "gym-logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/3ioAAAAASUVORK5CYII=",
      "base64",
    ),
  });

  await expect
    .poll(() => workspace.state.settings.gymLogo)
    .toMatch(/^f2000000-0000-0000-0000-000000000001\/branding\/[\w-]+\.png$/);
  await expect(page.getByRole("button", { name: "Change logo" })).toBeVisible();
  await expect(page.locator('aside button[data-tour="sidebar-brand"] img')).toBeVisible();
  await expect(page.locator("aside img[alt='Gym logo']")).toBeVisible();

  await page.getByRole("button", { name: "Remove" }).click();
  await expect.poll(() => workspace.state.settings.gymLogo).toBeNull();
  await expect(page.getByRole("button", { name: "Upload logo" })).toBeVisible();
  await expect(page.locator("aside img[alt='Gym logo']")).toHaveCount(0);
});
