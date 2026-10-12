import { type LeadDetail, type LeadSummary, type Page, QUALIFICATIONS } from "@gac/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { Icon } from "../components/Icon";
import { Button, ErrorAlert, Spinner } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { CALL_OUTCOMES, CALL_TABS, type CallTab, callQueueQuery, currentOf, telHref } from "../lib/calls";
import { contactName, displayPhone, formatNumber, safeUrl } from "../lib/leads";

function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** File d'appel : un prospect à la fois, l'issue de l'appel en un clic, le suivant s'affiche aussitôt. */
export function CallsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<CallTab>("to-call");
  const [city, setCity] = useState("");
  const [qualification, setQualification] = useState("");
  const [skipped, setSkipped] = useState<string[]>([]);
  const [done, setDone] = useState(0);
  const [announce, setAnnounce] = useState("");
  const cityId = useId();
  const qualId = useId();
  const dCity = useDebounced(city);

  const queue = useQuery({
    queryKey: ["leads", "calls", tab, dCity, qualification],
    queryFn: () =>
      api<Page<LeadSummary>>(`/leads?${callQueueQuery(tab, { city: dCity, qualification }, { limit: 50 })}`),
    placeholderData: keepPreviousData,
  });
  const items = queue.data?.items ?? [];
  const current = currentOf(items, skipped);

  // Un autre filtre ou onglet : on repart du début de la file.
  // biome-ignore lint/correctness/useExhaustiveDependencies: réinitialisation déclenchée par les filtres seulement
  useEffect(() => setSkipped([]), [tab, dCity, qualification]);

  const reload = () => void queue.refetch();
  const filtered = Boolean(dCity.trim() || qualification);
  const clearFilters = () => {
    setCity("");
    setQualification("");
  };

  return (
    <>
      <h1 className="mb-1 text-2xl font-extrabold">File d'appel</h1>
      <p className="mb-4 max-w-3xl text-sm text-ds-muted">
        Les prospects jamais appelés passent en premier, regroupés par ville. Choisissez l'issue de l'appel :
        le prospect suivant s'affiche aussitôt. Trois essais sans réponse classent un prospect « Injoignable
        ».
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <fieldset className="segmented border-0">
          <legend className="sr-only">File</legend>
          {CALL_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
              className="segment"
            >
              {t.label}
            </button>
          ))}
        </fieldset>
        <div className="field">
          <label htmlFor={cityId} className="label">
            Ville
          </label>
          <input id={cityId} value={city} onChange={(e) => setCity(e.target.value)} className="input" />
        </div>
        <div className="field">
          <label htmlFor={qualId} className="label">
            Qualification
          </label>
          <select
            id={qualId}
            value={qualification}
            onChange={(e) => setQualification(e.target.value)}
            className="select"
          >
            <option value="">Toutes</option>
            {QUALIFICATIONS.map((q) => (
              <option key={q}>{q}</option>
            ))}
          </select>
        </div>
        {filtered && (
          <Button variant="ghost" onClick={clearFilters}>
            Tout effacer
          </Button>
        )}
        <p className="text-sm text-ds-muted sm:ml-auto" aria-live="polite">
          <strong className="num text-ds-ink">{formatNumber(queue.data?.total)}</strong> dans la file ·{" "}
          <strong className="num text-ds-ink">{done}</strong>{" "}
          {done > 1 ? "appels enregistrés" : "appel enregistré"} pendant cette session
        </p>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>

      {queue.error && !queue.data ? (
        <div role="alert" className="card empty">
          <h3>Impossible de charger la file</h3>
          <p>{errorMessage(queue.error)} Votre filtre est conservé ; aucun appel n'a été perdu.</p>
          <Button className="btn--lg" onClick={reload}>
            Réessayer
          </Button>
        </div>
      ) : queue.isLoading ? (
        <Spinner label="Chargement de la file d'appel" />
      ) : current ? (
        <CallCard
          key={current.id}
          id={current.id}
          onSkip={() => setSkipped((s) => [...s, current.id])}
          onLogged={async (message) => {
            setDone((n) => n + 1);
            setAnnounce(message);
            await qc.invalidateQueries({ queryKey: ["leads"] });
          }}
        />
      ) : (
        <div className="card empty">
          <h3>
            {skipped.length > 0
              ? "Vous avez passé tous les prospects affichés"
              : dCity.trim()
                ? `Plus personne à appeler à ${dCity.trim()}`
                : "Personne à appeler avec ces critères"}
          </h3>
          <p>
            {skipped.length > 0
              ? "Revenez au début pour les revoir."
              : "Tous les prospects de ce filtre ont été appelés."}
          </p>
          {skipped.length > 0 ? (
            <Button variant="secondary" className="btn--lg" onClick={() => setSkipped([])}>
              Revenir au début
            </Button>
          ) : (
            <>
              {tab === "to-call" && (
                <Button className="btn--lg" onClick={() => setTab("callback")}>
                  Voir « À rappeler »
                </Button>
              )}
              {filtered && (
                <Button variant="secondary" className="btn--lg" onClick={clearFilters}>
                  Retirer les filtres
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

function CallCard({
  id,
  onSkip,
  onLogged,
}: {
  id: string;
  onSkip: () => void;
  onLogged: (message: string) => Promise<void>;
}) {
  const noteId = useId();
  const lead = useQuery({ queryKey: ["lead", id], queryFn: () => api<LeadDetail>(`/leads/${id}`) });
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const log = useMutation({
    mutationFn: (outcome: string) =>
      api<LeadDetail>(`/leads/${id}/call`, {
        method: "POST",
        body: { outcome, ...(note.trim() ? { note } : {}) },
      }),
    onSuccess: async (data, outcome) => {
      setError(null);
      await onLogged(`Appel enregistré : ${data.company.name}, ${outcome}.`);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  if (lead.isLoading) return <Spinner />;
  if (lead.error) return <ErrorAlert message={errorMessage(lead.error)} />;
  const d = lead.data;
  if (!d) return null;
  const tel = telHref(d.company.phone);
  const maps = safeUrl(d.companyDetail.googleMapsUrl);
  const site = safeUrl(d.company.website);
  const attempts = [
    ["Appel", d.callStatus],
    ["Relance 1", d.followup1],
    ["Relance 2", d.followup2],
  ].filter(([, v]) => v);

  return (
    <div className="anim-enter-right">
      <article aria-label={`Prospect : ${d.company.name}`} className="card mb-4 flex flex-col gap-3">
        <div>
          <h2 className="t-card text-xl">{d.company.name}</h2>
          <p className="t-small text-ds-muted">
            {[d.company.sector, d.company.city, contactName(d.contact)].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="pill pill--outline">{d.qualification}</span>
            <span className="pill pill--neutral">Essai {Math.min(attempts.length + 1, 3)} sur 3</span>
          </div>
        </div>
        {tel ? (
          <a
            href={tel}
            aria-label={`Appeler ${d.company.name} au ${displayPhone(d.company.phone)}`}
            className="btn btn--primary btn--block btn--lg font-mono text-3xl font-semibold"
          >
            <Icon name="phone" size={24} />
            {displayPhone(d.company.phone)}
          </a>
        ) : (
          <p className="alert alert--warning">Pas de numéro exploitable</p>
        )}
        <p className="t-small flex flex-wrap items-center gap-x-3 gap-y-1 text-ds-muted">
          <span>
            <strong className="num text-ds-ink">{d.company.googleRating ?? "—"}</strong> (
            {formatNumber(d.company.googleReviews)} avis)
          </span>
          <span>{d.companyDetail.address ?? "—"}</span>
          {site ? (
            <a href={site} target="_blank" rel="noreferrer noopener" className="link">
              {d.company.domain ?? "Site web"}
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
          ) : (
            <span>Aucun site web</span>
          )}
          {maps && (
            <a href={maps} target="_blank" rel="noreferrer noopener" className="link">
              Fiche Google<span className="sr-only"> (nouvel onglet)</span>
            </a>
          )}
        </p>
        {attempts.length > 0 && (
          <p className="t-small">
            <strong>Déjà tenté :</strong> {attempts.map(([k, v]) => `${k} ${v}`).join(" · ")}
          </p>
        )}
        {d.comment && (
          <div className="rounded-lg bg-ds-surface-2 p-3 text-sm">
            <p className="mb-1 font-semibold">Notes précédentes</p>
            <p className="whitespace-pre-wrap">{d.comment}</p>
          </div>
        )}
        <div className="field">
          <label htmlFor={noteId} className="label">
            Note <span className="opt">(facultatif, jointe à l'issue)</span>
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Ex. rappeler après 17 h"
            className="textarea"
          />
        </div>
      </article>

      <ErrorAlert message={error} />
      <fieldset className="grid grid-cols-2 gap-2 border-0 p-0 sm:grid-cols-4">
        <legend className="sr-only">Issue de l'appel</legend>
        {CALL_OUTCOMES.map((o) => (
          <Button
            key={o.value}
            variant={o.variant === "primary" ? "primary" : "secondary"}
            title={o.hint}
            className="btn--lg"
            disabled={log.isPending}
            onClick={() => log.mutate(o.value)}
          >
            {o.label}
          </Button>
        ))}
        <Button variant="secondary" className="btn--lg" disabled={log.isPending} onClick={onSkip}>
          Passer
        </Button>
      </fieldset>
    </div>
  );
}
