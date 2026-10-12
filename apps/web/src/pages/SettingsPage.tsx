import { MAIL_SETTING_KEYS, type MailSettingKey, type MailSettings } from "@gac/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button, ErrorAlert, Spinner } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";

const LABELS: Record<MailSettingKey, { label: string; hint?: string; kind: "text" | "area" | "number" }> = {
  fromName: { label: "Nom de l'expéditeur", kind: "text" },
  agendaText: { label: "Phrase de prise de rendez-vous", kind: "text" },
  signature: { label: "Signature", kind: "area" },
  optOutText: {
    label: "Mention de désinscription",
    hint: "Obligatoire dans chaque e-mail : 20 caractères au minimum.",
    kind: "area",
  },
  dailyCap: { label: "Plafond d'envois par jour", kind: "number" },
  intervalSeconds: { label: "Délai entre deux envois (secondes)", kind: "number" },
  slots: {
    label: "Créneaux d'envoi",
    hint: "Jour@HH:MM séparés par des virgules, heure de Paris (ex. mon@14:00,tue@09:00).",
    kind: "text",
  },
  windowMinutes: { label: "Durée d'un créneau (minutes)", kind: "number" },
};

/** Réglages d'envoi modifiables sans redéploiement. La clé Brevo, l'adresse expéditrice et le mode restent sur le serveur. */
export function SettingsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const admin = can("ADMIN");
  const settings = useQuery({
    queryKey: ["settings", "mail"],
    queryFn: () => api<MailSettings>("/settings/mail"),
  });
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data) {
      setForm(Object.fromEntries(MAIL_SETTING_KEYS.map((k) => [k, String(settings.data.values[k])])));
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<MailSettings>("/settings/mail", { method: "PUT", body }),
    onSuccess: (data) => {
      setError(null);
      setInfo("Réglages enregistrés.");
      qc.setQueryData(["settings", "mail"], data);
    },
    onError: (e) => {
      setInfo(null);
      setError(errorMessage(e));
    },
  });

  if (settings.isPending) return <Spinner />;
  if (settings.error) return <ErrorAlert message={errorMessage(settings.error)} />;
  const s = settings.data;
  if (!s) return null;

  const changes = () => {
    const body: Record<string, unknown> = {};
    for (const k of MAIL_SETTING_KEYS) {
      const raw = form[k] ?? "";
      const val = LABELS[k].kind === "number" ? Number(raw) : raw.trim();
      if (val !== s.values[k]) body[k] = val === s.defaults[k] ? null : val;
    }
    return body;
  };
  const body = changes();
  const dirty = Object.keys(body).length > 0;

  return (
    <>
      <h1 className="mb-1 text-2xl font-extrabold">Réglages</h1>
      <p className="mb-4 max-w-3xl text-sm text-ds-muted">
        Texte des e-mails et cadence d'envoi.{" "}
        {admin ? "Seuls les administrateurs modifient ces réglages." : "Vous les consultez en lecture seule."}
      </p>

      <section className="card mb-4 max-w-3xl" aria-label="Réglages gérés par le serveur">
        <h2 className="t-card mb-2">Gérés sur le serveur</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-ds-muted">Mode d'envoi</dt>
          <dd>{s.serverOnly.mode === "prod" ? "Actif" : "Désactivé"}</dd>
          <dt className="text-ds-muted">Expéditeur</dt>
          <dd>{s.serverOnly.fromAddress}</dd>
          <dt className="text-ds-muted">Brevo</dt>
          <dd>{s.serverOnly.configured ? "Configuré" : "Non configuré"}</dd>
          <dt className="text-ds-muted">Adresse de test</dt>
          <dd>{s.serverOnly.testRecipient ?? "Aucune"}</dd>
        </dl>
      </section>

      <form
        className="card max-w-3xl"
        onSubmit={(e) => {
          e.preventDefault();
          setInfo(null);
          save.mutate(body);
        }}
      >
        <ErrorAlert message={error} />
        {info && (
          <p role="status" className="alert alert--good mb-4">
            {info}
          </p>
        )}
        {MAIL_SETTING_KEYS.map((k) => {
          const l = LABELS[k];
          const id = `setting-${k}`;
          const overridden = s.overridden.includes(k);
          return (
            <div key={k} className="field mb-4">
              <label htmlFor={id} className="label">
                {l.label}
                {overridden && <span className="pill pill--accent ml-2">Modifié</span>}
              </label>
              {l.kind === "area" ? (
                <textarea
                  id={id}
                  className="textarea"
                  rows={3}
                  disabled={!admin}
                  value={form[k] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  aria-describedby={l.hint ? `${id}-hint` : undefined}
                />
              ) : (
                <input
                  id={id}
                  className="input"
                  type={l.kind === "number" ? "number" : "text"}
                  disabled={!admin}
                  value={form[k] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  aria-describedby={l.hint ? `${id}-hint` : undefined}
                />
              )}
              {l.hint && (
                <p id={`${id}-hint`} className="hint">
                  {l.hint}
                </p>
              )}
              {admin && overridden && (
                <div>
                  <Button
                    variant="ghost"
                    disabled={save.isPending}
                    onClick={() => save.mutate({ [k]: null })}
                  >
                    Revenir à la valeur du serveur
                  </Button>
                </div>
              )}
            </div>
          );
        })}
        {admin && (
          <Button type="submit" disabled={!dirty || save.isPending}>
            Enregistrer
          </Button>
        )}
      </form>
    </>
  );
}
