import type { InstructorPayType } from "@/generated/prisma/enums";

export type ClassEconomicsRow = {
  sessionId: string;
  courseTitle: string;
  style: string;
  level: string;
  roomId: string;
  roomName: string;
  surfaceSqm: number | null;
  instructorId: string;
  instructorName: string;
  /** 0 = Sunday … 6 = Saturday (JS Date.getDay). */
  dayOfWeek: number | null;
  startTimeIso: string;
  endTimeIso: string;
  paidCount: number;
  waitlistedCount: number;
  leadsFilled: number;
  followsFilled: number;
  maxLeads: number;
  maxFollows: number;
  imbalance: number;
  priceRegular: number;
  /** SUM(amountCad) for paid, non-waitlisted seats. */
  revenue: number;
  instructorCost: number;
  /** Revenue − instructor payroll (drives bottom-10% filter). */
  grossMargin: number;
  /** Net profit / room m². */
  roomYieldPerSqm: number | null;
  /** Expected CAD locked on the waitlist (tier-aware). */
  waitlistBlockedRevenue: number;
  utilizationPct: number;
  hours: number;
  payType: InstructorPayType | null;
};

export type ParitySnapshot = {
  sessionId: string;
  courseTitle: string;
  leadsFilled: number;
  followsFilled: number;
  maxLeads: number;
  maxFollows: number;
  imbalance: number;
  waitlistedCount: number;
  blockedRevenue: number;
  status: "balanced" | "warning" | "blocked";
};

export type HeatmapCell = {
  roomId: string;
  roomName: string;
  dayOfWeek: number;
  hour: number;
  utilizationPct: number;
  enrolled: number;
  capacity: number;
  sessionIds: string[];
};

export type ProgressionFunnel = {
  beginnerCompleters: number;
  intermediateEnrolled: number;
  advancedEnrolled: number;
  l1ToL2Rate: number | null;
  l2ToL3Rate: number | null;
};

export type ChurnRiskStudent = {
  studentId: string;
  fullName: string;
  email: string;
  unpaidAttendanceMisses: number;
  courseTitles: string[];
};

export type DanceAnalyticsBundle = {
  locationId: string;
  classRows: ClassEconomicsRow[];
  parity: ParitySnapshot[];
  heatmap: HeatmapCell[];
  progression: ProgressionFunnel;
  churnRiskStudents: ChurnRiskStudent[];
  aggregates: {
    floorUtilizationPct: number | null;
    avgYieldPerSqm: number | null;
    avgLeadFollowDelta: number | null;
    blockedRevenue: number;
    avgNetProfitPerClass: number | null;
    payrollToRevenuePct: number | null;
    churnRiskCount: number;
    classCount: number;
    paidEnrollmentCount: number;
  };
};
