import type { Page } from "@gac/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, ErrorAlert, Spinner } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { Pager } from "./UsersPage";

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

export function AuditPage() {
  const [offset, setOffset] = useState(0);
  const events = useQuery({
    queryKey: ["audit", offset],
    queryFn: () => api<Page<AuditEvent>>(`/audit-events?limit=${PAGE_SIZE}&offset=${offset}`),
  });
  return (
    <>
      <h1 className="mb-6 text-2xl font-extrabold">Journal d'audit</h1>
      <Card>
        {events.isPending && <Spinner />}
        {events.isError && <ErrorAlert message={errorMessage(events.error)} />}
        {events.data && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Événements enregistrés, du plus récent au plus ancien</caption>
                <thead>
                  <tr className="border-b border-brand-100">
                    <th scope="col" className="py-2 pr-4">
                      Date
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Action
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Objet
                    </th>
                    <th scope="col" className="py-2">
                      Adresse IP
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {events.data.items.map((e) => (
                    <tr key={e.id} className="border-b border-brand-50">
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {new Date(e.at).toLocaleString("fr-FR")}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">{e.action}</td>
                      <td className="py-2 pr-4">
                        {e.entityType}
                        {e.entityId ? ` · ${e.entityId.slice(0, 8)}` : ""}
                      </td>
                      <td className="py-2">{e.ip ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager total={events.data.total} offset={offset} pageSize={PAGE_SIZE} onChange={setOffset} />
          </>
        )}
      </Card>
    </>
  );
}
