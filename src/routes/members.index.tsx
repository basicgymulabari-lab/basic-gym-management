import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Search, Plus, Eye, Pencil, Trash2, Filter } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Panel, EmptyState } from "@/components/app/Panel";
import { StatusBadge } from "@/components/app/StatCard";
import { TablePager } from "@/components/app/TablePager";
import { MemberFormDialog } from "@/components/app/MemberFormDialog";
import { PrivateAssetImage } from "@/components/app/PrivateAssetImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { trashMember, useGym } from "@/lib/gym/store";
import { localDateInput } from "@/lib/gym/calendar";
import {
  activeMembers,
  currentMembership,
  isWalkIn,
  money,
  outstandingFor,
  planOf,
  shortDate,
  statusOf,
} from "@/lib/gym/selectors";
import type { Member } from "@/lib/gym/types";
import {
  FREE_MEMBER_LIMIT,
  openSubscriptionPaywall,
  regularMemberCount,
  useSubscription,
} from "@/lib/billing/client";

const searchSchema = z.object({
  filter: fallback(z.string(), "all").default("all"),
  q: fallback(z.string(), "").default(""),
  shift: fallback(z.string(), "all").default("all"),
  page: fallback(z.coerce.number().int().min(1), 1).default(1),
  new: fallback(z.boolean(), false).default(false),
});

export const Route = createFileRoute("/members/")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Members — IRONVAULT Gym Management" },
      {
        name: "description",
        content:
          "Search, filter and manage every gym member: profiles, membership status, dues and progress notes.",
      },
      { property: "og:title", content: "Members — IRONVAULT Gym Management" },
      {
        property: "og:description",
        content: "Full member roster with status filters, dues tracking and safe delete to trash.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <MembersPage />
    </AppShell>
  ),
});

const FILTERS = [
  "all",
  "active",
  "expiring",
  "expired",
  "frozen",
  "unassigned",
  "due",
  "walk-in",
  "no-visit-30-days",
] as const;
const SHIFTS = ["all", "morning", "evening", "unassigned"] as const;
const MEMBER_PAGE_SIZE = 25;

function displayMemberPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return /0{10,}$/.test(digits) ? "No phone recorded" : phone;
}

