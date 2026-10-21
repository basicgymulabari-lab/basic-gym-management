import { expect, test } from "@playwright/test";
import path from "node:path";

test("attendance history search filters attendees by name and phone", async ({ page }) => {
  // The enhancement intentionally runs only on the global /attendance route;
  // about:blank fixtures bypass that route guard and hide the search control.
  await page.route("http://attendance.test/attendance", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" }),
  );
  await page.goto("http://attendance.test/attendance");
  await page.setContent(`
    <section>
      <div><h2>Attendance history</h2></div>
      <div>
        <div class="divide-y">
          <div><p>Sagar rai teacher</p><p>+977 0000000000</p><p>Shift: Morning</p></div>
          <div><p>Sabita Dhimal</p><p>+977 9800000000</p><p>Shift: Evening</p></div>
        </div>
      </div>
    </section>
  `);
  await page.addScriptTag({ path: path.resolve("public/attendance-history-search.js") });

  const search = page.getByRole("searchbox", {
    name: "Search attendance history by name or phone",
  });
  await expect(search).toBeVisible();

  const rows = page.locator(".divide-y > div");
  await search.fill("sagar rai");
  await expect(rows.nth(0)).toBeVisible();
  await expect(rows.nth(1)).toBeHidden();
  await expect(page.getByRole("status")).toHaveText("1 attendee match this search.");

  await search.fill("9800000000");
  await expect(rows.nth(0)).toBeHidden();
  await expect(rows.nth(1)).toBeVisible();

  await search.fill("no attendee");
  await expect(page.getByRole("status")).toHaveText("No attendees match this search.");

  await search.fill("");
  await expect(rows.nth(0)).toBeVisible();
  await expect(rows.nth(1)).toBeVisible();
  await expect(page.getByRole("status")).toBeHidden();
});
