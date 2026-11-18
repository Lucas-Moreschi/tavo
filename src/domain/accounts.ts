import { tabTotals } from "@/domain/finance";
import type { RestaurantState, Tab, TabTotals } from "@/domain/types";

export function accountTotals(state: RestaurantState, tabs: Tab[]) {
  const totals: TabTotals = {
    subtotalCents: 0,
    serviceCents: 0,
    discountCents: 0,
    extraCents: 0,
    totalCents: 0,
    paidCents: 0,
    balanceCents: 0,
  };
  let dueCents = 0,
    refundCents = 0;
  for (const tab of tabs) {
    const current = tabTotals(state, tab.id);
    for (const key of Object.keys(totals) as (keyof TabTotals)[]) totals[key] += current[key];
    dueCents += Math.max(0, current.balanceCents);
    refundCents += Math.max(0, -current.balanceCents);
  }
  return { ...totals, dueCents, refundCents };
}

export function groupTabs(state: RestaurantState, groupId: string) {
  const visits = new Set(
    state.visits.filter((visit) => visit.groupId === groupId).map((visit) => visit.id),
  );
  return state.tabs.filter((tab) => visits.has(tab.visitId));
}

export function joiningTabs(state: RestaurantState, tableIds: string[]) {
  const visits = new Set(
    state.occupancies
      .filter((occupancy) => !occupancy.releasedAt && tableIds.includes(occupancy.tableId))
      .map((occupancy) => occupancy.visitId),
  );
  return state.tabs.filter((tab) => visits.has(tab.visitId));
}

export function accountOrigin(state: RestaurantState, tab: Tab) {
  const history = state.occupancies.filter((occupancy) => occupancy.visitId === tab.visitId);
  const active = history.filter((occupancy) => !occupancy.releasedAt);
  const lastRelease = history
    .map((occupancy) => occupancy.releasedAt || "")
    .sort()
    .at(-1);
  const origins = active.length
    ? active
    : history.filter((occupancy) => occupancy.releasedAt === lastRelease);
  const numbers = [
    ...new Set(
      origins
        .map((occupancy) => state.tables.find((table) => table.id === occupancy.tableId)?.number)
        .filter((number): number is number => number !== undefined),
    ),
  ].sort((a, b) => a - b);
  const visit = state.visits.find((entry) => entry.id === tab.visitId);
  return numbers.length ? `Mesa ${numbers.join(" + ")}` : visit?.label || "Atendimento";
}
