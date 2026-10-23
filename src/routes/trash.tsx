import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { RotateCcw, Trash2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Panel, EmptyState } from "@/components/app/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  deleteAttendancePermanently,
  deleteMemberPermanently,
  deletePlanPermanently,
  deleteProductPermanently,
  deleteExpensePermanently,
  restoreExpense,
  restoreAttendanceRecord,
  restoreMembershipTerm,
  restorePaymentInvoice,
  deletePaymentInvoiceForever,
  restoreMember,
  restorePlan,
  restoreProduct,
  getCurrentSession,
  useGym,
} from "@/lib/gym/store";
import {
  daysUntil,
  membershipPayable,
  money,
  paidFor,
  saleDue,
  salePaid,
  shortDate,
  shortDateTime,
  trashedMembers,
  trashedAttendance,
  trashedPlans,
  trashedProducts,
  trashedExpenses,
} from "@/lib/gym/selectors";
import type { AttendanceRecord, Expense, GymState, Member, Plan, Product } from "@/lib/gym/types";
import {
  FREE_MEMBER_LIMIT,
  getSubscriptionSnapshot,
  openSubscriptionPaywall,
  regularMemberCount,
} from "@/lib/billing/client";
import { deletePrivateAsset } from "@/lib/gym/storage";

type TrashDetailsTarget =
  | { kind: "member"; record: Member }
  | { kind: "attendance"; record: AttendanceRecord }
  | { kind: "plan"; record: Plan }
  | { kind: "product"; record: Product }
  | { kind: "expense"; record: Expense };

