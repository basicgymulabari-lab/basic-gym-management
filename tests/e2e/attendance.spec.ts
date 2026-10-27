import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AttendanceRecord, GymState } from "../../src/lib/gym/types";

const owner = {
  id: "e3000000-0000-0000-0000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "attendance-owner@example.invalid",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { full_name: "Attendance QA", gym_name: "IRONVAULT QA" },
  factors: [],
  identities: [],
  created_at: "2026-01-01T00:00:00.000Z",
};

const token = () => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    sub: owner.id,
    aud: "authenticated",
    role: "authenticated",
    email: owner.email,
    exp: 4102444800,
    iat: 1791763200,
    aal: "aal1",
    app_metadata: owner.app_metadata,
    user_metadata: owner.user_metadata,
  })}.attendance-test-signature`;
};

function response(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function testWorkspace(): GymState {
  return {
    version: 1,
    auth: { email: "", passwordHash: "" },
    staff: {},
    settings: {
      gymName: "IRONVAULT QA",
      tagline: "Strength Club",
      address: "",
      phone: "",
      email: owner.email,
      currency: "₹",
      invoicePrefix: "INV",
      lowStockAlerts: true,
      expiryReminderDays: 7,
      adminName: "Attendance QA",
      calendarSystem: "gregorian",
      phoneCountry: "nepal",
    },
    members: [
      {
        id: "member-sagar",
        type: "member",
        name: "Sagar Rai Teacher",
        email: "sagar@example.invalid",
        phone: "+977 9800000001",
        gender: "male",
        dob: "1990-01-01",
        address: "",
        photo: null,
        joinDate: "2026-01-01T00:00:00.000Z",
        emergencyContact: "",
        notes: [],
        measurements: [],
        shift: "morning",
        deletedAt: null,
      },
      {
        id: "member-sabita",
        type: "member",
        name: "Sabita Dhimal",
        email: "sabita@example.invalid",
        phone: "+977 9800000002",
        gender: "female",
        dob: "1992-02-02",
        address: "",
        photo: null,
        joinDate: "2026-01-01T00:00:00.000Z",
        emergencyContact: "",
        notes: [],
        measurements: [],
        shift: "evening",
        deletedAt: null,
      },
    ],
    plans: [],
    memberships: [],
    payments: [],
    attendance: [],
    products: [],
    sales: [],
    activities: [],
    expenses: [],
    inquiries: [],
    readNotifications: [],
    invoiceSeq: 0,
  };
}

const gymContext = {
  gym_id: "e4000000-0000-0000-0000-000000000001",
  role: "owner",
  permissions: {},
  display_name: "Attendance QA",
  email: owner.email,
  enabled: true,
  gym_name: "IRONVAULT QA",
  account_status: "active",
  subscription_status: "active",
  subscription_source: "manual",
  subscription_current_period_end: "2099-01-01T00:00:00.000Z",
  subscription_expired: false,
};

async function installMockBackend(page: Page, initialState: GymState = testWorkspace()) {
  const data: { state: GymState; revision: number } = { state: initialState, revision: 1 };
  const errors: string[] = [];
  await page.route("https://attendance-test.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const pathname = url.pathname;

    if (pathname.endsWith("/auth/v1/token")) {
      return response(route, {
        access_token: token(),
        token_type: "bearer",
        expires_in: 3600,
        expires_at: 4102444800,
        refresh_token: "attendance-test-refresh-token",
        user: owner,
      });
    }
    if (pathname.endsWith("/auth/v1/user")) return response(route, owner);
    if (pathname.endsWith("/auth/v1/logout")) return route.fulfill({ status: 204, body: "" });
    if (pathname.endsWith("/rest/v1/gym_users")) return response(route, []);
    if (pathname.endsWith("/functions/v1/staff-receptionist"))
      return response(route, { account: null });
    if (pathname.endsWith("/rest/v1/rpc/get_current_gym_context"))
      return response(route, gymContext);
    if (pathname.endsWith("/rest/v1/rpc/load_current_gym_workspace")) {
      return response(route, { ...gymContext, state: data.state, revision: data.revision });
    }
    if (pathname.endsWith("/rest/v1/rpc/save_current_gym_workspace")) {
      const args = route.request().postDataJSON() as { p_state: typeof data.state };
      data.state = args.p_state;
      data.revision += 1;
      return response(route, { revision: data.revision });
    }
    if (pathname.endsWith("/rest/v1/rpc/record_audit_event")) return response(route, {});
    if (pathname.endsWith("/rest/v1/rpc/platform_current_app_releases")) return response(route, []);

    errors.push(`${method} ${pathname}`);
    return response(route, { message: "Unhandled isolated QA backend request" }, 404);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return { data, errors };
}

function workspaceWithAttendance(): GymState {
  const workspace = testWorkspace();
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const checkedInAt = now.toISOString();
  const checkedInAtEarlier = new Date(now.getTime() - 5 * 60_000).toISOString();
  const records: AttendanceRecord[] = [
    {
      id: `${date}:member-sagar`,
      memberId: "member-sagar",
      memberName: "Sagar Rai Teacher",
      memberPhone: "+977 9800000001",
      shift: "morning",
      date,
      checkedInAt,
    },
    {
      id: `${date}:member-sabita`,
      memberId: "member-sabita",
      memberName: "Sabita Dhimal",
      memberPhone: "+977 9800000002",
      shift: "evening",
      date,
      checkedInAt: checkedInAtEarlier,
    },
  ];
  workspace.attendance = records;
  return workspace;
}

async function signIn(page: Page) {
  await page.addInitScript((email) => {
    window.localStorage.setItem(`ironvault.app-tour.v1.${email.toLowerCase()}`, "done");
  }, owner.email);
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill(owner.email);
  await page.getByRole("textbox", { name: "Password" }).fill("mock-only-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  if (await skipTour.isVisible().catch(() => false)) await skipTour.click();
}

test("attendance check-in, snapshots, search, shift filter, export and responsive layout", async ({
  page,
}) => {
  // This flow covers three viewport layouts plus search/export persistence and the
  // Members route. Keep the whole-test budget above the final hydration check.
  test.setTimeout(120_000);
  const { data, errors } = await installMockBackend(page);
  await signIn(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/attendance");
  await expect(page.getByRole("heading", { name: "Attendance", exact: true })).toBeVisible();
  const evidenceRound = `round-3-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const evidenceDir = path.resolve("qa/ironvault/attendance", evidenceRound);
  await mkdir(evidenceDir, { recursive: true });

  const quickSearch = page.getByRole("textbox", { name: "Search members to check in" });
  await quickSearch.fill("Sagar");
  await expect(page.getByText("Sagar Rai Teacher")).toBeVisible();
  await page.screenshot({
    path: path.join(evidenceDir, "check-in-search-results.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText("Sagar Rai Teacher")).toBeVisible();
  const checkedInHistoryRow = page
    .locator('[data-testid^="attendance-record-"]')
    .filter({ hasText: "Sagar Rai Teacher" });
  await expect(checkedInHistoryRow.getByText("Morning", { exact: true })).toBeVisible();
  await expect(checkedInHistoryRow).not.toContainText("Shift: Morning");
  await expect(page.getByText("Attendance recorded")).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "check-in-success.png"), fullPage: true });
  await quickSearch.fill("Sagar");
  await expect(page.getByRole("button", { name: "Checked in" })).toBeDisabled();
  await page.screenshot({
    path: path.join(evidenceDir, "duplicate-check-in-disabled.png"),
    fullPage: true,
  });
  await expect.poll(() => data.state.attendance.length).toBe(1);

  await quickSearch.fill("Sabita");
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText("Sabita Dhimal")).toBeVisible();
  await expect.poll(() => data.state.attendance.length).toBe(2);
  await expect(page.getByText("Attendance recorded")).toHaveCount(0, { timeout: 10_000 });

  // The Worker injects this legacy enhancement into production HTML; verify it
  // does not duplicate or override the native React history search.
  await page.addScriptTag({ path: path.resolve("public/attendance-history-search.js") });
  await expect(page.getByRole("textbox", { name: "Search attended members" })).toHaveCount(1);
  await expect(page.locator("[data-attendance-history-search]")).toHaveCount(0);
  await expect(page.locator("#attendance-history-search")).toHaveCount(1);

  const historySearch = page.getByRole("textbox", { name: "Search attended members" });
  await historySearch.fill("sagar rai");
  await expect(page.getByText("Sabita Dhimal")).toBeHidden();
  await page.screenshot({
    path: path.join(evidenceDir, "history-name-search.png"),
    fullPage: true,
  });
  await historySearch.fill("9800000002");
  await expect(page.getByText("Sabita Dhimal")).toBeVisible();
  await historySearch.fill("");

  await page.getByRole("combobox", { name: "Filter attendance by shift" }).click();
  await page.getByRole("option", { name: "Evening" }).click();
  await expect(page.getByText("Sabita Dhimal")).toBeVisible();
  await expect(page.getByText("Sagar Rai Teacher")).toBeHidden();
  await page.screenshot({
    path: path.join(evidenceDir, "history-evening-filter.png"),
    fullPage: true,
  });

  await page.getByRole("combobox", { name: "Filter attendance by shift" }).click();
  await page.getByRole("option", { name: "All shifts" }).click();
  await expect(page.getByText("Sagar Rai Teacher")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const exportFilename = (await download).suggestedFilename();
  expect(exportFilename).toMatch(/^ironvault-attendance-.*\.csv$/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Attendance history", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Sabita Dhimal")).toBeVisible();
  await expect(page.getByText("Sagar Rai Teacher")).toBeVisible();
  await expect.poll(() => data.state.attendance.length).toBe(2);

  const historyRows = page.locator('[data-testid^="attendance-record-"]');
  const sagarHistoryRow = historyRows.filter({ hasText: "Sagar Rai Teacher" });
  const sabitaHistoryRow = historyRows.filter({ hasText: "Sabita Dhimal" });
  const morningShiftBadge = sagarHistoryRow.getByText("Morning", { exact: true });
  await expect(morningShiftBadge).toBeVisible();
  await expect(morningShiftBadge).toHaveClass(/rounded-full/);
  await expect(sagarHistoryRow).not.toContainText("Shift: Morning");
  const badgeBox = await sagarHistoryRow.getByTestId("attendance-shift-badge").boundingBox();
  const checkInTimeBox = await sagarHistoryRow.getByTestId("attendance-check-in-time").boundingBox();
  if (!badgeBox || !checkInTimeBox) throw new Error("Attendance badge and time should be measurable");
  expect(checkInTimeBox.x - (badgeBox.x + badgeBox.width)).toBeGreaterThanOrEqual(27);
  await expect(sabitaHistoryRow.getByText("Evening", { exact: true })).toBeVisible();

  const viewports = [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ];
  const layoutMeasurements: Array<Record<string, unknown>> = [];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(page.getByRole("heading", { name: "Attendance", exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Attendance history", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/2 check-ins ·/)).toBeVisible();
    // Let the shell's responsive drawer/inset transitions reach a stable state.
    await expect
      .poll(() =>
        page.locator("aside").evaluate((element) => {
          const left = element.getBoundingClientRect().left;
          return window.innerWidth >= 1024 ? Math.abs(left) < 1 : Math.abs(left + 264) < 1;
        }),
      )
      .toBe(true);
    if (viewport.width < 1024) {
      await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow, `${viewport.name} should not horizontally overflow`).toBe(false);
    layoutMeasurements.push(
      await page.evaluate((name) => {
        const sidebar = document.querySelector("aside")?.getBoundingClientRect();
        const content = document.querySelector("main")?.getBoundingClientRect();
        return {
          viewport: name,
          innerWidth: window.innerWidth,
          scrollX: window.scrollX,
          sidebar: sidebar && { left: sidebar.left, right: sidebar.right, width: sidebar.width },
          contentLeft: content?.left,
        };
      }, viewport.name),
    );
    await page.screenshot({ path: path.join(evidenceDir, `${viewport.name}.png`), fullPage: true });
    if (viewport.name === "desktop") {
      await page.screenshot({ path: path.join(evidenceDir, "desktop-viewport.png") });
    }
  }

  await page.goto("/members");
  await expect(page.locator("body")).not.toContainText("Loading workspace…");
  await expect(page.locator("main").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Member Management" })).toBeVisible();
  await page.getByPlaceholder("Search by name, phone or email").fill("Sagar");
  const mobileSagarCard = page.getByRole("article").filter({ hasText: "Sagar Rai Teacher" });
  await expect(mobileSagarCard.getByText("Sagar Rai Teacher")).toBeVisible();
  await expect(mobileSagarCard.getByText("morning", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Filter members by shift" }).click();
  await page.getByRole("option", { name: "Evening" }).click();
  await expect(page.getByText("No people found")).toBeVisible();
  expect(errors, "the app should not log browser or network errors").toEqual([]);
  await writeFile(
    path.join(evidenceDir, "metadata.json"),
    JSON.stringify(
      {
        route: "/attendance",
        round: evidenceRound,
        testStatus: "passed",
        capturedAt: new Date().toISOString(),
        viewports,
        layoutMeasurements,
        environment: "Local Vite app with isolated mocked Supabase; synthetic QA members only.",
        browserErrors: errors,
        backendAttendanceCount: data.state.attendance.length,
        verifiedScenarios: [
          "quick search finds a registered member by name",
          "check-in stores the current profile shift and time snapshot",
          "repeat same-day check-in is disabled",
          "attendance history searches by name and phone",
          "attendance history shows the shift as a rounded badge without the Shift prefix",
          "shift filter returns matching attendees",
          "CSV export triggers with a date-scoped filename",
          "mock cloud workspace retains both check-ins across page reload",
          "member list displays shift and supports shift filtering",
          "desktop, tablet, and mobile layouts have no horizontal overflow",
        ],
        exportFilename,
      },
      null,
      2,
    ),
  );
});

test("a mistaken check-in can be removed and member profiles show attendance history", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const { data, errors } = await installMockBackend(page, workspaceWithAttendance());
  await signIn(page);
  await page.goto("/attendance");

  const sabitaRecordId = data.state.attendance.find(
    (record) => record.memberId === "member-sabita",
  )!.id;
  const sabitaRow = page.getByTestId(`attendance-record-${sabitaRecordId}`);
  await expect(sabitaRow).toContainText("Sabita Dhimal");
  await sabitaRow.getByRole("button", { name: "Remove attendance for Sabita Dhimal" }).click();

  let confirmation = page.getByRole("alertdialog");
  await expect(
    confirmation.getByRole("heading", { name: "Move attendance check-in to Trash?" }),
  ).toBeVisible();
  await expect(confirmation).toContainText("Sabita Dhimal");
  await confirmation.getByRole("button", { name: "Keep check-in" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect.poll(() => data.state.attendance.length).toBe(2);
  await expect(sabitaRow).toBeVisible();

  await sabitaRow.getByRole("button", { name: "Remove attendance for Sabita Dhimal" }).click();
  confirmation = page.getByRole("alertdialog");
  await confirmation.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page.getByText("Attendance check-in moved to Trash")).toBeVisible();
  await expect(sabitaRow).toHaveCount(0);
  await expect.poll(
    () => data.state.attendance.find((record) => record.memberId === "member-sabita")?.deletedAt,
  ).toBeTruthy();
  await expect.poll(() => data.state.attendance.length).toBe(2);

  await page.goto("/trash");
  await expect(page.getByRole("heading", { name: "Deleted Attendance Check-ins" })).toBeVisible();
  const trashedSabitaRecord = page.locator(
    `[data-testid="trashed-attendance-${sabitaRecordId}"]:visible`,
  );
  await expect(trashedSabitaRecord).toContainText("Sabita Dhimal");
  await trashedSabitaRecord.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("Sabita Dhimal's check-in restored")).toBeVisible();
  await expect.poll(
    () => data.state.attendance.find((record) => record.id === sabitaRecordId)?.deletedAt,
  ).toBeNull();
  await page.goto("/attendance");
  await expect(page.getByTestId(`attendance-record-${sabitaRecordId}`)).toBeVisible();

  await page.goto("/members/member-sagar?tab=attendance");
  await expect(page.getByRole("heading", { name: "Sagar Rai Teacher" })).toBeVisible();
  const attendanceTab = page.getByRole("tab", { name: "Attendance" });
  await expect(attendanceTab).toHaveAttribute("data-state", "active");
  const attendancePanel = page.getByRole("tabpanel");
  await expect(attendancePanel).toContainText("Attendance History");
  const sagarRecordId = data.state.attendance[0]!.id;
  const profileAttendanceRow = attendancePanel.getByTestId(`member-attendance-${sagarRecordId}`);
  const profileShiftBadge = profileAttendanceRow.getByTestId("member-attendance-shift-badge");
  await expect(profileShiftBadge).toHaveText("Morning");
  await expect(profileShiftBadge).toHaveClass(/rounded-full/);
  await expect(profileAttendanceRow).not.toContainText("Shift: Morning");
  const profileBadgeBox = await profileShiftBadge.boundingBox();
  const profileTimeBox = await profileAttendanceRow
    .getByTestId("member-attendance-check-in-time")
    .boundingBox();
  if (!profileBadgeBox || !profileTimeBox) {
    throw new Error("Profile attendance shift badge and time should be measurable");
  }
  expect(profileTimeBox.x - (profileBadgeBox.x + profileBadgeBox.width)).toBeGreaterThanOrEqual(8);
  await profileAttendanceRow
    .getByRole("button", { name: "Remove attendance for Sagar Rai Teacher" })
    .click();
  confirmation = page.getByRole("alertdialog");
  await confirmation.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page.getByText("Attendance check-in moved to Trash")).toBeVisible();
  await expect(attendancePanel).toContainText("No attendance history");
  await expect.poll(
    () => data.state.attendance.find((record) => record.memberId === "member-sagar")?.deletedAt,
  ).toBeTruthy();
  await expect.poll(() => data.state.attendance.length).toBe(2);
  expect(errors, "attendance deletion and profile history should not log browser errors").toEqual(
    [],
  );
});

test("attendance history member names open the matching profile", async ({ page }) => {
  const { data, errors } = await installMockBackend(page, workspaceWithAttendance());
  await signIn(page);
  await page.goto("/attendance");

  const record = data.state.attendance.find((entry) => entry.memberId === "member-sagar")!;
  await page
    .getByTestId(`attendance-record-${record.id}`)
    .getByRole("link", { name: "Open member profile for Sagar Rai Teacher" })
    .click();

  await expect(page).toHaveURL(/\/members\/member-sagar(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Sagar Rai Teacher" })).toBeVisible();
  expect(errors, "opening an attendee profile should not log browser errors").toEqual([]);
});

test("member profile attendance uses date ranges instead of a redundant search", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const workspace = workspaceWithAttendance();
  const currentRecord = workspace.attendance[0]!;
  const olderDate = new Date();
  olderDate.setDate(olderDate.getDate() - 45);
  const olderDateValue = [
    olderDate.getFullYear(),
    String(olderDate.getMonth() + 1).padStart(2, "0"),
    String(olderDate.getDate()).padStart(2, "0"),
  ].join("-");
  const olderRecord: AttendanceRecord = {
    ...currentRecord,
    id: `${olderDateValue}:member-sagar`,
    date: olderDateValue,
    checkedInAt: new Date(
      olderDate.getFullYear(),
      olderDate.getMonth(),
      olderDate.getDate(),
      8,
    ).toISOString(),
  };
  workspace.attendance.push(olderRecord);
  const { errors } = await installMockBackend(page, workspace);
  await signIn(page);
  await page.goto("/members/member-sagar?tab=attendance");

  const panel = page.getByRole("tabpanel");
  await expect(panel.getByRole("heading", { name: "Attendance History" })).toBeVisible();
  await expect(panel.getByRole("textbox")).toHaveCount(0);
  await expect(panel).toContainText("2 visits recorded");

  const range = panel.getByRole("combobox", {
    name: "Filter member attendance by date range",
  });
  await range.click();
  await page.getByRole("option", { name: "Last 30 days" }).click();
  await expect(panel).toContainText("1 visit shown · 2 total");
  await expect(panel.getByTestId(`member-attendance-${olderRecord.id}`)).toHaveCount(0);
  await expect(panel.getByTestId(`member-attendance-${currentRecord.id}`)).toBeVisible();

  await range.click();
  await page.getByRole("option", { name: "Custom range" }).click();
  await expect(panel.getByRole("button", { name: "Attendance start date" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Attendance end date" })).toBeVisible();

  const now = new Date();
  const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(now);
  const ordinal = (day: number) =>
    `${day}${day % 100 >= 11 && day % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[day % 10] ?? "th")}`;
  const todayPattern = new RegExp(`${month} ${ordinal(now.getDate())}, ${now.getFullYear()}`);
  const selectTodayInOpenCalendar = () =>
    page.getByRole("dialog").last().getByRole("button", { name: todayPattern }).click();
  await panel.getByRole("button", { name: "Attendance start date" }).click();
  await selectTodayInOpenCalendar();
  await panel.getByRole("button", { name: "Attendance end date" }).click();
  await selectTodayInOpenCalendar();
  await expect(panel).toContainText("1 visit shown · 2 total");
  await expect(panel.getByTestId(`member-attendance-${olderRecord.id}`)).toHaveCount(0);
  await page.addScriptTag({ path: path.resolve("public/attendance-history-search.js") });
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  await expect(panel.locator("[data-attendance-history-search]")).toHaveCount(0);
  await expect(panel.getByRole("textbox")).toHaveCount(0);

  // The shared profile component must provide the same date filtering for
  // every member, not only the profile used above.
  await page.goto("/members/member-sabita?tab=attendance");
  const secondMemberPanel = page.getByRole("tabpanel");
  await expect(
    secondMemberPanel.getByRole("heading", { name: "Attendance History" }),
  ).toBeVisible();
  await expect(secondMemberPanel).toContainText("1 visit recorded");
  const secondMemberRange = secondMemberPanel.getByRole("combobox", {
    name: "Filter member attendance by date range",
  });
  await secondMemberRange.click();
  await page.getByRole("option", { name: "Custom range" }).click();
  await secondMemberPanel.getByRole("button", { name: "Attendance start date" }).click();
  await selectTodayInOpenCalendar();
  await secondMemberPanel.getByRole("button", { name: "Attendance end date" }).click();
  await selectTodayInOpenCalendar();
  await expect(secondMemberPanel).toContainText("1 visit shown · 1 total");
  await page.addScriptTag({ path: path.resolve("public/attendance-history-search.js") });
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  await expect(secondMemberPanel.locator("[data-attendance-history-search]")).toHaveCount(0);
  await expect(secondMemberPanel.getByRole("textbox")).toHaveCount(0);
  expect(errors, "member attendance date filters should not log browser errors").toEqual([]);
});
