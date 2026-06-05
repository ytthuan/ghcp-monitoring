"use client";
import { useState } from "react";
import { Activity, Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import { Button } from "~/components/ui/button";
import { SidebarNav } from "./SidebarNav";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open navigation"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen} side="left">
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="px-4 py-4">
            <SheetTitle className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4" />
              Copilot Dashboard
            </SheetTitle>
          </SheetHeader>
          <SidebarNav collapsed={false} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}

export default MobileNav;
