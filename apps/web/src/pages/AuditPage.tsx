import type { Page } from "@gac/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useOwnerOptions } from "../components/LeadsTools";
import { Pager } from "../components/Pager";
import { Card, ErrorAlert, Spinner } from "../components/ui";
import { api, errorMessage } from "../lib/api";

interface AuditEvent {
  id: number;
  at: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  data: Record<string, unknown> | null;
  ip: string | null;
}

const PAGE_SIZE = 50;

/** Libellés français des actions enregistrées (le code technique reste lisible en détail). */
const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Connexion",
  "auth.login_failed": "Échec de connexion",
  "auth.account_locked": "Compte verrouillé",
  "auth.logout": "Déconnexion",
  "auth.password_changed": "Mot de passe changé",
  "user.created": "Compte créé",
  "user.updated": "Compte modifié",
  "user.password_reset": "Mot de passe réinitialisé",
  "user.seeded": "Compte initial créé",
  "leads.bulk_update": "Modification groupée de leads",
  "leads.export": "Export de leads",
  "emails.bulk_validation": "Validation groupée d'e-mails",
  "emails.bulk_undo": "Annulation d'une validation groupée",
  "emails.address_check": "Contrôle d'adresses",
  "emails.marked_sent": "E-mail marqué comme envoyé",
  "emails.send_released": "Envoi incertain libéré",
  "settings.mail_updated": "Réglages d'envoi modifiés",
  "suppressions.add": "Adresse exclue ajoutée",
  "sourcing.started": "Recherche de prospects lancée",
  "sourcing.cancelled": "Recherche de prospects annulée",
};
const ENTITY_LABELS: Record<string, string> = {
  user: "Compte",
  lead: "Lead",
  email: "E-mail",
  settings: "Réglages",
  suppression: "Adresse exclue",
  sourcing_run: "Recherche",
};
const label = (action: string) => ACTION_LABELS[action] ?? action;

export function AuditPage() {
  const [offset, setOffset] = useState(0);
  const [action, setAction] = useState("");
  const owners = useOwnerOptions();
  const events = useQuery({
    queryKey: ["audit", offset, action],
    queryFn: () =>
      api<Page<AuditEvent>>(
        `/audit-events?limit=${PAGE_SIZE}&offset=${offset}${action ? `&action=${encodeURIComponent(action)}` : ""}`,
      ),
    placeholderData: keepPreviousData,
  });
  const who = (id: string | null) =>
    id ? (owners.data?.find((o) => o.id === id)?.name ?? `${id.slice(0, 8)}…`) : "Système";
  const total = events.data?.total ?? 0;

  return (
    <>
      <header className="pagebar mb-4">
        <div className="pagebar-title">
          <h1 className="t-page">Journal d'audit</h1>
          <span className="pagebar-count">
            {total.toLocaleString("fr-FR")} {total > 1 ? "événements" : "événement"}
          </span>
        </div>
        <div className="pagebar-filters">
          <select
            aria-label="Type d'action"
            className={`select u-w-auto ${action ? "is-set" : ""}`}
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Toutes les actions</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {action && (
            <button
              type="button"
              className="filter-clear"
              onClick={() => {
                setAction("");
                setOffset(0);
              }}
            >
              Effacer
            </button>
          )}
        </div>
      </header>
      <Card>
        {events.isPending && <Spinner />}
        {events.isError && <ErrorAlert message={errorMessage(events.error)} />}
        {events.data && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Événements enregistrés, du plus récent au plus ancien</caption>
                <thead>
                  <tr className="border-b border-ds-line">
                    {["Date", "Qui", "Action", "Objet", "Adresse IP"].map((h) => (
                      <th key={h} scope="col" className="py-2 pr-4">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {events.data.items.map((e) => (
                    <tr key={e.id} className="border-b border-ds-line align-top">
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {new Date(e.at).toLocaleString("fr-FR")}
                      </td>
                      <td className="py-2 pr-4">{who(e.actorId)}</td>
                      <td className="py-2 pr-4">
                        <span className="font-semibold">{label(e.action)}</span>
                        {e.data && Object.keys(e.data).length > 0 && (
                          <details className="fold">
                            <summary className="t-small text-ds-muted">Détail</summary>
                            <pre className="t-small m-0 mt-1 max-w-md overflow-x-auto whitespace-pre-wrap font-mono">
                              {JSON.stringify(e.data, null, 2)}
                            </pre>
                          </details>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {ENTITY_LABELS[e.entityType] ?? e.entityType}
                        {e.entityId ? ` · ${e.entityId.slice(0, 8)}` : ""}
                      </td>
                      <td className="py-2">{e.ip ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager total={total} offset={offset} pageSize={PAGE_SIZE} onChange={setOffset} />
          </>
        )}
      </Card>
    </>
  );
}
