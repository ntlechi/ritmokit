import {
  BookOpen,
  Calendar,
  CalendarClock,
  CalendarDays,
  GraduationCap,
  LayoutTemplate,
  MessageSquare,
  MessagesSquare,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { HelpCategoryKey, HelpTopicKey } from "@/lib/help/config";

export const HELP_TOPIC_ICONS: Record<HelpTopicKey, LucideIcon> = {
  schedule: Calendar,
  punch: Timer,
  training: BookOpen,
  messages: MessageSquare,
  availability: CalendarClock,
  managerSchedule: Users,
  weekTemplates: LayoutTemplate,
  managerSops: BookOpen,
};

export const HELP_CATEGORY_ICONS: Record<HelpCategoryKey, LucideIcon> = {
  clock: Timer,
  schedule: CalendarDays,
  learning: GraduationCap,
  team: MessagesSquare,
  manage: Users,
};
