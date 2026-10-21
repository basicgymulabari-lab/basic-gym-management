import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "gold" | "success" | "danger" | "warning";

const toneRing: Record<Tone, string> = {
  gold: "text-gold border-gold/35 bg-gold/10",
  success: "text-success border-success/35 bg-success/10",
  danger: "text-destructive border-destructive/35 bg-destructive/10",
  warning: "text-warning border-warning/35 bg-warning/10",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "gold",
  to,
  search,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: Tone;
  to: string;
  search?: Record<string, unknown>;
}) {
  return (
    <Link
      to={to as never}
      search={search as never}
      className="group surface-panel hairline-top relative block overflow-hidden rounded-2xl p-4 transition-all duration-300 hover:-translate-y-1 hover:border-gold/40 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-xl border sm:h-11 sm:w-11",
            toneRing[tone],
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-gold" />
      </div>
      <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:mt-5 sm:text-[11px] sm:tracking-[0.18em]">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl tracking-wide sm:text-3xl">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">{hint}</p>}
    </Link>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-success/12 text-success border-success/35",
    expiring: "bg-warning/12 text-warning border-warning/35",
    expired: "bg-destructive/12 text-destructive border-destructive/35",
    frozen: "bg-info/12 text-info border-info/35",
    unassigned: "bg-secondary text-muted-foreground border-border",
    "walk-in": "bg-gold/12 text-gold border-gold/35",
    paid: "bg-success/12 text-success border-success/35",
    partial: "bg-warning/12 text-warning border-warning/35",
    unpaid: "bg-destructive/12 text-destructive border-destructive/35",
    low: "bg-warning/12 text-warning border-warning/35",
    out: "bg-destructive/12 text-destructive border-destructive/35",
    "in stock": "bg-success/12 text-success border-success/35",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
        map[status.toLowerCase()] ?? "bg-secondary text-muted-foreground border-border",
      )}
    >
      {status}
    </span>
  );
}
