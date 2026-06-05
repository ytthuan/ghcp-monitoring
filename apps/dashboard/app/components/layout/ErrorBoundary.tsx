"use client";
import * as React from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "~/components/ui/button";

interface State {
  err: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  override state: State = { err: null };
  static getDerivedStateFromError(err: Error): State {
    return { err };
  }
  override componentDidCatch(err: Error): void {
    // eslint-disable-next-line no-console
    console.error("[dashboard] render error", err);
  }
  reset = (): void => {
    this.setState({ err: null });
  };
  override render(): React.ReactNode {
    if (!this.state.err) return this.props.children;
    const name = this.state.err.name || "Error";
    return (
      <div className="m-4 rounded-lg border bg-card p-6 text-sm shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 text-destructive"
            aria-hidden
          />
          <div className="flex-1 space-y-2">
            <div className="text-sm font-medium text-foreground">
              Couldn&apos;t load this view
            </div>
            <p className="text-xs text-muted-foreground">
              An unexpected{" "}
              <span className="font-mono text-foreground">{name}</span>{" "}
              interrupted rendering. Try again — if it persists, refresh the
              page.
            </p>
            <div>
              <Button
                size="sm"
                variant="outline"
                onClick={this.reset}
                className="gap-1"
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden />
                Retry
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
