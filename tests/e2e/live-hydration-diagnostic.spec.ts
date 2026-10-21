import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const cases = [
  { route: "/login", viewport: { width: 1440, height: 1000 } },
  { route: "/ceo", viewport: { width: 1440, height: 1000 } },
  { route: "/ceo/demo", viewport: { width: 1440, height: 1000 } },
  { route: "/", viewport: { width: 1440, height: 1000 } },
  { route: "/members", viewport: { width: 1440, height: 1000 } },
  { route: "/ceo", viewport: { width: 768, height: 1024 } },
  { route: "/ceo", viewport: { width: 390, height: 844 } },
];

test("isolate current live hydration errors by route in fresh browser contexts", async ({ browser }, testInfo) => {
  const diagnostics: Array<{
    route: string;
    viewport: { width: number; height: number };
    status: number | null;
    finalPath: string;
    pageErrors: string[];
    consoleErrors: string[];
  }> = [];

  for (const item of cases) {
    const context = await browser.newContext({ viewport: item.viewport });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    const response = await page.goto(item.route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_000);
    diagnostics.push({
      route: item.route,
      viewport: item.viewport,
      status: response?.status() ?? null,
      finalPath: new URL(page.url()).pathname,
      pageErrors,
      consoleErrors,
    });
    if (item.route === "/ceo" || item.route === "/ceo/demo") {
      await page.screenshot({
        path: testInfo.outputPath(`${item.route.slice(1).replaceAll("/", "-")}-${item.viewport.width}.png`),
        fullPage: true,
      });
    }
    await context.close();
  }

  await testInfo.attach("hydration-route-diagnostics.json", {
    body: JSON.stringify({
      timestamp: new Date().toISOString(),
      liveWorker: "velvetgrip-gympro3r23re234r23423.basicgymulabari.workers.dev",
      productionDataTouched: false,
      diagnostics,
    }, null, 2),
    contentType: "application/json",
  });

  expect(diagnostics.every((item) => item.status === 200)).toBe(true);
  expect(diagnostics.flatMap((item) => item.pageErrors.map((message) => `${item.route} ${item.viewport.width}: ${message}`))).toEqual([]);
  expect(diagnostics.flatMap((item) => item.consoleErrors.map((message) => `${item.route} ${item.viewport.width}: ${message}`))).toEqual([]);
});

test("record errors with the actual document URL during repeated same-context route loads", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const diagnostics: Array<{ target: string; finalUrl: string; pageErrors: string[]; consoleErrors: string[] }> = [];
  const routeSequence = ["/", "/members", "/attendance", "/ceo/demo", "/login", "/ceo", "/login"];

  for (const target of routeSequence) {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const onPageError = (error: Error) => pageErrors.push(`${page.url()}: ${error.message}`);
    const onConsole = (message: import("@playwright/test").ConsoleMessage) => {
      if (message.type() === "error") consoleErrors.push(`${page.url()}: ${message.text()}`);
    };
    page.on("pageerror", onPageError);
    page.on("console", onConsole);
    await page.goto(target, { waitUntil: "networkidle" });
    await page.waitForTimeout(1_000);
    diagnostics.push({ target, finalUrl: page.url(), pageErrors, consoleErrors });
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
  }

  await writeFile(
    testInfo.outputPath("same-context-navigation-diagnostics.json"),
    JSON.stringify({ timestamp: new Date().toISOString(), diagnostics }, null, 2),
  );
  await testInfo.attach("same-context-navigation-diagnostics.json", {
    path: testInfo.outputPath("same-context-navigation-diagnostics.json"),
    contentType: "application/json",
  });
  await context.close();
});

test("identify the navigation pair that starts the live hydration warning", async ({ browser }, testInfo) => {
  const sequences = [
    { name: "CEO demo redirect then login", routes: ["/ceo/demo", "/login"] },
    { name: "direct CEO then login", routes: ["/ceo", "/login"] },
    { name: "login then CEO", routes: ["/login", "/ceo"] },
    { name: "protected route then login", routes: ["/members", "/login"] },
    { name: "login reload", routes: ["/login", "/login"] },
  ];
  const results: Array<{ sequence: string; route: string; pageErrors: string[] }> = [];

  for (const sequence of sequences) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    for (const route of sequence.routes) {
      const errors: string[] = [];
      const onPageError = (error: Error) => errors.push(`${page.url()}: ${error.message}`);
      page.on("pageerror", onPageError);
      await page.goto(route, { waitUntil: "networkidle" });
      await page.waitForTimeout(700);
      results.push({ sequence: sequence.name, route, pageErrors: errors });
      page.off("pageerror", onPageError);
    }
    await context.close();
  }

  await writeFile(
    testInfo.outputPath("hydration-navigation-pairs.json"),
    JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2),
  );
  await testInfo.attach("hydration-navigation-pairs.json", {
    path: testInfo.outputPath("hydration-navigation-pairs.json"),
    contentType: "application/json",
  });
});
