import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// CLDR/ICU still emits deprecated ids for some zones (Asia/Calcutta, not
// Asia/Kolkata). We display and save the modern IANA name, both spellings
// are valid `Intl` time zones, and keep the legacy id attached as a search
// keyword so either name finds the zone.
const MODERN_ID: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Europe/Kiev": "Europe/Kyiv",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "America/Godthab": "America/Nuuk",
  "Pacific/Truk": "Pacific/Chuuk",
  "Pacific/Ponape": "Pacific/Pohnpei",
};

const LEGACY_ID: Record<string, string> = Object.fromEntries(
  Object.entries(MODERN_ID).map(([legacy, modern]) => [modern, legacy]),
);

/** Map a deprecated ICU zone id to its modern IANA equivalent (else as-is). */
export function canonicalTimezone(zone: string): string {
  return MODERN_ID[zone] ?? zone;
}

/** The browser-detected IANA timezone, modernized (Calcutta → Kolkata). */
export function detectedTimezone(): string {
  return canonicalTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

/**
 * Substring-only ranking for the timezone list, replacing cmdk's default
 * fuzzy scorer: that one matches subsequences, so "Kolk" surfaced
 * Asia/Srednekolymsk (K…OL…K) while the exact city prefix sat below it.
 * Here a city-segment prefix (1) beats a city-segment substring (0.85)
 * beats a substring anywhere in the id (0.6); anything that isn't a
 * contiguous substring is dropped. Exported for tests.
 */
export function timezoneMatchScore(
  value: string,
  search: string,
  keywords?: string[],
): number {
  const query = search.trim().toLowerCase().replace(/_/g, " ");
  if (!query) return 1;
  let best = 0;
  for (const candidate of [value, ...(keywords ?? [])]) {
    const hay = candidate.toLowerCase().replace(/_/g, " ");
    const city = hay.slice(hay.lastIndexOf("/") + 1);
    if (city.startsWith(query)) best = Math.max(best, 1);
    else if (city.includes(query)) best = Math.max(best, 0.85);
    else if (hay.includes(query)) best = Math.max(best, 0.6);
  }
  return best;
}

/**
 * Group IANA zone names by their region prefix ("America/New_York" → "America").
 * Zones with no slash (UTC, GMT aliases) collect under "Other". Exported for
 * tests; regions and zones keep the platform's (already sorted) order.
 */
export function groupTimezones(
  zones: string[],
): { region: string; zones: string[] }[] {
  const byRegion = new Map<string, string[]>();
  for (const zone of zones) {
    const slash = zone.indexOf("/");
    const region = slash === -1 ? "Other" : zone.slice(0, slash);
    const list = byRegion.get(region);
    if (list) list.push(zone);
    else byRegion.set(region, [zone]);
  }
  return [...byRegion.entries()].map(([region, regionZones]) => ({
    region,
    zones: regionZones,
  }));
}

/**
 * Searchable IANA timezone picker, grouped by region. The list comes from the
 * browser (`Intl.supportedValuesOf`) with legacy ids modernized, and the
 * current value and the detected zone always present even when a browser
 * build omits them.
 */
export function TimezoneSelect({
  value,
  onChange,
  disabled,
}: {
  /** The currently saved IANA zone (falls back to the detected zone upstream). */
  value: string;
  onChange: (zone: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Saved values may predate modernization (Asia/Calcutta): compare and
  // display through the canonical id so the check mark and trigger agree
  // with the list.
  const canonicalValue = value ? canonicalTimezone(value) : "";

  const groups = useMemo(() => {
    const supported =
      typeof Intl.supportedValuesOf === "function"
        ? Intl.supportedValuesOf("timeZone")
        : [];
    const all = new Set(supported.map(canonicalTimezone));
    // Never let the saved or detected zone vanish from the list.
    if (canonicalValue) all.add(canonicalValue);
    all.add(detectedTimezone());
    return groupTimezones([...all].sort());
  }, [canonicalValue]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label="Timezone"
          disabled={disabled}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/50 disabled:opacity-60"
          data-testid="timezone-trigger"
        >
          <span className="truncate">{canonicalValue || detectedTimezone()}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-64 p-0" align="start">
        <Command filter={timezoneMatchScore}>
          <CommandInput placeholder="Search timezones…" />
          <CommandList className="max-h-64">
            <CommandEmpty>No timezone found.</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.region} heading={group.region}>
                {group.zones.map((zone) => (
                  <CommandItem
                    key={zone}
                    value={zone}
                    keywords={[
                      zone.replace(/_/g, " "),
                      ...(LEGACY_ID[zone] ? [LEGACY_ID[zone]] : []),
                    ]}
                    onSelect={() => {
                      setOpen(false);
                      if (zone !== canonicalValue) onChange(zone);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        zone === canonicalValue ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{zone.replace(/_/g, " ")}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
