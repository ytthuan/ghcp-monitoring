import { Inbox } from "lucide-react";
import { cn } from "~/lib/utils";

export function EmptyState({
  icon: Icon = Inbox,
  title = "No data yet",
  description = "Send a Copilot message to start populating telemetry — this view updates automatically.",
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center",
        className,
      )}
    >
      <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
      <div className="text-sm font-medium">{title}</div>
      <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

export default EmptyState;
