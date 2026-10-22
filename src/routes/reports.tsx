import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Printer } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Panel } from "@/components/app/Panel";
import { Button } from "@/components/ui/button";
import { AppDatePicker } from "@/components/app/AppDatePicker";
import { getCurrentSession, useGym } from "@/lib/gym/store";
import { formatDayMonth, localDateInput } from "@/lib/gym/calendar";
import { formatTime, minutesSinceMidnight } from "@/lib/gym/time";
import type { GymState } from "@/lib/gym/types";
import { addMoney, multiplyMoney, subtractMoney, sumMoney } from "@/lib/gym/money";
import {
  gymMembers,
  currentMembership,
  isCurrentMemberStatus,
  metricMeta,
  metricStart,
  money,
  planDistribution,
  profitOfSales,
  rangeToMetric,
  rangeWindow,
  revenueForMetric,
  revenueSeries,
  shortDate,
  statusOf,
  topProducts,
  totalDue,
  inWindow,
} from "@/lib/gym/selectors";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports & Analytics — IRONVAULT Gym Management" },
      {
        name: "description",
        content:
          "Daily, weekly, monthly and yearly reports on revenue, memberships, dues and product sales — exportable as CSV.",
      },
      { property: "og:title", content: "Reports & Analytics — IRONVAULT Gym Management" },
      {
        property: "og:description",
        content: "Revenue trends, membership breakdowns, sales performance and CSV export.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <ReportsPage />
    </AppShell>
  ),
});

const RANGES = ["daily", "weekly", "monthly", "yearly"] as const;
type RangeKey = (typeof RANGES)[number];
type ReportRange = RangeKey | "custom";
const GOLDS = ["#D4AF37", "#B8912C", "#E8CE7A", "#8C6D1F", "#F2E2AC"];

function MemberProfileName({
  member,
  label,
}: {
  member: GymState["members"][number] | undefined;
  label: string;
}) {
  if (!member) return <>{label}</>;

  return (
    <Link
      to="/members/$memberId"
      params={{ memberId: member.id }}
      search={{ tab: undefined }}
      aria-label={`Open member profile for ${member.name}`}
      title={`Open ${member.name}'s profile`}
      className="rounded-sm no-underline hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
    >
      {label}
    </Link>
  );
}

const daysAgoInput = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localDateInput(date);
};

function customWindow(start: string, end: string) {
  const from = new Date(`${start}T00:00:00`);
  const to = new Date(`${end}T23:59:59.999`);
  return { start: from, end: to };
}

function customRevenueSeries(state: GymState, start: string, end: string) {
  const window = customWindow(start, end);
  if (window.end < window.start) return [];
  const day = 86_400_000;
  const spanDays = Math.floor((window.end.getTime() - window.start.getTime()) / day) + 1;
  const bucketDays = spanDays <= 45 ? 1 : spanDays <= 370 ? 7 : 30;
  const buckets: Array<{ label: string; start: Date; end: Date }> = [];
  for (let cursor = new Date(window.start); cursor <= window.end;) {
    const bucketStart = new Date(cursor);
    const bucketEnd = new Date(cursor);
    bucketEnd.setDate(bucketEnd.getDate() + bucketDays - 1);
    bucketEnd.setHours(23, 59, 59, 999);
    if (bucketEnd > window.end) bucketEnd.setTime(window.end.getTime());
    buckets.push({
      label:
        bucketDays === 1
          ? formatDayMonth(bucketStart)
          : `${formatDayMonth(bucketStart)}–${formatDayMonth(bucketEnd)}`,
      start: bucketStart,
      end: bucketEnd,
    });
    cursor = new Date(bucketEnd);
    cursor.setMilliseconds(cursor.getMilliseconds() + 1);
  }
  return buckets.map((bucket) => {
    const inBucket = (date: string) => inWindow(date, bucket);
    const membership = sumMoney(
      state.payments.filter((payment) => payment.kind === "membership" && inBucket(payment.date)),
      (payment) => payment.amount,
    );
    const product = sumMoney(
      state.payments.filter((payment) => payment.kind === "product" && inBucket(payment.date)),
      (payment) => payment.amount,
    );
    const other = sumMoney(
      state.payments.filter((payment) => payment.kind === "other" && inBucket(payment.date)),
      (payment) => payment.amount,
    );
    return {
      label: bucket.label,
      membership,
      product,
      other,
      total: addMoney(addMoney(membership, product), other),
    };
  });
}

