import {
  ADDRESS_CHECK_LABELS,
  type AddressCheckResult,
  type BulkEmailResult,
  type BulkUndoResult,
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
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../components/Icon";
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
  const [followOpen, setFollowOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
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
  // Raccourcis J / K : e-mail suivant / précédent (hors champs de saisie).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (k !== "j" && k !== "k") return;
      const ids = items.map((i) => i.id);
      if (ids.length === 0) return;
      const at = selected ? ids.indexOf(selected) : -1;
      const next = k === "j" ? Math.min(ids.length - 1, at + 1) : Math.max(0, at - 1);
      setSelected(ids[next] ?? null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [items, selected]);
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["leads"] }),
      qc.invalidateQueries({ queryKey: ["emails", "stats"] }),
    ]);
  };

  return (
    <>
      <header className="pagebar mb-4">
        <div className="pagebar-title">
          <h1 className="t-page">E-mails à relire</h1>
          <span className="pagebar-count" aria-live="polite">
            {stats.data ? `${formatNumber(stats.data.toReview)} à relire` : "Chargement…"}
          </span>
        </div>
        <div className="pagebar-state">
          <SendStatusLine onDetail={() => setFollowOpen((o) => !o)} open={followOpen} />
        </div>
        <div className="pagebar-actions">
          {filters.tab === "review" && (
            <Button
              variant="secondary"
              aria-expanded={bulkOpen}
              aria-controls="emails-bulk"
              onClick={() => setBulkOpen((o) => !o)}
            >
              Validation groupée
            </Button>
          )}
          <Button
            variant="secondary"
            aria-expanded={followOpen}
            aria-controls="emails-follow"
            onClick={() => setFollowOpen((o) => !o)}
          >
            Suivi de l'envoi
          </Button>
        </div>
        <div className="pagebar-filters">
          <div className="tabs" role="tablist" aria-label="État des e-mails">
            {TABS.map((t) => {
              const n = tabCount(t.id, stats.data);
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  className="tab"
                  aria-selected={filters.tab === t.id}
                  onClick={() => change({ tab: t.id })}
                >
                  {t.label}
                  {n !== undefined && <span className="count">{formatNumber(n)}</span>}
                </button>
              );
            })}
          </div>
          <div className="input-wrap u-w-240">
            <Icon name="search" />
            <input
              type="search"
              className="input"
              aria-label="Recherche"
              placeholder="Entreprise, contact, objet…"
              value={filters.q}
              onChange={(e) => change({ q: e.target.value })}
            />
          </div>
          <select
            aria-label="Qualification"
            value={filters.qualification}
            onChange={(e) => change({ qualification: e.target.value })}
            className={`select u-w-auto ${filters.qualification ? "is-set" : ""}`}
          >
            <option value="">Qualification</option>
            {QUALIFICATIONS.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <select
            aria-label="Version du prompt"
            value={filters.promptVersion}
            onChange={(e) => change({ promptVersion: e.target.value })}
            className={`select u-w-auto ${filters.promptVersion ? "is-set" : ""}`}
          >
            <option value="">Version du prompt</option>
            {(stats.data?.byPrompt ?? [])
              .filter((p) => p.version !== "(inconnue)")
              .map((p) => (
                <option key={p.version}>{p.version}</option>
              ))}
          </select>
        </div>
      </header>

      <ErrorAlert message={queue.error ? errorMessage(queue.error) : null} />

      {bulkOpen && filters.tab === "review" && (
        <div id="emails-bulk" className="mb-4">
          <BulkPanel filters={effective} onDone={refresh} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[19rem_1fr]">
        <section
          className={`min-w-0 lg:max-h-[calc(100dvh-13rem)] lg:overflow-y-auto ${selected ? "hidden lg:block" : ""}`}
          aria-label="File de relecture"
        >
          {queue.isLoading ? (
            <Spinner />
          ) : items.length === 0 ? (
            <p className="card text-sm">Aucun e-mail dans cette liste.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(l.id)}
                    aria-current={selected === l.id}
                    className={`w-full rounded-xl border p-3 text-left text-sm ${
                      selected === l.id ? "border-ds-accent bg-ds-surface-2" : "border-ds-line bg-ds-surface"
                    }`}
                  >
                    <span className="block font-semibold">{l.company.name}</span>
                    <span className="block text-xs text-ds-muted">
                      {contactName(l.contact) || "Sans contact"} · {l.qualification ?? "Non qualifié"}
                    </span>
                    <span className="mt-1 block truncate">{l.email?.subject ?? "(sans objet)"}</span>
                    {l.email?.addressCheck && isBlockingCheck(l.email.addressCheck) && (
                      <span className="mt-1 mr-1 inline-block rounded bg-ds-critical-bg px-2 py-0.5 text-xs text-ds-critical-ink">
                        Adresse inutilisable ({ADDRESS_CHECK_LABELS[l.email.addressCheck]})
                      </span>
                    )}
                    {l.email?.blockedReason && (
                      <span className="mt-1 inline-block rounded bg-ds-critical-bg px-2 py-0.5 text-xs text-ds-critical-ink">
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

        <section className={`min-w-0 ${selected ? "" : "hidden lg:block"}`} aria-label="Relecture">
          {selected && (
            <button
              type="button"
              className="btn btn--ghost btn--sm mb-2 lg:hidden"
              onClick={() => setSelected(null)}
            >
              <Icon name="arrow-left" size={16} />
              Retour à la liste
            </button>
          )}
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
            <p className="card text-sm">Choisissez un e-mail dans la liste.</p>
          )}
        </section>
      </div>

      {followOpen && (
        <div id="emails-follow" className="mt-4 flex flex-col gap-4">
          <SendPanel />
          <AddressCheckPanel stats={stats.data} onDone={refresh} />
          {stats.data && stats.data.byPrompt.length > 0 && <PromptTable stats={stats.data} />}
        </div>
      )}
    </>
  );
}

/** Vrai si la touche part d'un champ de saisie : les raccourcis ne doivent alors rien faire. */
function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)
  );
}

