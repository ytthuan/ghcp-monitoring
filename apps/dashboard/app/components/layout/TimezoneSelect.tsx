"use client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  useTimezone,
  TIMEZONES,
  timezoneLabel,
  LOCAL_TZ_SENTINEL,
} from "~/lib/use-timezone";
import { Globe } from "lucide-react";

export function TimezoneSelect() {
  const { tz, setTz } = useTimezone();
  // Show the resolved IANA name when "local" is selected so the operator
  // can tell at a glance which zone "Local" actually means right now
  // (e.g. "Local (Asia/Bangkok)").
  const triggerLabel =
    tz === LOCAL_TZ_SENTINEL ? timezoneLabel(tz) : tz || "UTC";
  return (
    <Select value={tz} onValueChange={setTz}>
      <SelectTrigger
        aria-label="Select timezone"
        className="h-9 w-auto gap-1.5 border-none bg-transparent px-2 shadow-none hover:bg-accent hover:text-accent-foreground focus:ring-0"
      >
        <Globe className="h-4 w-4" aria-hidden />
        <SelectValue>
          <span className="text-sm">{triggerLabel}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {TIMEZONES.map((t) => (
          <SelectItem key={t.value} value={t.value}>
            {t.value === LOCAL_TZ_SENTINEL ? timezoneLabel(t.value) : t.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
