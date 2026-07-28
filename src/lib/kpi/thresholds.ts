/** Dance studio KPI health thresholds. */

/** Floor utilization % — healthy studios fill most seats. */
export const KPI_FLOOR_UTIL_GOOD_MIN = 70;
export const KPI_FLOOR_UTIL_WARN_MIN = 50;

/** Yield $/m² per class — studio-dependent; below warn = poor room allocation. */
export const KPI_YIELD_SQM_GOOD_MIN = 5;
export const KPI_YIELD_SQM_WARN_MIN = 2;

/** Lead/Follow absolute delta — green 0, yellow 1–2, red >2. */
export const KPI_PARITY_DELTA_GOOD_MAX = 0;
export const KPI_PARITY_DELTA_WARN_MAX = 2;

/** Payroll-to-revenue % — healthy dance studio band 25–35%. */
export const KPI_PAYROLL_REV_GOOD_MAX = 35;
export const KPI_PAYROLL_REV_WARN_MAX = 40;

/** L1→L2 progression % — retention engine. */
export const KPI_L1_L2_GOOD_MIN = 55;
export const KPI_L1_L2_WARN_MIN = 40;

/** Net profit per class ($) — break-even awareness. */
export const KPI_NET_PROFIT_GOOD_MIN = 50;
export const KPI_NET_PROFIT_WARN_MIN = 0;
