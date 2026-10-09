import type { DashboardQuery } from "@gac/shared";

export type PeriodChoice = DashboardQuery["period"];

export const PERIOD_LABELS: Record<PeriodChoice, string> = {
  all: "Toute la période",
  "7": "7 derniers jours",
  "30": "30 derniers jours",
  "90": "90 derniers jours",
  custom: "Période personnalisée",
};

/** Chaîne de requête de la période ; null tant qu'une période personnalisée est incomplète ou inversée. */
export function dashboardQuery(period: PeriodChoice, from: string, to: string): string | null {
  if (period !== "custom") return `period=${period}`;
  if (!from || !to || from > to) return null;
  return `period=custom&from=${from}&to=${to}`;
}

export function percent(part: number, total: number): string {
  return total === 0 ? "—" : `${Math.round((part / total) * 100)} %`;
}

export function euros(n: number): string {
  return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}
