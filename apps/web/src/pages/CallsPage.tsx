import { type LeadDetail, type LeadSummary, type Page, QUALIFICATIONS } from "@gac/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { Button, Card, ErrorAlert, Spinner } from "../components/ui";
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

  return (
    <>
      <h1 className="mb-1 text-2xl font-extrabold">File d'appel</h1>
      <p className="mb-6 max-w-3xl text-sm text-ink/70">
        Les prospects jamais appelés passent en premier, regroupés par ville. Choisissez l'issue de l'appel :
        le prospect suivant s'affiche aussitôt. Trois essais sans réponse classent un prospect « Injoignable
        ».
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div role="tablist" aria-label="File" className="flex gap-1">
          {CALL_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                tab === t.id ? "bg-brand-600 text-white" : "border border-brand-100 bg-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor={cityId} className="mb-1 block text-xs font-medium">
            Ville
          </label>
          <input
            id={cityId}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor={qualId} className="mb-1 block text-xs font-medium">
            Qualification
          </label>
          <select
            id={qualId}
            value={qualification}
            onChange={(e) => setQualification(e.target.value)}
            className="rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm"
          >
            <option value="">Toutes</option>
            {QUALIFICATIONS.map((q) => (
              <option key={q}>{q}</option>
            ))}
          </select>
        </div>
        <p className="ml-auto text-sm" aria-live="polite">
          <strong>{formatNumber(queue.data?.total)}</strong> dans la file · <strong>{done}</strong> appel(s)
          enregistré(s) pendant cette session
        </p>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
      <ErrorAlert message={queue.error ? errorMessage(queue.error) : null} />

      {queue.isLoading ? (
        <Spinner />
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
        <Card>
          <p className="text-sm">
            {skipped.length > 0
              ? "Vous avez passé tous les prospects affichés."
              : "Personne à appeler avec ces critères."}
          </p>
          {skipped.length > 0 && (
            <Button className="mt-3" variant="ghost" onClick={() => setSkipped([])}>
              Revenir au début
            </Button>
          )}
        </Card>
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
    <article aria-label={`Prospect : ${d.company.name}`} className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold">{d.company.name}</h2>
          <p className="text-sm text-ink/70">
            {[d.company.sector, d.company.city, d.qualification].filter(Boolean).join(" · ")}
          </p>
        </div>
        {tel ? (
          <a href={tel} className="rounded-xl bg-brand-600 px-5 py-3 text-xl font-bold text-white">
            {displayPhone(d.company.phone)}
          </a>
        ) : (
          <span className="text-sm">Pas de numéro exploitable</span>
        )}
      </div>

      <dl className="mt-4 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
        {contactName(d.contact) && (
          <>
            <dt className="text-ink/70">Contact</dt>
            <dd>{contactName(d.contact)}</dd>
          </>
        )}
        <dt className="text-ink/70">Note Google</dt>
        <dd>
          {d.company.googleRating ?? "—"} ({formatNumber(d.company.googleReviews)} avis)
        </dd>
        <dt className="text-ink/70">Adresse</dt>
        <dd>{d.companyDetail.address ?? "—"}</dd>
        <dt className="text-ink/70">Site web</dt>
        <dd>
          {site ? (
            <a href={site} target="_blank" rel="noreferrer noopener" className="underline">
              {d.company.domain ?? site}
            </a>
          ) : (
            "Aucun"
          )}
        </dd>
        {maps && (
          <>
            <dt className="text-ink/70">Fiche Google</dt>
            <dd>
              <a href={maps} target="_blank" rel="noreferrer noopener" className="underline">
                Ouvrir
              </a>
            </dd>
          </>
        )}
      </dl>

      {attempts.length > 0 && (
        <p className="mt-4 text-sm">
          <strong>Déjà tenté :</strong> {attempts.map(([k, v]) => `${k} ${v}`).join(" · ")}
        </p>
      )}
      {d.comment && (
        <div className="mt-2 rounded-lg bg-brand-50 p-3 text-sm">
          <p className="mb-1 font-semibold">Notes précédentes</p>
          <p className="whitespace-pre-wrap">{d.comment}</p>
        </div>
      )}

      <div className="mt-4">
        <label htmlFor={noteId} className="mb-1 block text-sm font-medium">
          Note (facultatif)
        </label>
        <textarea
          id={noteId}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={2}
          className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm"
        />
      </div>

      <ErrorAlert message={error} />
      <fieldset className="mt-4 flex flex-wrap gap-2">
        <legend className="sr-only">Issue de l'appel</legend>
        {CALL_OUTCOMES.map((o) => (
          <Button
            key={o.value}
            variant={o.variant}
            title={o.hint}
            disabled={log.isPending}
            onClick={() => log.mutate(o.value)}
          >
            {o.label}
          </Button>
        ))}
        <Button variant="ghost" className="ml-auto" disabled={log.isPending} onClick={onSkip}>
          Passer
        </Button>
      </fieldset>
    </article>
  );
}
