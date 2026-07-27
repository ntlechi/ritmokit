import { ModernShiftCard } from "@/components/calendar/ModernShiftCard";
import type { ShiftWithEmployee } from "@/lib/data/shifts";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/**
 * Shift chip — delegates to ModernShiftCard (Fable floating capsule).
 * Kept as a stable import path for week/month/orphan views.
 */
export function ShiftChip(props: {
  shift: ShiftWithEmployee;
  locale: Locale;
  dict: Dictionary;
  compact?: boolean;
  draggableHint?: boolean;
  onDelete?: () => void;
}) {
  return <ModernShiftCard {...props} />;
}
