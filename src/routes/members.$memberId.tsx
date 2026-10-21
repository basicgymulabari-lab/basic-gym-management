import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Cake,
  ShieldAlert,
  Clock3,
  Plus,
  RefreshCw,
  Snowflake,
  Pencil,
  Trash2,
  Wallet,
  Eye,
  ClipboardCopy,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { AppDatePicker } from "@/components/app/AppDatePicker";
import { AttendanceDeleteDialog } from "@/components/app/AttendanceDeleteDialog";
import { PageHeader, Panel, EmptyState } from "@/components/app/Panel";
import { StatusBadge } from "@/components/app/StatCard";
import { MemberFormDialog } from "@/components/app/MemberFormDialog";
import { PrivateAssetImage } from "@/components/app/PrivateAssetImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InvoiceDialog, type InvoiceData } from "@/components/app/InvoiceDialog";
import { localDateInput } from "@/lib/gym/calendar";
import { membershipEndDate } from "@/lib/gym/membership";
import {
  addNote,
  addPayment,
  addSalePayment,
  correctUnpaidMembership,
  deleteNote,
  renewMembership,
  toggleFreeze,
  updateNote,
  voidUnpaidMembership,
  useGym,
} from "@/lib/gym/store";
import {
  currentMembership,
  dueFor,
  isWalkIn,
  membershipHistory,
  membershipPayable,
  money,
  outstandingFor,
  paidFor,
  planOf,
  salePaid,
  saleDue,
  salesFor,
  shortDateTime,
  shortDate,
  compactDate,
  statusOf,
} from "@/lib/gym/selectors";
import type {
  AttendanceRecord,
  GymState,
  Membership,
  Payment,
  PaymentMethod,
  ProgressNote,
  Sale,
} from "@/lib/gym/types";

type CollectBalanceTarget =
  { kind: "membership"; membership: Membership } | { kind: "purchase"; sale: Sale };
type AttendancePeriod = "all" | "30days" | "90days" | "custom";

function recentAttendanceStart(days: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days + 1);
  return localDateInput(date);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export const Route = createFileRoute("/members/$memberId")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab:
      typeof search.tab === "string" &&
      ["history", "attendance", "payments", "purchases", "notes"].includes(search.tab)
        ? search.tab
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Member Profile — IRONVAULT Gym Management" },
      {
        name: "description",
        content:
          "Member profile with attendance, membership history, payments, product purchases and progress notes.",
      },
      { property: "og:title", content: "Member Profile — IRONVAULT Gym Management" },
      {
        property: "og:description",
        content:
          "Attendance, membership history, dues and trainer progress notes in one profile.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <MemberProfile />
    </AppShell>
  ),
});

