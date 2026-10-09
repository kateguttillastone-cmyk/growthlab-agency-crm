import { PASSWORD_MIN_LENGTH, ROLE_LABELS } from "@gac/shared";
import { type FormEvent, useState } from "react";
import { Button, Card, ErrorAlert, Field } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";

export function ProfilePage() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    setBusy(true);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: { currentPassword: current, newPassword: next },
      });
      setDone(true);
      setCurrent("");
      setNext("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="mb-6 text-2xl font-extrabold">Mon profil</h1>
      <Card>
        <dl className="grid max-w-md grid-cols-[8rem_1fr] gap-2 text-sm">
          <dt className="font-semibold">Nom</dt>
          <dd>{user?.name}</dd>
          <dt className="font-semibold">E-mail</dt>
          <dd>{user?.email}</dd>
          <dt className="font-semibold">Rôle</dt>
          <dd>{user ? ROLE_LABELS[user.role] : ""}</dd>
        </dl>
      </Card>
      <Card title="Changer mon mot de passe">
        <form onSubmit={onSubmit} className="max-w-md">
          <ErrorAlert message={error} />
          {done && (
            <p role="status" className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              Mot de passe modifié. Vos autres appareils ont été déconnectés.
            </p>
          )}
          <Field
            label="Mot de passe actuel"
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <Field
            label="Nouveau mot de passe"
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            hint={`Au moins ${PASSWORD_MIN_LENGTH} caractères.`}
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <Button type="submit" disabled={busy}>
            Enregistrer
          </Button>
        </form>
      </Card>
    </>
  );
}
