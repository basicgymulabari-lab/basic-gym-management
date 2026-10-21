import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RotateCcw, Trash2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Panel, EmptyState } from "@/components/app/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  restoreMember,
  restorePlan,
  restoreProduct,
  getCurrentSession,
  useGym,
} from "@/lib/gym/store";
import {
  daysUntil,
  money,
  shortDate,
  shortDateTime,
  trashedMembers,
  trashedAttendance,
  trashedPlans,
  trashedProducts,
  trashedExpenses,
} from "@/lib/gym/selectors";
import type { AttendanceRecord, Member } from "@/lib/gym/types";
import {
  FREE_MEMBER_LIMIT,
  getSubscriptionSnapshot,
  openSubscriptionPaywall,
  regularMemberCount,
} from "@/lib/billing/client";
import { deletePrivateAsset } from "@/lib/gym/storage";

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
  const [attendanceTarget, setAttendanceTarget] = useState<AttendanceRecord | null>(null);

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
        subtitle="Review deleted records by type. Restore an item or permanently remove it."
      />

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <p className="text-sm text-muted-foreground">
          Restore returns an item to its original section. Permanent deletion cannot be undone;
          deleting a member also erases its linked records and requires typing <strong>DELETE</strong>.
        </p>
      </div>

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
                        <p className="break-words font-medium">{m.name}</p>
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
                          <p className="font-medium">{m.name}</p>
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
                      <p className="break-words font-medium">{record.memberName}</p>
                      <p className="break-all text-xs text-muted-foreground">{record.memberPhone}</p>
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
                        <p className="font-medium">{record.memberName}</p>
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
                        <p className="font-medium">{p.name}</p>
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
                          <p className="font-medium">{p.name}</p>
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
                        <p className="font-medium">{p.name}</p>
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
                          <p className="font-medium">{p.name}</p>
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
                        <p className="break-words font-medium">{e.title}</p>
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
                          <p className="font-medium">{e.title}</p>
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
      <AttendancePurgeDialog
        record={attendanceTarget}
        onClose={() => setAttendanceTarget(null)}
      />
    </>
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