function MemberProfile() {
  const state = useGym();
  const { memberId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(tab ?? "history");
  useEffect(() => {
    if (tab) setActiveTab(tab);
  }, [tab]);
  const [editOpen, setEditOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<ProgressNote | null>(null);
  const [deletingNote, setDeletingNote] = useState<ProgressNote | null>(null);
  const [deletingAttendance, setDeletingAttendance] = useState<AttendanceRecord | null>(null);
  const [collectFor, setCollectFor] = useState<CollectBalanceTarget | null>(null);
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [editingMembership, setEditingMembership] = useState<Membership | null>(null);
  const [voidingMembership, setVoidingMembership] = useState<Membership | null>(null);
  const [attendancePeriod, setAttendancePeriod] = useState<AttendancePeriod>("all");
  const [attendanceStartDate, setAttendanceStartDate] = useState("");
  const [attendanceEndDate, setAttendanceEndDate] = useState("");

  const member = state?.members.find((m) => m.id === memberId);

  if (!state) return null;
  if (!member) {
    return (
      <EmptyState title="Member not found" hint="This record may have been permanently deleted." />
    );
  }

  const cur = state.settings.currency;
  const walkIn = isWalkIn(member);
  const status = walkIn ? "walk-in" : statusOf(state, member.id);
  const ms = currentMembership(state, member.id);
  const due = walkIn ? outstandingFor(state, member.id) : dueFor(state, member.id);
  const copyMemberSummary = async () => {
    const rows: Array<[string, string]> = [
      ["Member", member.name],
      ["Status", status],
      ["Phone", member.phone || "—"],
    ];
    if (member.email) rows.push(["Email", member.email]);
    rows.push(["Membership", ms ? (planOf(state, ms.planId)?.name ?? "—") : "No current plan"]);
    if (ms) rows.push(["Valid through", shortDate(ms.endDate)]);
    rows.push(["Balance due", money(due, cur)]);
    const plainText = `${state.settings.gymName} · Member summary\n\n${rows
      .map(([label, value]) => `${label}: ${value}`)
      .join("\n")}`;
    const html = `<div><p><strong>${escapeHtml(state.settings.gymName)} · Member summary</strong></p><table style="border-collapse:collapse"><tbody>${rows
      .map(
        ([label, value]) =>
          `<tr><th style="padding:4px 12px 4px 0;text-align:left">${escapeHtml(label)}</th><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`,
      )
      .join("")}</tbody></table></div>`;

    try {
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plainText], { type: "text/plain" }),
          }),
        ]);
        toast.success("Formatted member summary copied");
        return;
      }
      await navigator.clipboard.writeText(plainText);
      toast.success("Member summary copied");
    } catch {
      try {
        await navigator.clipboard.writeText(plainText);
        toast.success("Plain-text member summary copied");
      } catch {
        toast.error("Could not access the clipboard. Check your browser permissions.");
      }
    }
  };
  const payments = state.payments.filter((p) => p.memberId === member.id);
  const purchases = salesFor(state, member.id);
  const allAttendanceRecords = (state.attendance ?? [])
    .filter((record) => record.memberId === member.id && !record.deletedAt)
    .sort((left, right) => right.checkedInAt.localeCompare(left.checkedInAt));
  const customAttendanceRangeReady =
    attendancePeriod !== "custom" || Boolean(attendanceStartDate && attendanceEndDate);
  const attendanceRecords = customAttendanceRangeReady
    ? allAttendanceRecords.filter((record) => {
        if (attendancePeriod === "30days") return record.date >= recentAttendanceStart(30);
        if (attendancePeriod === "90days") return record.date >= recentAttendanceStart(90);
        if (attendancePeriod === "custom") {
          return record.date >= attendanceStartDate && record.date <= attendanceEndDate;
        }
        return true;
      })
    : [];
  const attendanceDescription = !customAttendanceRangeReady
    ? "Choose a start and end date to filter visits"
    : attendancePeriod === "all"
      ? `${allAttendanceRecords.length} ${allAttendanceRecords.length === 1 ? "visit" : "visits"} recorded`
      : `${attendanceRecords.length} ${attendanceRecords.length === 1 ? "visit" : "visits"} shown · ${allAttendanceRecords.length} total`;
  const duePurchase = purchases.find((sale) => saleDue(state, sale) > 0);
  const profileTab =
    walkIn && !["payments", "purchases"].includes(activeTab) ? "purchases" : activeTab;

  return (
    <>
      <Button variant="ghost" size="sm" className="mb-3 -ml-2 text-muted-foreground" asChild>
        <Link to="/members" search={{ filter: "all", q: "", new: false }}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to members
        </Link>
      </Button>

      <PageHeader
        title={member.name}
        subtitle={walkIn ? "Walk-in Customer" : `Member since ${shortDate(member.joinDate)}`}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => void copyMemberSummary()}
              aria-label="Copy formatted member summary"
              title="Copy a formatted summary for pasting into documents"
            >
              <ClipboardCopy className="mr-2 h-4 w-4" /> Copy summary
            </Button>
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </Button>
            {!walkIn && ms && (
              <Button
                variant="secondary"
                onClick={() => {
                  if (toggleFreeze(ms.id))
                    toast.success(ms.frozen ? "Membership unfrozen" : "Membership frozen");
                  else toast.error("Membership was not changed.");
                }}
              >
                <Snowflake className="mr-2 h-4 w-4" /> {ms.frozen ? "Unfreeze" : "Freeze"}
              </Button>
            )}
            {!walkIn && (
              <Button onClick={() => setRenewOpen(true)}>
                <RefreshCw className="mr-2 h-4 w-4" /> Renew
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Panel>
            <div className="flex flex-col items-center text-center">
              <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-3xl border border-gold/35 bg-secondary font-display text-3xl text-gold">
                {member.photo ? (
                  <PrivateAssetImage
                    source={member.photo}
                    alt={member.name}
                    className="h-full w-full object-cover"
                    fallback={member.name.slice(0, 2).toUpperCase()}
                  />
                ) : (
                  member.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <p className="mt-3 font-display text-2xl tracking-wide">{member.name}</p>
              <div className="mt-2">
                <StatusBadge status={status} />
              </div>
            </div>

            <dl className="mt-6 space-y-3 text-sm">
              <Info icon={Phone} value={member.phone} />
              <Info icon={Mail} value={member.email || "—"} />
              {!walkIn && <Info icon={Cake} value={shortDate(member.dob.slice(0, 10))} />}
              <Info icon={MapPin} value={member.address || "—"} />
              {!walkIn && (
                <Info icon={ShieldAlert} value={`Emergency: ${member.emergencyContact || "—"}`} />
              )}
            </dl>
          </Panel>

          <Panel
            title="Membership Status"
            actions={
              walkIn && duePurchase ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCollectFor({ kind: "purchase", sale: duePurchase })}
                >
                  <Wallet className="mr-1.5 h-3.5 w-3.5" /> Record Payment
                </Button>
              ) : undefined
            }
          >
            {walkIn ? (
              <div className="space-y-3 text-sm">
                <Row label="Membership" value="No Membership" />
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="text-muted-foreground">Outstanding</span>
                  <span
                    className={`font-display text-xl ${due > 0 ? "text-warning" : "text-success"}`}
                  >
                    {money(due, cur)}
                  </span>
                </div>
              </div>
            ) : ms ? (
              <div className="space-y-3 text-sm">
                <Row label="Plan" value={planOf(state, ms.planId)?.name ?? "—"} />
                <Row label="Start" value={shortDate(ms.startDate)} />
                <Row label="Expiry" value={shortDate(ms.endDate)} />
                <Row label="Plan price" value={money(ms.price - ms.discount, cur)} />
                {(ms.joiningFee ?? 0) > 0 && (
                  <Row label="Joining fee" value={money(ms.joiningFee ?? 0, cur)} />
                )}
                <Row label="Paid" value={money(paidFor(state, ms.id), cur)} />
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="text-muted-foreground">Total due</span>
                  <span
                    className={`font-display text-xl ${due > 0 ? "text-warning" : "text-success"}`}
                  >
                    {money(due, cur)}
                  </span>
                </div>
              </div>
            ) : (
              <EmptyState title="No active membership" hint="Renew to start a new term." />
            )}
          </Panel>
        </div>

        <Tabs value={profileTab} onValueChange={setActiveTab} className="min-w-0">
          <TabsList className="mb-4 flex-wrap">
            {!walkIn && <TabsTrigger value="history">Membership History</TabsTrigger>}
            {!walkIn && <TabsTrigger value="attendance">Attendance</TabsTrigger>}
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="purchases">Product Purchases</TabsTrigger>
            {!walkIn && <TabsTrigger value="notes">Progress Notes</TabsTrigger>}
          </TabsList>

          <TabsContent value="history">
            <Panel title="Membership History">
              {membershipHistory(state, member.id).length === 0 ? (
                <EmptyState
                  title="No membership history"
                  hint="Membership terms will appear here when assigned."
                />
              ) : (
                <div className="space-y-3">
                  {membershipHistory(state, member.id).map((h) => {
                    const paid = paidFor(state, h.id);
                    const bal = Math.max(0, membershipPayable(h) - paid);
                    const canCorrect = paid === 0 && !h.frozen;
                    return (
                      <article
                        key={h.id}
                        className="rounded-xl border border-border bg-secondary/20 p-4"
                      >
                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="break-words font-medium">
                              {planOf(state, h.planId)?.name ?? "—"}
                            </h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {compactDate(h.startDate)} → {compactDate(h.endDate)}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${bal > 0 ? "border-warning/30 text-warning" : "border-success/30 text-success"}`}
                          >
                            {bal > 0 ? `Balance ${money(bal, cur)}` : "Fully paid"}
                          </span>
                        </div>
                        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border/60 pt-3 text-sm sm:grid-cols-3">
                          <div>
                            <dt className="text-xs text-muted-foreground">Base plan price</dt>
                            <dd>{money(h.price, cur)}</dd>
                          </div>
                          {h.discount > 0 && (
                            <div>
                              <dt className="text-xs text-muted-foreground">Discount</dt>
                              <dd className="text-warning">−{money(h.discount, cur)}</dd>
                            </div>
                          )}
                          {(h.joiningFee ?? 0) > 0 && (
                            <div>
                              <dt className="text-xs text-muted-foreground">Joining fee</dt>
                              <dd>{money(h.joiningFee ?? 0, cur)}</dd>
                            </div>
                          )}
                          <div>
                            <dt className="text-xs text-muted-foreground">Total payable</dt>
                            <dd className="font-medium">{money(membershipPayable(h), cur)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Paid</dt>
                            <dd className="text-success">{money(paid, cur)}</dd>
                          </div>
                        </dl>
                        {bal > 0 && (
                          <div className="mt-4 flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
                            <Button
                              size="sm"
                              variant="secondary"
                              className="w-full sm:w-auto"
                              onClick={() => setCollectFor({ kind: "membership", membership: h })}
                            >
                              <Wallet className="mr-1.5 h-3.5 w-3.5" /> Collect balance
                            </Button>
                            {canCorrect && (
                              <MembershipHistoryActions
                                onEdit={() => setEditingMembership(h)}
                                onVoid={() => setVoidingMembership(h)}
                              />
                            )}
                          </div>
                        )}
                        {bal <= 0 && (
                          <div className="mt-4 flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
                            {canCorrect ? (
                              <MembershipHistoryActions
                                onEdit={() => setEditingMembership(h)}
                                onVoid={() => setVoidingMembership(h)}
                              />
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                {h.frozen
                                  ? "Unfreeze this term before correcting it."
                                  : "This term has payment history. To protect issued receipts, it can’t be edited or removed here."}
                              </p>
                            )}
                          </div>
                        )}
                        {bal > 0 && !canCorrect && (
                          <p className="mt-3 text-xs text-muted-foreground">
                            {h.frozen
                              ? "Unfreeze this term before correcting it."
                              : "This term has payment history. To protect issued receipts, it can’t be edited or removed here."}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </Panel>
          </TabsContent>

          <TabsContent value="attendance">
            <Panel title="Attendance History" description={attendanceDescription}>
              {allAttendanceRecords.length > 0 && (
                <div className="mb-4 space-y-3">
                  <div className="w-full sm:max-w-xs">
                    <Label className="mb-1.5 block text-xs text-muted-foreground">Date range</Label>
                    <Select
                      value={attendancePeriod}
                      onValueChange={(value) => setAttendancePeriod(value as AttendancePeriod)}
                    >
                      <SelectTrigger aria-label="Filter member attendance by date range">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All dates</SelectItem>
                        <SelectItem value="30days">Last 30 days</SelectItem>
                        <SelectItem value="90days">Last 90 days</SelectItem>
                        <SelectItem value="custom">Custom range</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {attendancePeriod === "custom" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="min-w-0">
                        <Label className="mb-1.5 block text-xs text-muted-foreground">From</Label>
                        <AppDatePicker
                          value={attendanceStartDate}
                          onChange={setAttendanceStartDate}
                          max={
                            attendanceEndDate
                              ? new Date(`${attendanceEndDate}T00:00:00`)
                              : undefined
                          }
                          placeholder="Start date"
                          ariaLabel="Attendance start date"
                        />
                      </div>
                      <div className="min-w-0">
                        <Label className="mb-1.5 block text-xs text-muted-foreground">To</Label>
                        <AppDatePicker
                          value={attendanceEndDate}
                          onChange={setAttendanceEndDate}
                          min={
                            attendanceStartDate
                              ? new Date(`${attendanceStartDate}T00:00:00`)
                              : undefined
                          }
                          placeholder="End date"
                          ariaLabel="Attendance end date"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
              {attendanceRecords.length === 0 ? (
                <EmptyState
                  title={
                    allAttendanceRecords.length === 0
                      ? "No attendance history"
                      : customAttendanceRangeReady
                        ? "No visits in this date range"
                        : "Choose your date range"
                  }
                  hint={
                    allAttendanceRecords.length === 0
                      ? "This member’s check-ins will appear here."
                      : customAttendanceRangeReady
                        ? "Try another range or select All dates."
                        : "Select both a start and end date to see visits."
                  }
                />
              ) : (
                <div className="space-y-2">
                  {attendanceRecords.map((record) => (
                    <article
                      key={record.id}
                      data-testid={`member-attendance-${record.id}`}
                      className="flex min-w-0 flex-col gap-2 rounded-xl border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{shortDate(record.date)}</p>
                      </div>
                      <div className="flex w-full min-w-0 items-center justify-between gap-3 sm:ml-auto sm:flex-1 sm:justify-end">
                        <span
                          data-testid="member-attendance-shift-badge"
                          className={
                            record.shift
                              ? "inline-flex shrink-0 items-center rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-medium text-gold sm:mr-2"
                              : "inline-flex shrink-0 items-center rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs font-medium text-muted-foreground sm:mr-2"
                          }
                        >
                          {record.shift
                            ? `${record.shift[0].toUpperCase()}${record.shift.slice(1)}`
                            : "Not assigned"}
                        </span>
                        <p
                          data-testid="member-attendance-check-in-time"
                          className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-muted-foreground"
                        >
                          <Clock3 className="h-4 w-4" />
                          {new Date(record.checkedInAt).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={`Remove attendance for ${record.memberName}`}
                          title="Remove this check-in"
                          onClick={() => setDeletingAttendance(record)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </Panel>
          </TabsContent>

          <TabsContent value="payments">
            <Panel title="Payment History">
              {payments.length === 0 ? (
                <EmptyState title="No payments recorded yet" />
              ) : (
                <>
                  <div className="space-y-3 sm:hidden">
                    {payments.map((p) => (
                      <article
                        key={p.id}
                        className="rounded-xl border border-border bg-secondary/20 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="break-all font-medium text-gold">{p.invoiceNo}</p>
                            <p className="mt-1 break-words text-sm text-muted-foreground">
                              {p.note || "Membership payment"}
                            </p>
                          </div>
                          <p className="shrink-0 text-right font-medium">{money(p.amount, cur)}</p>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-sm">
                          <span className="text-muted-foreground">{shortDateTime(p.date)}</span>
                          <Button
                            variant="secondary"
                            size="sm"
                            aria-label={`View invoice ${p.invoiceNo}`}
                            onClick={() =>
                              setInvoice(invoiceOf(p, member.name, member.phone, state))
                            }
                          >
                            <Eye className="mr-1.5 h-4 w-4" /> View invoice
                          </Button>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto sm:block">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                          <th className="py-3">Invoice</th>
                          <th className="py-3">Paid at</th>
                          <th className="py-3">Note</th>
                          <th className="py-3 text-right">Amount</th>
                          <th className="py-3 text-right">Invoice</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((p) => (
                          <tr key={p.id} className="border-b border-border/50">
                            <td className="py-3 font-medium text-gold">{p.invoiceNo}</td>
                            <td className="py-3 text-muted-foreground">{shortDateTime(p.date)}</td>
                            <td className="py-3 text-muted-foreground">{p.note}</td>
                            <td className="py-3 text-right">{money(p.amount, cur)}</td>
                            <td className="py-3 text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="View invoice"
                                onClick={() =>
                                  setInvoice(invoiceOf(p, member.name, member.phone, state))
                                }
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Panel>
          </TabsContent>

          <TabsContent value="purchases">
            <Panel title="Product Purchases">
              {purchases.length === 0 ? (
                <EmptyState title="No product purchases yet" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                        <th className="py-3">Invoice</th>
                        <th className="py-3">Purchased at</th>
                        <th className="py-3">Product</th>
                        <th className="py-3 text-right">Total</th>
                        <th className="py-3 text-right">Paid</th>
                        <th className="py-3 text-right">Due</th>
                        <th className="py-3 text-right">Invoice</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchases.map((s) => {
                        const paid = salePaid(state, s);
                        const bal = saleDue(state, s);
                        return (
                          <tr key={s.id} className="border-b border-border/50">
                            <td className="py-3 font-medium text-gold">{s.invoiceNo}</td>
                            <td className="py-3 text-muted-foreground">{shortDateTime(s.date)}</td>
                            <td className="py-3">
                              {s.productName} × {s.qty}
                            </td>
                            <td className="py-3 text-right">{money(s.total, cur)}</td>
                            <td className="py-3 text-right text-success">{money(paid, cur)}</td>
                            <td
                              className={`py-3 text-right ${bal > 0 ? "text-warning" : "text-success"}`}
                            >
                              {money(bal, cur)}
                            </td>
                            <td className="py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {bal > 0 ? (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => setCollectFor({ kind: "purchase", sale: s })}
                                  >
                                    <Wallet className="mr-1.5 h-3.5 w-3.5" /> Collect balance
                                  </Button>
                                ) : (
                                  <span className="text-xs text-success">Fully paid</span>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  aria-label="View invoice"
                                  onClick={() =>
                                    setInvoice({
                                      invoiceNo: s.invoiceNo,
                                      date: s.date,
                                      title: "Sales Invoice",
                                      walkIn,
                                      billedTo: member.name,
                                      contact: member.phone,
                                      lines: [
                                        {
                                          description: s.productName,
                                          qty: s.qty,
                                          rate: s.unitPrice,
                                        },
                                      ],
                                      discount: s.discount ?? 0,
                                      paid,
                                      method: [...state.payments]
                                        .filter((payment) => payment.saleId === s.id)
                                        .sort(
                                          (a, b) =>
                                            new Date(a.date).getTime() - new Date(b.date).getTime(),
                                        )[0]?.method,
                                    })
                                  }
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </TabsContent>

          <TabsContent value="notes">
            <Panel
              title="Progress Notes"
              actions={
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditingNote(null);
                    setNoteOpen(true);
                  }}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add note
                </Button>
              }
            >
              {member.notes.length === 0 ? (
                <EmptyState title="No progress notes yet" />
              ) : (
                <ul className="space-y-3">
                  {member.notes.map((n) => (
                    <li key={n.id} className="rounded-xl border border-border bg-secondary/30 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{n.title}</p>
                          <span className="text-xs text-muted-foreground">{shortDate(n.date)}</span>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Edit progress note"
                            onClick={() => {
                              setEditingNote(n);
                              setNoteOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            aria-label="Delete progress note"
                            onClick={() => setDeletingNote(n)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{n.note}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </TabsContent>
        </Tabs>
      </div>

      <MemberFormDialog open={editOpen} onOpenChange={setEditOpen} member={member} />
      {!walkIn && (
        <RenewDialog
          open={renewOpen}
          onOpenChange={setRenewOpen}
          memberId={member.id}
          onDone={() =>
            navigate({
              to: "/members/$memberId",
              params: { memberId: member.id },
              search: { tab: undefined },
            })
          }
        />
      )}
      {!walkIn && (
        <NoteDialog
          open={noteOpen}
          onOpenChange={(open) => {
            setNoteOpen(open);
            if (!open) setEditingNote(null);
          }}
          memberId={member.id}
          note={editingNote}
        />
      )}
      <Dialog open={Boolean(deletingNote)} onOpenChange={(open) => !open && setDeletingNote(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl tracking-wide">
              Delete progress note?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete{" "}
            <strong className="text-foreground">{deletingNote?.title}</strong>.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeletingNote(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!deletingNote || !deleteNote(member.id, deletingNote.id)) {
                  return toast.error("Progress note could not be deleted");
                }
                setDeletingNote(null);
                toast.success("Progress note deleted");
              }}
            >
              Delete note
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CollectBalanceDialog
        target={collectFor}
        onClose={() => setCollectFor(null)}
        memberName={member.name}
      />
      <InvoiceDialog
        invoice={invoice}
        settings={state.settings}
        onOpenChange={() => setInvoice(null)}
      />
      <AttendanceDeleteDialog record={deletingAttendance} onOpenChange={setDeletingAttendance} />
      {editingMembership && (
        <MembershipCorrectionDialog
          key={editingMembership.id}
          membership={editingMembership}
          onClose={() => setEditingMembership(null)}
        />
      )}
      {voidingMembership && (
        <VoidMembershipDialog
          key={voidingMembership.id}
          membership={voidingMembership}
          onClose={() => setVoidingMembership(null)}
        />
      )}
    </>
  );
}

function invoiceOf(
  p: Payment,
  name: string,
  phone: string | undefined,
  state: GymState,
): InvoiceData {
  const ms = p.membershipId ? state.memberships.find((m) => m.id === p.membershipId) : null;
  if (ms) {
    const plan = planOf(state, ms.planId);
    return {
      invoiceNo: p.invoiceNo,
      date: p.date,
      billedTo: name,
      contact: phone,
      title: "Membership Payment Receipt",
      lines: [
        {
          description: p.note || `${plan?.name ?? "Membership"} payment`,
          qty: 1,
          rate: p.amount,
        },
      ],
      paid: p.amount,
      method: p.method,
    };
  }
  return {
    invoiceNo: p.invoiceNo,
    date: p.date,
    billedTo: name,
    contact: phone,
    lines: [{ description: p.note || "Payment", qty: 1, rate: p.amount }],
    paid: p.amount,
    method: p.method,
  };
}

function CollectBalanceDialog({
  target,
  memberName,
  onClose,
}: {
  target: CollectBalanceTarget | null;
  memberName: string;
  onClose: () => void;
}) {
  const state = useGym();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Payment["method"]>("cash");
  const [note, setNote] = useState("");
  const [seeded, setSeeded] = useState<string | null>(null);

  if (!state || !target) return null;
  const cur = state.settings.currency;
  const membership = target.kind === "membership" ? target.membership : null;
  const sale = target.kind === "purchase" ? target.sale : null;
  const targetId = membership?.id ?? sale!.id;
  const total = membership ? membershipPayable(membership) : sale!.total;
  const paid = membership ? paidFor(state, membership.id) : salePaid(state, sale!);
  const balance = Math.max(0, total - paid);
  const plan = membership ? planOf(state, membership.planId) : null;

  if (seeded !== targetId) {
    setSeeded(targetId);
    setAmount(String(balance));
    setMethod("cash");
    setNote("");
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-wide">Collect Balance</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border border-border bg-secondary/30 p-4 text-sm">
            <Row label="Member" value={memberName} />
            <Row
              label={membership ? "Plan" : "Product"}
              value={membership ? (plan?.name ?? "—") : `${sale!.productName} × ${sale!.qty}`}
            />
            <Row label="Total price" value={money(total, cur)} />
            <Row label="Already paid" value={money(paid, cur)} />
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-muted-foreground">Remaining balance</span>
              <span className="font-display text-xl text-warning">{money(balance, cur)}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Payment amount</Label>
            <Input
              type="number"
              min={1}
              max={balance}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Payment method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as Payment["method"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="bank">Bank transfer</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Input
              value={note}
              maxLength={120}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Balance payment"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const n = Number(amount);
                if (Number.isNaN(n) || n <= 0)
                  return toast.error("Enter an amount greater than zero");
                if (n > balance) return toast.error("Payment cannot exceed the remaining balance");
                const saved = membership
                  ? addPayment({
                      memberId: membership.memberId,
                      membershipId: membership.id,
                      amount: n,
                      method,
                      purpose: "membership_balance",
                      note: note.trim() || `${plan?.name ?? "Membership"} — balance payment`,
                    })
                  : addSalePayment(
                      sale!.id,
                      n,
                      method,
                      note.trim() || `${sale!.productName} — balance payment`,
                    );
                if (!saved) return toast.error("Payment could not be recorded");
                toast.success(
                  n === balance ? "Payment complete — balance fully paid" : "Payment recorded",
                );
                setSeeded(null);
                onClose();
              }}
            >
              Complete payment
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ icon: Icon, value }: { icon: typeof Mail; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
      <span className="min-w-0 break-words text-muted-foreground">{value}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

export function RenewDialog({
  open,
  onOpenChange,
  memberId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  memberId: string;
  onDone?: () => void;
}) {
  const state = useGym();
  const [planId, setPlanId] = useState("");
  const [startDate, setStartDate] = useState(() => localDateInput(new Date()));
  const [discountType, setDiscountType] = useState<"none" | "percent" | "fixed">("none");
  const [discountValue, setDiscountValue] = useState("");
  const [paid, setPaid] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const latestMembership = state?.memberships
    .filter((membership) => membership.memberId === memberId)
    .sort((a, b) => +new Date(b.endDate) - +new Date(a.endDate))[0];
  const latestEndDate = latestMembership ? new Date(latestMembership.endDate) : null;
  const suggestedStartDate =
    latestEndDate && latestEndDate > new Date()
      ? localDateInput(latestEndDate)
      : localDateInput(new Date());

  useEffect(() => {
    if (open) setStartDate(suggestedStartDate);
  }, [open, memberId, suggestedStartDate]);

  if (!state) return null;
  const plan = state.plans.find((p) => p.id === planId);
  const cur = state.settings.currency;
  const parsedStartDate = new Date(`${startDate}T00:00:00`);
  const startDateValid = Boolean(
    /^\d{4}-\d{2}-\d{2}$/.test(startDate) &&
    Number.isFinite(parsedStartDate.getTime()) &&
    localDateInput(parsedStartDate) === startDate,
  );
  const renewalEndDate = plan && startDateValid ? membershipEndDate(parsedStartDate, plan) : null;
  const originalPrice = plan?.price ?? 0;
  const rawDiscount =
    discountType === "none"
      ? 0
      : discountType === "percent"
        ? (originalPrice * (Number(discountValue) || 0)) / 100
        : Number(discountValue) || 0;
  const discountAmount = Math.min(Math.max(0, Math.round(rawDiscount)), originalPrice);
  const finalPrice = originalPrice - discountAmount;
  const paidNum = Number(paid || 0);
  const paidValid =
    paid === "" || (Number.isFinite(paidNum) && paidNum >= 0 && paidNum <= finalPrice);
  const discountValid =
    discountType === "none" ||
    (discountValue !== "" &&
      Number.isFinite(Number(discountValue)) &&
      Number(discountValue) >= 0 &&
      (discountType === "percent"
        ? Number(discountValue) <= 100
        : Number(discountValue) <= originalPrice));
  const remaining = Math.max(0, finalPrice - (paid === "" ? 0 : paidNum));

  const reset = () => {
    setPlanId("");
    setStartDate(suggestedStartDate);
    setPaid("");
    setDiscountType("none");
    setDiscountValue("");
    setPaymentMethod("cash");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-wide">
            Renew Membership
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Plan</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a plan" />
              </SelectTrigger>
              <SelectContent>
                {state.plans
                  .filter((p) => !p.deletedAt)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {money(p.price, cur)} / {p.durationDays} days
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Membership start date</Label>
            <AppDatePicker
              value={startDate}
              onChange={setStartDate}
              ariaLabel="Membership start date"
              placeholder="Select membership start date"
            />
            <p className="text-xs text-muted-foreground">
              Choose a past, current, or future date for this renewed term.
            </p>
            {renewalEndDate && (
              <p className="text-xs text-muted-foreground">
                Membership period: {shortDate(parsedStartDate)} → {shortDate(renewalEndDate)}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Discount type</Label>
            <Select
              value={discountType}
              onValueChange={(v) => setDiscountType(v as "none" | "percent" | "fixed")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No discount</SelectItem>
                <SelectItem value="percent">Percentage (%)</SelectItem>
                <SelectItem value="fixed">Fixed amount ({cur})</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {discountType !== "none" && (
            <div className="space-y-2">
              <Label>{discountType === "percent" ? "Discount (%)" : `Discount (${cur})`}</Label>
              <Input
                type="number"
                min={0}
                max={discountType === "percent" ? 100 : originalPrice}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder="0"
              />
              {!discountValid && (
                <p className="text-xs text-destructive">Enter a valid discount.</p>
              )}
            </div>
          )}
          {plan && (
            <div className="space-y-1 rounded-lg border border-border bg-background/40 p-3 text-sm">
              <Row label="Original price" value={money(originalPrice, cur)} />
              <Row label="Discount" value={`- ${money(discountAmount, cur)}`} />
              <Row label="Final payable" value={money(finalPrice, cur)} />
              <Row label="Remaining balance" value={money(remaining, cur)} />
            </div>
          )}
          <div className="space-y-2">
            <Label>Amount collected now</Label>
            <Input
              type="number"
              min={0}
              max={finalPrice}
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
              placeholder={plan ? String(finalPrice) : "0"}
            />
            {!paidValid && (
              <p className="text-xs text-destructive">
                Amount collected cannot exceed the final payable amount ({money(finalPrice, cur)}).
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Payment method</Label>
            <Select
              value={paymentMethod}
              onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
              disabled={paidValid && paidNum === 0}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="bank">Bank transfer</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={!planId || !startDateValid || !paidValid || !discountValid}
              onClick={() => {
                const amount = Number(paid || 0);
                if (!Number.isFinite(amount) || amount < 0 || amount > finalPrice) {
                  toast.error("Enter a valid amount");
                  return;
                }
                if (
                  !renewMembership(
                    memberId,
                    planId,
                    amount,
                    discountAmount,
                    paymentMethod,
                    startDate,
                  )
                ) {
                  toast.error("Renewal was not saved. Check the account, member and plan details.");
                  return;
                }
                toast.success("Membership renewed");
                onOpenChange(false);
                reset();
                onDone?.();
              }}
            >
              Confirm renewal
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NoteDialog({
  open,
  onOpenChange,
  memberId,
  note: existingNote,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  memberId: string;
  note: ProgressNote | null;
}) {
  const key = existingNote?.id ?? "new";
  const [loadedKey, setLoadedKey] = useState(key);
  const [title, setTitle] = useState(existingNote?.title ?? "");
  const [note, setNote] = useState(existingNote?.note ?? "");
  if (loadedKey !== key) {
    setLoadedKey(key);
    setTitle(existingNote?.title ?? "");
    setNote(existingNote?.note ?? "");
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-wide">
            {existingNote ? "Edit Progress Note" : "Add Progress Note"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea
              rows={4}
              value={note}
              maxLength={600}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (title.trim().length < 2 || note.trim().length < 2) {
                  toast.error("Add a title and note");
                  return;
                }
                if (existingNote) {
                  if (
                    !updateNote(memberId, existingNote.id, {
                      title: title.trim(),
                      note: note.trim(),
                    })
                  ) {
                    return toast.error("Progress note could not be updated");
                  }
                  toast.success("Progress note updated");
                } else {
                  if (!addNote(memberId, title.trim(), note.trim())) {
                    return toast.error("Progress note could not be saved");
                  }
                  toast.success("Progress note saved");
                }
                setTitle("");
                setNote("");
                onOpenChange(false);
              }}
            >
              {existingNote ? "Save changes" : "Save note"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MembershipHistoryActions({ onEdit, onVoid }: { onEdit: () => void; onVoid: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={onEdit}>
        <Pencil className="mr-1.5 h-3.5 w-3.5" /> Correct term
      </Button>
      <Button size="sm" variant="ghost" className="text-destructive" onClick={onVoid}>
        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove unpaid term
      </Button>
    </div>
  );
}

function MembershipCorrectionDialog({
  membership,
  onClose,
}: {
  membership: Membership;
  onClose: () => void;
}) {
  const state = useGym();
  const [planId, setPlanId] = useState(membership.planId);
  const [startDate, setStartDate] = useState(membership.startDate.slice(0, 10));
  const [discount, setDiscount] = useState(String(membership.discount));
  const [joiningFee, setJoiningFee] = useState(String(membership.joiningFee ?? 0));
  const [reason, setReason] = useState("");

  if (!state) return null;
  const plan = state.plans.find((item) => item.id === planId && !item.deletedAt);
  const discountAmount = Number(discount);
  const joiningFeeAmount = Number(joiningFee);
  const amountsValid = Boolean(
    plan &&
    Number.isFinite(discountAmount) &&
    discountAmount >= 0 &&
    discountAmount <= plan.price &&
    Number.isFinite(joiningFeeAmount) &&
    joiningFeeAmount >= 0,
  );
  const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
  const startValid = Boolean(
    start &&
    Number.isFinite(start.getTime()) &&
    `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(
      start.getDate(),
    ).padStart(2, "0")}` === startDate,
  );
  const endDate = startValid && plan && start ? membershipEndDate(start, plan) : null;
  const payable = amountsValid && plan ? plan.price - discountAmount + joiningFeeAmount : null;
  const canSave = amountsValid && startValid && reason.trim().length >= 5;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-wide">
            Correct unpaid membership
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="rounded-lg border border-border bg-secondary/30 p-3 text-sm text-muted-foreground">
            This term has no recorded payments. Its record ID and history remain intact. Any payment
            or invoice records are never changed by this correction.
          </p>
          <div className="space-y-2">
            <Label htmlFor="membership-correction-plan">Membership plan</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger id="membership-correction-plan">
                <SelectValue placeholder="Select a plan" />
              </SelectTrigger>
              <SelectContent>
                {state.plans
                  .filter((item) => !item.deletedAt || item.id === membership.planId)
                  .map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                      {item.id === membership.planId && item.deletedAt ? " (Archived)" : ""}
                      {` — ${money(item.price, state.settings.currency)} / ${item.durationDays} days`}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Membership start date</Label>
            <AppDatePicker value={startDate} onChange={setStartDate} />
          </div>
          {endDate && (
            <p className="text-sm text-muted-foreground">
              Corrected membership expiry:{" "}
              <span className="text-foreground">{shortDate(endDate)}</span>
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="membership-correction-discount">
                Discount ({state.settings.currency})
              </Label>
              <Input
                id="membership-correction-discount"
                type="number"
                min={0}
                max={plan?.price}
                step="0.01"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="membership-correction-fee">
                Joining fee ({state.settings.currency})
              </Label>
              <Input
                id="membership-correction-fee"
                type="number"
                min={0}
                step="0.01"
                value={joiningFee}
                onChange={(event) => setJoiningFee(event.target.value)}
              />
            </div>
          </div>
          {payable !== null && (
            <div className="rounded-lg border border-border bg-secondary/30 p-3 text-sm">
              <Row
                label="Corrected plan price"
                value={money(plan!.price, state.settings.currency)}
              />
              <Row label="Discount" value={`− ${money(discountAmount, state.settings.currency)}`} />
              <Row label="Joining fee" value={money(joiningFeeAmount, state.settings.currency)} />
              <div className="mt-2 border-t border-border pt-2">
                <Row label="Corrected total" value={money(payable, state.settings.currency)} />
              </div>
            </div>
          )}
          {!amountsValid && (
            <p role="alert" className="text-sm text-destructive">
              Choose a plan and enter a valid non-negative discount and joining fee.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="membership-correction-reason">Reason for correction</Label>
            <Textarea
              id="membership-correction-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="For example: selected the wrong membership plan"
            />
            <p className="text-xs text-muted-foreground">Required (5–500 characters).</p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!canSave}
              onClick={() => {
                const result = correctUnpaidMembership({
                  membershipId: membership.id,
                  planId,
                  startDate,
                  discount: discountAmount,
                  joiningFee: joiningFeeAmount,
                  reason,
                });
                if (result !== "saved") {
                  toast.error(
                    result === "payments_linked"
                      ? "Payments are linked to this term. To protect the issued receipts, paid terms cannot be edited here."
                      : result === "membership_frozen"
                        ? "Unfreeze this membership before correcting it."
                        : "The correction could not be saved. Check the plan, date, amounts, and account access.",
                  );
                  return;
                }
                toast.success("Membership term corrected; its history was recorded.");
                onClose();
              }}
            >
              Save correction
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VoidMembershipDialog({
  membership,
  onClose,
}: {
  membership: Membership;
  onClose: () => void;
}) {
  const state = useGym();
  const [reason, setReason] = useState("");
  if (!state) return null;
  const planName = planOf(state, membership.planId)?.name ?? "Membership";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-wide">
            Remove unpaid term?
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            “{planName}” has no linked payments. Removing it updates membership status/history; a
            reason is retained in the activity history. This cannot remove or alter an invoice.
          </p>
          <div className="space-y-2">
            <Label htmlFor="membership-void-reason">Reason</Label>
            <Textarea
              id="membership-void-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="For example: duplicate term created by mistake"
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 5}
              onClick={() => {
                const result = voidUnpaidMembership(membership.id, reason);
                if (result !== "saved") {
                  toast.error(
                    result === "payments_linked"
                      ? "This term now has linked payments and cannot be removed."
                      : "The term could not be removed. Check the reason and account access.",
                  );
                  return;
                }
                toast.success("Unpaid membership removed; the action was recorded.");
                onClose();
              }}
            >
              Remove unpaid term
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
