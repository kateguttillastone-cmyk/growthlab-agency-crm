import {
  CALL_STATES,
  CALL_STATUSES,
  LEAD_FIELD_MIN_ROLE,
  type LeadDetail,
  PIPELINE_STAGES,
  QUALIFICATIONS,
  SERVICES,
  type UpdateLeadInput,
} from "@gac/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  contactName,
  describeEvent,
  displayPhone,
  EMAIL_STATUS_STYLE,
  formatDate,
  formatNumber,
  QUALIFICATION_STYLE,
  safeUrl,
  triState,
} from "../lib/leads";
import { Button, ErrorAlert, Spinner } from "./ui";

const NONE_LABEL = "— Aucune —";

/** Fiche d'un lead : lecture pour tous, champs modifiables selon le rôle (le serveur refait la vérification). */
export function LeadDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ["leads", "detail", id],
    queryFn: () => api<LeadDetail>(`/leads/${id}`),
  });

  const save = useMutation({
    mutationFn: (patch: UpdateLeadInput) => api<LeadDetail>(`/leads/${id}`, { method: "PATCH", body: patch }),
    onSuccess: (updated) => {
      setError(null);
      qc.setQueryData(["leads", "detail", id], updated);
      void qc.invalidateQueries({ queryKey: ["leads", "list"] });
      void qc.invalidateQueries({ queryKey: ["leads", "facets"] });
    },
    onError: (e) => setError(errorMessage(e)),
  });

  // Accessibilité : le focus entre dans la fiche, Échap la ferme, le focus revient où il était.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  const d = detail.data;
  const editable = (field: keyof UpdateLeadInput) => can(LEAD_FIELD_MIN_ROLE[field]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Fond cliquable : un vrai bouton (le clavier dispose déjà d'Échap et du bouton « Fermer ») */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fermer la fiche"
        className="absolute inset-0 cursor-default bg-black/40"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-xl font-extrabold">
              {d?.company.name ?? "Fiche du lead"}
            </h2>
            {d && (
              <p className="text-sm text-ink/70">
                {contactName(d.contact) || "Aucun contact nommé"}
                {d.contact?.jobTitle ? ` · ${d.contact.jobTitle}` : ""}
              </p>
            )}
          </div>
          <Button ref={closeRef} variant="ghost" onClick={onClose} aria-label="Fermer la fiche">
            Fermer
          </Button>
        </div>

        {detail.isPending && <Spinner />}
        {detail.isError && <ErrorAlert message={errorMessage(detail.error)} />}
        <ErrorAlert message={error} />

        {d && (
          <div className="space-y-6">
            <Section title="Coordonnées">
              <Item label="Téléphone">
                {d.company.phone ? (
                  <a className="underline" href={`tel:${d.company.phone}`}>
                    {displayPhone(d.company.phone)}
                  </a>
                ) : (
                  "—"
                )}
              </Item>
              <Item label="E-mail">
                {d.contact?.email ? (
                  <a className="underline" href={`mailto:${d.contact.email}`}>
                    {d.contact.email}
                  </a>
                ) : (
                  "—"
                )}
              </Item>
              <Item label="Site web">
                <ExternalLink url={d.company.website} />
              </Item>
              <Item label="LinkedIn (contact)">
                <ExternalLink url={d.contact?.linkedinUrl} label="Profil" />
              </Item>
              <Item label="LinkedIn (entreprise)">
                <ExternalLink url={d.companyDetail.linkedinUrl} label="Page" />
              </Item>
              <Item label="Adresse">{d.companyDetail.address ?? "—"}</Item>
            </Section>

            <Section title="Qualification">
              <Item label="Qualification">
                <Editable
                  can={editable("qualification")}
                  value={d.qualification}
                  options={QUALIFICATIONS}
                  empty="Non qualifié"
                  onChange={(v) => save.mutate({ qualification: v })}
                  busy={save.isPending}
                  label="Qualification"
                  display={
                    d.qualification ? (
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold ${QUALIFICATION_STYLE[d.qualification]}`}
                      >
                        {d.qualification}
                      </span>
                    ) : (
                      "Non qualifié"
                    )
                  }
                />
              </Item>
              <Item label="Service recommandé">
                <Editable
                  can={editable("service")}
                  value={d.service}
                  options={SERVICES}
                  onChange={(v) => save.mutate({ service: v })}
                  busy={save.isPending}
                  label="Service recommandé"
                />
                {d.serviceDetail && <span className="block text-xs text-ink/70">{d.serviceDetail}</span>}
              </Item>
              <Item label="Raison">{d.qualificationReason ?? "—"}</Item>
              <Item label="Origine">{d.source}</Item>
              <Item label="Détecté le">{formatDate(d.detectedAt)}</Item>
            </Section>

            <Section title="Suivi commercial">
              <Item label="Étape du pipeline">
                <Editable
                  can={editable("stage")}
                  value={d.stage}
                  options={PIPELINE_STAGES}
                  onChange={(v) => save.mutate({ stage: v })}
                  busy={save.isPending}
                  label="Étape du pipeline"
                />
              </Item>
              <Item label="File d'appel">
                <Editable
                  can={editable("callState")}
                  value={d.callState}
                  options={CALL_STATES}
                  onChange={(v) => save.mutate({ callState: v })}
                  busy={save.isPending}
                  label="File d'appel"
                />
              </Item>
              <Item label="Dernier appel">
                <Editable
                  can={editable("callStatus")}
                  value={d.callStatus}
                  options={CALL_STATUSES}
                  onChange={(v) => save.mutate({ callStatus: v })}
                  busy={save.isPending}
                  label="Statut du dernier appel"
                />
              </Item>
              <Item label="Relance 1">
                <Editable
                  can={editable("followup1")}
                  value={d.followup1}
                  options={CALL_STATUSES}
                  onChange={(v) => save.mutate({ followup1: v })}
                  busy={save.isPending}
                  label="Relance 1"
                />
              </Item>
              <Item label="Relance 2">
                <Editable
                  can={editable("followup2")}
                  value={d.followup2}
                  options={CALL_STATUSES}
                  onChange={(v) => save.mutate({ followup2: v })}
                  busy={save.isPending}
                  label="Relance 2"
                />
              </Item>
              <Item label="Commentaire">
                <EditableText
                  can={editable("comment")}
                  value={d.comment}
                  onSave={(v) => save.mutate({ comment: v })}
                  busy={save.isPending}
                  label="Commentaire"
                  max={2000}
                />
              </Item>
              <Item label="Prochaine action">
                <EditableText
                  can={editable("nextAction")}
                  value={d.nextAction}
                  onSave={(v) => save.mutate({ nextAction: v })}
                  busy={save.isPending}
                  label="Prochaine action"
                  max={500}
                />
              </Item>
              <Item label="Valeur du deal (€)">
                <EditableNumber
                  can={editable("dealValue")}
                  value={d.dealValue}
                  onSave={(v) => save.mutate({ dealValue: v })}
                  busy={save.isPending}
                  label="Valeur du deal"
                />
              </Item>
              <Item label="Pack">
                <EditableText
                  can={editable("pack")}
                  value={d.pack}
                  onSave={(v) => save.mutate({ pack: v })}
                  busy={save.isPending}
                  label="Pack"
                  max={100}
                  single
                />
              </Item>
              <Item label="Responsable">{d.owner?.name ?? "—"}</Item>
            </Section>

            <Section title="Entreprise">
              <Item label="Secteur">{d.company.sector ?? "—"}</Item>
              <Item label="Effectif">{formatNumber(d.company.employees)}</Item>
              <Item label="Création">{d.companyDetail.foundedYear ?? "—"}</Item>
              <Item label="Ville">
                {[d.company.city, d.company.region].filter(Boolean).join(", ") || "—"}
              </Item>
              {d.companyDetail.description && <Item label="Description">{d.companyDetail.description}</Item>}
            </Section>

            <Section title="Présence web">
              <Item label="Trafic organique / mois">{formatNumber(d.companyDetail.organicTraffic)}</Item>
              <Item label="Autorité du domaine">{formatNumber(d.companyDetail.domainAuthority)}</Item>
              <Item label="Backlinks">{formatNumber(d.companyDetail.backlinks)}</Item>
              <Item label="CMS">{d.companyDetail.cms ?? "—"}</Item>
              <Item label="E-commerce">{triState(d.companyDetail.isEcommerce)}</Item>
              <Item label="Google Tag Manager">{triState(d.companyDetail.hasGtm)}</Item>
              <Item label="Google Analytics 4">{triState(d.companyDetail.hasGa4)}</Item>
              <Item label="Pixel Meta">{triState(d.companyDetail.hasMetaPixel)}</Item>
              <Item label="Google Ads détecté">{triState(d.companyDetail.hasGoogleAds)}</Item>
              <Item label="HTTPS">{triState(d.companyDetail.hasSsl)}</Item>
              <Item label="Vérifier les publicités">
                {d.company.domain ? (
                  <a
                    className="underline"
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`https://adstransparency.google.com/?region=FR&domain=${encodeURIComponent(d.company.domain)}`}
                  >
                    Google Ads Transparency
                  </a>
                ) : (
                  "—"
                )}
              </Item>
            </Section>

            {(d.companyDetail.googleCategory || d.company.googleRating !== null) && (
              <Section title="Google Maps">
                <Item label="Catégorie">{d.companyDetail.googleCategory ?? "—"}</Item>
                <Item label="Note">
                  {d.company.googleRating !== null
                    ? `${d.company.googleRating} / 5 (${formatNumber(d.company.googleReviews)} avis)`
                    : "—"}
                </Item>
                <Item label="Fiche">
                  <ExternalLink url={d.companyDetail.googleMapsUrl} label="Ouvrir" />
                </Item>
              </Section>
            )}

            <Section title="E-mail de prospection">
              {d.emailMessage ? (
                <>
                  <Item label="Validation">{d.email?.validation}</Item>
                  <Item label="Envoi">
                    {d.email?.status ? (
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold ${EMAIL_STATUS_STYLE[d.email.status]}`}
                      >
                        {d.email.status}
                      </span>
                    ) : (
                      "Pas encore envoyé"
                    )}
                    {d.email?.sentOn ? ` le ${formatDate(d.email.sentOn)}` : ""}
                  </Item>
                  <Item label="Objet">{d.emailMessage.subject ?? "—"}</Item>
                  <Item label="Message">
                    <pre className="whitespace-pre-wrap rounded bg-brand-50 p-3 font-sans text-sm">
                      {d.emailMessage.body ?? "—"}
                    </pre>
                  </Item>
                  <p className="text-xs text-ink/70">
                    La relecture, la validation et l'envoi depuis cet écran arrivent avec la phase 4.
                  </p>
                </>
              ) : (
                <p className="text-sm">Aucun e-mail rédigé pour ce prospect.</p>
              )}
            </Section>

            <Section title="Historique">
              {d.events.length === 0 && <p className="text-sm">Aucun événement.</p>}
              <ol className="space-y-2 text-sm">
                {d.events.map((e) => (
                  <li key={e.id}>
                    <span className="text-ink/70">
                      {new Date(e.at).toLocaleString("fr-FR")}
                      {e.actorName ? ` · ${e.actorName}` : ""}
                    </span>
                    <br />
                    {describeEvent(e)}
                  </li>
                ))}
              </ol>
            </Section>
          </div>
        )}
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 border-b border-brand-100 pb-1 text-sm font-bold uppercase tracking-wide text-ink/70">
        {title}
      </h3>
      <dl className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-2 text-sm">{children}</dl>
    </section>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="font-semibold">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

function ExternalLink({ url, label }: { url: string | null | undefined; label?: string }) {
  const href = safeUrl(url);
  if (!href) return <>—</>;
  return (
    <a className="underline" href={href} target="_blank" rel="noopener noreferrer">
      {label ?? href.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
    </a>
  );
}

function Editable<T extends string>({
  can,
  value,
  options,
  onChange,
  busy,
  label,
  empty = NONE_LABEL,
  display,
}: {
  can: boolean;
  value: T | null;
  options: readonly T[];
  onChange: (v: T | null) => void;
  busy: boolean;
  label: string;
  empty?: string;
  display?: ReactNode;
}) {
  if (!can) return <>{display ?? value ?? "—"}</>;
  return (
    <select
      aria-label={label}
      className="w-full rounded border border-brand-100 bg-white px-2 py-1"
      value={value ?? ""}
      disabled={busy}
      onChange={(e) => onChange(e.target.value === "" ? null : (e.target.value as T))}
    >
      <option value="">{empty}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function EditableText({
  can,
  value,
  onSave,
  busy,
  label,
  max,
  single,
}: {
  can: boolean;
  value: string | null;
  onSave: (v: string | null) => void;
  busy: boolean;
  label: string;
  max: number;
  single?: boolean;
}) {
  const [text, setText] = useState(value ?? "");
  useEffect(() => setText(value ?? ""), [value]);
  if (!can) return <>{value ?? "—"}</>;
  const changed = text.trim() !== (value ?? "");
  const common = {
    "aria-label": label,
    value: text,
    maxLength: max,
    className: "w-full rounded border border-brand-100 bg-white px-2 py-1",
    onChange: (e: { target: { value: string } }) => setText(e.target.value),
  };
  return (
    <div className="space-y-1">
      {single ? <input type="text" {...common} /> : <textarea rows={3} {...common} />}
      <Button
        variant="ghost"
        className="px-2 py-1 text-xs"
        disabled={!changed || busy}
        onClick={() => onSave(text.trim() === "" ? null : text.trim())}
      >
        Enregistrer
      </Button>
    </div>
  );
}

function EditableNumber({
  can,
  value,
  onSave,
  busy,
  label,
}: {
  can: boolean;
  value: number | null;
  onSave: (v: number | null) => void;
  busy: boolean;
  label: string;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => setText(value === null ? "" : String(value)), [value]);
  if (!can) return <>{value === null ? "—" : formatNumber(value)}</>;
  const parsed = text.trim() === "" ? null : Number(text.replace(",", "."));
  const valid = parsed === null || (Number.isFinite(parsed) && parsed >= 0);
  return (
    <div className="flex items-center gap-2">
      <input
        aria-label={label}
        inputMode="decimal"
        className="w-32 rounded border border-brand-100 bg-white px-2 py-1"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-invalid={!valid}
      />
      <Button
        variant="ghost"
        className="px-2 py-1 text-xs"
        disabled={!valid || parsed === value || busy}
        onClick={() => onSave(parsed)}
      >
        Enregistrer
      </Button>
    </div>
  );
}
