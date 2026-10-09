import type { LeadFacets, LeadSummary, Page } from "@gac/shared";
import { NONE } from "@gac/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LeadDrawer } from "../components/LeadDrawer";
import { Pager } from "../components/Pager";
import { Card, ErrorAlert, Spinner } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  activePreset,
  contactName,
  displayPhone,
  EMAIL_STATUS_STYLE,
  filtersFromParams,
  formatDate,
  formatNumber,
  type LeadFilters,
  PRESETS,
  QUALIFICATION_STYLE,
  toQueryString,
} from "../lib/leads";

const PAGE_SIZE = 50;

type SortKey = NonNullable<LeadFilters["sort"]>;
const COLUMNS: Array<{ key: SortKey | null; label: string }> = [
  { key: "company", label: "Prospect" },
  { key: "qualification", label: "Qualification" },
  { key: null, label: "Service" },
  { key: "employees", label: "Effectif" },
  { key: null, label: "Ville" },
  { key: null, label: "Téléphone" },
  { key: null, label: "E-mail" },
  { key: null, label: "Étape" },
  { key: null, label: "Appel" },
  { key: "detectedAt", label: "Détecté" },
];

export function LeadsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const filters = filtersFromParams(params);
  const page = Math.max(1, Number(params.get("page")) || 1);
  const openId = params.get("lead");
  const sort = filters.sort ?? "detectedAt";
  const order = filters.order ?? "desc";

  const update = (next: LeadFilters, opts: { keepPage?: boolean } = {}) => {
    const p = new URLSearchParams(toQueryString(next));
    if (opts.keepPage && page > 1) p.set("page", String(page));
    if (openId) p.set("lead", openId);
    setParams(p, { replace: true });
  };

  // Recherche : on attend la fin de la frappe avant d'interroger le serveur.
  const [search, setSearch] = useState(filters.q ?? "");
  useEffect(() => {
    const timer = setTimeout(() => {
      const q = search.trim();
      setParams(
        (prev) => {
          if ((prev.get("q") ?? "") === q) return prev;
          const p = new URLSearchParams(prev);
          if (q) p.set("q", q);
          else p.delete("q");
          p.delete("page");
          return p;
        },
        { replace: true },
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [search, setParams]);

  const qs = toQueryString(filters, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const list = useQuery({
    queryKey: ["leads", "list", qs],
    queryFn: () => api<Page<LeadSummary>>(`/leads?${qs}`),
    placeholderData: keepPreviousData,
  });
  const facets = useQuery({
    queryKey: ["leads", "facets"],
    queryFn: () => api<LeadFacets>("/leads/facets"),
    staleTime: 60_000,
  });

  const preset = activePreset(filters);
  const toggleSort = (key: SortKey) =>
    update({ ...filters, sort: key, order: sort === key && order === "asc" ? "desc" : "asc" });
  const openLead = (id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set("lead", id);
    else p.delete("lead");
    setParams(p, { replace: true });
  };

  const f = facets.data;
  const opt = (counts: Record<string, number> | undefined, value: string, label = value) =>
    counts ? `${label} (${(counts[value] ?? 0).toLocaleString("fr-FR")})` : label;

  return (
    <>
      <h1 className="mb-1 text-2xl font-extrabold">Leads</h1>
      <p className="mb-4 text-sm text-ink/70" aria-live="polite">
        {f ? `${f.total.toLocaleString("fr-FR")} prospects au total` : "Chargement…"}
        {list.data ? ` — ${list.data.total.toLocaleString("fr-FR")} correspondent aux filtres` : ""}
      </p>

      {f?.total === 0 && (
        <p className="mb-4 rounded-lg bg-white p-4 text-sm" role="note">
          Aucun prospect pour l'instant.{" "}
          {can("ADMIN") ? (
            <>
              <Link to="/import" className="font-semibold underline">
                Importez l'export de l'ancienne base
              </Link>{" "}
              pour commencer.
            </>
          ) : (
            "Demandez à un administrateur d'importer l'ancienne base."
          )}
        </p>
      )}

      <nav aria-label="Vues rapides" className="mb-4 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            title={p.hint}
            aria-pressed={preset === p.id}
            onClick={() => update({ ...p.filters, sort: filters.sort, order: filters.order })}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${
              preset === p.id
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-brand-100 bg-white hover:bg-brand-50"
            }`}
          >
            {p.label}
          </button>
        ))}
      </nav>

      <Card>
        <form
          aria-label="Filtres des leads"
          className="grid gap-3 md:grid-cols-3 lg:grid-cols-4"
          onSubmit={(e) => e.preventDefault()}
        >
          <Filter label="Rechercher" className="lg:col-span-2">
            {(id) => (
              <input
                id={id}
                type="search"
                className="w-full rounded border border-brand-100 bg-white px-2 py-1.5"
                placeholder="Entreprise, nom, e-mail, site, téléphone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}
          </Filter>
          <Select
            label="Qualification"
            value={filters.qualification}
            onChange={(v) => update({ ...filters, qualification: v as never })}
          >
            {["Chaud", "Tiède", "Froid"].map((v) => (
              <option key={v} value={v}>
                {opt(f?.qualification, v)}
              </option>
            ))}
            <option value={NONE}>{opt(f?.qualification, "none", "Non qualifié")}</option>
          </Select>
          <Select
            label="Segment"
            value={filters.segment}
            onChange={(v) => update({ ...filters, segment: v as never })}
          >
            <option value="with_website">{opt(f?.segment, "with_website", "Avec site web")}</option>
            <option value="no_website">{opt(f?.segment, "no_website", "Sans site web")}</option>
          </Select>
          <Select
            label="Service"
            value={filters.service}
            onChange={(v) => update({ ...filters, service: v as never })}
          >
            {["Google Ads", "Création de site", "Refonte de site"].map((v) => (
              <option key={v} value={v}>
                {opt(f?.service, v)}
              </option>
            ))}
          </Select>
          <Select
            label="Étape"
            value={filters.stage}
            onChange={(v) => update({ ...filters, stage: v as never })}
          >
            <option value={NONE}>{opt(f?.stage, "none", "Aucune")}</option>
            {Object.keys(f?.stage ?? {})
              .filter((k) => k !== "none")
              .map((v) => (
                <option key={v} value={v}>
                  {opt(f?.stage, v)}
                </option>
              ))}
          </Select>
          <Select
            label="Validation e-mail"
            value={filters.validation}
            onChange={(v) => update({ ...filters, validation: v as never })}
          >
            {["Pas Validé", "Validé", "Rejeté"].map((v) => (
              <option key={v} value={v}>
                {opt(f?.validation, v)}
              </option>
            ))}
          </Select>
          <Select
            label="Envoi e-mail"
            value={filters.emailStatus}
            onChange={(v) => update({ ...filters, emailStatus: v as never })}
          >
            {["Envoyé", "Délivré", "Ouvert", "Bounce", "Désinscrit"].map((v) => (
              <option key={v} value={v}>
                {opt(f?.emailStatus, v)}
              </option>
            ))}
            <option value={NONE}>{opt(f?.emailStatus, "none", "Pas envoyé")}</option>
          </Select>
        </form>
      </Card>

      <Card>
        {list.isPending && <Spinner />}
        {list.isError && <ErrorAlert message={errorMessage(list.error)} />}
        {list.data && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Liste des prospects, page {page}, triée par {sort} (
                  {order === "asc" ? "croissant" : "décroissant"})
                </caption>
                <thead>
                  <tr className="border-b border-brand-100">
                    {COLUMNS.map((c) => (
                      <th
                        key={c.label}
                        scope="col"
                        className="whitespace-nowrap py-2 pr-4"
                        aria-sort={
                          c.key && c.key === sort ? (order === "asc" ? "ascending" : "descending") : undefined
                        }
                      >
                        {c.key ? (
                          <button
                            type="button"
                            className="font-semibold underline-offset-2 hover:underline"
                            onClick={() => toggleSort(c.key as SortKey)}
                          >
                            {c.label}
                            {c.key === sort ? (order === "asc" ? " ▲" : " ▼") : ""}
                          </button>
                        ) : (
                          c.label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className={list.isPlaceholderData ? "opacity-60" : ""}>
                  {list.data.items.map((l) => (
                    <tr key={l.id} className="border-b border-brand-50 align-top hover:bg-brand-50/60">
                      <th scope="row" className="py-2 pr-4 font-normal">
                        <button
                          type="button"
                          className="text-left font-semibold underline-offset-2 hover:underline"
                          onClick={() => openLead(l.id)}
                        >
                          {l.company.name}
                        </button>
                        <span className="block text-xs text-ink/70">{contactName(l.contact) || "—"}</span>
                      </th>
                      <td className="py-2 pr-4">
                        {l.qualification ? (
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-semibold ${QUALIFICATION_STYLE[l.qualification]}`}
                          >
                            {l.qualification}
                          </span>
                        ) : (
                          <span className="text-ink/60">À qualifier</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">{l.service ?? "—"}</td>
                      <td className="py-2 pr-4">{formatNumber(l.company.employees)}</td>
                      <td className="py-2 pr-4">{l.company.city ?? "—"}</td>
                      <td className="whitespace-nowrap py-2 pr-4">
                        {l.company.phone ? (
                          <a className="underline" href={`tel:${l.company.phone}`}>
                            {displayPhone(l.company.phone)}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {l.email?.status ? (
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-semibold ${EMAIL_STATUS_STYLE[l.email.status]}`}
                          >
                            {l.email.status}
                          </span>
                        ) : l.email ? (
                          <span className="text-xs">{l.email.validation}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 pr-4">{l.stage ?? "—"}</td>
                      <td className="py-2 pr-4">{l.callStatus ?? l.callState ?? "—"}</td>
                      <td className="whitespace-nowrap py-2">{formatDate(l.detectedAt)}</td>
                    </tr>
                  ))}
                  {list.data.items.length === 0 && (
                    <tr>
                      <td colSpan={COLUMNS.length} className="py-8 text-center text-ink/70">
                        Aucun prospect ne correspond à ces filtres.{" "}
                        <button
                          type="button"
                          className="underline"
                          onClick={() => {
                            setSearch("");
                            update({});
                          }}
                        >
                          Réinitialiser
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pager
              total={list.data.total}
              offset={(page - 1) * PAGE_SIZE}
              pageSize={PAGE_SIZE}
              onChange={(offset) => {
                const p = new URLSearchParams(params);
                p.set("page", String(offset / PAGE_SIZE + 1));
                setParams(p, { replace: true });
              }}
            />
          </>
        )}
      </Card>

      {openId && <LeadDrawer id={openId} onClose={() => openLead(null)} />}
    </>
  );
}

function Filter({
  label,
  children,
  className = "",
}: {
  label: string;
  children: (id: string) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  children: React.ReactNode;
}) {
  return (
    <Filter label={label}>
      {(id) => (
        <select
          id={id}
          className="w-full rounded border border-brand-100 bg-white px-2 py-1.5 font-normal"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">Tous</option>
          {children}
        </select>
      )}
    </Filter>
  );
}
