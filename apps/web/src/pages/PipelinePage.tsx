import {
  type LeadSummary,
  NONE,
  PIPELINE_STAGES,
  type PipelineBoard,
  type PipelineStage,
  QUALIFICATIONS,
} from "@gac/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { LeadDrawer } from "../components/LeadDrawer";
import { useOwnerOptions } from "../components/LeadsTools";
import { Button, ErrorAlert, Spinner } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { euros } from "../lib/dashboard";
import { contactName, displayPhone } from "../lib/leads";

/** Pipeline en colonnes (une par étape). Le déplacement passe par « Déplacer vers… » : clavier, lecteur d'écran et mobile. */
export function PipelinePage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const owners = useOwnerOptions();
  const [params, setParams] = useSearchParams();
  const openId = params.get("lead");
  const [qualification, setQualification] = useState("");
  const [owner, setOwner] = useState("");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<PipelineStage>("Nouveau");
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [movedId, setMovedId] = useState<string | null>(null);
  // Déplacement au clavier : carte « saisie » et colonne visée
  const [grab, setGrab] = useState<{ id: string; from: PipelineStage; target: PipelineStage } | null>(null);

  const filter = new URLSearchParams();
  if (qualification) filter.set("qualification", qualification);
  if (owner) filter.set("owner", owner);
  if (q.trim()) filter.set("q", q.trim());
  const fs = filter.toString();

  const board = useQuery({
    queryKey: ["pipeline", fs],
    queryFn: () => api<PipelineBoard>(`/pipeline?${fs}`),
    placeholderData: keepPreviousData,
  });

  const move = useMutation({
    mutationFn: (v: { lead: LeadSummary; stage: PipelineStage }) =>
      api(`/leads/${v.lead.id}`, { method: "PATCH", body: { stage: v.stage } }),
    onSuccess: async (_d, v) => {
      setError(null);
      setMovedId(v.lead.id);
      setAnnounce(`${v.lead.company.name} déplacé vers « ${v.stage} ».`);
      await qc.invalidateQueries({ queryKey: ["pipeline"] });
      await qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const grabKey = (lead: LeadSummary, from: PipelineStage, e: React.KeyboardEvent) => {
    const stages = PIPELINE_STAGES as readonly PipelineStage[];
    const cur = grab?.id === lead.id ? grab : null;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (!cur) {
        setGrab({ id: lead.id, from, target: from });
        setAnnounce(
          `${lead.company.name} saisi à l'étape « ${from} ». Flèches gauche et droite pour choisir l'étape, Entrée pour déposer, Échap pour annuler.`,
        );
      } else {
        setGrab(null);
        if (cur.target !== cur.from) move.mutate({ lead, stage: cur.target });
        else setAnnounce("Déplacement annulé : même étape.");
      }
    } else if (cur && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      e.preventDefault();
      const i = stages.indexOf(cur.target) + (e.key === "ArrowRight" ? 1 : -1);
      const target = stages[Math.max(0, Math.min(stages.length - 1, i))] ?? cur.target;
      setGrab({ ...cur, target });
      setAnnounce(`Étape visée : « ${target} ».`);
    } else if (cur && e.key === "Escape") {
      e.preventDefault();
      setGrab(null);
      setAnnounce("Déplacement annulé.");
    }
  };

  const openLead = (id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set("lead", id);
    else p.delete("lead");
    setParams(p, { replace: true });
  };

  return (
    <>
      <header className="pagebar mb-3">
        <div className="pagebar-title">
          <h1 className="t-page">Pipeline</h1>
          <span className="pagebar-count">
            {board.data
              ? `${board.data.stages.reduce((n, c) => n + c.count, 0).toLocaleString("fr-FR")} leads`
              : "Chargement…"}
          </span>
        </div>
        <div className="pagebar-state">
          {board.data && board.data.unstaged > 0 && (
            <span className="t-small text-ds-muted">
              {board.data.unstaged.toLocaleString("fr-FR")} sans étape (à classer depuis Leads)
            </span>
          )}
        </div>
        <form className="pagebar-filters" onSubmit={(e) => e.preventDefault()}>
          <div className="input-wrap u-w-240">
            <Icon name="search" />
            <input
              type="search"
              className="input"
              aria-label="Rechercher"
              placeholder="Entreprise, site, e-mail…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select
            aria-label="Qualification"
            className={`select u-w-auto ${qualification ? "is-set" : ""}`}
            value={qualification}
            onChange={(e) => setQualification(e.target.value)}
          >
            <option value="">Qualification</option>
            {QUALIFICATIONS.map((v) => (
              <option key={v}>{v}</option>
            ))}
            <option value={NONE}>Non qualifié</option>
          </select>
          {can("MANAGER") && (
            <select
              aria-label="Responsable"
              className={`select u-w-auto ${owner ? "is-set" : ""}`}
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            >
              <option value="">Responsable</option>
              <option value={NONE}>Sans responsable</option>
              {(owners.data ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label="Étape affichée"
            className="select u-w-auto md:hidden"
            value={active}
            onChange={(e) => setActive(e.target.value as PipelineStage)}
          >
            {PIPELINE_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
                {board.data ? ` (${board.data.stages.find((x) => x.stage === s)?.count ?? 0})` : ""}
              </option>
            ))}
          </select>
        </form>
      </header>

      <p className="t-small mb-2 hidden text-ds-muted md:block">
        Au clavier : <kbd className="kbd">Espace</kbd> saisir une carte (poignée) ·{" "}
        <kbd className="kbd">←</kbd> <kbd className="kbd">→</kbd> choisir l'étape ·{" "}
        <kbd className="kbd">Entrée</kbd> déposer · <kbd className="kbd">Échap</kbd> annuler
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
      <ErrorAlert message={error ?? (board.error ? errorMessage(board.error) : null)} />
      {board.isPending && <Spinner />}

      {board.data && (
        <div className="relative flex gap-3 md:h-[calc(100dvh-12rem)] md:overflow-x-auto md:pb-2">
          {board.data.stages.map((col) => (
            <Column
              key={`${col.stage}:${fs}`}
              col={col}
              filter={fs}
              visibleOnMobile={col.stage === active}
              canMove={can("AGENT")}
              busy={move.isPending}
              movedId={movedId}
              grab={grab}
              onGrabKey={grabKey}
              ownerName={(id) => (id ? (owners.data?.find((o) => o.id === id)?.name ?? null) : null)}
              onMove={(lead, stage) => move.mutate({ lead, stage })}
              onOpen={openLead}
            />
          ))}
        </div>
      )}

      {openId && <LeadDrawer id={openId} onClose={() => openLead(null)} />}
    </>
  );
}

function Column({
  col,
  filter,
  visibleOnMobile,
  canMove,
  busy,
  movedId,
  grab,
  onGrabKey,
  ownerName,
  onMove,
  onOpen,
}: {
  col: PipelineBoard["stages"][number];
  filter: string;
  visibleOnMobile: boolean;
  canMove: boolean;
  busy: boolean;
  movedId: string | null;
  grab: { id: string; from: PipelineStage; target: PipelineStage } | null;
  onGrabKey: (lead: LeadSummary, from: PipelineStage, e: React.KeyboardEvent) => void;
  ownerName: (id: string | null) => string | null;
  onMove: (lead: LeadSummary, stage: PipelineStage) => void;
  onOpen: (id: string) => void;
}) {
  const [extra, setExtra] = useState<LeadSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = [...col.items, ...extra.filter((e) => !col.items.some((i) => i.id === e.id))];

  async function more() {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams(filter);
      p.set("offset", String(items.length));
      p.set("limit", "20");
      const res = await api<{ items: LeadSummary[]; total: number }>(
        `/pipeline/${encodeURIComponent(col.stage)}?${p}`,
      );
      setExtra((cur) => [...cur, ...res.items]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      aria-label={`Étape ${col.stage}`}
      className={`kcol kcol--scroll ${grab?.target === col.stage && grab.from !== col.stage ? "is-target" : ""} ${visibleOnMobile ? "flex" : "hidden"} min-w-0 flex-1 md:flex md:w-72 md:min-w-72 md:flex-none`}
    >
      <header className="kcol-head">
        <h2 className="t-card">{col.stage}</h2>
        <span className="t-small num text-ds-muted">
          {col.count.toLocaleString("fr-FR")}
          {col.value > 0 ? ` · ${euros(col.value)}` : ""}
        </span>
      </header>
      <div className="kcol-list">
        {items.length === 0 && <p className="t-small text-ds-muted">Aucun lead à cette étape.</p>}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((l) => (
            <li
              key={l.id}
              className={`card flex flex-col gap-1 p-3 ${l.id === movedId ? "anim-settle" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  className="text-left font-semibold hover:underline"
                  onClick={() => onOpen(l.id)}
                >
                  {l.company.name}
                </button>
                {canMove && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon btn--sm hidden md:inline-flex"
                    aria-pressed={grab?.id === l.id}
                    aria-label={`Déplacer ${l.company.name} au clavier`}
                    title="Espace pour saisir, flèches pour choisir l'étape, Entrée pour déposer"
                    onKeyDown={(e) => onGrabKey(l, col.stage, e)}
                  >
                    <Icon name="grip" size={16} />
                  </button>
                )}
              </div>
              <span className="t-small text-ds-muted">
                {[l.company.city, contactName(l.contact)].filter(Boolean).join(" · ") || "—"}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {l.qualification && <span className="pill pill--outline">{l.qualification}</span>}
                {ownerName(l.ownerId) && <span className="pill pill--neutral">{ownerName(l.ownerId)}</span>}
              </div>
              {l.company.phone && <span className="t-small num">{displayPhone(l.company.phone)}</span>}
              {canMove && <MoveSelect lead={l} current={col.stage} disabled={busy} onMove={onMove} />}
            </li>
          ))}
        </ul>
        <ErrorAlert message={error} />
        {col.count > items.length && (
          <Button variant="secondary" disabled={loading} onClick={more}>
            Voir plus ({(col.count - items.length).toLocaleString("fr-FR")})
          </Button>
        )}
      </div>
    </section>
  );
}

function MoveSelect({
  lead,
  current,
  disabled,
  onMove,
}: {
  lead: LeadSummary;
  current: PipelineStage;
  disabled: boolean;
  onMove: (lead: LeadSummary, stage: PipelineStage) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="sr-only">
        Déplacer {lead.company.name} vers…
      </label>
      <select
        id={id}
        className="select"
        value=""
        disabled={disabled}
        onChange={(e) => e.target.value && onMove(lead, e.target.value as PipelineStage)}
      >
        <option value="">Déplacer vers…</option>
        {PIPELINE_STAGES.filter((s) => s !== current).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}
