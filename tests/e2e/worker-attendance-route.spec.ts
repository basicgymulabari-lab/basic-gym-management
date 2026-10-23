import { expect, test } from "@playwright/test";
import { readdir } from "node:fs/promises";

test("Cloudflare Worker serves a focused sign-in shell for direct login visits", async ({
  page,
}) => {
  const response = await page.goto("/login", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);

  const headers = response?.headers() ?? {};
  expect(headers["content-type"]).toContain("text/html");
  expect(headers["content-security-policy"]).toMatch(/nonce-[A-Za-z0-9+/=_-]+/);
  expect(headers["cache-control"]).toContain("no-store");

  const html = await response!.text();
  expect(html).toContain("Sign In &amp; Sign Up — IRONVAULT Gym Management");
  expect(html).toContain(
    'property="og:title" content="Sign In &amp; Sign Up — IRONVAULT Gym Management"',
  );
  expect(html).not.toContain('property="og:title" content="Dashboard — IRONVAULT Gym Management"');
  expect(html).not.toContain("AppShell-");
  expect(html).not.toContain("StatCard-");
  const modulePreloads = [...html.matchAll(/rel="modulepreload"/g)];
  expect(modulePreloads.length).toBeLessThan(25);

  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  await expect(page.getByLabel(/email address/i)).toBeVisible();
});

test("Cloudflare Worker fallback serves the Attendance route and its assets", async ({
  page,
  request,
}) => {
  const response = await page.goto("/attendance", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);

  const headers = response?.headers() ?? {};
  expect(headers["content-type"]).toContain("text/html");
  expect(headers["content-security-policy"]).toMatch(/nonce-[A-Za-z0-9+/=_-]+/);
  expect(headers["cache-control"]).toContain("no-store");

  const html = await response!.text();
  expect(html).toContain("/attendance-history-search.js");
  const nonce = headers["content-security-policy"].match(/script-src[^;]*'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  const escapedNonce = nonce!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const [, attributes] of html.matchAll(/<script\b([^>]*)>/gi)) {
    expect(attributes).toMatch(new RegExp(`nonce=["']${escapedNonce}["']`));
  }

  const legacySearchAsset = await request.get("/attendance-history-search.js");
  expect(legacySearchAsset.status()).toBe(200);
  expect(legacySearchAsset.headers()["content-type"]).toContain("javascript");
  expect(legacySearchAsset.headers()["cache-control"]).toContain("no-store");

  const assets = await readdir("dist/client/assets");
  const attendanceChunk = assets.find((asset) => /^attendance-.*\.js$/.test(asset));
  expect(
    attendanceChunk,
    "production build should emit a lazy Attendance route chunk",
  ).toBeTruthy();
  const attendanceAsset = await request.get(`/assets/${attendanceChunk}`);
  expect(attendanceAsset.status()).toBe(200);
  expect(attendanceAsset.headers()["cache-control"]).toContain("immutable");
  expect(attendanceAsset.headers()["cache-control"]).not.toContain("no-store");
  expect(await attendanceAsset.text()).toContain("Attendance history");
});

test("retired CEO demo route redirects before app hydration", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto("/ceo/demo", { waitUntil: "networkidle" });

  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/ceo");
  expect(pageErrors).toEqual([]);
});
