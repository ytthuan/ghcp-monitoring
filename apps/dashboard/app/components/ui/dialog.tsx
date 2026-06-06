"use client";
/**
 * Centered modal dialog. Lightweight, no @radix-ui/react-dialog dependency
 * (matches the existing <Sheet/> pattern). Controlled via open + onOpenChange.
 *
 * Behavior:
 *  - ESC key closes
 *  - Backdrop click closes
 *  - Body scroll locked while open
 *  - Focus moved to first [data-autofocus] element on open; restored on close
 *  - role="dialog" aria-modal="true" so a11y / e2e selectors work as expected
 */
import * as React from "react";
import { cn } from "~/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  // ESC-to-close
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  // Body scroll-lock + autofocus + restore-focus on unmount
  const previousFocus = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Defer to next tick so children render first.
    const t = window.setTimeout(() => {
      const root = document.querySelector('[data-copilot-dialog="true"]');
      const target =
        root?.querySelector<HTMLElement>("[data-autofocus]") ??
        root?.querySelector<HTMLElement>("button, [tabindex]");
      target?.focus();
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      previousFocus.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center sm:items-center">
      <button
        aria-label="Close dialog"
        type="button"
        className="anim-enter absolute inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />
      <div
        data-copilot-dialog="true"
        role="dialog"
        aria-modal="true"
        className={cn(
          "anim-enter relative z-10 mx-auto flex w-full max-w-[min(95vw,72rem)] flex-col",
          "h-full sm:my-6 sm:h-auto sm:max-h-[90vh]",
          "overflow-hidden rounded-none bg-background shadow-xl",
          "sm:rounded-lg sm:border",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogContent({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)} {...rest}>
      {children}
    </div>
  );
}

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("shrink-0 border-b bg-card px-5 py-4", className)}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("text-base font-semibold leading-tight", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)} {...props} />
  );
}

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-end gap-2 border-t bg-card px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}