/** Brouillon gardé sur cet appareil pour ne rien perdre si la page se recharge (effacé à l'enregistrement). */
const draftKey = (id: string) => `gac-email-draft:${id}`;
function readDraft(id: string, base: string | undefined): { subject: string; body: string } | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    if (!raw) return null;
    const d = JSON.parse(raw) as { subject?: string; body?: string; base?: string };
    if (d.base !== base || typeof d.subject !== "string" || typeof d.body !== "string") return null;
    return { subject: d.subject, body: d.body };
  } catch {
    return null;
  }
}
function writeDraft(id: string, base: string | undefined, subject: string, body: string | null) {
  try {
    if (body === null) localStorage.removeItem(draftKey(id));
    else localStorage.setItem(draftKey(id), JSON.stringify({ subject, body, base }));
  } catch {
    // stockage indisponible : le brouillon n'est simplement pas gardé
  }
}

function tabCount(tab: string, stats: EmailStats | undefined): number | undefined {
  if (!stats) return undefined;
  if (tab === "review") return stats.toReview;
  if (tab === "validated") return stats.validatedNotSent;
  if (tab === "rejected") return stats.rejected;
  return undefined;
}

/** Ligne d'état de l'envoi dans la barre de page : état, volume du jour, prochain créneau. */
function SendStatusLine({ onDetail, open }: { onDetail: () => void; open: boolean }) {
  const status = useQuery({
    queryKey: ["emails", "send-status"],
    queryFn: () => api<SendStatus>("/emails/send-status"),
    refetchInterval: 60_000,
  });
  const s = status.data;
  if (!s) return null;
  const off = s.mode === "off";
  const label = off ? "Envoi désactivé" : s.paused ? "Envoi en pause" : "Envoi actif";
  const tone = off ? "statusline--off" : s.paused ? "statusline--paused" : "";
  return (
    <div className={`statusline ${tone}`} role="status" aria-label="État d'envoi">
      <span className="statusline-dot" aria-hidden="true" />
      {label}
      {!off && (
        <>
          <span className="statusline-sep" aria-hidden="true">
            ·
          </span>
          <span>
            <b className="num">{s.sentToday}</b> / {s.dailyCap} aujourd'hui
          </span>
          {s.nextSlot && (
            <>
              <span className="statusline-sep" aria-hidden="true">
                ·
              </span>
              <span>
                prochain créneau{" "}
                {new Date(s.nextSlot).toLocaleString("fr-FR", {
                  weekday: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Europe/Paris",
                })}
              </span>
            </>
          )}
        </>
      )}
      <button type="button" className="btn btn--ghost btn--sm" aria-expanded={open} onClick={onDetail}>
        Détail
      </button>
    </div>
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
              <tr key={p.version} className="border-t border-ds-line">
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
  const [restored, setRestored] = useState(false);

  // Le brouillon repart de la version enregistrée chaque fois que le serveur en renvoie une nouvelle.
  const version = message?.updatedAt;
  // biome-ignore lint/correctness/useExhaustiveDependencies: seule une nouvelle version du serveur réinitialise le brouillon
  useEffect(() => {
    const draft = readDraft(id, version);
    setSubject(draft?.subject ?? message?.subject ?? "");
    setBody(draft?.body ?? message?.body ?? "");
    setRestored(!!draft);
  }, [version]);

  // Brouillon : enregistré sur l'appareil dès qu'on modifie, retiré quand il rejoint la version du serveur.
  const dSubjectDraft = useDebounced(subject, 600);
  const dBodyDraft = useDebounced(body, 600);
  // biome-ignore lint/correctness/useExhaustiveDependencies: déclenché par les seules saisies temporisées
  useEffect(() => {
    if (!message) return;
    const changed = dSubjectDraft !== (message.subject ?? "") || dBodyDraft !== (message.body ?? "");
    writeDraft(id, version, dSubjectDraft, changed ? dBodyDraft : null);
  }, [dSubjectDraft, dBodyDraft]);

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
      writeDraft(id, version, "", null);
      setRestored(false);
      qc.setQueryData(["lead", id], data);
      await onChanged();
      if (input.advance) onAdvance();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  // Raccourcis V valider · R rejeter · E modifier (hors champs de saisie) : les actions sont posées plus bas.
  const shortcuts = useRef<{ validate: (() => void) | null; reject: (() => void) | null }>({
    validate: null,
    reject: null,
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: les actions passent par la référence
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "v") shortcuts.current.validate?.();
      else if (k === "r") shortcuts.current.reject?.();
      else if (k === "e") {
        e.preventDefault();
        document.getElementById(subjectId)?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const aiStatus = useQuery({
    queryKey: ["ai", "status"],
    queryFn: () => api<{ configured: boolean; usedToday: number; dailyLimit: number }>("/ai/status"),
    staleTime: 30_000,
  });
  const aiReady = aiStatus.data?.configured === true;
  const [instruction, setInstruction] = useState("");
  const instructionId = useId();
  const rewrite = useMutation({
    mutationFn: () =>
      api<{ subject: string; body: string }>(`/leads/${id}/email/rewrite`, {
        method: "POST",
        body: { instruction },
      }),
    onSuccess: (r) => {
      setError(null);
      setSubject(r.subject);
      setBody(r.body);
      setInfo(
        "Réécriture proposée : relisez-la, puis enregistrez ou validez. Rien n'est enregistré tant que vous ne le faites pas.",
      );
      void qc.invalidateQueries({ queryKey: ["ai", "status"] });
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const score = useMutation({
    mutationFn: () =>
      api<{ noWebsite: boolean; emailWritten: boolean }>(`/leads/${id}/score`, { method: "POST" }),
    onSuccess: async (r) => {
      setError(null);
      setInfo(
        r.noWebsite
          ? "Prospect sans site web : service « Création de site » enregistré (pas d'e-mail rédigé)."
          : r.emailWritten
            ? "Prospect qualifié et e-mail rédigé : relisez-le avant de valider."
            : "Prospect qualifié (l'e-mail existant n'a pas été modifié).",
      );
      await qc.invalidateQueries({ queryKey: ["lead", id] });
      await qc.invalidateQueries({ queryKey: ["ai", "status"] });
      await onChanged();
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

  const markSent = useMutation({
    mutationFn: () => api<LeadDetail>(`/leads/${id}/email/mark-sent`, { method: "POST", body: {} }),
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
    return (
      <div className="card text-sm">
        <p>Ce prospect n'a pas d'e-mail rédigé.</p>
        <ErrorAlert message={error} />
        {info && (
          <p role="status" className="alert alert--good mt-3">
            {info}
          </p>
        )}
        {aiReady && lead.data?.contact?.email && (
          <Button className="mt-3" disabled={score.isPending} onClick={() => score.mutate()}>
            {score.isPending ? "Rédaction en cours…" : "Qualifier et rédiger l'e-mail (IA)"}
          </Button>
        )}
      </div>
    );
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
  shortcuts.current = {
    validate:
      sent || cannotValidate || save.isPending
        ? null
        : () => save.mutate({ validation: "Validé", advance: true }),
    reject: sent || save.isPending ? null : () => save.mutate({ validation: "Rejeté", advance: true }),
  };

  return (
    <div className="card">
      <h2 className="text-lg font-bold">{lead.data.company.name}</h2>
      <p className="mb-4 text-sm text-ds-muted">
        {contactName(lead.data.contact) || "Sans contact"} · {email ?? "pas d'adresse"} ·{" "}
        {lead.data.qualification ?? "Non qualifié"}
        {message.promptVersion ? ` · prompt ${message.promptVersion}` : ""}
      </p>
      <ErrorAlert message={error} />
      {info && (
        <p role="status" className="alert alert--good mb-4">
          {info}
        </p>
      )}
      {restored && dirty && (
        <p role="status" className="alert alert--info mb-4">
          Brouillon retrouvé sur cet appareil : vos modifications n'étaient pas encore enregistrées.
        </p>
      )}
      {message.sendReserved && (
        <div role="alert" className="alert alert--warning mb-4">
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
          {can("ADMIN") && (
            <Button
              className="mt-2 ml-2"
              variant="ghost"
              disabled={markSent.isPending}
              onClick={() => {
                if (window.confirm("Confirmer que cet e-mail est bien parti ? Il sera marqué « Envoyé »."))
                  markSent.mutate();
              }}
            >
              Bien parti : le marquer comme envoyé
            </Button>
          )}
        </div>
      )}
      {!message.sendReserved && message.sendError && !sent && (
        <p className="alert alert--warning mb-4">Dernier essai d'envoi refusé : {message.sendError}</p>
      )}
      {check && isBlockingCheck(check) && (
        <p role="alert" className="alert alert--critical mb-4">
          L'adresse {email} est inutilisable ({ADDRESS_CHECK_LABELS[check]}) : elle ne peut pas être validée.
          Rejetez cet e-mail ou corrigez l'adresse.
        </p>
      )}
      {blocked && (
        <p role="alert" className="alert alert--critical mb-4">
          Cette adresse est dans la liste d'exclusion ({BLOCKED_LABELS[blocked]}) : elle ne peut pas être
          validée.
        </p>
      )}
      <p className="t-small mb-3 text-ds-muted">
        Raccourcis : <kbd className="kbd">V</kbd> valider · <kbd className="kbd">R</kbd> rejeter ·{" "}
        <kbd className="kbd">E</kbd> modifier · <kbd className="kbd">J</kbd> / <kbd className="kbd">K</kbd>{" "}
        suivant / précédent
      </p>
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
            className="input mb-4"
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
            className="textarea"
          />
          {warnings.length > 0 && (
            <ul aria-label="Points d'attention" className="mt-3 space-y-1 text-sm text-ds-warning-ink">
              {warnings.map((w) => (
                <li key={w.code} className="rounded bg-ds-warning-bg px-2 py-1">
                  {w.message}
                </li>
              ))}
            </ul>
          )}
        </div>
        <section aria-label="Aperçu de l'e-mail final">
          <p className="mb-1 text-sm font-medium">Aperçu (tel qu'il partira)</p>
          <div className="rounded-lg border border-ds-line bg-ds-surface-2 p-4 text-sm">
            {preview.data ? (
              <>
                <p className="text-xs text-ds-muted">De : {preview.data.from}</p>
                <p className="mb-3 font-semibold">Objet : {preview.data.subject || "(vide)"}</p>
                {preview.data.paragraphs.map((p, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: aperçu en lecture seule, l'ordre fait l'identité
                  <p key={i} className={`mb-3 ${p.type === "agenda" ? "text-ds-accent" : ""}`}>
                    {p.lines.map((l, j) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: idem
                      <span key={j} className="block">
                        {l}
                      </span>
                    ))}
                    {p.type === "agenda" && (
                      <span className="block text-xs text-ds-muted">(ajouté automatiquement)</span>
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

      {!sent && aiReady && !message.sendReserved && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="field min-w-64 flex-1">
            <label htmlFor={instructionId} className="label">
              Réécrire par IA <span className="opt">(consigne libre)</span>
            </label>
            <input
              id={instructionId}
              className="input"
              maxLength={500}
              placeholder="Ex. plus court, ton plus direct, mettre en avant les avis Google"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
          </div>
          <Button
            variant="secondary"
            disabled={rewrite.isPending || instruction.trim().length < 5}
            onClick={() => rewrite.mutate()}
          >
            {rewrite.isPending ? "Réécriture…" : "Réécrire"}
          </Button>
        </div>
      )}

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
            <span className="text-sm text-ds-critical-ink">Validation impossible : {cannotValidate}</span>
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
  const [batchId, setBatchId] = useState<string | null>(null);
  const [undone, setUndone] = useState<BulkUndoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const filter = bulkFilter(filters);
  const key = JSON.stringify(filter);

  // Un autre filtre invalide la simulation : on ne confirme jamais un effectif périmé.
  // biome-ignore lint/correctness/useExhaustiveDependencies: la simulation dépend uniquement du filtre sérialisé
  useEffect(() => {
    setResult(null);
    setApplied(null);
    setBatchId(null);
    setUndone(null);
  }, [key]);

  async function undo() {
    if (!batchId) return;
    setBusy(true);
    setError(null);
    try {
      setUndone(await api<BulkUndoResult>(`/emails/bulk/${batchId}/undo`, { method: "POST" }));
      setBatchId(null);
      setApplied(null);
      await onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

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
        setBatchId(res.batchId);
        setUndone(null);
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
      <p className="mb-3 text-sm text-ds-muted">
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
        <div role="status" className="mt-4 rounded-lg bg-ds-surface-2 p-4 text-sm">
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
          {batchId && (
            <Button className="ml-3" variant="secondary" disabled={busy} onClick={undo}>
              Annuler ce lot
            </Button>
          )}
        </p>
      )}
      {undone && (
        <p role="status" className="mt-4 text-sm font-semibold">
          Lot annulé : {undone.reverted} e-mail(s) remis à relire
          {undone.skipped > 0 ? `, ${undone.skipped} non modifié(s) (déjà envoyés ou changés depuis)` : ""}.
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
      <p className="mb-3 max-w-3xl text-sm text-ds-muted">
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
        <div role="status" className="mt-4 rounded-lg bg-ds-surface-2 p-4 text-sm">
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
        <dt className="text-ds-muted">État</dt>
        <dd className="font-semibold">{label}</dd>
        <dt className="text-ds-muted">Expéditeur</dt>
        <dd>{s.from}</dd>
        <dt className="text-ds-muted">Aujourd'hui</dt>
        <dd>
          {s.sentToday} / {s.dailyCap} envoyés
        </dd>
        <dt className="text-ds-muted">Prêts à partir</dt>
        <dd>
          {s.ready} (validés, adresse contrôlée) · {s.blocked} validés bloqués (adresse non contrôlée ou
          inutilisable, exclue, échecs)
        </dd>
        <dt className="text-ds-muted">Prochain créneau</dt>
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
            <dt className="text-ds-muted">Adresse de test</dt>
            <dd>{s.testRecipient}</dd>
          </>
        )}
      </dl>
      {s.uncertain > 0 && (
        <p role="alert" className="alert alert--warning mt-3">
          {s.uncertain} envoi(s) au résultat inconnu : ouvrez la fiche concernée et vérifiez dans Brevo avant
          de le libérer.
        </p>
      )}
      {s.mode === "off" && (
        <p className="mt-3 text-sm text-ds-muted">
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
