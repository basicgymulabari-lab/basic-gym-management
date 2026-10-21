import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 grid grid-cols-1 items-start gap-3 sm:flex sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="break-words font-display text-3xl tracking-[0.06em] sm:truncate sm:text-4xl">
          <span className="text-gradient-gold">{title}</span>
        </h1>
        {subtitle && <p className="mt-1 break-words text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex w-full max-w-full flex-wrap items-center gap-2 sm:w-auto sm:min-w-0 sm:max-w-full">
          {actions}
        </div>
      )}
    </header>
  );
}

export function Panel({
  id,
  title,
  description,
  actions,
  children,
  className,
  collapsible = false,
  defaultExpanded = true,
  mobileDefaultExpanded,
}: {
  id?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  mobileDefaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const userControlledExpanded = useRef(false);
  const contentId = useId();

  useEffect(() => {
    if (!collapsible || mobileDefaultExpanded === undefined) return;

    const mobileViewport = window.matchMedia("(max-width: 639px)");
    const syncResponsiveDefault = () => {
      if (userControlledExpanded.current) return;
      setExpanded(mobileViewport.matches ? mobileDefaultExpanded : defaultExpanded);
    };

    syncResponsiveDefault();
    mobileViewport.addEventListener("change", syncResponsiveDefault);
    return () => mobileViewport.removeEventListener("change", syncResponsiveDefault);
  }, [collapsible, defaultExpanded, mobileDefaultExpanded]);

  return (
    <section
      id={id}
      className={cn("surface-panel hairline-top relative overflow-hidden rounded-2xl", className)}
    >
      {collapsible && title ? (
        <div className="grid grid-cols-1 items-center border-b border-border sm:grid-cols-[minmax(0,1fr)_auto]">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={contentId}
            className="flex min-w-0 items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold sm:px-5"
            onClick={() => {
              userControlledExpanded.current = true;
              setExpanded((current) => !current);
            }}
          >
            <span className="min-w-0">
              <span className="block break-words font-display text-xl tracking-wide sm:truncate">
                {title}
              </span>
              {description && (
                <span className="block break-words text-xs text-muted-foreground sm:truncate">
                  {description}
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
              {expanded ? "Hide" : "Show"}
              <ChevronDown
                className={cn(
                  "h-5 w-5 text-gold transition-transform duration-300 ease-out",
                  expanded && "rotate-180",
                )}
              />
            </span>
          </button>
          {actions && (
            <div className="flex max-w-full items-center gap-2 overflow-x-auto px-4 pb-4 sm:shrink-0 sm:px-5 sm:pb-0 sm:pl-0">
              {actions}
            </div>
          )}
        </div>
      ) : title || actions ? (
        <div className="grid grid-cols-1 items-start gap-3 border-b border-border px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
          <div className="min-w-0">
            {title && (
              <h2 className="break-words font-display text-xl tracking-wide sm:truncate">
                {title}
              </h2>
            )}
            {description && (
              <p className="break-words text-xs text-muted-foreground sm:truncate">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-1 sm:shrink-0 sm:overflow-visible sm:pb-0">
              {actions}
            </div>
          )}
        </div>
      ) : null}
      {collapsible ? (
        <div
          id={contentId}
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
            expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="p-4 sm:p-5">{children}</div>
          </div>
        </div>
      ) : (
        <div className="p-4 sm:p-5">{children}</div>
      )}
    </section>
  );
}

export function EmptyState({
  title,
  hint,
  className,
}: {
  title: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid place-items-center rounded-xl border border-dashed border-border px-6 py-14 text-center",
        className,
      )}
    >
      <p className="font-display text-lg tracking-wide text-muted-foreground">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted-foreground/70">{hint}</p>}
    </div>
  );
}
