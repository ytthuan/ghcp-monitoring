import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Search } from "lucide-react";
import { useFilters } from "~/lib/use-filters";
import { useTimezone, formatTimestampInTz } from "~/lib/use-timezone";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { TableSkeleton } from "~/components/layout/Skeletons";
import { Button } from "~/components/ui/button";
import { EmptyState } from "~/components/layout/EmptyState";
import { FormatCell } from "~/components/data/FormatCell";
import { Badge } from "~/components/ui/badge";
import { FiltersSchema, type Filters, type SessionRow } from "~/lib/types";
import { cn } from "~/lib/utils";
import { useKeyboardRowNav } from "./-sessions/use-keyboard-row-nav";

const fetchSessions = createServerFn({ method: "POST" })
  .inputValidator((d: Filters) => FiltersSchema.parse(d))
  .handler(async ({ data }) => {
    const { listSessions } = await import("~/server/queries/sessions");
    return listSessions(data);
  });

export const Route = createFileRoute("/sessions/")({
  component: SessionsPage,
});

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

type SortKey =
  | "session_id"
  | "start_ts"
  | "end_ts"
  | "calls"
  | "input"
  | "output";
type SortDir = "asc" | "desc";

interface SortState {
  key: SortKey;
  dir: SortDir;
}

function SessionsPage() {
  const { filters, setFilters } = useFilters();
  const { tz } = useTimezone();
  const navigate = useNavigate();
  const [sort, setSort] = useState<SortState>({ key: "end_ts", dir: "desc" });

  const q = useQuery({
    queryKey: ["sessions", filters],
    queryFn: () => fetchSessions({ data: filters }),
  });

  const rows = useMemo<SessionRow[]>(() => {
    const base = q.data ?? [];
    const sorted = [...base].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [q.data, sort]);

  const openSession = (i: number) => {
    const r = rows[i];
    if (!r) return;
    void navigate({
      to: "/sessions/$id",
      params: { id: r.session_id },
      search: (prev: Record<string, unknown>) => prev,
    });
  };

  const { activeIndex, rowProps } = useKeyboardRowNav(rows.length, openSession);

  if (q.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Chat sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <TableSkeleton rows={10} cols={3} />
        </CardContent>
      </Card>
    );
  }
  if (q.error) throw q.error;

  const isEmpty = rows.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chat sessions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative max-h-[70vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))]">
              <TableRow>
                <SortHeader
                  label="Session"
                  k="session_id"
                  sort={sort}
                  setSort={setSort}
                />
                <SortHeader
                  label="Start"
                  k="start_ts"
                  sort={sort}
                  setSort={setSort}
                />
                <SortHeader
                  label="End"
                  k="end_ts"
                  sort={sort}
                  setSort={setSort}
                />
                <SortHeader
                  label="Calls"
                  k="calls"
                  sort={sort}
                  setSort={setSort}
                  align="right"
                />
                <SortHeader
                  label="Input"
                  k="input"
                  sort={sort}
                  setSort={setSort}
                  align="right"
                />
                <SortHeader
                  label="Output"
                  k="output"
                  sort={sort}
                  setSort={setSort}
                  align="right"
                />
                <TableHead>Models</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isEmpty ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState
                      icon={Search}
                      title="No sessions in this range"
                      description="Widen the time range or clear model/agent filters to see sessions."
                      action={
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setFilters({
                              models: [],
                              agents: [],
                              range: "7d",
                              from: undefined,
                              to: undefined,
                            })
                          }
                        >
                          Reset filters
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((s, i) => {
                  const props = rowProps(i);
                  return (
                    <TableRow
                      key={s.session_id}
                      data-testid="session-row"
                      data-active={props["data-active"]}
                      tabIndex={props.tabIndex}
                      onFocus={props.onFocus}
                      onClick={() => openSession(i)}
                      className={cn(
                        "cursor-pointer data-[active=true]:bg-muted",
                        FOCUS_RING,
                      )}
                      aria-label={`Open session ${s.session_id}`}
                    >
                      <TableCell>
                        <span className="font-mono text-xs">
                          {s.session_id.slice(0, 12)}…
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {formatTimestampInTz(s.start_ts, tz)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {formatTimestampInTz(s.end_ts, tz)}
                      </TableCell>
                      <TableCell className="text-right">
                        <FormatCell kind="number" value={s.calls} />
                      </TableCell>
                      <TableCell className="text-right">
                        <FormatCell kind="number" value={s.input} />
                      </TableCell>
                      <TableCell className="text-right">
                        <FormatCell kind="number" value={s.output} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {s.models.map((m) => (
                            <Badge key={m} variant="secondary">
                              {m}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        {!isEmpty ? (
          <div className="px-1 pt-2 text-xs text-muted-foreground">
            {rows.length} session{rows.length === 1 ? "" : "s"} · use{" "}
            <kbd className="rounded border bg-muted px-1">j</kbd>/
            <kbd className="rounded border bg-muted px-1">k</kbd> to navigate,{" "}
            <kbd className="rounded border bg-muted px-1">Enter</kbd> to open
            {activeIndex >= 0 && rows[activeIndex]
              ? ` · row ${activeIndex + 1}`
              : ""}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SortHeader({
  label,
  k,
  sort,
  setSort,
  align,
}: {
  label: string;
  k: SortKey;
  sort: SortState;
  setSort: (s: SortState) => void;
  align?: "right";
}) {
  const active = sort.key === k;
  const dir = active ? sort.dir : null;
  const next: SortDir = active && sort.dir === "asc" ? "desc" : "asc";
  return (
    <TableHead
      className={align === "right" ? "text-right" : undefined}
      aria-sort={
        dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"
      }
    >
      <button
        type="button"
        onClick={() => setSort({ key: k, dir: next })}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm hover:text-foreground",
          align === "right" ? "ml-auto" : "",
          FOCUS_RING,
        )}
      >
        {label}
        {dir === "asc" ? (
          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
        ) : dir === "desc" ? (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden />
        )}
      </button>
    </TableHead>
  );
}