function isWithinTimeWindow(value: string, start: string, end: string) {
  const minutes = minutesSinceMidnight(value);
  if (minutes === null) return false;
  const startMinutes = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5));
  const endMinutes = Number(end.slice(0, 2)) * 60 + Number(end.slice(3, 5));

  // A window that crosses midnight, such as 22:00–02:00, spans both sides of midnight.
  return startMinutes <= endMinutes
    ? minutes >= startMinutes && minutes <= endMinutes
    : minutes >= startMinutes || minutes <= endMinutes;
}

function formatClockTime(value: string) {
  return formatTime(value);
}

function ReportsPage() {
  const state = useGym();
  const [range, setRange] = useState<ReportRange>("monthly");
  const [customStart, setCustomStart] = useState(daysAgoInput(29));
  const [customEnd, setCustomEnd] = useState(localDateInput(new Date()));
  const [collectionStartTime, setCollectionStartTime] = useState("00:00");
  const [collectionEndTime, setCollectionEndTime] = useState("23:59");
  const [exportSucceeded, setExportSucceeded] = useState(false);

  const series = useMemo(
    () =>
      state
        ? range === "custom"
          ? customRevenueSeries(state, customStart, customEnd)
          : revenueSeries(state, range)
        : [],
    [state, range, customStart, customEnd],
  );

  if (!state) return null;
  const session = getCurrentSession();
  const canViewProductProfit =
    session?.role !== "receptionist" || Boolean(session.permissions?.viewProductCost);
  const cur = state.settings.currency;
  const dist = planDistribution(state);
  const products = topProducts(state, 5);
  const maxProductRevenue = Math.max(1, ...products.map((product) => product.revenue));
  const hasRevenueData = series.some((point) => point.total > 0);
  const selectedWindow = customWindow(customStart, customEnd);
  const customValid = selectedWindow.start <= selectedWindow.end;
  const reportRevenue =
    range === "custom"
      ? sumMoney(
          state.payments.filter((payment) => customValid && inWindow(payment.date, selectedWindow)),
          (payment) => payment.amount,
        )
      : revenueForMetric(state, rangeToMetric(range));
  const reportProfit =
    range === "custom"
      ? sumMoney(
          state.sales.filter((sale) => customValid && inWindow(sale.date, selectedWindow)),
          (sale) => subtractMoney(sale.total, multiplyMoney(sale.unitCost, sale.qty)),
        )
      : profitOfSales(state, metricStart(rangeToMetric(range)));
  const reportLabel =
    range === "custom" ? "Custom revenue" : metricMeta(rangeToMetric(range)).label;
  const memberStatuses = gymMembers(state).map((member) => statusOf(state, member.id));
  const activeMemberCount = memberStatuses.filter(isCurrentMemberStatus).length;
  const collectionWindow = range === "custom" ? selectedWindow : rangeWindow(range);
  const collectionDetailTitle =
    range === "daily"
      ? "Today's collection details"
      : `${range === "custom" ? "Custom range" : range[0]!.toUpperCase() + range.slice(1)} collection details`;
  const collectionPeriodDescription =
    range === "daily"
      ? "today"
      : range === "custom"
        ? `from ${shortDate(collectionWindow.start)} to ${shortDate(collectionWindow.end)}`
        : `this ${range.replace("ly", "")}`;
  const isAllDayCollectionWindow =
    collectionStartTime === "00:00" && collectionEndTime === "23:59";
  const collectionDetailPeriodDescription =
    range === "daily" && !isAllDayCollectionWindow
      ? `today from ${collectionStartTime} to ${collectionEndTime} (gym time)`
      : collectionPeriodDescription;
  const collectionPayments = state.payments
    .filter(
      (payment) =>
        (range !== "custom" || customValid) &&
        inWindow(payment.date, collectionWindow) &&
        (range !== "daily" ||
          isWithinTimeWindow(payment.date, collectionStartTime, collectionEndTime)),
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const collectionMembershipPayments = collectionPayments.filter(
    (payment) => payment.kind === "membership",
  );
  const collectionProductPayments = collectionPayments.filter(
    (payment) => payment.kind === "product",
  );
  const collectionOtherPayments = collectionPayments.filter((payment) => payment.kind === "other");
  const collectionBalancePayments = collectionMembershipPayments.filter(
    (payment) => payment.purpose === "membership_balance" || /\bbalance\b/i.test(payment.note),
  );
  const collectionBalanceMemberCount = new Set(
    collectionBalancePayments.map((payment) => payment.memberId).filter(Boolean),
  ).size;
  const collectionProductSales = state.sales
    .filter(
      (sale) =>
        (range !== "custom" || customValid) &&
        inWindow(sale.date, collectionWindow) &&
        (range !== "daily" ||
          isWithinTimeWindow(sale.date, collectionStartTime, collectionEndTime)),
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const collectionProductSaleValue = sumMoney(collectionProductSales, (sale) => sale.total);
  const productBySaleId = new Map(state.sales.map((sale) => [sale.id, sale]));
  const memberById = new Map(state.members.map((member) => [member.id, member]));
  const memberByName = new Map<string, GymState["members"][number] | null>();
  for (const member of state.members) {
    const normalizedName = member.name.normalize("NFKC").trim().toLowerCase();
    if (!normalizedName) continue;
    memberByName.set(
      normalizedName,
      memberByName.has(normalizedName) ? null : member,
    );
  }
  const memberForName = (name?: string | null) =>
    name ? (memberByName.get(name.normalize("NFKC").trim().toLowerCase()) ?? undefined) : undefined;

  const exportCsv = () => {
    setExportSucceeded(false);
    const csvCell = (value: string) =>
      /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
    const rows = [
      ["Period", "Revenue"],
      ...series.map((d) => [d.label, String(d.total)]),
      [],
      ["Summary", ""],
      ["Selected revenue", String(reportRevenue)],
      ["Pending dues", String(totalDue(state))],
      ...(canViewProductProfit ? [["Product profit", String(reportProfit)]] : []),
      ["Active members", String(activeMemberCount)],
      ...(range !== "custom" || customValid
        ? [
            [],
            [collectionDetailTitle, ""],
            [`Payments recorded ${collectionDetailPeriodDescription}`, String(collectionPayments.length)],
            ...(range === "daily"
              ? [["Collection time window", `${collectionStartTime}–${collectionEndTime} gym time`]]
              : []),
            [
              "Membership received",
              String(sumMoney(collectionMembershipPayments, (payment) => payment.amount)),
            ],
            [
              "Product payments received",
              String(sumMoney(collectionProductPayments, (payment) => payment.amount)),
            ],
            [
              "Other receipts",
              String(sumMoney(collectionOtherPayments, (payment) => payment.amount)),
            ],
            [
              "Membership balance collected",
              String(sumMoney(collectionBalancePayments, (payment) => payment.amount)),
            ],
            ["Members who paid membership balance", String(collectionBalanceMemberCount)],
            [
              "Products sold",
              String(collectionProductSales.reduce((total, sale) => total + sale.qty, 0)),
            ],
            ["Product sales value", String(collectionProductSaleValue)],
            [],
            [`${collectionDetailTitle}`, "Type", "Name or item", "Invoice", "Time", "Amount"],
            ...collectionPayments.map((payment) => {
              const sale = payment.saleId ? productBySaleId.get(payment.saleId) : undefined;
              const member = payment.memberId ? memberById.get(payment.memberId) : undefined;
              const payer = sale?.buyer ?? member?.name ?? payment.payerName ?? "Walk-in";
              const detail = sale
                ? `${sale.productName} (${sale.qty} units)`
                : payment.purpose === "membership_balance" || /\bbalance\b/i.test(payment.note)
                  ? "Membership balance"
                  : payment.kind === "membership"
                    ? "Membership payment"
                    : payment.note || "Other receipt";
              return [
                detail,
                payment.kind,
                payer,
                payment.invoiceNo,
                formatTime(payment.date, { hour: "2-digit" }),
                String(payment.amount),
              ];
            }),
          ]
        : []),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ironvault-report-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportSucceeded(true);
  };

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        subtitle={`Generated ${shortDate(new Date())} · all figures computed locally`}
        actions={
          <>
            <div className="flex min-w-0 max-w-full flex-wrap gap-2">
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" /> Print
              </Button>
              <Button onClick={exportCsv}>
                <Download className="mr-2 h-4 w-4" /> Export CSV
              </Button>
            </div>
            {exportSucceeded && (
              <span className="w-full text-right text-xs text-emerald-400 sm:w-auto" role="status">
                CSV exported
              </span>
            )}
          </>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded-full border px-4 py-1.5 text-xs font-medium capitalize transition-colors ${
              range === r
                ? "border-gold/50 bg-gold/15 text-gold"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {r}
          </button>
        ))}
        <button
          onClick={() => setRange("custom")}
          className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${
            range === "custom"
              ? "border-gold/50 bg-gold/15 text-gold"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          Custom
        </button>
      </div>

      {range === "custom" && (
        <div className="mb-6 grid gap-4 rounded-2xl border border-gold/25 bg-secondary/25 p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Start date</p>
            <AppDatePicker value={customStart} onChange={setCustomStart} max={new Date()} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">End date</p>
            <AppDatePicker
              value={customEnd}
              onChange={setCustomEnd}
              min={new Date(`${customStart}T00:00:00`)}
              max={new Date()}
            />
          </div>
          {!customValid && (
            <p className="text-xs text-destructive sm:col-span-2">
              End date must be on or after the start date.
            </p>
          )}
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link
          to="/reports"
          hash="collection-details"
          aria-label={`View ${reportLabel.toLowerCase()} collection details`}
          className="group surface-panel rounded-2xl p-5 transition-colors hover:border-gold/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
        >
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {reportLabel}
          </p>
          <p className="mt-1 font-display text-2xl text-gradient-gold">
            {money(reportRevenue, cur)}
          </p>
          <span className="sr-only">Open collection details for this period</span>
        </Link>
        <Link
          to="/members"
          search={{ filter: "due" }}
          aria-label="View members with pending dues"
          className="group surface-panel rounded-2xl p-5 transition-colors hover:border-gold/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
        >
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Pending dues
          </p>
          <p className="mt-1 font-display text-2xl text-gradient-gold">{money(totalDue(state), cur)}</p>
          <span className="sr-only">Open members filtered to pending dues</span>
        </Link>
        {canViewProductProfit && (
          <Link
            to="/products"
            search={{ sale: undefined, sell: undefined }}
            aria-label="View products to review product sales and profit"
            className="group surface-panel rounded-2xl p-5 transition-colors hover:border-gold/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
          >
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Product profit
            </p>
            <p className="mt-1 font-display text-2xl text-gradient-gold">
              {money(reportProfit, cur)}
            </p>
            <span className="sr-only">Open products and sales</span>
          </Link>
        )}
        <Link
          to="/members"
          search={{ filter: "active" }}
          aria-label="View active members"
          className="group surface-panel rounded-2xl p-5 transition-colors hover:border-gold/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
        >
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Active members
          </p>
          <p className="mt-1 font-display text-2xl text-gradient-gold">{activeMemberCount}</p>
          <span className="sr-only">Open the active member list</span>
        </Link>
      </div>

      {(range !== "custom" || customValid) && (
        <Panel
          id="collection-details"
          title={collectionDetailTitle}
          className="mb-6"
          actions={
            range === "daily" ? (
              <div
                className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-[repeat(2,minmax(7.5rem,auto))]"
                aria-label="Filter today's collection by time"
              >
                <label className="grid min-w-0 gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  From
                  <input
                    type="time"
                    aria-label="Collection start time"
                    value={collectionStartTime}
                    onChange={(event) => setCollectionStartTime(event.target.value)}
                    className="h-10 min-w-0 rounded-lg border border-border bg-background px-2 text-sm normal-case tracking-normal text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  To
                  <input
                    type="time"
                    aria-label="Collection end time"
                    value={collectionEndTime}
                    onChange={(event) => setCollectionEndTime(event.target.value)}
                    className="h-10 min-w-0 rounded-lg border border-border bg-background px-2 text-sm normal-case tracking-normal text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
                  />
                </label>
              </div>
            ) : undefined
          }
        >
          <p className="mb-4 text-sm text-muted-foreground">
            {collectionPayments.length} payment{collectionPayments.length === 1 ? "" : "s"} recorded{" "}
            {collectionDetailPeriodDescription}. Product sales are shown separately from cash collected,
            so unpaid balances are clear.
          </p>
          <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              [
                "Membership received",
                sumMoney(collectionMembershipPayments, (payment) => payment.amount),
              ],
              [
                "Product payments",
                sumMoney(collectionProductPayments, (payment) => payment.amount),
              ],
              ["Other receipts", sumMoney(collectionOtherPayments, (payment) => payment.amount)],
              [
                "Balance-paying members",
                `${collectionBalanceMemberCount} · ${money(
                  sumMoney(collectionBalancePayments, (payment) => payment.amount),
                  cur,
                )}`,
              ],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border/70 bg-background/30 p-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {label}
                </p>
                <p className="mt-1 font-display text-lg text-gold">
                  {typeof value === "number" ? money(value, cur) : value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 2xl:grid-cols-2">
            <section aria-labelledby="period-product-sales-heading" className="min-w-0">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h3 id="period-product-sales-heading" className="font-display text-base uppercase">
                  Products sold {collectionDetailPeriodDescription}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {collectionProductSales.reduce((total, sale) => total + sale.qty, 0)} units ·{" "}
                  {money(collectionProductSaleValue, cur)} sales value
                </span>
              </div>
              {collectionProductSales.length ? (
                <div className="space-y-2 md:hidden">
                  {collectionProductSales.map((sale) => (
                    <article
                      key={sale.id}
                      className="rounded-xl border border-border/70 bg-background/30 p-3"
                    >
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{sale.productName}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            <MemberProfileName
                              member={
                                (sale.memberId ? memberById.get(sale.memberId) : undefined) ??
                                memberForName(sale.buyer)
                              }
                              label={sale.buyer || "Walk-in"}
                            />
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-medium tabular-nums">
                          {money(sale.total, cur)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {sale.qty} unit{sale.qty === 1 ? "" : "s"} sold · Sold at{" "}
                        {formatClockTime(sale.date)}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-border/70 bg-background/30 px-3 py-5 text-center text-sm text-muted-foreground md:hidden">
                  No product sales recorded {collectionDetailPeriodDescription}.
                </div>
              )}
              {collectionProductSales.length ? (
                <div className="hidden overflow-x-auto rounded-xl border border-border/70 md:block">
                  <table className="w-full min-w-[500px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-2.5">Product</th>
                        <th className="px-3 py-2.5">Buyer</th>
                        <th className="px-3 py-2.5 text-right">Qty</th>
                        <th className="px-3 py-2.5">Time</th>
                        <th className="px-3 py-2.5 text-right">Sale value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {collectionProductSales.map((sale) => (
                        <tr key={sale.id} className="border-b border-border/50 last:border-0">
                          <td
                            className="max-w-[12rem] truncate px-3 py-2.5 font-medium"
                            title={sale.productName}
                          >
                            {sale.productName}
                          </td>
                          <td
                            className="max-w-[10rem] truncate px-3 py-2.5 text-muted-foreground"
                            title={sale.buyer}
                          >
                            <MemberProfileName
                              member={
                                (sale.memberId ? memberById.get(sale.memberId) : undefined) ??
                                memberForName(sale.buyer)
                              }
                              label={sale.buyer || "Walk-in"}
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{sale.qty}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                            {formatClockTime(sale.date)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {money(sale.total, cur)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="hidden rounded-xl border border-border/70 bg-background/30 px-3 py-5 text-center text-sm text-muted-foreground md:block">
                  No product sales recorded {collectionDetailPeriodDescription}.
                </div>
              )}
            </section>

            <section aria-labelledby="period-balance-payments-heading" className="min-w-0">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h3
                  id="period-balance-payments-heading"
                  className="font-display text-base uppercase"
                >
                  Membership balances collected
                </h3>
                <span className="text-xs text-muted-foreground">
                  {collectionBalanceMemberCount} member
                  {collectionBalanceMemberCount === 1 ? "" : "s"} ·{" "}
                  {money(
                    sumMoney(collectionBalancePayments, (payment) => payment.amount),
                    cur,
                  )}
                </span>
              </div>
              {collectionBalancePayments.length ? (
                <div className="space-y-2">
                  {collectionBalancePayments.map((payment) => {
                    const member =
                      (payment.memberId ? memberById.get(payment.memberId) : undefined) ??
                      memberForName(payment.payerName);
                    return (
                      <div
                        key={payment.id}
                        className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/30 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            <MemberProfileName
                              member={member}
                              label={member?.name ?? payment.payerName ?? "Member"}
                            />
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {payment.invoiceNo} · {payment.note || "Membership balance"}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-medium tabular-nums text-emerald-400">
                          {money(payment.amount, cur)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-border/70 bg-background/30 px-3 py-5 text-center text-sm text-muted-foreground">
                  No membership balance payments recorded {collectionDetailPeriodDescription}.
                </div>
              )}
            </section>
          </div>

          {collectionPayments.length > 0 && (
            <details className="mt-5 rounded-xl border border-border/70 bg-background/20 p-3">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                View all {collectionPayments.length} payment records
              </summary>
              <div className="mt-3 divide-y divide-border/60">
                {collectionPayments.map((payment) => {
                  const sale = payment.saleId ? productBySaleId.get(payment.saleId) : undefined;
                  const memberId = payment.memberId ?? sale?.memberId;
                  const payerName = sale?.buyer || payment.payerName || undefined;
                  const member =
                    (memberId ? memberById.get(memberId) : undefined) ??
                    memberForName(payerName);
                  const saleDescription = sale
                    ? `${sale.productName} · ${sale.qty} unit${sale.qty === 1 ? "" : "s"}`
                    : null;
                  return (
                    <div
                      key={payment.id}
                      className="grid gap-1 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          <MemberProfileName
                            member={member}
                            label={payerName ?? member?.name ?? "Walk-in"}
                          />
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {saleDescription ?? payment.note ?? payment.kind} · {payment.invoiceNo} ·{" "}
                          {formatTime(payment.date, { hour: "2-digit" })}
                        </p>
                      </div>
                      <span className="font-medium tabular-nums">{money(payment.amount, cur)}</span>
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </Panel>
      )}

      <Panel title={`Revenue — ${range}`} className="mb-6">
        {hasRevenueData ? (
          <div className="h-72 w-full" role="img" aria-label={`Revenue chart for ${range}`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="revGold" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#D4AF37" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="label"
                  stroke="#8b8b8b"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={12}
                />
                <YAxis
                  stroke="#8b8b8b"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number) => money(value, cur)}
                  width={84}
                />
                <Tooltip
                  contentStyle={{
                    background: "#111111",
                    border: "1px solid rgba(212,175,55,0.35)",
                    borderRadius: 12,
                    color: "#fff",
                  }}
                  formatter={(v: number) => money(v, cur)}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#D4AF37"
                  strokeWidth={2}
                  fill="url(#revGold)"
                  dot={{ r: 3, fill: "#D4AF37", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div
            className="flex h-48 items-center justify-center rounded-xl border border-border/60 bg-background/30 px-4 text-center text-sm text-muted-foreground"
            role="status"
          >
            No revenue recorded for this period.
          </div>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Membership distribution">
          {dist.length > 0 ? (
            <div className="h-64 w-full" role="img" aria-label="Membership distribution chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={dist}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={dist.length > 1 ? 3 : 0}
                    isAnimationActive={false}
                  >
                    {dist.map((_, i) => (
                      <Cell key={i} fill={GOLDS[i % GOLDS.length]} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="rounded-xl border border-gold/60 bg-popover px-3.5 py-2.5 text-xs shadow-lg">
                          <p className="font-semibold text-gold">{payload[0].name}</p>
                          <p className="mt-0.5 font-medium text-gold/90">
                            Members: {payload[0].value}
                          </p>
                        </div>
                      ) : null
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div
              className="flex h-48 items-center justify-center rounded-xl border border-border/60 bg-background/30 px-4 text-center text-sm text-muted-foreground"
              role="status"
            >
              No membership plans have enrolled members yet.
            </div>
          )}
          <ul className="mt-4 space-y-2 text-sm">
            {dist.map((d, i) => (
              <li key={d.name} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: GOLDS[i % GOLDS.length] }}
                  />
                  {d.name}
                </span>
                <span className="font-medium">{d.value}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Top selling products" description="Ranked by sales revenue">
          {products.length > 0 ? (
            <div className="min-w-0">
              <ol
                aria-label="Top selling products ranked by sales revenue"
                className="flex flex-col divide-y divide-border/60 sm:h-96"
              >
                {products.map((product, index) => (
                  <li
                    key={`${product.name}-${index}`}
                    className="flex flex-col justify-center gap-3 py-3 first:pt-0 last:pb-0 sm:min-h-0 sm:flex-1"
                  >
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-gold/25 bg-gold/10 text-xs font-semibold text-gold">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium" title={product.name}>
                            {product.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {product.units} unit{product.units === 1 ? "" : "s"} sold
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-medium tabular-nums text-gold">
                        {money(product.revenue, cur)}
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={`${product.name} revenue`}
                      aria-valuemin={0}
                      aria-valuemax={maxProductRevenue}
                      aria-valuenow={product.revenue}
                      className="ml-11 h-2 overflow-hidden rounded-full bg-secondary/80"
                    >
                      <div
                        className="h-full rounded-full bg-gold"
                        style={{
                          width: `${Math.max(4, (product.revenue / maxProductRevenue) * 100)}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div
              className="flex h-48 items-center justify-center rounded-xl border border-border/60 bg-background/30 px-4 text-center text-sm text-muted-foreground"
              role="status"
            >
              No product sales have been recorded yet.
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Membership status summary" className="mt-6">
        <div className="space-y-2 md:hidden">
          {gymMembers(state)
            .slice(0, 10)
            .map((m) => {
              const ms = currentMembership(state, m.id);
              return (
                <article
                  key={m.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 rounded-xl border border-border/70 bg-background/30 p-3 text-sm"
                >
                  <h3 className="col-span-2 break-words font-medium">
                    <MemberProfileName member={m} label={m.name} />
                  </h3>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    Status
                  </span>
                  <span className="text-right capitalize">{statusOf(state, m.id)}</span>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    Expiry
                  </span>
                  <span className="text-right text-muted-foreground">
                    {ms ? shortDate(ms.endDate) : "—"}
                  </span>
                </article>
              );
            })}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="py-3">Member</th>
                <th className="py-3">Status</th>
                <th className="py-3">Expiry</th>
              </tr>
            </thead>
            <tbody>
              {gymMembers(state)
                .slice(0, 10)
                .map((m) => {
                  const ms = currentMembership(state, m.id);
                  return (
                    <tr key={m.id} className="border-b border-border/50">
                      <td className="py-2.5">
                        <MemberProfileName member={m} label={m.name} />
                      </td>
                      <td className="py-2.5 capitalize text-muted-foreground">
                        {statusOf(state, m.id)}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {ms ? shortDate(ms.endDate) : "—"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
