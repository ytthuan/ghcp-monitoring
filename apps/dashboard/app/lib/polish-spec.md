# Dashboard Polish Spec (Wave 1 design contract)

> **Audience:** every later polish subagent (waves 2–4) and any human PR.
> **Rule:** if you are about to write JSX or CSS in `apps/dashboard/`, re-read the relevant section here first. If the spec is wrong, fix the spec in the same PR — don't drift.
>
> Repo gate: `AGENTS.md` › Directory Architecture still binds. This spec only governs `apps/dashboard/app/**`.

---

## 1. Design tokens & spacing

All tokens already exist in `app/styles/globals.css` as CSS variables exposed to Tailwind via `@theme`. **Components must reference them by Tailwind utility, never as raw hex / hsl literals.**

### Color tokens (canonical list — use only these)

| Purpose                | Class                                       |
| ---------------------- | ------------------------------------------- |
| Page background        | `bg-background`                             |
| Surface (cards, popovers) | `bg-card` / `bg-popover`                 |
| Primary text           | `text-foreground`                           |
| Secondary / hint text  | `text-muted-foreground`                     |
| Subtle surface (hover, chips, skeletons) | `bg-muted` / `bg-accent`      |
| Border                 | `border` (uses `--border`)                  |
| Focus ring             | `ring-ring` (token), see §10               |
| Destructive            | `bg-destructive text-destructive-foreground` |
| Chart series 1–5       | `fill-chart-1`…`fill-chart-5` / `stroke-chart-N` / `text-chart-N` |

The five chart tokens are the **only** color source for series. Never inline a hex in a `<svg>` or recharts prop — pull from `var(--chart-N)` or the helper in `app/lib/colors.ts`.

### Radii

| Element                       | Class           |
| ----------------------------- | --------------- |
| Card, dialog, sheet, popover  | `rounded-lg`    |
| Inputs, buttons, table wrap   | `rounded-md`    |
| Chips / badges / pill cells   | `rounded-sm`    |
| Avatars / dot indicators      | `rounded-full`  |

### Spacing scale (Tailwind 4 default; pick from this set only)