export const Route = createFileRoute("/trash")({
  head: () => ({
    meta: [
      { title: "Trash — IRONVAULT Gym Management" },
      {
        name: "description",
        content:
          "Recover deleted member records within 30 days or permanently erase them with a typed DELETE confirmation.",
      },
      { property: "og:title", content: "Trash — IRONVAULT Gym Management" },
      {
        property: "og:description",
        content: "Safe delete with 30-day recovery and confirmed permanent deletion.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <TrashPage />
    </AppShell>
  ),
});

function TrashPage() {
  const state = useGym();
  const [target, setTarget] = useState<Member | null>(null);
  const [invoiceTarget, setInvoiceTarget] = useState<string | null>(null);
  const [invoiceConfirmation, setInvoiceConfirmation] = useState("");
  const [attendanceTarget, setAttendanceTarget] = useState<AttendanceRecord | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<TrashDetailsTarget | null>(null);

  const items = useMemo(() => (state ? trashedMembers(state) : []), [state]);
  const attendance = useMemo(() => (state ? trashedAttendance(state) : []), [state]);
  const plans = useMemo(() => (state ? trashedPlans(state) : []), [state]);
  const products = useMemo(() => (state ? trashedProducts(state) : []), [state]);
  const expenses = useMemo(() => (state ? trashedExpenses(state) : []), [state]);
  if (!state) return null;

  return (
    <>
      <PageHeader
        title="Trash"
        subtitle="Select a deleted item to review its saved details. Restore it or permanently remove it."
      />

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <p className="text-sm text-muted-foreground">
          Restore returns an item to its original section. Permanent deletion cannot be undone;
          deleting a member also erases its linked records and requires typing{" "}
          <strong>DELETE</strong>.
        </p>
      </div>

      <Panel title="Deleted Invoices">
        {state.payments.filter((payment) => payment.invoiceDeletedAt && !payment.invoicePurgedAt)
          .length === 0 ? (
          <EmptyState
            title="No deleted invoices"
            hint="Receipts moved to Trash remain recoverable. Payments still count toward revenue and paid amounts."
          />
        ) : (
          <div className="space-y-3">
            {state.payments
              .filter((payment) => payment.invoiceDeletedAt && !payment.invoicePurgedAt)
              .map((payment) => (
                <article
                  key={payment.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border p-4"
                >
                  <div className="min-w-0 space-y-1 text-sm">
                    <h3 className="break-words font-medium">
                      {payment.invoiceNo} ·{" "}
                      {state.members.find((member) => member.id === payment.memberId)?.name ??
                        payment.payerName ??
                        "Walk-in customer"}
                    </h3>
                    <p>
                      {money(payment.amount, state.settings.currency)} · {payment.method} ·{" "}
                      {shortDateTime(payment.date)}
                    </p>
                    <p className="break-words text-muted-foreground">{payment.note}</p>
                    <p className="text-muted-foreground">
                      Deleted {shortDateTime(payment.invoiceDeletedAt!)} by{" "}
                      {payment.invoiceDeletedBy ?? "Admin"}
                    </p>
                    <p className="text-xs text-warning">
                      Receipt hidden only. Payment retained in financial totals.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (restorePaymentInvoice(payment.id)) toast.success("Invoice restored");
                      else toast.error("Invoice could not be restored. Check your account access.");
                    }}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Restore invoice
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => {
                      setInvoiceTarget(payment.id);
                      setInvoiceConfirmation("");
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete forever
                  </Button>
                </article>
              ))}
          </div>
        )}
      </Panel>

      <Dialog
        open={Boolean(invoiceTarget)}
        onOpenChange={(open) => {
          if (!open) setInvoiceTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete invoice forever?</DialogTitle>
            <DialogDescription>
              This removes the receipt from Trash and prevents restoration. The payment record
              remains in financial totals; this does not refund money or change dues. Type DELETE to
              confirm.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="invoice-delete-confirmation">Type DELETE</Label>
          <Input
            id="invoice-delete-confirmation"
            value={invoiceConfirmation}
            onChange={(event) => setInvoiceConfirmation(event.target.value)}
            autoComplete="off"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setInvoiceTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={invoiceConfirmation !== "DELETE"}
              onClick={() => {
                if (
                  invoiceTarget &&
                  deletePaymentInvoiceForever(invoiceTarget, invoiceConfirmation)
                ) {
                  toast.success("Invoice removed from Trash permanently; payment retained");
                  setInvoiceTarget(null);
                } else toast.error("Invoice could not be removed. Check your account access.");
              }}
            >
              Delete forever
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Panel title="Deleted Membership Terms">
        {state.memberships.filter((term) => term.deletedAt).length === 0 ? (
          <EmptyState
            title="No deleted membership terms"
            hint="Deleted terms appear here for recovery. Payments and receipts are preserved."
          />
        ) : (
          <div className="space-y-3">
            {state.memberships
              .filter((term) => term.deletedAt)
              .map((term) => {
                const member = state.members.find((item) => item.id === term.memberId);
                const paid = paidFor(state, term.id);
                return (
                  <article
                    key={term.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border p-4"
                  >
                    <div className="min-w-0 space-y-1 text-sm">
                      <h3 className="break-words font-medium">
                        {member?.name ?? "Member"} ·{" "}
                        {state.plans.find((plan) => plan.id === term.planId)?.name ?? "Membership"}
                      </h3>
                      <p className="text-muted-foreground">
                        {shortDate(term.startDate)} → {shortDate(term.endDate)}
                      </p>
                      <p>
                        Total {money(membershipPayable(term), state.settings.currency)} · Paid{" "}
                        {money(paid, state.settings.currency)} · Due{" "}
                        {money(
                          Math.max(0, membershipPayable(term) - paid),
                          state.settings.currency,
                        )}
                      </p>
                      <p className="text-muted-foreground">
                        Deleted {shortDateTime(term.deletedAt!)} by {term.deletedBy ?? "Admin"}
                      </p>
                      {term.deletionReason && (
                        <p className="break-words text-muted-foreground">
                          Reason: {term.deletionReason}
                        </p>
                      )}
                      {member?.deletedAt && (
                        <p className="text-warning">Restore the member first.</p>
                      )}
                    </div>
                    <Button
                      variant="secondary"
                      disabled={!member || Boolean(member.deletedAt)}
                      onClick={() => {
                        if (restoreMembershipTerm(term.id))
                          toast.success("Membership term restored");
                        else
                          toast.error(
                            "The term could not be restored. Check member status and account access.",
                          );
                      }}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Restore term
                    </Button>
                  </article>
                );
              })}
          </div>
        )}
      </Panel>

      <Panel title="Deleted Members">
        {items.length === 0 ? (
          <EmptyState
            title="No deleted members"
            hint="Deleted profiles remain recoverable here for 30 days."
            className="gap-0.5 px-3 py-2 [&>p:first-child]:text-base [&>p:last-child]:text-xs [&>p:last-child]:leading-5 sm:py-4"
          />
        ) : (
          <>
            <div className="space-y-3 xl:hidden">
              {items.map((m) => {
                const purge = m.deletedAt
                  ? daysUntil(new Date(+new Date(m.deletedAt) + 30 * 24 * 60 * 60 * 1000))
                  : 30;
                return (
                  <article
                    key={m.id}
                    className="rounded-xl border border-border bg-secondary/20 p-4"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <TrashRecordName
                          name={m.name}
                          onClick={() => setDetailsTarget({ kind: "member", record: m })}
                        />
                        <p className="break-all text-xs text-muted-foreground">{m.phone}</p>
                      </div>
                      <span
                        className={`shrink-0 text-sm ${purge <= 5 ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {Math.max(0, purge)} days left
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">Deleted on</dt>
                        <dd>{m.deletedAt ? shortDate(m.deletedAt) : "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Deleted by</dt>
                        <dd className="break-words">{m.deletedBy ?? "Admin"}</dd>
                      </div>
                    </dl>
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-3">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => {
                          if (restoreMember(m.id)) {
                            toast.success(`${m.name} restored`);
                            return;
                          }
                          const session = getCurrentSession();
                          const readOnly =
                            session?.accountStatus === "pending" ||
                            session?.accountStatus === "suspended" ||
                            session?.accountStatus === "archived" ||
                            session?.subscriptionExpired === true;
                          if (readOnly) {
                            toast.error(
                              "This gym account is read-only; the member was not restored.",
                            );
                            return;
                          }
                          const regularMember = m.type === undefined || m.type === "member";
                          if (
                            regularMember &&
                            regularMemberCount(state) >= FREE_MEMBER_LIMIT &&
                            !getSubscriptionSnapshot().active
                          ) {
                            openSubscriptionPaywall("member-limit");
                            toast.info(
                              "Restoring this member would exceed the free 10-member limit.",
                            );
                            return;
                          }
                          toast.error(
                            `${m.name} could not be restored. Please refresh and try again.`,
                          );
                        }}
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex-1 text-destructive hover:text-destructive"
                        onClick={() => setTarget(m)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete forever
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-3">Member</th>
                    <th className="py-3">Deleted on</th>
                    <th className="py-3">Deleted by</th>
                    <th className="py-3">Auto-purge in</th>
                    <th className="py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((m) => {
                    const purge = m.deletedAt
                      ? daysUntil(new Date(+new Date(m.deletedAt) + 30 * 24 * 60 * 60 * 1000))
                      : 30;
                    return (
                      <tr key={m.id} className="border-b border-border/50 hover:bg-secondary/40">
                        <td className="py-3">
                          <TrashRecordName
                            name={m.name}
                            onClick={() => setDetailsTarget({ kind: "member", record: m })}
                          />
                          <p className="text-xs text-muted-foreground">{m.phone}</p>
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {m.deletedAt ? shortDate(m.deletedAt) : "—"}
                        </td>
                        <td className="py-3 text-muted-foreground">{m.deletedBy ?? "Admin"}</td>
                        <td className="py-3">
                          <span
                            className={purge <= 5 ? "text-destructive" : "text-muted-foreground"}
                          >
                            {Math.max(0, purge)} days
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                if (restoreMember(m.id)) {
                                  toast.success(`${m.name} restored`);
                                  return;
                                }
                                const session = getCurrentSession();
                                const readOnly =
                                  session?.accountStatus === "pending" ||
                                  session?.accountStatus === "suspended" ||
                                  session?.accountStatus === "archived" ||
                                  session?.subscriptionExpired === true;
                                if (readOnly) {
                                  toast.error(
                                    "This gym account is read-only; the member was not restored.",
                                  );
                                  return;
                                }
                                const regularMember = m.type === undefined || m.type === "member";
                                if (
                                  regularMember &&
                                  regularMemberCount(state) >= FREE_MEMBER_LIMIT &&
                                  !getSubscriptionSnapshot().active
                                ) {
                                  openSubscriptionPaywall("member-limit");
                                  toast.info(
                                    "Restoring this member would exceed the free 10-member limit.",
                                  );
                                  return;
                                }
                                toast.error(
                                  `${m.name} could not be restored. Please refresh and try again.`,
                                );
                              }}
                            >
                              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setTarget(m)}
                            >
                              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete forever
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      <Panel
        title="Deleted Attendance Check-ins"
        description={`${attendance.length} ${attendance.length === 1 ? "check-in" : "check-ins"} in Trash · restore to return them to attendance history`}
        className="mt-6"
      >
        {attendance.length === 0 ? (
          <EmptyState
            title="No deleted check-ins"
            hint="Attendance check-ins you remove will appear here so you can restore them."
            className="gap-0.5 px-3 py-2 [&>p:first-child]:text-base [&>p:last-child]:text-xs [&>p:last-child]:leading-5 sm:py-4"
          />
        ) : (
          <>
            <div className="space-y-3 xl:hidden">
              {attendance.map((record) => (
                <article
                  key={record.id}
                  data-testid={`trashed-attendance-${record.id}`}
                  className="rounded-xl border border-border bg-secondary/20 p-4"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <TrashRecordName
                        name={record.memberName}
                        onClick={() => setDetailsTarget({ kind: "attendance", record })}
                      />
                      <p className="break-all text-xs text-muted-foreground">
                        {record.memberPhone}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-xs text-gold">
                      {record.shift
                        ? `${record.shift[0].toUpperCase()}${record.shift.slice(1)}`
                        : "Not assigned"}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Checked in</dt>
                      <dd>{shortDateTime(record.checkedInAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Deleted on</dt>
                      <dd>{record.deletedAt ? shortDateTime(record.deletedAt) : "—"}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-muted-foreground">Deleted by</dt>
                      <dd className="break-words">{record.deletedBy || "Admin"}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1"
                      onClick={() => {
                        if (restoreAttendanceRecord(record.id))
                          toast.success(`${record.memberName}'s check-in restored`);
                        else toast.error("Check-in could not be restored. Please try again.");
                      }}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1 text-destructive hover:text-destructive"
                      onClick={() => setAttendanceTarget(record)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete forever
                    </Button>
                  </div>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-3">Member</th>
                    <th className="py-3">Shift</th>
                    <th className="py-3">Checked in</th>
                    <th className="py-3">Deleted on</th>
                    <th className="py-3">Deleted by</th>
                    <th className="py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((record) => (
                    <tr
                      key={record.id}
                      data-testid={`trashed-attendance-${record.id}`}
                      className="border-b border-border/50 hover:bg-secondary/40"
                    >
                      <td className="py-3">
                        <TrashRecordName
                          name={record.memberName}
                          onClick={() => setDetailsTarget({ kind: "attendance", record })}
                        />
                        <p className="text-xs text-muted-foreground">{record.memberPhone}</p>
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {record.shift
                          ? `${record.shift[0].toUpperCase()}${record.shift.slice(1)}`
                          : "Not assigned"}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {shortDateTime(record.checkedInAt)}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {record.deletedAt ? shortDateTime(record.deletedAt) : "—"}
                      </td>
                      <td className="py-3 text-muted-foreground">{record.deletedBy || "Admin"}</td>
                      <td className="py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              if (restoreAttendanceRecord(record.id))
                                toast.success(`${record.memberName}'s check-in restored`);
                              else toast.error("Check-in could not be restored. Please try again.");
                            }}
                          >
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setAttendanceTarget(record)}
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete forever
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      <Panel title="Deleted Membership Plans" className="mt-6">
        {plans.length === 0 ? (
          <EmptyState
            title="No deleted plans"
            hint="Deleted plans remain recoverable here for 30 days."
            className="gap-0.5 px-3 py-2 [&>p:first-child]:text-base [&>p:last-child]:text-xs [&>p:last-child]:leading-5 sm:py-4"
          />
        ) : (
          <>
            <div className="space-y-3 xl:hidden">
              {plans.map((p) => {
                const purge = p.deletedAt
                  ? daysUntil(new Date(+new Date(p.deletedAt) + 30 * 24 * 60 * 60 * 1000))
                  : 30;
                return (
                  <article
                    key={p.id}
                    className="rounded-xl border border-border bg-secondary/20 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <TrashRecordName
                          name={p.name}
                          onClick={() => setDetailsTarget({ kind: "plan", record: p })}
                        />
                        <p className="text-xs text-muted-foreground">
                          {p.durationDays} days · {money(p.price, state.settings.currency)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-sm ${purge <= 5 ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {Math.max(0, purge)} days left
                      </span>
                    </div>
                    <p className="mt-3 border-t border-border/60 pt-3 text-sm text-muted-foreground">
                      Deleted {p.deletedAt ? shortDate(p.deletedAt) : "—"}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => {
                          if (restorePlan(p.id)) toast.success(`${p.name} restored`);
                          else toast.error(`${p.name} could not be restored. Please try again.`);
                        }}
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex-1 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (deletePlanPermanently(p.id))
                            toast.success("Plan permanently deleted");
                          else
                            toast.error(
                              "This plan is locked, still used by membership history, or no longer in Trash.",
                            );
                        }}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete forever
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-3">Plan</th>
                    <th className="py-3">Price</th>
                    <th className="py-3">Deleted on</th>
                    <th className="py-3">Auto-purge in</th>
                    <th className="py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => {
                    const purge = p.deletedAt
                      ? daysUntil(new Date(+new Date(p.deletedAt) + 30 * 24 * 60 * 60 * 1000))
                      : 30;
                    return (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-secondary/40">
                        <td className="py-3">
                          <TrashRecordName
                            name={p.name}
                            onClick={() => setDetailsTarget({ kind: "plan", record: p })}
                          />
                          <p className="text-xs text-muted-foreground">{p.durationDays} days</p>
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {money(p.price, state.settings.currency)}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {p.deletedAt ? shortDate(p.deletedAt) : "—"}
                        </td>
                        <td className="py-3">
                          <span
                            className={purge <= 5 ? "text-destructive" : "text-muted-foreground"}
                          >
                            {Math.max(0, purge)} days
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                if (restorePlan(p.id)) toast.success(`${p.name} restored`);
                                else
                                  toast.error(`${p.name} could not be restored. Please try again.`);
                              }}
                            >
                              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (deletePlanPermanently(p.id)) {
                                  toast.success("Plan permanently deleted");
                                } else {
                                  toast.error(
                                    "This plan is locked, still used by membership history, or no longer in Trash.",
                                  );
                                }
                              }}
                            >
                              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete forever
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      <Panel title="Deleted Products" className="mt-6">
        {products.length === 0 ? (
          <EmptyState
            title="No deleted products"
            hint="Deleted products remain recoverable here for 30 days."
            className="gap-0.5 px-3 py-2 [&>p:first-child]:text-base [&>p:last-child]:text-xs [&>p:last-child]:leading-5 sm:py-4"
          />
        ) : (
          <>
            <div className="space-y-3 xl:hidden">
              {products.map((p) => {
                const purge = p.deletedAt
                  ? daysUntil(new Date(+new Date(p.deletedAt) + 30 * 24 * 60 * 60 * 1000))
                  : 30;
                return (
                  <article
                    key={p.id}
                    className="rounded-xl border border-border bg-secondary/20 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <TrashRecordName
                          name={p.name}
                          onClick={() => setDetailsTarget({ kind: "product", record: p })}
                        />
                        <p className="text-xs text-muted-foreground">
                          {p.category} · {money(p.price, state.settings.currency)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-sm ${purge <= 5 ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {Math.max(0, purge)} days left
                      </span>
                    </div>
                    <p className="mt-3 border-t border-border/60 pt-3 text-sm text-muted-foreground">
                      Deleted {p.deletedAt ? shortDate(p.deletedAt) : "—"}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => {
                          if (restoreProduct(p.id)) toast.success(`${p.name} restored`);
                          else toast.error("Product could not be restored");
                        }}
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex-1 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (deleteProductPermanently(p.id))
                            toast.success("Product permanently deleted");
                          else toast.error("Product could not be permanently deleted");
                        }}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete forever
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-3">Product</th>
                    <th className="py-3">Price</th>
                    <th className="py-3">Deleted on</th>
                    <th className="py-3">Auto-purge in</th>
                    <th className="py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const purge = p.deletedAt
                      ? daysUntil(new Date(+new Date(p.deletedAt) + 30 * 24 * 60 * 60 * 1000))
                      : 30;
                    return (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-secondary/40">
                        <td className="py-3">
                          <TrashRecordName
                            name={p.name}
                            onClick={() => setDetailsTarget({ kind: "product", record: p })}
                          />
                          <p className="text-xs text-muted-foreground">{p.category}</p>
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {money(p.price, state.settings.currency)}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {p.deletedAt ? shortDate(p.deletedAt) : "—"}
                        </td>
                        <td className="py-3">
                          <span
                            className={purge <= 5 ? "text-destructive" : "text-muted-foreground"}
                          >
                            {Math.max(0, purge)} days
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                if (restoreProduct(p.id)) toast.success(`${p.name} restored`);
                                else toast.error("Product could not be restored");
                              }}
                            >
                              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (deleteProductPermanently(p.id))
                                  toast.success("Product permanently deleted");
                                else toast.error("Product could not be permanently deleted");
                              }}
                            >
                              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete forever
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      <Panel title="Deleted Expenses" className="mt-6">
        {expenses.length === 0 ? (
          <EmptyState
            title="No deleted expenses"
            hint="Deleted expenses remain recoverable here for 30 days."
            className="gap-0.5 px-3 py-2 [&>p:first-child]:text-base [&>p:last-child]:text-xs [&>p:last-child]:leading-5 sm:py-4"
          />
        ) : (
          <>
            <div className="space-y-3 xl:hidden">
              {expenses.map((e) => {
                const purge = e.deletedAt
                  ? daysUntil(new Date(+new Date(e.deletedAt) + 30 * 24 * 60 * 60 * 1000))
                  : 30;
                return (
                  <article
                    key={e.id}
                    className="rounded-xl border border-border bg-secondary/20 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <TrashRecordName
                          name={e.title}
                          onClick={() => setDetailsTarget({ kind: "expense", record: e })}
                        />
                        <p className="break-words text-xs text-muted-foreground">
                          {e.expenseNo} · {e.category}
                        </p>
                        <p className="mt-1 text-sm">{money(e.amount, state.settings.currency)}</p>
                      </div>
                      <span
                        className={`shrink-0 text-sm ${purge <= 5 ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {Math.max(0, purge)} days left
                      </span>
                    </div>
                    <p className="mt-3 border-t border-border/60 pt-3 text-sm text-muted-foreground">
                      Deleted {e.deletedAt ? shortDate(e.deletedAt) : "—"}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => {
                          if (restoreExpense(e.id)) toast.success(`${e.title} restored`);
                          else toast.error("Expense could not be restored");
                        }}
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex-1 text-destructive hover:text-destructive"
                        onClick={async () => {
                          if (e.locked !== false) {
                            toast.error(
                              "This expense is locked and cannot be permanently deleted.",
                            );
                            return;
                          }
                          try {
                            if (!deleteExpensePermanently(e.id)) {
                              toast.error("Expense was not deleted. Refresh and try again.");
                              return;
                            }
                            toast.success("Expense permanently deleted");
                            if (e.attachment?.path)
                              await deletePrivateAsset(e.attachment.path).catch(() =>
                                toast.warning(
                                  "Expense deleted, but its private attachment could not be removed.",
                                ),
                              );
                          } catch (error) {
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "The private attachment could not be removed.",
                            );
                          }
                        }}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete forever
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-3">Expense</th>
                    <th className="py-3">Amount</th>
                    <th className="py-3">Deleted on</th>
                    <th className="py-3">Auto-purge in</th>
                    <th className="py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => {
                    const purge = e.deletedAt
                      ? daysUntil(new Date(+new Date(e.deletedAt) + 30 * 24 * 60 * 60 * 1000))
                      : 30;
                    return (
                      <tr key={e.id} className="border-b border-border/50 hover:bg-secondary/40">
                        <td className="py-3">
                          <TrashRecordName
                            name={e.title}
                            onClick={() => setDetailsTarget({ kind: "expense", record: e })}
                          />
                          <p className="text-xs text-muted-foreground">
                            {e.expenseNo} · {e.category}
                          </p>
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {money(e.amount, state.settings.currency)}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {e.deletedAt ? shortDate(e.deletedAt) : "—"}
                        </td>
                        <td className="py-3">
                          <span
                            className={purge <= 5 ? "text-destructive" : "text-muted-foreground"}
                          >
                            {Math.max(0, purge)} days
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                if (restoreExpense(e.id)) toast.success(`${e.title} restored`);
                                else toast.error("Expense could not be restored");
                              }}
                            >
                              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={async () => {
                                if (e.locked !== false) {
                                  toast.error(
                                    "This expense is locked and cannot be permanently deleted.",
                                  );
                                  return;
                                }
                                try {
                                  if (!deleteExpensePermanently(e.id)) {
                                    toast.error("Expense was not deleted. Refresh and try again.");
                                    return;
                                  }
                                  toast.success("Expense permanently deleted");
                                  if (e.attachment?.path) {
                                    await deletePrivateAsset(e.attachment.path).catch(() =>
                                      toast.warning(
                                        "Expense deleted, but its private attachment could not be removed.",
                                      ),
                                    );
                                  }
                                } catch (error) {
                                  toast.error(
                                    error instanceof Error
                                      ? error.message
                                      : "The private attachment could not be removed.",
                                  );
                                }
                              }}
                            >
                              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete forever
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      <ConfirmDialog member={target} onClose={() => setTarget(null)} />
      <AttendancePurgeDialog record={attendanceTarget} onClose={() => setAttendanceTarget(null)} />
      <TrashRecordDetailsDialog
        target={detailsTarget}
        state={state}
        onClose={() => setDetailsTarget(null)}
      />
    </>
  );
}

function TrashRecordName({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="block max-w-full cursor-pointer break-words rounded-sm text-left font-medium text-foreground transition-colors hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={`View deleted-record details for ${name}`}
      aria-haspopup="dialog"
      title="View saved details"
      onClick={onClick}
    >
      {name}
    </button>
  );
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm">{children ?? "—"}</dd>
    </div>
  );
}

function DetailSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border/70 bg-secondary/10 p-4">
      <h3 className="font-display text-sm uppercase tracking-wide">
        {title}
        {count !== undefined && (
          <span className="ml-2 font-sans text-xs font-normal normal-case tracking-normal text-muted-foreground">
            {count}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

function EmptyDetails({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function TrashRecordDetailsDialog({
  target,
  state,
  onClose,
}: {
  target: TrashDetailsTarget | null;
  state: GymState;
  onClose: () => void;
}) {
  if (!target) return null;

  const title =
    target.kind === "member"
      ? target.record.name
      : target.kind === "attendance"
        ? `${target.record.memberName} · Attendance`
        : target.kind === "plan"
          ? target.record.name
          : target.kind === "product"
            ? target.record.name
            : target.record.title;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="pr-8">
          <DialogTitle className="font-display text-xl tracking-wide">{title}</DialogTitle>
          <DialogDescription>
            Saved record details. Reviewing this information does not restore or change the item.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {target.kind === "member" && <MemberTrashDetails member={target.record} state={state} />}
          {target.kind === "attendance" && (
            <AttendanceTrashDetails record={target.record} state={state} />
          )}
          {target.kind === "plan" && <PlanTrashDetails plan={target.record} state={state} />}
          {target.kind === "product" && (
            <ProductTrashDetails product={target.record} state={state} />
          )}
          {target.kind === "expense" && (
            <ExpenseTrashDetails expense={target.record} state={state} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MemberTrashDetails({ member, state }: { member: Member; state: GymState }) {
  const memberships = state.memberships
    .filter((item) => item.memberId === member.id)
    .sort((left, right) => right.startDate.localeCompare(left.startDate));
  const sales = state.sales
    .filter((sale) => sale.memberId === member.id)
    .sort((left, right) => right.date.localeCompare(left.date));
  const membershipIds = new Set(memberships.map((item) => item.id));
  const saleIds = new Set(sales.map((item) => item.id));
  const payments = state.payments
    .filter(
      (payment) =>
        payment.memberId === member.id ||
        membershipIds.has(payment.membershipId ?? "") ||
        saleIds.has(payment.saleId ?? ""),
    )
    .sort((left, right) => right.date.localeCompare(left.date));
  const attendance = (state.attendance ?? [])
    .filter((record) => record.memberId === member.id)
    .sort((left, right) => right.checkedInAt.localeCompare(left.checkedInAt));

  return (
    <>
      <DetailSection title="Member information">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DetailField label="Phone">{member.phone}</DetailField>
          <DetailField label="Email">{member.email}</DetailField>
          <DetailField label="Joined">{shortDate(member.joinDate)}</DetailField>
          <DetailField label="Date of birth">{shortDate(member.dob)}</DetailField>
          <DetailField label="Gender">{member.gender}</DetailField>
          <DetailField label="Emergency contact">{member.emergencyContact}</DetailField>
          <DetailField label="Deleted on">
            {member.deletedAt ? shortDateTime(member.deletedAt) : "—"}
          </DetailField>
          <DetailField label="Deleted by">{member.deletedBy || "Admin"}</DetailField>
          <DetailField label="Address">{member.address}</DetailField>
        </dl>
      </DetailSection>

      <DetailSection title="Membership history" count={memberships.length}>
        {memberships.length === 0 ? (
          <EmptyDetails>No membership terms are linked to this member.</EmptyDetails>
        ) : (
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {memberships.map((membership) => {
              const plan = state.plans.find((item) => item.id === membership.planId);
              const payable = membershipPayable(membership);
              const paid = paidFor(state, membership.id);
              return (
                <div key={membership.id} className="rounded-lg border border-border/60 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium">{plan?.name ?? "Membership plan unavailable"}</p>
                    <p className="text-sm">{money(payable, state.settings.currency)}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {shortDate(membership.startDate)} – {shortDate(membership.endDate)}
                    {membership.frozen ? " · Frozen" : ""}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Paid {money(paid, state.settings.currency)} · Due{" "}
                    {money(Math.max(0, payable - paid), state.settings.currency)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Product purchases" count={sales.length}>
        {sales.length === 0 ? (
          <EmptyDetails>No product purchases are linked to this member.</EmptyDetails>
        ) : (
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {sales.map((sale) => (
              <div key={sale.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium">{sale.productName}</p>
                  <p className="text-sm">{money(sale.total, state.settings.currency)}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {sale.invoiceNo} · Qty {sale.qty} · {shortDateTime(sale.date)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Paid {money(salePaid(state, sale), state.settings.currency)} · Due{" "}
                  {money(saleDue(state, sale), state.settings.currency)}
                </p>
              </div>
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Payments" count={payments.length}>
        {payments.length === 0 ? (
          <EmptyDetails>No payments are linked to this member.</EmptyDetails>
        ) : (
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border/60 p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {payment.invoiceNo} · {payment.kind}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {shortDateTime(payment.date)} · {payment.method}
                    {payment.note ? ` · ${payment.note}` : ""}
                  </p>
                </div>
                <p className="text-sm">{money(payment.amount, state.settings.currency)}</p>
              </div>
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Attendance history" count={attendance.length}>
        {attendance.length === 0 ? (
          <EmptyDetails>No attendance check-ins are linked to this member.</EmptyDetails>
        ) : (
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {attendance.map((record) => (
              <div
                key={record.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3"
              >
                <p className="text-sm">
                  {shortDateTime(record.checkedInAt)} · {record.shift ?? "Shift not assigned"}
                </p>
                {record.deletedAt && (
                  <span className="text-xs text-muted-foreground">In Trash</span>
                )}
              </div>
            ))}
          </div>
        )}
      </DetailSection>

      {member.notes.length > 0 && (
        <DetailSection title="Progress notes" count={member.notes.length}>
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {member.notes
              .slice()
              .sort((left, right) => right.date.localeCompare(left.date))
              .map((note) => (
                <div key={note.id} className="rounded-lg border border-border/60 p-3">
                  <p className="font-medium">{note.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {note.note}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">{shortDate(note.date)}</p>
                </div>
              ))}
          </div>
        </DetailSection>
      )}
    </>
  );
}

function AttendanceTrashDetails({ record, state }: { record: AttendanceRecord; state: GymState }) {
  const member = state.members.find((item) => item.id === record.memberId);
  return (
    <DetailSection title="Check-in details">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DetailField label="Member">{record.memberName}</DetailField>
        <DetailField label="Phone">{record.memberPhone}</DetailField>
        <DetailField label="Checked in">{shortDateTime(record.checkedInAt)}</DetailField>
        <DetailField label="Shift">{record.shift ?? "Not assigned"}</DetailField>
        <DetailField label="Deleted on">
          {record.deletedAt ? shortDateTime(record.deletedAt) : "—"}
        </DetailField>
        <DetailField label="Deleted by">{record.deletedBy || "Admin"}</DetailField>
        <DetailField label="Member profile">
          {member ? (member.deletedAt ? "Also in Trash" : "Still active") : "No linked profile"}
        </DetailField>
      </dl>
    </DetailSection>
  );
}

function PlanTrashDetails({ plan, state }: { plan: Plan; state: GymState }) {
  const memberships = state.memberships
    .filter((membership) => membership.planId === plan.id)
    .sort((left, right) => right.startDate.localeCompare(left.startDate));
  return (
    <>
      <DetailSection title="Plan information">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DetailField label="Price">{money(plan.price, state.settings.currency)}</DetailField>
          <DetailField label="Joining fee">
            {money(plan.joiningFee ?? 0, state.settings.currency)}
          </DetailField>
          <DetailField label="Duration">{plan.durationDays} days</DetailField>
          <DetailField label="Status">{plan.active ? "Active" : "Inactive"}</DetailField>
          <DetailField label="Deleted on">
            {plan.deletedAt ? shortDateTime(plan.deletedAt) : "—"}
          </DetailField>
          <DetailField label="Description">{plan.description}</DetailField>
        </dl>
      </DetailSection>
      <DetailSection title="Membership records using this plan" count={memberships.length}>
        {memberships.length === 0 ? (
          <EmptyDetails>No membership history references this plan.</EmptyDetails>
        ) : (
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {memberships.map((membership) => {
              const member = state.members.find((item) => item.id === membership.memberId);
              return (
                <div
                  key={membership.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border/60 p-3"
                >
                  <div>
                    <p className="font-medium">{member?.name ?? "Member record unavailable"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {shortDate(membership.startDate)} – {shortDate(membership.endDate)}
                    </p>
                  </div>
                  <p className="text-sm">
                    {money(membershipPayable(membership), state.settings.currency)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </DetailSection>
    </>
  );
}

function ProductTrashDetails({ product, state }: { product: Product; state: GymState }) {
  const sales = state.sales
    .filter((sale) => sale.productId === product.id)
    .sort((left, right) => right.date.localeCompare(left.date));
  return (
    <>
      <DetailSection title="Product information">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DetailField label="Category">{product.category}</DetailField>
          <DetailField label="SKU">{product.sku}</DetailField>
          <DetailField label="Selling price">
            {money(product.price, state.settings.currency)}
          </DetailField>
          <DetailField label="Unit cost">
            {money(product.cost, state.settings.currency)}
          </DetailField>
          <DetailField label="Stock at deletion">{product.stock}</DetailField>
          <DetailField label="Low-stock threshold">{product.lowStockAt}</DetailField>
          <DetailField label="Added on">{shortDateTime(product.createdAt)}</DetailField>
          <DetailField label="Deleted on">
            {product.deletedAt ? shortDateTime(product.deletedAt) : "—"}
          </DetailField>
        </dl>
      </DetailSection>
      <DetailSection title="Recorded sales" count={sales.length}>
        {sales.length === 0 ? (
          <EmptyDetails>No sales records reference this product.</EmptyDetails>
        ) : (
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {sales.map((sale) => (
              <div
                key={sale.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border/60 p-3"
              >
                <div>
                  <p className="font-medium">{sale.buyer || "Walk-in customer"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {sale.invoiceNo} · Qty {sale.qty} · {shortDateTime(sale.date)}
                  </p>
                </div>
                <p className="text-sm">{money(sale.total, state.settings.currency)}</p>
              </div>
            ))}
          </div>
        )}
      </DetailSection>
    </>
  );
}

function ExpenseTrashDetails({ expense, state }: { expense: Expense; state: GymState }) {
  const attachmentSize = expense.attachment?.size
    ? `${(expense.attachment.size / 1024).toFixed(1)} KB`
    : "—";
  return (
    <DetailSection title="Expense information">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DetailField label="Expense number">{expense.expenseNo}</DetailField>
        <DetailField label="Category">{expense.category}</DetailField>
        <DetailField label="Amount">{money(expense.amount, state.settings.currency)}</DetailField>
        <DetailField label="Expense date">{shortDate(expense.date)}</DetailField>
        <DetailField label="Payment method">{expense.method}</DetailField>
        <DetailField label="Deleted on">
          {expense.deletedAt ? shortDateTime(expense.deletedAt) : "—"}
        </DetailField>
        <DetailField label="Notes">{expense.notes}</DetailField>
        <DetailField label="Attachment">
          {expense.attachment
            ? `${expense.attachment.name} · ${expense.attachment.type || "file"} · ${attachmentSize}`
            : "None"}
        </DetailField>
      </dl>
    </DetailSection>
  );
}

function AttendancePurgeDialog({
  record,
  onClose,
}: {
  record: AttendanceRecord | null;
  onClose: () => void;
}) {
  return (
    <AlertDialog open={Boolean(record)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Permanently delete this check-in?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes {record?.memberName}’s attendance record for{" "}
            {record ? shortDate(record.date) : "this date"}. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              if (!record) return;
              if (deleteAttendancePermanently(record.id)) {
                toast.success("Attendance check-in permanently deleted");
                onClose();
              } else {
                toast.error("Check-in was not deleted. Refresh and try again.");
              }
            }}
          >
            Delete permanently
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ConfirmDialog({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const [text, setText] = useState("");
  if (!member) return null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-wide text-destructive">
            Permanently delete {member.name}?
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            All records linked to this member will be erased from this device. This action is
            irreversible.
          </p>
          <div className="space-y-2">
            <Label>
              Type <span className="font-mono text-destructive">DELETE</span> to confirm
            </Label>
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="DELETE" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={text !== "DELETE"}
              onClick={async () => {
                if (!deleteMemberPermanently(member.id)) {
                  toast.error("Member was not deleted. Refresh and try again.");
                  return;
                }
                toast.success("Member permanently deleted");
                if (member.photo) {
                  try {
                    await deletePrivateAsset(member.photo);
                  } catch {
                    toast.warning("Member deleted, but the private photo could not be removed.");
                  }
                }
                setText("");
                onClose();
              }}
            >
              Delete permanently
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
