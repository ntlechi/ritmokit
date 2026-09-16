export type PublicScheduleClass = {
  id: string;
  seasonId: string | null;
  seasonName: string | null;
  courseId: string;
  title: string;
  level: string;
  style: string;
  dayOfWeek: number | null;
  startTime: string;
  endTime: string;
  startTimeLocal: string;
  endTimeLocal: string;
  room: {
    id: string;
    name: string;
    capacity: number | null;
    surfaceSqm: number | null;
  };
  instructor: {
    id: string;
    fullName: string;
  };
  pricing: {
    regular: number;
    couple: number | null;
    student: number | null;
  };
  capacity: {
    maxLeads: number;
    maxFollows: number;
    leadsFilled: number;
    followsFilled: number;
    leadsFree: number;
    followsFree: number;
    imbalance: number;
    /** Role currently diverted to its own waitlist by the parity engine (gap would exceed 2). */
    lockedRole: "LEAD" | "FOLLOW" | null;
    full: boolean;
    canRegisterLead: boolean;
    canRegisterFollow: boolean;
    canRegisterSolo: boolean;
    canRegisterCouple: boolean;
    canWaitlistLead: boolean;
    canWaitlistFollow: boolean;
    waitlistActive: boolean;
  };
  syllabus: {
    weekNumber: number;
    seasonWeek: number;
    title: string;
    body: string;
    musicNote: string | null;
    leadFocus: string | null;
    followFocus: string | null;
    videoUrl: string | null;
  } | null;
  packageClassIds: string[];
  isPackage: boolean;
  packageCount: number;
};
