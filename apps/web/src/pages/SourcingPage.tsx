import {
  SOURCING_SOURCE_LABELS,
  SOURCING_SOURCES,
  SOURCING_STATE_LABELS,
  type SourcingCriteria,
  type SourcingEstimate,
  type SourcingRun,
  type SourcingRunPage,
  type SourcingSource,
  type SourcingState,
  type SourcingStatus,
} from "@gac/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, ErrorAlert, Field, SelectField, Spinner } from "../components/ui";
import { api, errorMessage } from "../lib/api";

const STATE_PILL: Record<SourcingState, string> = {
  queued: "pill pill--pending",
  running: "pill pill--info",
  succeeded: "pill pill--good",
  failed: "pill pill--critical",
  cancelled: "pill pill--neutral",
};

const euros = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const when = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

function sourceLabel(source: SourcingSource): string {
  return source === "google_maps" ? "Sourcing · Google Maps" : "Sourcing · LinkedIn";
}

/** Trouver de nouveaux prospects par critères : on simule (coût, doublons probables), on confirme, on suit l'exécution. */
export function SourcingPage() {
  const qc = useQueryClient();
  const [source, setSource] = useState<SourcingSource>("google_maps");
  const [query, setQuery] = useState("");
  const [cities, setCities] = useState("");
  const [maxResults, setMaxResults] = useState("20");
  const [noWebsiteOnly, setNoWebsiteOnly] = useState(false);
  const [estimate, setEstimate] = useState<SourcingEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ["sourcing", "status"],
    queryFn: () => api<SourcingStatus>("/sourcing/status"),
  });
  const runs = useQuery({
    queryKey: ["sourcing", "runs"],
    queryFn: () => api<SourcingRunPage>("/sourcing/runs?limit=20"),
    // tant qu'une recherche tourne, l'état se rafraîchit seul
    refetchInterval: (q) =>
      q.state.data?.items.some((r) => r.state === "queued" || r.state === "running") ? 5000 : false,
  });

  const criteria = (): SourcingCriteria => ({
    source,
    query: query.trim(),
    cities: cities
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean),
    maxResults: Number(maxResults),
    noWebsiteOnly: source === "google_maps" && noWebsiteOnly,
  });
  const reset = () => {
    setEstimate(null);
    setInfo(null);
  };

  const simulate = useMutation({
    mutationFn: () =>
      api<SourcingEstimate>("/sourcing/runs", {
        method: "POST",
        body: { criteria: criteria(), dryRun: true },
      }),
    onSuccess: (e) => {
      setError(null);
      setEstimate(e);
    },
    onError: (e) => {
      setEstimate(null);
      setError(errorMessage(e));
    },
  });
  const launch = useMutation({
    mutationFn: () =>
      api<SourcingRun>("/sourcing/runs", {
        method: "POST",
        body: { criteria: criteria(), dryRun: false, expectedCost: estimate?.estimatedCost },
      }),
    onSuccess: async () => {
      setError(null);
      setEstimate(null);
      setInfo("Recherche lancée : suivez son état dans le tableau ci-dessous.");
      await qc.invalidateQueries({ queryKey: ["sourcing"] });
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api<SourcingRun>(`/sourcing/runs/${id}/cancel`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sourcing"] }),
    onError: (e) => setError(errorMessage(e)),
  });

  const s = status.data;
  const off = s?.mode === "off";
  const notConfigured = s !== undefined && s.mode !== "off" && !s.configured;
  const remaining = s ? Math.max(0, s.dailyBudget - s.spentToday) : null;

  return (
    <>
      <h1 className="mb-1 text-2xl font-extrabold">Sourcing</h1>
      <p className="mb-4 max-w-3xl text-sm text-ds-muted">
        Trouver de nouveaux prospects à partir de critères. Les leads trouvés arrivent à l'étape « Nouveau »,
        sans doublon, avec un numéro français. Une recherche coûte : on simule d'abord, puis on confirme.
      </p>

      {off && (
        <p role="note" className="alert alert--info mb-4 max-w-3xl">
          Le sourcing est désactivé sur ce serveur : vous pouvez simuler une recherche, mais pas la lancer.
        </p>
      )}
      {notConfigured && (
        <p role="alert" className="alert alert--warning mb-4 max-w-3xl">
          Le fournisseur de prospects n'est pas configuré (jeton manquant) : aucune recherche ne peut partir.
        </p>
      )}
      {s && !off && (
        <p className="mb-4 text-sm text-ds-muted">
          Aujourd'hui : <strong className="num text-ds-ink">{euros(s.spentToday)}</strong> engagés sur{" "}
          {euros(s.dailyBudget)} (reste {euros(remaining ?? 0)}).
        </p>
      )}

      <form
        className="card mb-6 max-w-3xl"
        aria-label="Nouvelle recherche"
        onSubmit={(e) => {
          e.preventDefault();
          setInfo(null);
          simulate.mutate();
        }}
      >
        <h2 className="t-card mb-3">Nouvelle recherche</h2>
        <ErrorAlert message={error} />
        {info && (
          <p role="status" className="alert alert--good mb-4">
            {info}
          </p>
        )}
        <div className="grid gap-x-4 sm:grid-cols-2">
          <SelectField
            label="Source"
            value={source}
            onChange={(e) => {
              setSource(e.target.value as SourcingSource);
              reset();
            }}
          >
            {SOURCING_SOURCES.map((v) => (
              <option key={v} value={v}>
                {SOURCING_SOURCE_LABELS[v]}
              </option>
            ))}
          </SelectField>
          <Field
            label={source === "linkedin" ? "Poste ou secteur" : "Métier ou secteur"}
            required
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              reset();
            }}
          />
          <Field
            label="Villes"
            required
            hint="Séparées par des virgules (10 au plus)"
            value={cities}
            onChange={(e) => {
              setCities(e.target.value);
              reset();
            }}
          />
          <Field
            label="Nombre maximal de résultats"
            type="number"
            min={1}
            max={s?.maxPerRun ?? 100}
            required
            hint={s ? `${s.maxPerRun} au plus par recherche` : undefined}
            value={maxResults}
            onChange={(e) => {
              setMaxResults(e.target.value);
              reset();
            }}
          />
        </div>
        {source === "google_maps" && (
          <label className="mb-4 flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={noWebsiteOnly}
              onChange={(e) => {
                setNoWebsiteOnly(e.target.checked);
                reset();
              }}
            />
            Seulement les établissements sans site web
          </label>
        )}
        {s && (
          <p className="mb-3 text-sm text-ds-muted">
            Coût estimé : {euros(s.costPerResult)} × {Number(maxResults) || 0} résultats au plus ={" "}
            <strong className="num text-ds-ink">{euros(s.costPerResult * (Number(maxResults) || 0))}</strong>
          </p>
        )}
        <Button
          type="submit"
          variant="secondary"
          disabled={simulate.isPending || !query.trim() || !cities.trim() || !Number(maxResults)}
        >
          Simuler la recherche
        </Button>

        {estimate && (
          <div role="status" className="alert alert--info mt-4 flex-col">
            <p className="font-semibold">
              Coût maximal : {euros(estimate.estimatedCost)} pour {estimate.maxResults} résultats au plus.
            </p>
            <p>
              Doublons probables : {estimate.probableDuplicates.toLocaleString("fr-FR")} entreprise(s) déjà
              connue(s) dans ces villes et ce secteur (elles ne seront pas recréées).
            </p>
            <p>
              Budget du jour : {euros(estimate.spentToday)} déjà engagés sur {euros(estimate.dailyBudget)}.
            </p>
            {!off && !notConfigured && (
              <div>
                <Button disabled={launch.isPending} onClick={() => launch.mutate()}>
                  Lancer la recherche ({euros(estimate.estimatedCost)})
                </Button>
              </div>
            )}
          </div>
        )}
      </form>

      <section className="card" aria-label="Exécutions">
        <h2 className="t-card mb-3">Exécutions</h2>
        {runs.isPending && <Spinner />}
        <ErrorAlert message={runs.error ? errorMessage(runs.error) : null} />
        {runs.data && runs.data.items.length === 0 && (
          <p className="text-sm text-ds-muted">Aucune recherche lancée pour l'instant.</p>
        )}
        {runs.data && runs.data.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Recherches lancées, de la plus récente à la plus ancienne</caption>
              <thead>
                <tr className="border-b border-ds-line">
                  {["Lancée le", "Critères", "État", "Résultat", "Coût", "Actions"].map((h) => (
                    <th key={h} scope="col" className="whitespace-nowrap py-2 pr-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.data.items.map((r) => (
                  <tr key={r.id} className="border-b border-ds-line align-top">
                    <th scope="row" className="whitespace-nowrap py-2 pr-4 font-normal">
                      {when(r.createdAt)}
                      {r.createdBy && <span className="block text-xs text-ds-muted">{r.createdBy.name}</span>}
                    </th>
                    <td className="py-2 pr-4">
                      {r.criteria.query} · {r.criteria.cities.join(", ")}
                      <span className="block text-xs text-ds-muted">
                        {SOURCING_SOURCE_LABELS[r.criteria.source]}, {r.criteria.maxResults} au plus
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={STATE_PILL[r.state]}>
                        {SOURCING_STATE_LABELS[r.state]}
                        {r.state === "running" && r.progress !== null ? ` · ${r.progress} %` : ""}
                      </span>
                      {r.error && <span className="block text-xs text-ds-critical-ink">{r.error}</span>}
                    </td>
                    <td className="py-2 pr-4">
                      {r.state === "succeeded"
                        ? `${r.created ?? 0} nouveau(x) · ${r.duplicates ?? 0} doublon(s)${r.rejected ? ` · ${r.rejected} écarté(s)` : ""}`
                        : "—"}
                    </td>
                    <td className="num py-2 pr-4">
                      {r.cost !== null
                        ? euros(r.cost)
                        : r.state === "failed"
                          ? "—"
                          : `≤ ${euros(r.estimatedCost)}`}
                    </td>
                    <td className="py-2">
                      {(r.state === "queued" || r.state === "running") && (
                        <Button
                          variant="ghost"
                          disabled={cancel.isPending}
                          onClick={() => {
                            if (window.confirm("Annuler cette recherche ? Le coût déjà engagé reste dû."))
                              cancel.mutate(r.id);
                          }}
                        >
                          Annuler
                        </Button>
                      )}
                      {r.state === "succeeded" && (r.created ?? 0) > 0 && (
                        <Link
                          className="link"
                          to={`/leads?source=${encodeURIComponent(sourceLabel(r.criteria.source))}`}
                        >
                          Voir les leads
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
