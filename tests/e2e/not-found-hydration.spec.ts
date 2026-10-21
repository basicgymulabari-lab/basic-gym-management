import { expect, test, type BrowserContext } from "@playwright/test";

test("unknown routes render a responsive 404 without runtime errors", async ({ context }) => {
  // Exercise nine Worker-served states plus keyboard navigation; allow time for full-page captures.
  test.setTimeout(120_000);
  const viewports = [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ] as const;
  const routes = [
    { path: "/demo", name: "demo" },
    { path: "/qa-not-a-real-route", name: "unknown-route" },
    { path: "/ceo/not-a-real-route", name: "unknown-ceo-child" },
  ] as const;

  for (const viewport of viewports) {
    for (const route of routes) {
      const errors: string[] = [];
      const page = await openPage(context, viewport.width, viewport.height, errors);
      const responses: number[] = [];
      page.on("response", (response) => {
        if (response.request().resourceType() === "document") {
          responses.push(response.status());
        } else if (response.status() >= 400) {
          errors.push(`HTTP ${response.status()} ${response.request().resourceType()}: ${response.url()}`);
        }
      });
      await page.goto(route.path);
      expect(responses.at(-1), `${route.path} document status`).toBe(404);
      await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
      const homeLink = page.getByRole("link", { name: "Go home" });
      await expect(homeLink).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
      await page.screenshot({
        path: `qa/ironvault/not-found/round-4-http-status/${route.name}-${viewport.name}.png`,
        fullPage: true,
      });
      await page.close();

      expect(errors, `${route.path} at ${viewport.name} emitted: ${errors.join(" | ")}`).toEqual(
        [],
      );
    }
  }

  const keyboardErrors: string[] = [];
  const keyboardPage = await openPage(context, 390, 844, keyboardErrors);
  await keyboardPage.goto("/qa-not-a-real-route");
  await expect(keyboardPage.getByRole("heading", { name: "Page not found" })).toBeVisible();
  const homeLink = keyboardPage.getByRole("link", { name: "Go home" });
  await expect(homeLink).toBeVisible();
  await keyboardPage.keyboard.press("Tab");
  await expect(homeLink).toBeFocused();
  const focusRing = await homeLink.evaluate((element) => getComputedStyle(element).boxShadow);
  expect(focusRing, "Go home should have a visible keyboard focus ring").not.toBe("none");
  await keyboardPage.screenshot({
    path: "qa/ironvault/not-found/round-4-http-status/unknown-route-mobile-focused.png",
    fullPage: true,
  });
  await keyboardPage.keyboard.press("Enter");
  await expect(keyboardPage).toHaveURL(/\/login$/);
  await keyboardPage.close();
  expect(keyboardErrors, keyboardErrors.join(" | ")).toEqual([]);

  const validRouteErrors: string[] = [];
  const validRoute = await openPage(context, 1440, 1000, validRouteErrors);
  const validDocumentResponses: number[] = [];
  validRoute.on("response", (response) => {
    if (response.request().resourceType() === "document") {
      validDocumentResponses.push(response.status());
    }
  });
  await validRoute.goto("/ceo/demo");
  expect(validDocumentResponses.at(-1), "/ceo/demo document status").toBe(200);
  await expect(validRoute).toHaveURL(/\/ceo$/);
  await expect(validRoute.getByRole("heading", { name: "CEO sign in" })).toBeVisible();
  await validRoute.close();
  expect(validRouteErrors, validRouteErrors.join(" | ")).toEqual([]);
});

test("registered app routes retain successful document responses", async ({ request }) => {
  const routes = [
    "/",
    "/login",
    "/members",
    "/members/qa-synthetic-member",
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
    "/ceo",
    "/ceo/demo",
  ];

  for (const route of routes) {
    const response = await request.get(route, { headers: { accept: "text/html" } });
    expect(response.status(), `${route} should remain a valid application route`).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/html");
  }
});

async function openPage(
  context: BrowserContext,
  width: number,
  height: number,
  errors: string[],
) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("Failed to load resource: the server responded with a status of 404")
    ) {
      errors.push(`console: ${message.text()}`);
    }
  });
  return page;
}