function MembersPage() {
  const state = useGym();
  const subscription = useSubscription();
  const navigate = useNavigate({ from: "/members/" });
  const search = Route.useSearch();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [toTrash, setToTrash] = useState<Member | null>(null);

  const filter = FILTERS.includes(search.filter as (typeof FILTERS)[number])
    ? (search.filter as (typeof FILTERS)[number])
    : "all";
  const shiftFilter = SHIFTS.includes(search.shift as (typeof SHIFTS)[number])
    ? (search.shift as (typeof SHIFTS)[number])
    : "all";
  const q = search.q.slice(0, 60).toLowerCase();
  const noVisitCutoffDate = new Date();
  noVisitCutoffDate.setHours(0, 0, 0, 0);
  noVisitCutoffDate.setDate(noVisitCutoffDate.getDate() - 30);
  const noVisitCutoff = localDateInput(noVisitCutoffDate);
  const registeredMembers = state ? regularMemberCount(state) : 0;
  const memberLimitReached = registeredMembers >= FREE_MEMBER_LIMIT && !subscription.active;

  useEffect(() => {
    if (!search.new || !state) return;
    if (memberLimitReached) {
      setFormOpen(false);
      openSubscriptionPaywall("member-limit");
      void navigate({
        search: (previous: Record<string, unknown>) => ({ ...previous, new: false }) as never,
        replace: true,
      });
      return;
    }
    setEditing(null);
    setFormOpen(true);
  }, [memberLimitReached, navigate, search.new, state]);

  const rows = useMemo(() => {
    if (!state) return [];
    const lastVisitByMember = new Map<string, string>();
    for (const visit of state.attendance ?? []) {
      if (visit.deletedAt) continue;
      const previousVisit = lastVisitByMember.get(visit.memberId);
      if (!previousVisit || visit.date > previousVisit) {
        lastVisitByMember.set(visit.memberId, visit.date);
      }
    }

    return activeMembers(state)
      .map((m) => ({
        member: m,
        status: isWalkIn(m) ? "walk-in" : statusOf(state, m.id),
        due: outstandingFor(state, m.id),
        membership: currentMembership(state, m.id),
        lastVisit: lastVisitByMember.get(m.id) ?? null,
      }))
      .filter((r) => {
        if (filter === "no-visit-30-days") {
          return !isWalkIn(r.member) && (!r.lastVisit || r.lastVisit <= noVisitCutoff);
        }
        if (filter === "due") return r.due > 0;
        if (filter === "walk-in") return isWalkIn(r.member);
        if (isWalkIn(r.member)) return filter === "all";
        if (filter === "active") return r.status === "active" || r.status === "expiring";
        if (filter !== "all") return r.status === filter;
        return true;
      })
      .filter(
        (r) =>
          !q ||
          r.member.name.toLowerCase().includes(q) ||
          r.member.phone.toLowerCase().includes(q) ||
          r.member.email.toLowerCase().includes(q),
      )
      .filter((r) =>
        shiftFilter === "all"
          ? true
          : shiftFilter === "unassigned"
            ? !r.member.shift
            : r.member.shift === shiftFilter,
      )
      .sort((a, b) => a.member.name.localeCompare(b.member.name));
  }, [state, filter, q, shiftFilter, noVisitCutoff]);

  const pageCount = Math.max(1, Math.ceil(rows.length / MEMBER_PAGE_SIZE));
  const currentPage = Math.min(search.page, pageCount);
  const visibleRows = useMemo(
    () => rows.slice((currentPage - 1) * MEMBER_PAGE_SIZE, currentPage * MEMBER_PAGE_SIZE),
    [currentPage, rows],
  );

  if (!state) return null;
  const cur = state.settings.currency;
  const setSearch = (patch: Record<string, unknown>) =>
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }) as never });

  return (
    <>
      <PageHeader
        title="Member Management"
        subtitle={`${rows.length} ${rows.length === 1 ? "person" : "people"} matching the current view`}
        actions={
          <Button
            onClick={() => {
              if (memberLimitReached) {
                openSubscriptionPaywall("member-limit");
                return;
              }
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Add Member
          </Button>
        }
      />

      <Panel>
        <div className="space-y-3">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative h-9 min-w-0 flex-1">
              <Search className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by name, phone or email"
                value={search.q}
                maxLength={60}
                onChange={(e) => setSearch({ q: e.target.value, page: 1 })}
              />
            </div>
            <Select
              value={shiftFilter}
              onValueChange={(value) => setSearch({ shift: value, page: 1 })}
            >
              <SelectTrigger className="w-full sm:w-40" aria-label="Filter members by shift">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All shifts</SelectItem>
                <SelectItem value="morning">Morning</SelectItem>
                <SelectItem value="evening">Evening</SelectItem>
                <SelectItem value="unassigned">Not assigned</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setSearch({ filter: f, page: 1 })}
                className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  filter === f
                    ? "border-gold/50 bg-gold/15 text-gold"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "due"
                  ? "Pending due"
                  : f === "walk-in"
                    ? "Walk-in Customers"
                    : f === "no-visit-30-days"
                      ? "No visit · 30 days"
                      : f === "unassigned"
                        ? "No plan"
                        : f}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          {rows.length === 0 ? (
            <EmptyState title="No people found" hint="Try a different filter or search term." />
          ) : (
            <>
              <div className="space-y-3 xl:hidden">
                {visibleRows.map(({ member, status, due, membership, lastVisit }) => (
                  <article
                    key={member.id}
                    className="rounded-xl border border-border bg-secondary/20 p-4"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-gold/25 bg-secondary text-xs font-semibold text-gold">
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
                        <div className="min-w-0">
                          <p className="break-words font-medium">
                            <Link
                              to="/members/$memberId"
                              params={{ memberId: member.id }}
                              search={{ tab: undefined }}
                              aria-label={`Open member profile for ${member.name}`}
                              title={`Open ${member.name}'s profile`}
                              className="rounded-sm no-underline hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
                            >
                              {member.name}
                            </Link>
                          </p>
                          <p className="break-all text-xs text-muted-foreground">
                            {displayMemberPhone(member.phone)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Last visit: {lastVisit ? shortDate(lastVisit) : "No visits yet"}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={status} />
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <div className="min-w-0">
                        <dt className="text-xs text-muted-foreground">Plan</dt>
                        <dd className="break-words">
                          {isWalkIn(member)
                            ? "Walk-in"
                            : (planOf(state, membership?.planId)?.name ?? "No plan")}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Shift</dt>
                        <dd className="capitalize">{member.shift ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Expiry</dt>
                        <dd>
                          {!isWalkIn(member) && membership ? shortDate(membership.endDate) : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Due</dt>
                        <dd
                          className={due > 0 ? "font-medium text-warning" : "text-muted-foreground"}
                        >
                          {money(due, cur)}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-3">
                      <Button asChild size="sm" variant="secondary" className="flex-1">
                        <Link
                          to="/members/$memberId"
                          params={{ memberId: member.id }}
                          search={{ tab: undefined }}
                        >
                          <Eye className="mr-1.5 h-4 w-4" /> View
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => {
                          setEditing(member);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="mr-1.5 h-4 w-4" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        aria-label={`Move ${member.name} to trash`}
                        onClick={() => setToTrash(member)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto xl:block">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="py-3">Member</th>
                      <th className="py-3">Plan</th>
                      <th className="py-3">Shift</th>
                      <th className="py-3">Expiry</th>
                      <th className="py-3">Status</th>
                      <th className="py-3 text-right">Due</th>
                      <th className="py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map(({ member, status, due, membership, lastVisit }) => (
                      <tr
                        key={member.id}
                        className="border-b border-border/50 transition-colors hover:bg-secondary/40"
                      >
                        <td className="py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-gold/25 bg-secondary text-xs font-semibold text-gold">
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
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                <Link
                                  to="/members/$memberId"
                                  params={{ memberId: member.id }}
                                  search={{ tab: undefined }}
                                  aria-label={`Open member profile for ${member.name}`}
                                  title={`Open ${member.name}'s profile`}
                                  className="rounded-sm no-underline hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
                                >
                                  {member.name}
                                </Link>
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {displayMemberPhone(member.phone)}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                Last visit: {lastVisit ? shortDate(lastVisit) : "No visits yet"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {isWalkIn(member)
                            ? "—"
                            : (planOf(state, membership?.planId)?.name ?? "—")}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {member.shift ? (
                            <span className="rounded-full border border-gold/20 px-2.5 py-1 text-xs capitalize text-foreground">
                              {member.shift}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {!isWalkIn(member) && membership ? shortDate(membership.endDate) : "—"}
                        </td>
                        <td className="py-3">
                          <StatusBadge status={status} />
                        </td>
                        <td className="py-3 text-right font-medium">
                          <span className={due > 0 ? "text-warning" : "text-muted-foreground"}>
                            {money(due, cur)}
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex justify-end gap-1">
                            <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                              <Link
                                to="/members/$memberId"
                                params={{ memberId: member.id }}
                                search={{ tab: undefined }}
                                aria-label="View profile"
                              >
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={
                                isWalkIn(member) ? "Edit walk-in customer" : "Edit member"
                              }
                              onClick={() => {
                                setEditing(member);
                                setFormOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              aria-label="Move to trash"
                              onClick={() => setToTrash(member)}
                            >
                              <Trash2 className="h-4 w-4" />
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
        </div>
        {rows.length > MEMBER_PAGE_SIZE && (
          <TablePager
            page={currentPage}
            pageSize={MEMBER_PAGE_SIZE}
            total={rows.length}
            onPage={(page) => setSearch({ page })}
          />
        )}
      </Panel>

      <MemberFormDialog
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) {
            setEditing(null);
            if (search.new) setSearch({ new: false });
          }
        }}
        member={editing}
      />

      <AlertDialog open={Boolean(toTrash)} onOpenChange={(v) => !v && setToTrash(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl tracking-wide">
              Do you want to move this member to Trash?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toTrash?.name} will be moved to Trash. You can restore them within 30 days before the
              record is removed automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (toTrash) {
                  if (trashMember(toTrash.id, state.settings.adminName))
                    toast.success(`${toTrash.name} moved to Trash`);
                  else toast.error("Member was not moved to Trash.");
                }
                setToTrash(null);
              }}
            >
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
