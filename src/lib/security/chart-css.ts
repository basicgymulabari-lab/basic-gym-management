type ChartStyleConfig = Record<
  string,
  {
    color?: unknown;
    theme?: Partial<Record<"light" | "dark", unknown>>;
  }
>;

const THEMES = { light: "", dark: ".dark" } as const;
const SAFE_CSS_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const SAFE_COLOR_VALUE = /^(?:#[\da-f]{3}|#[\da-f]{4}|#[\da-f]{6}|#[\da-f]{8}|(?:transparent|currentcolor|[a-z]{1,24})|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\([0-9a-z.%+\s,/-]{1,96}\)|var\(--[a-z][a-z0-9_-]{0,62}\))$/i;

function safeIdentifier(value: string) {
  return SAFE_CSS_IDENTIFIER.test(value) ? value : null;
}

function safeColor(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length <= 128 && SAFE_COLOR_VALUE.test(normalized) ? normalized : null;
}

/** Build the chart's theme CSS from constrained identifiers and color values. */
export function buildChartCss(id: string, config: ChartStyleConfig) {
  const safeId = safeIdentifier(id);
  if (!safeId) return "";

  return Object.entries(THEMES)
    .map(([theme, prefix]) => {
      const declarations = Object.entries(config)
        .map(([key, itemConfig]) => {
          const safeKey = safeIdentifier(key);
          const color = safeColor(itemConfig.theme?.[theme as keyof typeof itemConfig.theme] || itemConfig.color);
          return safeKey && color ? `  --color-${safeKey}: ${color};` : null;
        })
        .filter((declaration): declaration is string => declaration !== null)
        .join("\n");

      return declarations ? `${prefix} [data-chart=${safeId}] {\n${declarations}\n}` : "";
    })
    .filter(Boolean)
    .join("\n");
}
