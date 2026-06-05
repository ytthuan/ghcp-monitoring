import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "~/components/ui/card";
import { ChartSkeleton } from "~/components/layout/Skeletons";
import { EmptyState } from "~/components/layout/EmptyState";
import { DetailBackLink } from "~/components/layout/Breadcrumbs";
import { z } from "zod";
import { SessionSummaryHeader } from "./-sessions/SessionSummaryHeader";
import { TurnTimeline } from "./-sessions/TurnTimeline";

const fetchSession = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { getSession } = await import("~/server/queries/sessions");
    return getSession(data.id);
  });

export const Route = createFileRoute("/sessions/$id")({
  component: SessionDetailPage,
});

function SessionDetailPage() {
  const { id } = Route.useParams();
  const q = useQuery({
    queryKey: ["session", id],
    queryFn: () => fetchSession({ data: { id } }),
  });

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <DetailBackLink />
        <ChartSkeleton height={120} />
        <ChartSkeleton height={400} />
      </div>
    );
  }
  if (q.error) throw q.error;

  const turns = q.data?.turns ?? [];

  if (turns.length === 0) {
    return (
      <div className="space-y-4">
        <DetailBackLink />
        <Card>
          <CardContent className="p-0">
            <EmptyState
              title="No turns recorded for this session"
              description="This session id has no chat spans in the selected range."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DetailBackLink />
      <SessionSummaryHeader sessionId={id} turns={turns} />
      <TurnTimeline turns={turns} />
    </div>
  );
}
