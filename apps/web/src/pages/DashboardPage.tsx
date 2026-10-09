import { Card } from "../components/ui";
import { useAuth } from "../lib/auth";

const PHASES = [
  ["1 — Socle", "API, PostgreSQL, comptes et rôles, journal d'audit, CI/CD, déploiement", "Prêt"],
  [
    "2 — Leads",
    "Modèle entreprises / contacts / leads, liste paginée et filtrée, édition, historique",
    "À venir",
  ],
  ["3 — Pipeline", "Kanban, règles STATUT → étape, valeur des deals", "À venir"],
  ["4 — Emails", "Validation, aperçu côté API, envoi planifié avec anti-doublon, statuts Brevo", "À venir"],
  ["5 — Sourcing", "Apify, enrichissement, scoring Claude, suivi des exécutions", "À venir"],
  ["6 — Tableaux de bord", "KPI, entonnoirs, statistiques d'envoi", "À venir"],
] as const;

export function DashboardPage() {
  const { user } = useAuth();
  return (
    <>
      <h1 className="mb-1 text-2xl font-extrabold">Bonjour {user?.name}</h1>
      <p className="mb-6 text-sm text-ink/70">
        Le socle de la nouvelle version est en place. Les écrans métier arrivent phase par phase (voir{" "}
        <code>docs/07-feuille-de-route.md</code>).
      </p>
      <Card title="Avancement">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Phases de la feuille de route et leur état</caption>
          <thead>
            <tr className="border-b border-brand-100">
              <th scope="col" className="py-2 pr-4">
                Phase
              </th>
              <th scope="col" className="py-2 pr-4">
                Contenu
              </th>
              <th scope="col" className="py-2">
                État
              </th>
            </tr>
          </thead>
          <tbody>
            {PHASES.map(([phase, content, state]) => (
              <tr key={phase} className="border-b border-brand-50 align-top">
                <th scope="row" className="py-2 pr-4 font-semibold">
                  {phase}
                </th>
                <td className="py-2 pr-4">{content}</td>
                <td className="py-2">{state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
