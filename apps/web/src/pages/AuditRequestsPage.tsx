import {
  AUDIT_REQUEST_STATUSES,
  type AuditRequest,
  type AuditRequestConvertResult,
  type AuditRequestPage,
  type AuditRequestStatus,
} from "@gac/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Pager } from "../components/Pager";
import { Button, ErrorAlert, Spinner } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { safeUrl } from "../lib/leads";

const PAGE_SIZE = 25;

const ACK_LABEL: Record<AuditRequest["ackStatus"], { text: string; pill: string }> = {
  sent: { text: "Accusé envoyé", pill: "pill--good" },
  pending: { text: "Envoi en cours", pill: "pill--neutral" },
  skipped: { text: "Accusé non envoyé", pill: "pill--warning" },
  failed: { text: "Échec de l'accusé", pill: "pill--critical" },
};
const STATUS_PILL: Record<AuditRequestStatus, string> = {
  Nouvelle: "pill--accent",
  Contactée: "pill--info",
  "Audit livré": "pill--good",
  Convertie: "pill--good",
  Rejetée: "pill--neutral",
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

/** Demandes d'audit gratuit reçues par le formulaire du site : à traiter vite, à part des leads de prospection. */
export function AuditRequestsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<AuditRequestStatus>("Nouvelle");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDq(q.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const p = new URLSearchParams({ status: tab, limit: String(PAGE_SIZE), offset: String(offset) });
  if (dq) p.set("q", dq);
  const list = useQuery({
    queryKey: ["audit-requests", "list", p.toString()],
    queryFn: () => api<AuditRequestPage>(`/audit-requests?${p}`),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const items = list.data?.items ?? [];
  const current = items.find((i) => i.id === selected) ?? null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["audit-requests"] });

  return (
    <>
      <header className="pagebar mb-4">
        <div className="pagebar-title">
          <h1 className="t-page">Demandes d'audit</h1>
          <span className="pagebar-count" aria-live="polite">
            {list.data
              ? `${AUDIT_REQUEST_STATUSES.reduce((n, s) => n + (list.data.byStatus[s] ?? 0), 0)} au total`
              : "Chargement…"}
          </span>
        </div>
        <div className="pagebar-filters">
          <div className="tabs" role="tablist" aria-label="Statut des demandes">
            {AUDIT_REQUEST_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                className="tab"
                aria-selected={tab === s}
                onClick={() => {
                  setTab(s);
                  setOffset(0);
                  setSelected(null);
                }}
              >
                {s}
                <span className="count">{list.data?.byStatus[s] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="input-wrap u-w-240">
            <Icon name="search" />
            <input
              type="search"
              className="input"
              aria-label="Rechercher"
              placeholder="Entreprise, e-mail, site…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
      </header>

      <ErrorAlert message={list.error ? errorMessage(list.error) : null} />
      {list.isPending && <Spinner />}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_26rem]">
        <section className={`min-w-0 ${selected ? "hidden xl:block" : ""}`} aria-label="Liste des demandes">
          {list.data && items.length === 0 && (
            <p className="card text-sm">
              {dq
                ? "Aucune demande ne correspond à cette recherche."
                : tab === "Nouvelle"
                  ? "Aucune nouvelle demande : tout est traité."
                  : "Aucune demande dans cette liste."}
            </p>
          )}
          {items.length > 0 && (
            <>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {items.map((r) => {
                  const ack = ACK_LABEL[r.ackStatus];
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        aria-current={selected === r.id}
                        onClick={() => setSelected(r.id)}
                        className={`w-full rounded-xl border p-3 text-left ${
                          selected === r.id
                            ? "border-ds-accent bg-ds-surface-2"
                            : "border-ds-line bg-ds-surface"
                        }`}
                      >
                        <span className="flex flex-wrap items-baseline justify-between gap-2">
                          <b>{r.companyName}</b>
                          <span className="t-small text-ds-muted">{fmt(r.createdAt)}</span>
                        </span>
                        <span className="t-small block break-all text-ds-muted">
                          {r.email}
                          {r.phone ? ` · ${r.phone}` : ""}
                        </span>
                        <span className="mt-1 block truncate">{r.subject ?? "(sans objet)"}</span>
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          <span className={`pill ${STATUS_PILL[r.status]}`}>{r.status}</span>
                          <span className={`pill ${ack.pill}`}>{ack.text}</span>
                          {r.suppressed && <span className="pill pill--critical">Adresse exclue</span>}
                          {r.knownLeadId && r.status !== "Convertie" && (
                            <span className="pill pill--info">Déjà prospect</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <Pager
                total={list.data?.total ?? 0}
                offset={offset}
                pageSize={PAGE_SIZE}
                onChange={setOffset}
              />
            </>
          )}
        </section>

        <section className={`min-w-0 ${selected ? "" : "hidden xl:block"}`} aria-label="Détail de la demande">
          {selected && (
            <button
              type="button"
              className="btn btn--ghost btn--sm mb-2 xl:hidden"
              onClick={() => setSelected(null)}
            >
              <Icon name="arrow-left" size={16} />
              Retour à la liste
            </button>
          )}
          {current ? (
            <Detail key={current.id} request={current} onChanged={refresh} />
          ) : (
            <p className="card text-sm">Choisissez une demande dans la liste.</p>
          )}
        </section>
      </div>
    </>
  );
}

function Detail({ request: r, onChanged }: { request: AuditRequest; onChanged: () => Promise<void> }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const noteId = useId();
  const statusId = useId();
  const [note, setNote] = useState(r.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const site = safeUrl(r.website);
  const ack = ACK_LABEL[r.ackStatus];

  const patch = useMutation({
    mutationFn: (body: { status?: AuditRequestStatus; note?: string | null; ownerId?: string | null }) =>
      api<AuditRequest>(`/audit-requests/${r.id}`, { method: "PATCH", body }),
    onSuccess: async () => {
      setError(null);
      setInfo("Enregistré.");
      await onChanged();
    },
    onError: (e) => {
      setInfo(null);
      setError(errorMessage(e));
    },
  });
  const resend = useMutation({
    mutationFn: () => api<AuditRequest>(`/audit-requests/${r.id}/resend-ack`, { method: "POST" }),
    onSuccess: async (data) => {
      setError(null);
      setInfo(
        data.ackStatus === "sent"
          ? "Accusé de réception envoyé."
          : (data.ackError ?? "L'accusé n'est pas parti."),
      );
      await onChanged();
    },
    onError: (e) => {
      setInfo(null);
      setError(errorMessage(e));
    },
  });
  const convert = useMutation({
    mutationFn: () => api<AuditRequestConvertResult>(`/audit-requests/${r.id}/convert`, { method: "POST" }),
    onSuccess: async (res) => {
      await onChanged();
      navigate(`/leads?lead=${res.leadId}`);
    },
    onError: (e) => {
      setInfo(null);
      setError(errorMessage(e));
    },
  });

  return (
    <div className="card">
      <h2 className="text-lg font-bold">{r.companyName}</h2>
      <p className="t-small mb-3 text-ds-muted">Reçue le {fmt(r.createdAt)}</p>
      <ErrorAlert message={error} />
      {info && (
        <p role="status" className="alert alert--good mb-3">
          {info}
        </p>
      )}
      {r.suppressed && (
        <p role="alert" className="alert alert--critical mb-3">
          Cette adresse est dans la liste d'exclusion (rebond, plainte ou exclusion manuelle) : aucun e-mail
          ne lui est envoyé depuis le CRM.
        </p>
      )}
      {r.knownLeadId && r.status !== "Convertie" && (
        <p className="alert alert--info mb-3">
          Ce contact existe déjà parmi les prospects.{" "}
          <Link className="link" to={`/leads?lead=${r.knownLeadId}`}>
            Ouvrir la fiche
          </Link>
        </p>
      )}

      <dl className="mb-4 grid grid-cols-[7rem_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-ds-muted">E-mail</dt>
        <dd className="break-all">
          <a className="link" href={`mailto:${r.email}`}>
            {r.email}
          </a>
        </dd>
        <dt className="text-ds-muted">Téléphone</dt>
        <dd>{r.phone ?? "non renseigné"}</dd>
        <dt className="text-ds-muted">Site</dt>
        <dd className="break-all">
          {site ? (
            <a className="link" href={site} target="_blank" rel="noreferrer noopener">
              {r.website}
            </a>
          ) : (
            r.website
          )}
        </dd>
        <dt className="text-ds-muted">Objet</dt>
        <dd>{r.subject ?? "non renseigné"}</dd>
      </dl>

      <p className="t-small mb-1 text-ds-muted">Message</p>
      <p className="mb-4 whitespace-pre-wrap rounded-lg bg-ds-surface-2 p-3 text-sm">
        {r.message ?? "(pas de message)"}
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className={`pill ${ack.pill}`}>{ack.text}</span>
        {r.ackSentAt && <span className="t-small text-ds-muted">le {fmt(r.ackSentAt)}</span>}
        {r.ackStatus !== "sent" && !r.suppressed && (
          <Button variant="secondary" disabled={resend.isPending} onClick={() => resend.mutate()}>
            {resend.isPending ? "Envoi…" : "Renvoyer l'accusé"}
          </Button>
        )}
      </div>
      {r.ackError && r.ackStatus !== "sent" && <p className="t-small mb-4 text-ds-muted">{r.ackError}</p>}

      <div className="field mb-3">
        <label htmlFor={statusId} className="label">
          Statut
        </label>
        <select
          id={statusId}
          className="select"
          value={r.status}
          disabled={patch.isPending}
          onChange={(e) => patch.mutate({ status: e.target.value as AuditRequestStatus })}
        >
          {AUDIT_REQUEST_STATUSES.filter((s) => s !== "Convertie" || r.leadId).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="field mb-3">
        <label htmlFor={noteId} className="label">
          Note interne
        </label>
        <textarea
          id={noteId}
          className="textarea"
          rows={3}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          disabled={patch.isPending || note.trim() === (r.note ?? "")}
          onClick={() => patch.mutate({ note: note.trim() || null })}
        >
          Enregistrer la note
        </Button>
        {user && r.ownerId !== user.id && (
          <Button
            variant="ghost"
            disabled={patch.isPending}
            onClick={() => patch.mutate({ ownerId: user.id })}
          >
            Me l'attribuer
          </Button>
        )}
        {r.leadId ? (
          <Link className="btn btn--primary" to={`/leads?lead=${r.leadId}`}>
            Ouvrir le lead
          </Link>
        ) : (
          <Button disabled={convert.isPending} onClick={() => convert.mutate()}>
            {convert.isPending ? "Conversion…" : "Convertir en lead"}
          </Button>
        )}
      </div>
    </div>
  );
}
