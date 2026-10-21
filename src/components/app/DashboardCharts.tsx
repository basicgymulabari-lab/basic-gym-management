import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/app/Panel";
import { money, type activePlanDistribution, type revenueSeries, type topProducts } from "@/lib/gym/selectors";

const PLAN_GRADIENTS = [
  ["#FFE27A", "#C88708"],
  ["#83D8B2", "#238660"],
  ["#8FD4F0", "#317FA7"],
  ["#B7BEC8", "#616975"],
  ["#FFC08C", "#D16D31"],
];

type RevenueData = ReturnType<typeof revenueSeries>;
type PlanData = ReturnType<typeof activePlanDistribution>;
type ProductData = ReturnType<typeof topProducts>;

type DashboardChartProps =
  | {
      kind: "revenue";
      series: RevenueData;
      currency: string;
      compactMoney: (value: number) => string;
    }
  | { kind: "membership"; plans: PlanData; active: number }
  | {
      kind: "sales";
      products: ProductData;
      currency: string;
      compactMoney: (value: number) => string;
    };

function RevenueChart({
  series,
  currency,
  compactMoney,
}: Extract<DashboardChartProps, { kind: "revenue" }>) {
  if (!series.some((point) => point.total > 0)) {
    return <EmptyState title="No revenue data yet" hint="Recorded payments will appear here." />;
  }

  return (
    <div className="h-[250px] w-full sm:h-[290px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ left: -18, right: 8, top: 8 }}>
          <defs>
            <linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-gold)" stopOpacity={0.55} />
              <stop offset="100%" stopColor="var(--color-gold)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="gGreen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="gBlue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart-3)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-chart-3)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 6" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            stroke="var(--color-muted-foreground)"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            fontSize={11}
            stroke="var(--color-muted-foreground)"
            tickFormatter={compactMoney}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => [
              money(value, currency),
              name === "membership" ? "Membership" : name === "product" ? "Products" : "Other",
            ]}
          />
          <Area
            type="monotone"
            dataKey="membership"
            stroke="var(--color-gold)"
            strokeWidth={2}
            fill="url(#gGold)"
          />
          <Area
            type="monotone"
            dataKey="product"
            stroke="var(--color-success)"
            strokeWidth={2}
            fill="url(#gGreen)"
          />
          <Area
            type="monotone"
            dataKey="other"
            stroke="var(--color-chart-3)"
            strokeWidth={2}
            fill="url(#gBlue)"
          />
          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(value: string) =>
              value === "membership" ? "Membership" : value === "product" ? "Products" : "Other"
            }
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function MembershipChart({
  plans,
  active,
}: Extract<DashboardChartProps, { kind: "membership" }>) {
  if (plans.length === 0) {
    return (
      <EmptyState
        title="No active memberships"
        hint="Plan distribution will appear after memberships are added."
      />
    );
  }

  return (
    <div>
      <div className="relative h-[190px] w-full sm:h-[210px]">
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center">
          <p className="font-display text-3xl leading-none text-foreground">{active}</p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Active
          </p>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <defs>
              {PLAN_GRADIENTS.map(([start, end], index) => (
                <linearGradient
                  key={index}
                  id={`membership-segment-${index}`}
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="1"
                >
                  <stop offset="0%" stopColor={start} />
                  <stop offset="100%" stopColor={end} />
                </linearGradient>
              ))}
            </defs>
            <Pie
              data={plans}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="79%"
              paddingAngle={3.5}
              cornerRadius={2}
              minAngle={2}
              stroke="var(--color-card)"
              strokeWidth={2}
              isAnimationActive
              animationDuration={700}
            >
              {plans.map((_, index) => (
                <Cell
                  key={index}
                  fill={`url(#membership-segment-${index % PLAN_GRADIENTS.length})`}
                  style={{ transition: "opacity 200ms ease, filter 200ms ease" }}
                />
              ))}
            </Pie>
            <Tooltip
              cursor={false}
              content={({ active: isActive, payload }) =>
                isActive && payload?.length ? (
                  <div className="rounded-xl border border-border bg-popover px-3.5 py-2.5 text-xs shadow-lg">
                    <p className="font-semibold text-foreground">{payload[0].name}</p>
                    <p className="mt-0.5 text-muted-foreground">
                      Members: <span className="font-medium text-gold">{payload[0].value}</span>
                    </p>
                  </div>
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 grid gap-x-4 gap-y-1.5 border-t border-border/70 pt-3 sm:grid-cols-2">
        {plans.map((plan, index) => (
          <div key={plan.name} className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-1">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                background: `linear-gradient(135deg, ${PLAN_GRADIENTS[index % PLAN_GRADIENTS.length][0]}, ${PLAN_GRADIENTS[index % PLAN_GRADIENTS.length][1]})`,
              }}
            />
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {plan.name}
            </span>
            <span className="shrink-0 text-xs font-semibold text-foreground">{plan.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductChart({
  products,
  currency,
  compactMoney,
}: Extract<DashboardChartProps, { kind: "sales" }>) {
  if (products.length === 0) {
    return (
      <EmptyState title="No product sales yet" hint="Completed product sales will appear here." />
    );
  }

  return (
    <div className="h-[240px] w-full sm:h-[270px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={products} margin={{ left: -18, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 6" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            fontSize={10}
            stroke="var(--color-muted-foreground)"
            tickFormatter={(value: string) => value.split(" ")[0]}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            fontSize={11}
            stroke="var(--color-muted-foreground)"
            tickFormatter={compactMoney}
          />
          <Tooltip
            cursor={{ fill: "var(--color-secondary)", opacity: 0.4 }}
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              fontSize: 12,
            }}
            formatter={(value: number) => money(value, currency)}
          />
          <Bar dataKey="revenue" radius={[6, 6, 0, 0]} fill="var(--color-gold)" />
          <Bar dataKey="profit" radius={[6, 6, 0, 0]} fill="var(--color-chart-3)" />
          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => (value === "revenue" ? "Revenue" : "Profit")}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function DashboardCharts(props: DashboardChartProps) {
  switch (props.kind) {
    case "revenue":
      return <RevenueChart {...props} />;
    case "membership":
      return <MembershipChart {...props} />;
    case "sales":
      return <ProductChart {...props} />;
  }
}
