import type { UtilizationTotals } from "./utilizationAnalytics";

// Exclusive requested-operation categories; vacancy overlap is deliberately not a category.
export function coolingCategories(totals: UtilizationTotals) {
  return [
    { id: "normal", label: "Normal cooling", ms: totals.modeMs.OCCUPIED, color: "#059669" },
    { id: "reduced", label: "Reduced / standby", ms: totals.reducedMs, color: "#64748B" },
    { id: "precool", label: "Pre-cooling", ms: totals.modeMs.PRECOOL, color: "#0284C7" }
  ] as const;
}
