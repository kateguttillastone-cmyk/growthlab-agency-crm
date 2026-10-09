import {
  ADDRESS_CHECK_LABELS,
  type AddressCheckResult,
  type BulkEmailResult,
  type EmailPreview,
  type EmailStats,
  emailWarnings,
  isBlockingCheck,
  type LeadDetail,
  type LeadSummary,
  type Page,
  QUALIFICATIONS,
  type SendStatus,
} from "@gac/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { Pager } from "../components/Pager";
import { Button, Card, ErrorAlert, Spinner } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { BLOCKED_LABELS, bulkFilter, nextAfter, type QueueFilters, queueQuery, TABS } from "../lib/emails";
import { contactName, formatNumber } from "../lib/leads";

const PAGE_SIZE = 25;

function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Relecture et validation des e-mails de prospection : file, aperçu fidèle, validation unitaire ou groupée. */
export function EmailsPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<QueueFilters>({
    tab: "review",
    q: "",
    qualification: "",
    promptVersion: "",
  });
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const q = useDebounced(filters.q);
  const effective = { ...filters, q };

  const stats = useQuery({ queryKey: ["emails", "stats"], queryFn: () => api<EmailStats>("/emails/stats") });
  const queue = useQuery({
    queryKey: ["leads", "emails", queueQuery(effective), offset],
    queryFn: () => api<Page<LeadSummary>>(`/leads?${queueQuery(effective, { limit: PAGE_SIZE, offset })}`),
    placeholderData: keepPreviousData,
  });

  const change = (patch: Partial<QueueFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setOffset(0);
  };
  const items = queue.data?.items ?? [];
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["leads"] }),
      qc.invalidateQueries({ queryKey: ["emails", "stats"] }),
    ]);
  };

  return (
    <>
      <h1 className="mb-1 text-2xl font-extrabold">E-mails à relire</h1>
      <p className="mb-6 max-w-3xl text-sm text-ink/70">
        Relisez l'e-mail tel qu'il partira, corrigez-le si besoin, puis validez-le. Rien n'est envoyé depuis
        cet écran. Une adresse exclue (rebond, désinscription) ne peut pas être validée.
      </p>

      <StatsCards stats={stats.data} />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div role="tablist" aria-label="Etat des e-mails" className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={filters.tab === t.id}
              onClick={() => change({ tab: t.id })}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                filters.tab === t.id ? "bg-brand-600 text-white" : "border border-brand-100 bg-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Filter label="Recherche">
          {(id) => (
            <input
              id={id}
              type="search"
              value={filters.q}
              onChange={(e) => change({ q: e.target.value })}
              className="rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm"
            />
          )}
        </Filter>
        <Filter label="Qualification">
          {(id) => (
            <select
              id={id}
              value={filters.qualification}
              onChange={(e) => change({ qualification: e.target.value })}
              className="rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm"
            >
              <option value="">Toutes</option>
              {QUALIFICATIONS.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          )}
        </Filter>
        <Filter label="Version du prompt">
          {(id) => (
            <select
              id={id}
              value={filters.promptVersion}
              onChange={(e) => change({ promptVersion: e.target.value })}
              className="rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm"
            >
              <option value="">Toutes</option>
              {(stats.data?.byPrompt ?? [])
                .filter((p) => p.version !== "(inconnue)")
                .map((p) => (
                  <option key={p.version}>{p.version}</option>
                ))}
            </select>
          )}
        </Filter>
      </div>

      <ErrorAlert message={queue.error ? errorMessage(queue.error) : null} />

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <section aria-label="File de relecture">
          {queue.isLoading ? (
            <Spinner />
          ) : items.length === 0 ? (
            <p className="rounded-2xl bg-white p-6 text-sm">Aucun e-mail dans cette liste.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(l.id)}
                    aria-current={selected === l.id}
                    className={`w-full rounded-xl border p-3 text-left text-sm ${
                      selected === l.id ? "border-brand-600 bg-brand-50" : "border-brand-100 bg-white"
                    }`}
                  >
                    <span className="block font-semibold">{l.company.name}</span>
                    <span className="block text-xs text-ink/70">
                      {contactName(l.contact) || "Sans contact"} · {l.qualification ?? "Non qualifié"}
                    </span>
                    <span className="mt-1 block truncate">{l.email?.subject ?? "(sans objet)"}</span>
                    {l.email?.addressCheck && isBlockingCheck(l.email.addressCheck) && (
                      <span className="mt-1 mr-1 inline-block rounded bg-red-100 px-2 py-0.5 text-xs text-red-900">
                        Adresse inutilisable ({ADDRESS_CHECK_LABELS[l.email.addressCheck]})
                      </span>
                    )}
                    {l.email?.blockedReason && (
                      <span className="mt-1 inline-block rounded bg-red-100 px-2 py-0.5 text-xs text-red-900">
                        Adresse exclue ({BLOCKED_LABELS[l.email.blockedReason]})
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Pager total={queue.data?.total ?? 0} offset={offset} pageSize={PAGE_SIZE} onChange={setOffset} />
        </section>

        <section aria-label="Relecture">
          {selected ? (
            <ReviewPanel
              key={selected}
              id={selected}
              onChanged={refresh}
              onAdvance={() =>
                setSelected(
                  nextAfter(
                    items.map((i) => i.id),
                    selected,
                  ),
                )
              }
            />
          ) : (
            <p className="rounded-2xl bg-white p-6 text-sm">Choisissez un e-mail dans la liste.</p>
          )}
        </section>
      </div>

      <SendPanel />

      <AddressCheckPanel stats={stats.data} onDone={refresh} />

      {filters.tab === "review" && <BulkPanel filters={effective} onDone={refresh} />}

      {stats.data && stats.data.byPrompt.length > 0 && <PromptTable stats={stats.data} />}
    </>
  );
}

function Filter({ label, children }: { label: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

function StatsCards({ stats }: { stats: EmailStats | undefined }) {
  const cards = [
    ["À relire", stats?.toReview],
    ["Sans adresse valable", stats?.toReviewNoRecipient],
    ["Adresses à contrôler", stats?.addressUnchecked],
    ["Adresses inutilisables", stats?.addressInvalid],
    ["Validés, non envoyés", stats?.validatedNotSent],
    ["Rejetés", stats?.rejected],
    ["Envoyés", stats?.sent],
  ] as const;
  return (
    <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      {cards.map(([label, n]) => (
        <div key={label} className="rounded-2xl bg-white p-4 shadow-sm">
          <dt className="text-xs text-ink/70">{label}</dt>
          <dd className="text-2xl font-extrabold">{formatNumber(n)}</dd>
        </div>
      ))}
    </dl>
  );
}

function PromptTable({ stats }: { stats: EmailStats }) {
  return (
    <Card title="Résultats par version du prompt">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">E-mails par version du prompt de rédaction</caption>
          <thead>
            <tr>
              {["Version", "À envoyer", "Envoyés", "Ouverts", "Rebonds", "Désinscrits"].map((h) => (
                <th key={h} scope="col" className="py-2 pr-4">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.byPrompt.map((p) => (
              <tr key={p.version} className="border-t border-brand-100">
                <th scope="row" className="py-2 pr-4 font-medium">
                  {p.version}
                </th>
                <td className="pr-4">{p.pending}</td>
                <td className="pr-4">{p.sent}</td>
                <td className="pr-4">{p.opened}</td>
                <td className="pr-4">{p.bounced}</td>
                <td className="pr-4">{p.unsubscribed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ReviewPanel({
  id,
  onChanged,
  onAdvance,
}: {
  id: string;
  onChanged: () => Promise<void>;
  onAdvance: () => void;
}) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [info, setInfo] = useState<string | null>(null);
  const subjectId = useId();
  const bodyId = useId();
  const lead = useQuery({ queryKey: ["lead", id], queryFn: () => api<LeadDetail>(`/leads/${id}`) });
  const message = lead.data?.emailMessage ?? null;
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Le brouillon repart de la version enregistrée chaque fois que le serveur en renvoie une nouvelle.
  const version = message?.updatedAt;
  // biome-ignore lint/correctness/useExhaustiveDependencies: seule une nouvelle version du serveur réinitialise le brouillon
  useEffect(() => {
    setSubject(message?.subject ?? "");
    setBody(message?.body ?? "");
  }, [version]);

  const dSubject = useDebounced(subject);
  const dBody = useDebounced(body);
  const preview = useQuery({
    queryKey: ["emails", "preview", dSubject, dBody],
    queryFn: () =>
      api<EmailPreview>("/emails/preview", { method: "POST", body: { subject: dSubject, body: dBody } }),
    enabled: !!message,
    placeholderData: keepPreviousData,
  });

  const save = useMutation({
    mutationFn: (input: { validation?: "Validé" | "Rejeté" | "Pas Validé"; advance?: boolean }) =>
      api<LeadDetail>(`/leads/${id}/email`, {
        method: "PATCH",
        body: {
          ...(subject !== (message?.subject ?? "") ? { subject } : {}),
          ...(body !== (message?.body ?? "") ? { body } : {}),
          ...(input.validation ? { validation: input.validation } : {}),
          expectedUpdatedAt: message?.updatedAt,
        },
      }),
    onSuccess: async (data, input) => {
      setError(null);
      qc.setQueryData(["lead", id], data);
      await onChanged();
      if (input.advance) onAdvance();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const testSend = useMutation({
    mutationFn: () => api<{ sentTo: string }>("/emails/test-send", { method: "POST", body: { leadId: id } }),
    onSuccess: (r) => {
      setError(null);
      setInfo(`E-mail de test envoyé à ${r.sentTo}.`);
    },
    onError: (e) => {
      setInfo(null);
      setError(errorMessage(e));
    },
  });
  const release = useMutation({
    mutationFn: () => api<LeadDetail>(`/leads/${id}/email/release`, { method: "POST" }),
    onSuccess: async (data) => {
      setError(null);
      qc.setQueryData(["lead", id], data);
      await onChanged();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  if (lead.isLoading) return <Spinner />;
  if (lead.error) return <ErrorAlert message={errorMessage(lead.error)} />;
  if (!lead.data || !message) {
    return <p className="rounded-2xl bg-white p-6 text-sm">Ce prospect n'a pas d'e-mail rédigé.</p>;
  }

  const dirty = subject !== (message.subject ?? "") || body !== (message.body ?? "");
  const sent = lead.data.email?.status !== null && lead.data.email?.status !== undefined;
  const blocked = lead.data.email?.blockedReason ?? null;
  const email = lead.data.contact?.email ?? null;
  const check = lead.data.email?.addressCheck ?? null;
  const cannotValidate = sent
    ? "Déjà envoyé"
    : !email
      ? "Pas d'adresse e-mail"
      : blocked
        ? `Adresse exclue (${BLOCKED_LABELS[blocked]})`
        : check && isBlockingCheck(check)
          ? `Adresse inutilisable (${ADDRESS_CHECK_LABELS[check]})`
          : !subject.trim() || !body.trim()
            ? "Objet et corps à renseigner"
            : null;
  const warnings = emailWarnings({ subject, body });
  const validation = lead.data.email?.validation;

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold">{lead.data.company.name}</h2>
      <p className="mb-4 text-sm text-ink/70">
        {contactName(lead.data.contact) || "Sans contact"} · {email ?? "pas d'adresse"} ·{" "}
        {lead.data.qualification ?? "Non qualifié"}
        {message.promptVersion ? ` · prompt ${message.promptVersion}` : ""}
      </p>
      <ErrorAlert message={error} />
      {info && (
        <p role="status" className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">
          {info}
        </p>
      )}
      {message.sendReserved && (
        <div role="alert" className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p>
            Envoi à vérifier : le résultat de l'envoi est inconnu ({message.sendError ?? "incertain"}). Il ne
            sera jamais renvoyé automatiquement. Vérifiez dans l'historique de Brevo qu'il n'est pas parti.
          </p>
          {can("ADMIN") && (
            <Button
              className="mt-2"
              variant="ghost"
              disabled={release.isPending}
              onClick={() => release.mutate()}
            >
              Non parti : le remettre dans la file
            </Button>
          )}
        </div>
      )}
      {!message.sendReserved && message.sendError && !sent && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Dernier essai d'envoi refusé : {message.sendError}
        </p>
      )}
      {check && isBlockingCheck(check) && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          L'adresse {email} est inutilisable ({ADDRESS_CHECK_LABELS[check]}) : elle ne peut pas être validée.
          Rejetez cet e-mail ou corrigez l'adresse.
        </p>
      )}
      {blocked && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          Cette adresse est dans la liste d'exclusion ({BLOCKED_LABELS[blocked]}) : elle ne peut pas être
          validée.
        </p>
      )}
      <p className="mb-4 text-sm">
        État : <strong>{validation}</strong>
        {message.validatedAt && message.validatedBy
          ? ` par ${message.validatedBy} le ${new Date(message.validatedAt).toLocaleDateString("fr-FR")}`
          : ""}
        {sent ? ` · envoyé (${lead.data.email?.status})` : ""}
      </p>

      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <label htmlFor={subjectId} className="mb-1 block text-sm font-medium">
            Objet
          </label>
          <input
            id={subjectId}
            value={subject}
            maxLength={200}
            readOnly={sent}
            onChange={(e) => setSubject(e.target.value)}
            className="mb-4 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm"
          />
          <label htmlFor={bodyId} className="mb-1 block text-sm font-medium">
            Corps (paragraphes séparés par une ligne vide)
          </label>
          <textarea
            id={bodyId}
            value={body}
            rows={16}
            maxLength={10000}
            readOnly={sent}
            onChange={(e) => setBody(e.target.value)}
            className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm"
          />
          {warnings.length > 0 && (
            <ul aria-label="Points d'attention" className="mt-3 space-y-1 text-sm text-amber-900">
              {warnings.map((w) => (
                <li key={w.code} className="rounded bg-amber-50 px-2 py-1">
                  {w.message}
                </li>
              ))}
            </ul>
          )}
        </div>
        <section aria-label="Aperçu de l'e-mail final">
          <p className="mb-1 text-sm font-medium">Aperçu (tel qu'il partira)</p>
          <div className="rounded-lg border border-brand-100 bg-brand-50/40 p-4 text-sm">
            {preview.data ? (
              <>
                <p className="text-xs text-ink/70">De : {preview.data.from}</p>
                <p className="mb-3 font-semibold">Objet : {preview.data.subject || "(vide)"}</p>
                {preview.data.paragraphs.map((p, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: aperçu en lecture seule, l'ordre fait l'identité
                  <p key={i} className={`mb-3 ${p.type === "agenda" ? "text-brand-700" : ""}`}>
                    {p.lines.map((l, j) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: idem
                      <span key={j} className="block">
                        {l}
                      </span>
                    ))}
                    {p.type === "agenda" && (
                      <span className="block text-xs text-ink/60">(ajouté automatiquement)</span>
                    )}
                  </p>
                ))}
              </>
            ) : (
              <Spinner />
            )}
          </div>
        </section>
      </div>

      {!sent && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            disabled={save.isPending || !!cannotValidate}
            onClick={() => save.mutate({ validation: "Validé", advance: true })}
          >
            Valider et passer au suivant
          </Button>
          <Button variant="ghost" disabled={save.isPending || !dirty} onClick={() => save.mutate({})}>
            Enregistrer sans valider
          </Button>
          <Button
            variant="danger"
            disabled={save.isPending}
            onClick={() => save.mutate({ validation: "Rejeté", advance: true })}
          >
            Rejeter
          </Button>
          {validation !== "Pas Validé" && (
            <Button
              variant="ghost"
              disabled={save.isPending}
              onClick={() => save.mutate({ validation: "Pas Validé" })}
            >
              Remettre à relire
            </Button>
          )}
          {can("ADMIN") && validation === "Validé" && (
            <Button variant="ghost" disabled={testSend.isPending} onClick={() => testSend.mutate()}>
              M'envoyer un test
            </Button>
          )}
          {cannotValidate && (
            <span className="text-sm text-red-800">Validation impossible : {cannotValidate}</span>
          )}
        </div>
      )}
    </div>
  );
}

function BulkPanel({ filters, onDone }: { filters: QueueFilters; onDone: () => Promise<void> }) {
  const [target, setTarget] = useState<"Validé" | "Rejeté">("Validé");
  const [result, setResult] = useState<BulkEmailResult | null>(null);
  const [applied, setApplied] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const filter = bulkFilter(filters);
  const key = JSON.stringify(filter);

  // Un autre filtre invalide la simulation : on ne confirme jamais un effectif périmé.
  // biome-ignore lint/correctness/useExhaustiveDependencies: la simulation dépend uniquement du filtre sérialisé
  useEffect(() => {
    setResult(null);
    setApplied(null);
  }, [key]);

  async function run(validation: "Validé" | "Rejeté", dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await api<BulkEmailResult>("/emails/bulk", {
        method: "POST",
        body: { validation, filter, dryRun, ...(dryRun ? {} : { expectedCount: result?.eligible }) },
      });
      setTarget(validation);
      if (dryRun) {
        setResult(res);
        setApplied(null);
      } else {
        setResult(null);
        setApplied(res.eligible);
        await onDone();
      }
    } catch (e) {
      setError(errorMessage(e));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  const describe = Object.keys(filter).length
    ? "les e-mails à relire correspondant aux filtres ci-dessus"
    : "tous les e-mails à relire";
  return (
    <Card title="Validation groupée">
      <p className="mb-3 text-sm text-ink/70">
        Agit sur {describe}. Une simulation indique d'abord combien d'e-mails seraient concernés ; les
        adresses exclues et les e-mails vides ne sont jamais validés.
      </p>
      <ErrorAlert message={error} />
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" disabled={busy} onClick={() => run("Validé", true)}>
          Simuler la validation
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => run("Rejeté", true)}>
          Simuler le rejet
        </Button>
      </div>
      {result && (
        <div role="status" className="mt-4 rounded-lg bg-brand-50 p-4 text-sm">
          <p className="font-semibold">
            {result.eligible} e-mail(s) seraient {target === "Validé" ? "validés" : "rejetés"}.
          </p>
          {Object.entries(result.skipped).map(([reason, n]) => (
            <p key={reason}>
              {n} ignoré(s) : {reason}
            </p>
          ))}
          {result.eligible > 0 && (
            <Button
              className="mt-3"
              variant={target === "Validé" ? "primary" : "danger"}
              disabled={busy}
              onClick={() => run(target, false)}
            >
              Confirmer : {target === "Validé" ? "valider" : "rejeter"} {result.eligible} e-mail(s)
            </Button>
          )}
        </div>
      )}
      {applied !== null && (
        <p role="status" className="mt-4 text-sm font-semibold">
          {applied} e-mail(s) {target === "Validé" ? "validés" : "rejetés"}.
        </p>
      )}
    </Card>
  );
}

function AddressCheckPanel({
  stats,
  onDone,
}: {
  stats: EmailStats | undefined;
  onDone: () => Promise<void>;
}) {
  const [result, setResult] = useState<AddressCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api<AddressCheckResult>("/emails/address-check", { method: "POST", body: {} }));
      await onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Fiabilité des adresses">
      <p className="mb-3 max-w-3xl text-sm text-ink/70">
        Avant d'envoyer, on vérifie chaque adresse : forme correcte, adresse jetable, et domaine capable de
        recevoir du courrier. Une adresse inutilisable ne peut pas être validée ; un e-mail déjà validé vers
        une telle adresse repart en relecture. Le contrôle porte sur 300 adresses à la fois et reste valable
        30 jours. Il ne dit pas qu'une boîte précise existe : il écarte seulement les cas certains.
      </p>
      <ErrorAlert message={error} />
      <Button disabled={busy || stats?.addressUnchecked === 0} onClick={run}>
        {busy
          ? "Contrôle en cours…"
          : `Vérifier les adresses (${stats?.addressUnchecked ?? "…"} à contrôler)`}
      </Button>
      {result && (
        <div role="status" className="mt-4 rounded-lg bg-brand-50 p-4 text-sm">
          <p className="font-semibold">
            {result.checked} adresse(s) contrôlée(s) : {result.valid} utilisable(s),{" "}
            {Object.values(result.invalid).reduce((a, b) => a + b, 0)} inutilisable(s).
          </p>
          {Object.entries(result.invalid).map(([k, n]) => (
            <p key={k}>
              {n} : {ADDRESS_CHECK_LABELS[k as keyof typeof ADDRESS_CHECK_LABELS] ?? k}
            </p>
          ))}
          {result.revoked > 0 && <p>{result.revoked} e-mail(s) validé(s) remis à relire.</p>}
          {result.indeterminate > 0 && (
            <p>{result.indeterminate} adresse(s) à recontrôler plus tard (le serveur DNS n'a pas répondu).</p>
          )}
          {result.remaining > 0 && <p>Il reste {result.remaining} adresse(s) à contrôler : relancez.</p>}
        </div>
      )}
    </Card>
  );
}

function SendPanel() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const status = useQuery({
    queryKey: ["emails", "send-status"],
    queryFn: () => api<SendStatus>("/emails/send-status"),
    refetchInterval: 60_000,
  });
  const pause = useMutation({
    mutationFn: (paused: boolean) =>
      api<SendStatus>("/emails/send-pause", { method: "POST", body: { paused } }),
    onSuccess: (data) => {
      setError(null);
      qc.setQueryData(["emails", "send-status"], data);
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const s = status.data;
  if (!s) return null;
  const label =
    s.mode === "off"
      ? "Désactivé"
      : s.paused
        ? "En pause"
        : s.slotOpen
          ? "Actif : créneau ouvert"
          : "Actif : en attente du prochain créneau";
  return (
    <Card title="Envoi planifié">
      <ErrorAlert message={error} />
      <dl className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
        <dt className="text-ink/70">État</dt>
        <dd className="font-semibold">{label}</dd>
        <dt className="text-ink/70">Expéditeur</dt>
        <dd>{s.from}</dd>
        <dt className="text-ink/70">Aujourd'hui</dt>
        <dd>
          {s.sentToday} / {s.dailyCap} envoyés
        </dd>
        <dt className="text-ink/70">Prêts à partir</dt>
        <dd>
          {s.ready} (validés, adresse contrôlée) · {s.blocked} validés bloqués (adresse non contrôlée ou
          inutilisable, exclue, échecs)
        </dd>
        <dt className="text-ink/70">Prochain créneau</dt>
        <dd>
          {s.nextSlot
            ? new Date(s.nextSlot).toLocaleString("fr-FR", {
                dateStyle: "full",
                timeStyle: "short",
                timeZone: "Europe/Paris",
              })
            : "—"}{" "}
          (créneaux {s.slots}, ouverts {s.windowMinutes} min, un envoi toutes les {s.intervalSeconds} s)
        </dd>
        {s.testRecipient && (
          <>
            <dt className="text-ink/70">Adresse de test</dt>
            <dd>{s.testRecipient}</dd>
          </>
        )}
      </dl>
      {s.uncertain > 0 && (
        <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {s.uncertain} envoi(s) au résultat inconnu : ouvrez la fiche concernée et vérifiez dans Brevo avant
          de le libérer.
        </p>
      )}
      {s.mode === "off" && (
        <p className="mt-3 text-sm text-ink/70">
          L'envoi automatique est désactivé sur ce serveur (SEND_MODE=off). Rien ne part tant qu'un
          administrateur ne l'active pas dans la configuration du serveur.
        </p>
      )}
      {can("ADMIN") && s.mode === "prod" && (
        <Button
          className="mt-3"
          variant={s.paused ? "primary" : "danger"}
          disabled={pause.isPending}
          onClick={() => pause.mutate(!s.paused)}
        >
          {s.paused ? "Reprendre l'envoi" : "Mettre l'envoi en pause"}
        </Button>
      )}
    </Card>
  );
}
