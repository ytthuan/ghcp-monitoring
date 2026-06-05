"use client";
/**
 * Sheet (slide-out drawer). Lightweight implementation that doesn't pull in
 * @radix-ui/react-dialog. Pass `open` + `onOpenChange` to control externally.
 */
import * as React from "react";
import { cn } from "~/lib/utils";

export function Sheet({
  open,
  onOpenChange,
  side = "right",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: "left" | "right";
  children: React.ReactNode;
}) {
  if (!open) return null;
  const panelSide =
    side === "left" ? "mr-auto border-r" : "ml-auto border-l";
  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        aria-label="Close"
        className="absolute inset-0 bg-black/40"
        onClick={() => onOpenChange(false)}
      />
      <div
        className={cn(
          "relative h-full w-full max-w-md overflow-auto bg-background p-6 shadow-xl",
          panelSide,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function SheetTrigger({
  onOpenChange,
  children,
}: {
  asChild?: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactElement;
}) {
  return React.cloneElement(
    children as React.ReactElement<{ onClick?: () => void }>,
    { onClick: () => onOpenChange(true) },
  );
}

export function SheetContent({
  className,
  children,
  side,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { side?: "left" | "right" }) {
  return (
    <div className={className} data-side={side} {...rest}>
      {children}
    </div>
  );
}

export function SheetHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mb-4 flex flex-col space-y-1.5", className)}
      {...props}
    />
  );
}

export function SheetTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <h2
      className={cn("text-lg font-semibold", className)}
      {...(props as React.HTMLAttributes<HTMLHeadingElement>)}
    />
  );
}
