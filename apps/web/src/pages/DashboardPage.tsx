import type { Dashboard, LeadSummary } from "@gac/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { Card, ErrorAlert, Spinner } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dashboardQuery, euros, PERIOD_LABELS, type PeriodChoice, percent } from "../lib/dashboard";
import { formatDate, formatNumber, QUALIFICATION_STYLE } from "../lib/leads";

const ORDER = ["Chaud", "Tiède", "Froid", "Non qualifié"];

export function DashboardPage() {
  const { user } = useAuth();
  const periodId = useId();
  const fromId = useId();
  const toId = useId();
  const [period, setPeriod] = useState<PeriodChoice>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const query = dashboardQuery(period, from, to);

  const dash = useQuery({
    queryKey: ["dashboard", query],
    queryFn: () => api<Dashboard>(`/dashboard?${query}`),
    enabled: query !== null,
    placeholderData: keepPreviousData,
  });
  const d = dash.data;

  return (
    <>
      <h1 className="mb-1 text-2xl font-extrabold">Bonjour {user?.name}</h1>
      <p className="mb-6 text-sm text-ink/70">
        Vue d'ensemble de la prospection. La période porte sur la date de détection des leads ; un lead sans
        date est exclu d'une période bornée.
      </p>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={periodId} className="mb-1 block text-xs font-medium">
            Période
          </label>
          <select
            id={periodId}
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodChoice)}
            className="rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm"
          >
            {Object.entries(PERIOD_LABELS).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {period === "custom" && (
          <>
            <div>
              <label htmlFor={fromId} className="mb-1 block text-xs font-medium">
                Du
              </label>
              <input
                id={fromId}
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor={toId} className="mb-1 block text-xs font-medium">
                Au
              </label>
              <input
                id={toId}
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm"
              />
            </div>
          </>
        )}
      </div>
      {query === null && (
        <p role="alert" className="mb-4 text-sm text-amber-900">
          Choisissez deux dates, la première avant la seconde.
        </p>
      )}
      <ErrorAlert message={dash.error ? errorMessage(dash.error) : null} />
      {dash.isLoading && query !== null && <Spinner />}

      {d && (
        <>
          <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Leads" value={formatNumber(d.kpis.leads)} />
            <Kpi
              label="Qualifiés (chaud + tiède)"
              value={formatNumber(d.kpis.qualified)}
              hint={`${percent(d.kpis.qualified, d.kpis.leads)} des leads`}
            />
            <Kpi
              label="E-mails validés"
              value={formatNumber(d.kpis.emailsValidated)}
              hint={`${formatNumber(d.kpis.emailsSent)} envoyés`}
            />
            <Kpi
              label="À appeler"
              value={formatNumber(d.kpis.toCall)}
              hint={`${formatNumber(d.kpis.appointments)} RDV programmés`}
            />
            <Kpi
              label="Deals gagnés"
              value={formatNumber(d.kpis.won)}
              hint={d.kpis.wonValue ? euros(d.kpis.wonValue) : "aucune valeur saisie"}
            />
            <Kpi
              label="En pipeline actif"
              value={formatNumber(d.kpis.activePipeline)}
              hint={`${percent(d.kpis.activePipeline, d.kpis.leads)} des leads · ${
                d.kpis.pipelineValue
                  ? `${euros(d.kpis.pipelineValue)} (${d.kpis.openDeals} deals)`
                  : "aucune valeur saisie"
              }`}
            />
          </dl>

          <div className="grid gap-4 lg:grid-cols-3">
            <Funnel
              title="Qualification"
              rows={ORDER.filter((k) => d.qualification[k]).map((k) => ({
                label: k,
                count: d.qualification[k] ?? 0,
              }))}
            />
            <Funnel title="Secteurs" rows={d.sectors} />
            <Funnel
              title="Pipeline"
              rows={d.pipeline.map((p) => ({
                label: p.stage,
                count: p.count,
                note: p.value ? euros(p.value) : undefined,
              }))}
              empty="Aucun lead n'a encore d'étape de pipeline."
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <LeadList
              title="À traiter en priorité"
              caption="Leads chauds dont l'e-mail n'est pas encore validé"
              leads={d.priority}
              action={
                <Link to="/emails" className="text-sm underline">
                  Relire les e-mails
                </Link>
              }
            />
            <LeadList title="Derniers leads détectés" caption="Les 8 plus récents" leads={d.recent} />
          </div>
        </>
      )}
    </>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <dt className="text-xs text-ink/70">{label}</dt>
      <dd className="text-2xl font-extrabold">{value}</dd>
      {hint && <dd className="text-xs text-ink/70">{hint}</dd>}
    </div>
  );
}

function Funnel({
  title,
  rows,
  empty = "Aucune donnée sur cette période.",
}: {
  title: string;
  rows: Array<{ label: string; count: number; note?: string | undefined }>;
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-ink/70">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.label} className="text-sm">
              <div className="mb-1 flex justify-between gap-2">
                <span>{r.label}</span>
                <span className="font-semibold">
                  {formatNumber(r.count)}
                  {r.note ? ` · ${r.note}` : ""}
                </span>
              </div>
              <progress
                max={max}
                value={r.count}
                aria-label={`${title} : ${r.label}`}
                className="h-2 w-full overflow-hidden rounded-full accent-brand-600"
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function LeadList({
  title,
  caption,
  leads,
  action,
}: {
  title: string;
  caption: string;
  leads: LeadSummary[];
  action?: React.ReactNode;
}) {
  return (
    <Card title={title}>
      <div className="mb-3 flex items-center justify-between text-sm text-ink/70">
        <span>{caption}</span>
        {action}
      </div>
      {leads.length === 0 ? (
        <p className="text-sm">Rien à signaler.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1 pr-2">
                Prospect
              </th>
              <th scope="col" className="py-1 pr-2">
                Qualification
              </th>
              <th scope="col" className="py-1">
                Détecté
              </th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} className="border-t border-brand-100">
                <th scope="row" className="py-2 pr-2 font-medium">
                  <Link to={`/leads?lead=${l.id}`} className="underline">
                    {l.company.name}
                  </Link>
                </th>
                <td className="pr-2">
                  {l.qualification ? (
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${QUALIFICATION_STYLE[l.qualification] ?? ""}`}
                    >
                      {l.qualification}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{formatDate(l.detectedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
