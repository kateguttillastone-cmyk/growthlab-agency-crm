import type { ImportReport } from "@gac/shared";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

/** Vrai quand le fichier ne changerait rien : tout ce qu'il contient est déjà en base. */
export function nothingNew(r: ImportReport): boolean {
  return (
    r.leads.created +
      r.contacts.created +
      r.companies.created +
      r.emailMessages.created +
      r.suppressions.created ===
    0
  );
}

export interface ReportRow {
  label: string;
  created: number | null;
  existing: number | null;
}

/** Lignes du tableau de rapport, dans l'ordre où l'utilisateur les lit. */
export function reportRows(r: ImportReport): ReportRow[] {
  return [
    { label: "Entreprises", ...r.companies },
    { label: "Contacts", ...r.contacts },
    { label: "Leads", ...r.leads },
    { label: "E-mails rédigés", ...r.emailMessages },
    { label: "Adresses à ne plus contacter (rebonds et désinscriptions)", ...r.suppressions },
  ];
}

export function sortedWarnings(r: ImportReport): Array<[string, number]> {
  return Object.entries(r.warnings).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"));
}