`gap-1 gap-2 gap-3 gap-4 gap-6 gap-8` and the matching `p-*` / `space-y-*`. Page-level layout uses `p-4` (set by `AppShell`'s `<main>`). Card internals use `p-6` (already baked into `CardHeader` / `CardContent`). KPI strips use `gap-4`. Avoid arbitrary values like `p-[18px]`.

### Typography

| Use                     | Class                                |
| ----------------------- | ------------------------------------ |
| Page H1 (rare)          | `text-lg font-semibold tracking-tight` |
| Card title (default)    | `text-sm font-medium text-muted-foreground` (already in `CardTitle`) |
| KPI value               | `text-2xl font-semibold tabular-nums` |
| Body                    | `text-sm`                            |
| Hint / caption / footer | `text-xs text-muted-foreground`      |
| Numeric cells           | always add `tabular-nums`            |

### Focus ring (canonical)

```
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
```

Use the `cn()` helper to compose. Every interactive element (button, link, row, tab, menu item) must carry this — no exceptions (§10).

---

## 2. Standard card pattern

Always wrap measurable content in a `Card`. The header has up to four slots: `eyebrow`, `title`, `stat`, `action`. Copy this shape verbatim:

```tsx
<Card>
  <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
    <div className="space-y-1">
      {/* eyebrow (optional) */}
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        Last 7d
      </div>
      <CardTitle>Tokens by model</CardTitle>
      {/* stat (optional, big number) */}
      <div className="text-2xl font-semibold tabular-nums text-foreground">
        {formatCompact(total)}
      </div>
    </div>
    {/* action slot (optional) */}
    {action ? <div className="shrink-0">{action}</div> : null}
  </CardHeader>
  <CardContent className="pt-0">{/* chart / table / list */}</CardContent>
</Card>
```

Rules:

- `CardTitle` stays muted + small. The big number lives **below** the title, not inside it.
- Action slot holds at most one icon button or one `<Link>` — no toolbars.
- Don't override `rounded-lg` / `border` / `bg-card` on `Card`.

---

## 3. Standard table pattern

Built on `app/components/ui/table.tsx` + `@tanstack/react-table`. Sticky header, hoverable rows (already in `TableRow`), keyboard `j` / `k` navigation, sort affordance, empty + pagination footers.

### Sticky header

Wrap `<Table>` in a scroll container and pin `<TableHeader>`:

```tsx
<div className="relative max-h-[70vh] overflow-auto rounded-md border">
  <Table>
    <TableHeader className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))]">
      {/* ...headers */}
    </TableHeader>
    <TableBody>{/* rows */}</TableBody>
  </Table>
</div>
```

### Sort affordance

For sortable headers, render a button with a chevron from Lucide:

```tsx
<button
  type="button"
  onClick={col.getToggleSortingHandler()}
  className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
  aria-sort={sortDir === "asc" ? "ascending" : sortDir === "desc" ? "descending" : "none"}
>
  {label}
  {sortDir === "asc" ? <ChevronUp className="h-3.5 w-3.5" />
   : sortDir === "desc" ? <ChevronDown className="h-3.5 w-3.5" />
   : <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />}
</button>
```

### Keyboard row nav (j / k)

Wave-3 `polish-tables` will create `app/lib/use-keyboard-row-nav.ts` exporting:

```ts
export function useKeyboardRowNav(
  rowCount: number,
  onActivate?: (index: number) => void,
  opts?: { enabled?: boolean; initialIndex?: number },
): {
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  rowProps: (i: number) => {
    "data-active": boolean | undefined;
    tabIndex: number;
    onFocus: () => void;
  };
};
```

Bindings: `j` / `ArrowDown` → next, `k` / `ArrowUp` → prev, `Enter` → `onActivate(activeIndex)`. Hook must ignore key events when `event.target` is inside an input/textarea/contenteditable. Active row is styled with `data-[active=true]:bg-muted`.

### Empty state inside table body

```tsx
<TableBody>
  {rows.length === 0 ? (
    <TableRow>
      <TableCell colSpan={cols.length} className="p-0">
        <EmptyState
          title="No calls match these filters"
          description="Loosen the time range or clear model/agent filters to see results."
        />
      </TableCell>
    </TableRow>
  ) : rows.map(/* ... */)}
</TableBody>
```

### Pagination footer

```tsx
<div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
  <div>Showing {from}–{to} of {formatNumber(total)}</div>
  <div className="flex items-center gap-2">
    <Button variant="ghost" size="sm" disabled={!canPrev} onClick={prev} aria-label="Previous page">
      <ChevronLeft className="h-4 w-4" />
    </Button>
    <span className="tabular-nums">Page {pageIndex + 1}</span>
    <Button variant="ghost" size="sm" disabled={!canNext} onClick={next} aria-label="Next page">
      <ChevronRight className="h-4 w-4" />
    </Button>
  </div>
</div>
```

---

## 4. Standard chart card pattern

```tsx
<Card>
  <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {eyebrow /* e.g. "Last 24h" */}
      </div>
      <CardTitle>{title}</CardTitle>
      {stat !== undefined ? (
        <div className="text-2xl font-semibold tabular-nums">{stat}</div>
      ) : null}
    </div>
    {drillTo ? (
      <Link
        to={drillTo}
        search={(prev) => ({ ...prev, ...drillSearch })}
        className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm inline-flex items-center gap-1"
      >
        View calls <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    ) : null}
  </CardHeader>
  <CardContent className="pt-0">
    <div className="h-[260px]">{/* <AreaStacked />, <Histogram />, etc */}</div>
  </CardContent>
</Card>
```

Rules:

- Drill-down link **must** use TanStack Router `<Link to=... search={(prev) => ({ ...prev, ... })}>` so global filters (time range, model, agent) survive navigation. Never hand-build a query string.
- Default chart body height is `h-[260px]` (KPI page) or `h-[320px]` (full charts page). No other arbitrary heights.
- Tooltips and legends inherit chart tokens via `app/components/ui/chart.tsx`.

---

## 5. Standard breadcrumb format

A new `<Breadcrumbs />` (wave-2, `polish-navigation`) lives at `app/components/layout/Breadcrumbs.tsx` and reads route metadata via `useMatches()`:

```tsx
// Each route opts in:
export const Route = createFileRoute("/traces/$traceId")({
  component: TraceDetail,
  staticData: { crumb: ({ params }) => ({ label: `Trace ${params.traceId.slice(0, 8)}`, parent: "/traces" }) },
});

// Breadcrumbs component
const matches = useMatches();
const crumbs = matches
  .map((m) => m.staticData?.crumb?.(m))
  .filter(Boolean);
```

Rendered shape:

```tsx
<nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
  {crumbs.map((c, i) => (
    <Fragment key={c.to ?? c.label}>
      {i > 0 && <ChevronRight className="h-3 w-3" aria-hidden />}
      {c.to ? (
        <Link to={c.to} className="hover:text-foreground rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {c.label}
        </Link>
      ) : (
        <span aria-current="page" className="text-foreground">{c.label}</span>
      )}
    </Fragment>
  ))}
</nav>
```

Detail routes (`traces.$traceId`, `sessions.$id`) additionally render a back link **above** the page title:

```tsx
<Link to="/traces" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
  <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to traces
</Link>
```

Breadcrumbs mount in `Header` (left of the existing title slot) and never wrap onto two lines on desktop.

---

## 6. Standard skeleton shapes

Wave-3 `polish-empty-loading` will implement these in `app/components/layout/Skeletons.tsx` on top of the existing `Skeleton` primitive. The visual intent is "block out the real shape", not "spin".

```ts
// app/components/layout/Skeletons.tsx
export function TableSkeleton(props: {
  rows?: number;          // default 8
  cols: number;           // required, must match real table
  className?: string;
}): JSX.Element;

export function ChartSkeleton(props: {
  height?: number;        // default 260
  className?: string;
}): JSX.Element;

export function KpiStripSkeleton(props: {
  n?: number;             // default 4
  className?: string;
}): JSX.Element;
```

Rules for implementations:

- Heights must come from props, **never** `className="h-[400px]"` literals at call sites.
- `TableSkeleton` renders inside the same scroll container as the real table so layout doesn't jump on load.
- Use `Skeleton` (already animated) for blocks; do not add new keyframes.

Call-site usage (during `isLoading`):

```tsx
{q.isLoading ? <ChartSkeleton height={260} /> : <AreaStacked data={q.data} />}
{q.isLoading ? <TableSkeleton rows={10} cols={columns.length} /> : <Table>…</Table>}
```

---

## 7. Standard EmptyState pattern

Extend `app/components/layout/EmptyState.tsx` to take an optional `icon`. Existing call sites keep working (icon defaults to `Inbox`). New signature:

```tsx
export function EmptyState(props: {
  icon?: LucideIcon;          // default: Inbox
  title: string;              // make required (no generic default copy)
  description?: string;
  action?: React.ReactNode;
  className?: string;
}): JSX.Element;
```

Visual: same dashed card, icon `h-5 w-5 text-muted-foreground`, title `text-sm font-medium`, description `text-xs text-muted-foreground max-w-sm`.

Call-site examples:

```tsx
// chart page
<EmptyState
  icon={LineChart}
  title="No latency samples in this window"
  description="Widen the time range or clear filters to populate the chart."
/>

// table page (calls)
<EmptyState
  icon={Search}
  title="No calls match these filters"
  description="Loosen the time range or clear model/agent filters."
  action={<Button size="sm" variant="outline" onClick={resetFilters}>Reset filters</Button>}
/>
```

The default-copy fallback ("Send a Copilot message…") is allowed only on `index.tsx` first-load.

---

## 8. Microcopy rules

- **Sentence case** everywhere. `Tokens by model`, not `Tokens By Model` or `TOKENS BY MODEL`. Eyebrows are an exception: `uppercase tracking-wide` styling, but the source string is still sentence case.
- **No trailing periods** on labels, button text, table headers, or chip text. Periods are fine in full sentences inside descriptions.
- **Time labels** are human: `Last 24h`, `Last 7d`, `Last 30d`. Never `7d` alone, never `7 days ago`.
- **Units always have a space**: `245 ms`, `12.4 K tokens`, `3.2 s`. Use `formatMs` / `formatCompact` from `app/lib/format.ts`.
- **Money**: `$1.23` (two decimals under $10, otherwise rounded sensibly). Use `formatUsd`. Never `$1.2300` or `$1`.
- **Percent**: `42.0%` to one decimal, with `formatPct`. No `42 percent`.
- **Numbers in tables**: always `tabular-nums`. Group thousands (`1,234`).
- **Errors**: `Couldn't load <thing> — try again` (em dash, sentence case, no period). Pair with a retry button that calls `query.refetch()`.
- **Empty**: state what's missing **and** the suggested action. Never just "No data".

---

## 9. Iconography

- **Library:** `lucide-react` only. Do not introduce another icon set.
- **Sizes:**
  - Dense UI (table cells, sort chevrons, inline links): `h-3.5 w-3.5` or `h-4 w-4`.
  - Header / nav / button icons: `h-4 w-4`.
  - EmptyState / page-level affordances: `h-5 w-5`.
- **Decorative icons** (next to a text label): `aria-hidden` and no `aria-label`.
- **Icon-only buttons / links**: **`aria-label` is REQUIRED**. Example: `<Button size="icon" aria-label="Refresh"><RefreshCw className="h-4 w-4" /></Button>`.
- Do not animate icons except for the existing `RefreshControl` spinner state.

---

## 10. Accessibility floor

- Focus ring (§1) on **every** interactive element: `<button>`, `<a>`, `<Link>`, table sort headers, custom rows that take focus, tabs, menu items.
- Icon-only controls have `aria-label` (§9). Decorative icons have `aria-hidden`.
- Color contrast meets WCAG AA — verified by sticking to tokens. Don't introduce new colors without checking against `--background` (light) and `--background` (dark).
- Dialogs / sheets trap focus and restore it on close (`@radix-ui/react-dialog` already does this — don't bypass it).
- Command palette (wave-2, built on existing `Dialog`): opens with `⌘K` / `Ctrl+K`, fully reachable by keyboard, list items use `role="option"`, `aria-selected`, and visible focus.
- Tables expose `aria-sort` on sortable headers (§3) and `scope="col"` on `<TableHead>` semantically (already a `<th>`).
- Respect `prefers-reduced-motion` — do not add custom transitions longer than 150 ms; use Tailwind's `transition-colors` / `transition-opacity` only.
- Tap targets ≥ 32 px on mobile (`size="sm"` button is 32 px in this design system; `size="icon"` is 36 px).

---

## 11. Telemetry safety reminder

`<RevealableCell />` defaults to `[redacted]`. `<RevealBanner />` stays mounted. The reveal flag lives in `sessionStorage` only — never `localStorage`, never a cookie, never URL state. The CommandPalette **must not** surface raw prompt / response / tool-arg / tool-result text in recent items or search results — only IDs, model names, agent names, route labels, and timestamps. Same constraint applies to any new "recently viewed" or "search" UI.

---

## 12. Anti-patterns (reject in review)

- ❌ Hex / rgb / hsl literals in component code (`#f5f2ed`, `rgb(...)`, `hsl(222 47% 11%)`). Use tokens.
- ❌ Inline `style={{ color: "..." }}`, `style={{ backgroundColor: "..." }}`. Use Tailwind utilities bound to tokens.
- ❌ Fixed-pixel skeletons at the call site (`<Skeleton className="h-[400px]" />`). Use `ChartSkeleton` / `TableSkeleton` / `KpiStripSkeleton` with a prop.
- ❌ `<EmptyState />` with the generic default copy on a page that has a specific purpose. Always pass `title` + `description`.
- ❌ Icon-only `<Button>` without `aria-label`.
- ❌ Hand-built query strings on drill-down links. Use `<Link search={(prev) => …}>`.
- ❌ New top-level dependency without a one-line justification in the PR description and `@security-auditor` sign-off (per `AGENTS.md`). The CommandPalette is built on the existing `Dialog` — no `cmdk`, no `kbar`.
- ❌ New keyframes / custom CSS in `globals.css` for one-off animations. Stick to Tailwind transitions and the existing `Skeleton` shimmer.
- ❌ Logging or rendering raw prompt / response text anywhere outside the explicit reveal flow (§11).

---

## 13. Number formatting

Every user-visible number flows through `app/lib/format.ts`. Pick the
right helper for the surface — **never use `String(n)`, `n.toString()`,
`n.toFixed(0)`, or bare `{value}` for a number you want a user to read.**

| Helper             | Output examples                | Use for                                      |
| ------------------ | ------------------------------ | -------------------------------------------- |
| `formatExact`      | `21,140,874` `9,872`           | Tooltips · popovers · CSV cells · table rows where space allows · "show me the actual number" |
| `formatCompactBig` | `21.1M` `12.4K`                | Chart axes · cell labels · sparkline labels · KPI big-number when ≥1K |
| `formatTokens`     | `21.1M` for ≥10K, else `9,872` | Token counts in dense charts + cells where 4-digit thousands still fit clearly |
| `formatRequests`   | `21.1M` for ≥1K, else `872`    | Request / call counts in dense surfaces      |
| `formatNumber`     | `1,234,567`                    | Same as `formatExact` — kept for back-compat |
| `formatCompact`    | `999` `21M`                    | Legacy compact (raw under 1K). Prefer `formatCompactBig` for new code. |
| `formatUsd`        | `$1.23` `<$0.01` `$0.00`       | Money cells / KPI tiles / chart tooltips     |
| `formatUsdExact`   | `$1.2345` `$0.0023`            | Hover / title / popover detail / CSV (4dp)   |
| `formatPct`        | `78.5%`                        | Percentages                                  |
| `formatLatency`    | `245 ms` `1.23 s`              | Latency (spec-compliant unit spacing)        |
| `formatMs`         | `245ms` `1.23s`                | Legacy latency (no space). Use `formatLatency` for new code. |

**Rules for chart components:**

- Recharts axes: pass a custom `tickFormatter={formatCompactBig}`.
- Recharts tooltips: render the full value via `formatExact` inside a custom `<Tooltip content={...}/>`. Bare `formatter` returning `String(value)` is forbidden.
- Heatmap / KPI cells: prefer `formatTokens` (or `formatRequests`) so the cell label stays compact, and put the exact value in the title/aria-label/popover via `formatExact`.

**Anti-patterns (now blocking, not just minor):**

- `<span>{n}</span>` where `n` is a number → use a formatter.
- `Number(x).toString()` in render → use `formatNumber` / `formatExact`.
- `(n / 1000).toFixed(1) + "K"` → use `formatCompactBig`.

### USD formatting

USD has its own rule because money rounding is load-bearing for trust.

- **All user-facing USD displays** — table cells, KPI tiles, chart tooltips,
  donut labels, footer totals — render through `formatUsd`. Two decimals,
  always. Never four. Never "let Intl decide".
- **`formatUsdExact` (4dp)** is reserved for hover/`title` text, popover
  detail rows, and CSV exports — surfaces where the user has explicitly
  asked for the precise figure.
- **Sub-cent guard:** `formatUsd` renders `<$0.01` for any non-zero value
  with `|n| < 0.005`. A literal `$0.00` for a non-zero cost is misleading
  (it implies "free"); `<$0.01` truthfully says "non-zero, below display
  resolution — see the tooltip for the exact figure". True zero still
  renders `$0.00`.
- **Pair them.** Whenever `formatUsd` is shown in a dense surface (cell,
  tile, axis label), the same value should be reachable via `formatUsdExact`
  in the cell's `title`, an aria-label, or a popover row. Wave 3 will pick
  up the consumer-side wiring (CostCell tooltip etc.).

**USD anti-patterns (blocking):**

- `` `$${n.toFixed(4)}` `` or `` `$${n.toFixed(2)}` `` — hand-rolled string,
  bypasses thousand separators and the sub-cent guard.
- `new Intl.NumberFormat("en-US", { style: "currency", currency: "USD",
  maximumFractionDigits: 4 })` outside `format.ts` — duplicates the helper
  and re-allocates a formatter per render.
- `"$" + n.toLocaleString()` or any other hand-rolled currency string.
- Showing `$0.00` for a value the caller knows is non-zero; route it through
  `formatUsd` and let the sub-cent guard handle it.
