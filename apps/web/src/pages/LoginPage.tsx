import { type FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button, ErrorAlert, Field } from "../components/ui";
import { errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [show, setShow] = useState(false);
  const rawFrom = (location.state as { from?: unknown } | null)?.from;
  // retour à la page d'origine : chemin interne uniquement
  const back =
    typeof rawFrom === "string" && /^\/(?!\/)/.test(rawFrom) && rawFrom !== "/login" ? rawFrom : "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={back} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate(back, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl bg-ds-surface p-8 shadow-lg">
        <h1 className="text-2xl font-extrabold">GAC Pilot</h1>
        <p className="mb-6 text-sm text-ds-muted">
          {back !== "/"
            ? "Votre session a expiré : reconnectez-vous pour reprendre."
            : "Accès réservé à l'équipe"}
        </p>
        <ErrorAlert message={error} />
        <Field
          label="Adresse e-mail"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Mot de passe"
          type={show ? "text" : "password"}
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label className="mb-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Afficher les caractères
        </label>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Connexion…" : "Se connecter"}
        </Button>
      </form>
    </main>
  );
}
