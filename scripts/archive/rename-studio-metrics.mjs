/**
 * Rename QSR metrics (SPLH, salesShare, POS) to dance-studio terminology.
 * Run: node scripts/rename-studio-metrics.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = join(process.cwd(), "src");
const SKIP = new Set(["generated"]);

const REPLACEMENTS = [
  ["targetSplh", "studentsPerHour"],
  ["salesSharePercent", "classMixSharePercent"],
  ["projectedSales", "projectedClassRevenue"],
  ["actualSales", "actualClassRevenue"],
  ["salesByHour", "classRevenueByHour"],
  ["dailySplh", "dailyRevenuePerLaborHour"],
  ["currentHourSplh", "currentHourRevenuePerLaborHour"],
  ["totalProjectedSales", "totalProjectedClassRevenue"],
  ["hasPosData", "hasLiveRevenueData"],
  ["hasSalesData", "hasClassRevenueData"],
  ["targetCompositeSplh", "targetCompositeStudentsPerHour"],
  ["computeCompositeTargetSplh", "computeCompositeTargetStudentsPerHour"],
  ["isSplhLow", "isRevenuePerHourLow"],
  ["SPLH_ALERT_RATIO", "REVENUE_PER_HOUR_ALERT_RATIO"],
  ["splh_low", "revenue_per_hour_low"],
  ["alertSplhLow", "alertRevenuePerHourLow"],
  ["invalidSplh", "invalidStudentsPerHour"],
  ["invalid_splh", "invalid_students_per_hour"],
  ["SplhCard", "RevenuePerHourCard"],
  ["LaborSalesChart", "LaborRevenueChart"],
  ["LaborSalesChartCopy", "LaborRevenueChartCopy"],
  ["labor-sales-chart", "labor-revenue-chart"],
  ["hasPosLive", "hasLiveEnrollment"],
  ["targetSplhHint", "studentsPerHourHint"],
  ["splhCurrentHour", "revenuePerHourCurrent"],
  ["splhDaily", "revenuePerHourDaily"],
  ["noSalesData", "noClassRevenueData"],
  ['splh: "', 'revenuePerHour: "'],
  ["splh: string", "revenuePerHour: string"],
  ['"{splh}"', '"{revenuePerHour}"'],
  ["financial?.splh", "financial?.revenuePerHour"],
  ["posLiveNote", "liveEnrollmentNote"],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if ([".ts", ".tsx"].includes(extname(name))) out.push(p);
  }
  return out;
}

let changed = 0;
for (const file of walk(ROOT)) {
  let text = readFileSync(file, "utf8");
  let next = text;
  for (const [from, to] of REPLACEMENTS) {
    next = next.split(from).join(to);
  }
  if (next !== text) {
    writeFileSync(file, next, "utf8");
    changed += 1;
    console.log("patched", file.replace(process.cwd() + "\\", ""));
  }
}

console.log(`done — ${changed} files`);
