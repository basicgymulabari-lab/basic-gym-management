import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, Clock3, Download, Search, Trash2, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { AttendanceDeleteDialog } from "@/components/app/AttendanceDeleteDialog";
import { AppDatePicker } from "@/components/app/AppDatePicker";
import { AppShell } from "@/components/app/AppShell";
import { EmptyState, PageHeader, Panel } from "@/components/app/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { checkInMember, useGym } from "@/lib/gym/store";
import { localDateInput, formatShortDate } from "@/lib/gym/calendar";
import { formatTime } from "@/lib/gym/time";
import { downloadCsv } from "@/lib/gym/csv";
import { activeMembers, isWalkIn } from "@/lib/gym/selectors";
import type { AttendanceRecord } from "@/lib/gym/types";

export const Route = createFileRoute("/attendance")({
  head: () => ({
    meta: [
      { title: "Attendance — IRONVAULT Gym Management" },
      {
        name: "description",
        content: "Quick member check-in with shift-aware attendance history and export.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <AttendancePage />
    </AppShell>
  ),
});

type ShiftFilter = "all" | "morning" | "evening" | "unassigned";

function AttendancePage() {
  const state = useGym();
  const today = localDateInput(new Date());
  const [query, setQuery] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyDate, setHistoryDate] = useState(today);
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>("all");
  const [deletingRecord, setDeletingRecord] = useState<AttendanceRecord | null>(null);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const normalizedHistoryQuery = historyQuery.trim().toLocaleLowerCase();
  const checkedInToday = useMemo(
    () =>
      new Set(
        (state?.attendance ?? [])
          .filter((record) => !record.deletedAt && record.date === today)
          .map((r) => r.memberId),
      ),
    [state?.attendance, today],
  );
  const candidates = useMemo(() => {
    if (!state || normalizedQuery.length < 1) return [];
    return activeMembers(state)
      .filter((member) => !isWalkIn(member))
      .filter((member) =>
        [member.name, member.phone, member.email].some((value) =>
          value.toLocaleLowerCase().includes(normalizedQuery),
        ),
      )
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, 8);
  }, [state, normalizedQuery]);

  const history = useMemo(() => {
    if (!state) return [];
    return (state.attendance ?? [])
      .filter((record) => !record.deletedAt)
      .filter((record) => record.date === historyDate)
      .filter((record) =>
        shiftFilter === "all"
          ? true
          : shiftFilter === "unassigned"
            ? !record.shift
            : record.shift === shiftFilter,
      )
      .filter(
        (record) =>
          !normalizedHistoryQuery ||
          record.memberName.toLocaleLowerCase().includes(normalizedHistoryQuery) ||
          record.memberPhone.toLocaleLowerCase().includes(normalizedHistoryQuery),
      )
      .sort((left, right) => right.checkedInAt.localeCompare(left.checkedInAt));
  }, [state, historyDate, shiftFilter, normalizedHistoryQuery]);

  if (!state) return null;

  const checkIn = (memberId: string) => {
    const result = checkInMember(memberId);
    if (result === "saved") {
      toast.success("Attendance recorded");
      setQuery("");
    } else if (result === "already_checked_in") {
      toast.info("This member is already checked in today");
    } else if (result === "read_only") {
      toast.error("Attendance was not saved because this workspace is read-only");
    } else {
      toast.error("This member is no longer available for check-in");
    }
  };

  const exportHistory = () => {
    downloadCsv(`ironvault-attendance-${historyDate}.csv`, [
      ["Member", "Phone", "Shift", "Date", "Check-in time"],
      ...history.map((record) => [
        record.memberName,
        record.memberPhone,
        record.shift ?? "Not assigned",
        formatShortDate(record.date),
        formatTime(record.checkedInAt),
      ]),
    ]);
  };

  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle="Search a member and mark today’s visit. One check-in per member each day."
      />

      <Panel title="Quick check-in" description="Registered members only">
        <div className="max-w-3xl">
          <label className="sr-only" htmlFor="attendance-member-search">
            Search members to check in
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="attendance-member-search"
              className="pl-9"
              placeholder="Name, phone or email"
              value={query}
              maxLength={80}
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {normalizedQuery.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Start typing a member’s name or phone number.
            </p>
          ) : candidates.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No matching registered members.</p>
          ) : (
            <div className="mt-3 divide-y divide-border rounded-xl border border-border">
              {candidates.map((member) => {
                const alreadyCheckedIn = checkedInToday.has(member.id);
                return (
                  <div
                    key={member.id}
                    className="flex min-w-0 flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{member.name}</p>
                      <p className="truncate text-sm text-muted-foreground">{member.phone}</p>
                      <p className="text-xs text-muted-foreground">
                        Shift:{" "}
                        {member.shift
                          ? `${member.shift[0].toUpperCase()}${member.shift.slice(1)}`
                          : "Not assigned"}
                      </p>
                    </div>
                    <Button
                      className="w-full shrink-0 sm:w-auto"
                      variant={alreadyCheckedIn ? "secondary" : "default"}
                      disabled={alreadyCheckedIn}
                      onClick={() => checkIn(member.id)}
                    >
                      {alreadyCheckedIn ? (
                        <>
                          <Check className="mr-2 h-4 w-4" /> Checked in
                        </>
                      ) : (
                        <>
                          <UserRoundCheck className="mr-2 h-4 w-4" /> Check in
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Panel>

      <Panel
        className="mt-5"
        title="Attendance history"
        description={`${history.length} ${history.length === 1 ? "check-in" : "check-ins"} · ${formatShortDate(historyDate)}`}
      >
        <div className="grid gap-3 xl:grid-cols-[minmax(220px,1fr)_auto] xl:items-start">
          <div className="min-w-0">
            <label className="sr-only" htmlFor="attendance-history-search">
              Search attended members
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="attendance-history-search"
                className="pl-9"
                placeholder="Search by name or phone"
                value={historyQuery}
                maxLength={80}
                onChange={(event) => setHistoryQuery(event.target.value)}
              />
            </div>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-[minmax(150px,190px)_minmax(130px,160px)_auto] lg:w-auto">
            <AppDatePicker value={historyDate} onChange={setHistoryDate} />
            <Select
              value={shiftFilter}
              onValueChange={(value) => setShiftFilter(value as ShiftFilter)}
            >
              <SelectTrigger aria-label="Filter attendance by shift">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All shifts</SelectItem>
                <SelectItem value="morning">Morning</SelectItem>
                <SelectItem value="evening">Evening</SelectItem>
                <SelectItem value="unassigned">Not assigned</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="secondary" className="w-full" onClick={exportHistory}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        </div>
        <div className="mt-4">
          {history.length === 0 ? (
            <EmptyState
              title="No attendance found"
              hint="Try another date, shift or search term."
              className="py-8 sm:py-10"
            />
          ) : (
            <div className="space-y-2">
              {history.map((record) => (
                <article
                  key={record.id}
                  data-testid={`attendance-record-${record.id}`}
                  className="flex min-w-0 flex-col gap-2 rounded-xl border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    {state.members.some((member) => member.id === record.memberId) ? (
                      <Link
                        to="/members/$memberId"
                        params={{ memberId: record.memberId }}
                        search={{ tab: undefined }}
                        aria-label={`Open member profile for ${record.memberName}`}
                        title={`Open ${record.memberName}'s profile`}
                        className="block truncate rounded-sm font-semibold no-underline transition-colors hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
                      >
                        {record.memberName}
                      </Link>
                    ) : (
                      <p className="truncate font-semibold">{record.memberName}</p>
                    )}
                    <p className="truncate text-sm text-muted-foreground">{record.memberPhone}</p>
                  </div>
                  <div className="flex w-full min-w-0 items-center justify-between gap-3 sm:ml-auto sm:flex-1 sm:justify-end">
                    <span
                      data-testid="attendance-shift-badge"
                      className={
                        record.shift
                          ? "inline-flex shrink-0 items-center rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-medium text-gold md:mr-4"
                          : "inline-flex shrink-0 items-center rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs font-medium text-muted-foreground md:mr-4"
                      }
                    >
                      {record.shift
                        ? `${record.shift[0].toUpperCase()}${record.shift.slice(1)}`
                        : "Not assigned"}
                    </span>
                    <p
                      data-testid="attendance-check-in-time"
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <Clock3 className="h-4 w-4" />
                      {formatTime(record.checkedInAt)}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove attendance for ${record.memberName}`}
                      title="Remove this check-in"
                      onClick={() => setDeletingRecord(record)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </Panel>
      <AttendanceDeleteDialog record={deletingRecord} onOpenChange={setDeletingRecord} />
    </>
  );
}
