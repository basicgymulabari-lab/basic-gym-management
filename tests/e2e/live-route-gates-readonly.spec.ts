import { expect, test } from "@playwright/test";

const protectedRoutes = [
  "/",
  "/members",
  "/members/qa-live-route-audit",
  "/attendance",
  "/memberships",
  "/payments",
  "/products",
  "/expenses",
  "/reports",
  "/inquiries",
  "/notifications",
  "/trash",
  "/settings",
];

test("all registered gym routes are served and enforce the signed-out gate", async ({ page }, testInfo) => {
  let currentRoute = "setup";
  const pageErrors: Array<{ route: string; message: string }> = [];
  const consoleErrors: Array<{ route: string; message: string }> = [];
  const mutationRequests: string[] = [];
  const routeResults: Array<{ requested: string; status: number | null; finalPath: string }> = [];

  page.on("pageerror", (error) => pageErrors.push({ route: currentRoute, message: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push({ route: currentRoute, message: message.text() });
  });
  page.on("request", (request) => {
    if (
      /\/rest\/v1\/|\/auth\/v1\/|\/functions\/v1\//.test(request.url()) &&
      !["GET", "HEAD", "OPTIONS"].includes(request.method())
    ) {
      mutationRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });

  for (const route of protectedRoutes) {
    currentRoute = route;
    const response = await page.goto(route, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    routeResults.push({
      requested: route,
      status: response?.status() ?? null,
      finalPath: new URL(page.url()).pathname,
    });
  }

  for (const route of ["/ceo", "/ceo/demo"]) {
    currentRoute = route;
    const response = await page.goto(route, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/ceo(?:\?|$)/);
    routeResults.push({
      requested: route,
      status: response?.status() ?? null,
      finalPath: new URL(page.url()).pathname,
    });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  currentRoute = "/login (evidence capture)";
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Welcome back" }).waitFor();
  await page.screenshot({ path: testInfo.outputPath("live-login-desktop.png"), fullPage: true });

  for (const viewport of [
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    currentRoute = `/ceo (${viewport.name} evidence capture)`;
    await page.goto("/ceo", { waitUntil: "networkidle" });
    await page.screenshot({ path: testInfo.outputPath(`live-ceo-${viewport.name}.png`), fullPage: true });
  }

  await testInfo.attach("route-gate-results.json", {
    body: JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        deployment: "velvetgrip-gympro3r23re234r23423.basicgymulabari.workers.dev",
        accountSignedIn: false,
        productionDataTouched: false,
        routeResults,
        pageErrors,
        consoleErrors,
        mutationRequests,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });

  expect(routeResults).toHaveLength(15);
  expect(routeResults.every((result) => result.status === 200)).toBe(true);
  expect(routeResults.filter((result) => protectedRoutes.includes(result.requested)).every((result) => result.finalPath === "/login")).toBe(true);
  expect(routeResults.filter((result) => result.requested.startsWith("/ceo")).every((result) => result.finalPath === "/ceo")).toBe(true);
  expect(pageErrors, JSON.stringify(pageErrors, null, 2)).toEqual([]);
  expect(consoleErrors, JSON.stringify(consoleErrors, null, 2)).toEqual([]);
  expect(mutationRequests).toEqual([]);
});

test("an unknown live route remains a real 404 instead of impersonating a registered page", async ({ page }) => {
  const response = await page.goto("/qa-not-a-real-route", { waitUntil: "networkidle" });
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
});
