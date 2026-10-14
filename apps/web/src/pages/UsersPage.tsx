import { PASSWORD_MIN_LENGTH, type Page, ROLE_LABELS, ROLES, type Role, type User } from "@gac/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Pager } from "../components/Pager";
import { Button, Card, ErrorAlert, Field, SelectField, Spinner } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";

const PAGE_SIZE = 20;

export function UsersPage() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);

  const list = useQuery({
    queryKey: ["users", { offset, q }],
    queryFn: () =>
      api<Page<User>>(`/users?limit=${PAGE_SIZE}&offset=${offset}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["users"] });

  const patch = useMutation({
    mutationFn: (v: { id: string; body: Partial<{ role: Role; active: boolean }> }) =>
      api<User>(`/users/${v.id}`, { method: "PATCH", body: v.body }),
    onSuccess: () => {
      setError(null);
      return refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const total = list.data?.total ?? 0;
  return (
    <>
      <header className="pagebar pagebar--compact mb-6">
        <div className="pagebar-title">
          <h1 className="t-page">Utilisateurs</h1>
          <span className="pagebar-count">
            {total} {total > 1 ? "comptes" : "compte"}
          </span>
        </div>
      </header>
      <ErrorAlert message={error} />
      <CreateUserForm onCreated={refresh} />
      <Card title="Comptes">
        <div className="mb-4 max-w-sm">
          <Field
            label="Rechercher (nom ou e-mail)"
            type="search"
            value={q}
            onChange={(e) => {
              setOffset(0);
              setQ(e.target.value);
            }}
          />
        </div>
        {list.isPending && <Spinner />}
        {list.isError && <ErrorAlert message={errorMessage(list.error)} />}
        {list.data && (
          <>
            <ul aria-label="Comptes" className="m-0 flex list-none flex-col gap-3 p-0 md:hidden">
              {list.data.items.map((u) => {
                const self = u.id === me?.id;
                return (
                  <li key={`m-${u.id}`} className="flex flex-col gap-2 rounded-xl border border-ds-line p-3">
                    <div className="flex items-center justify-between gap-2">
                      <b>{u.name}</b>
                      <span className={`pill ${u.active ? "pill--good" : "pill--neutral"}`}>
                        {u.active ? "Actif" : "Désactivé"}
                      </span>
                    </div>
                    <span className="t-small break-all text-ds-muted">{u.email}</span>
                    <span className="t-small text-ds-muted">
                      Dernière connexion :{" "}
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("fr-FR") : "jamais"}
                    </span>
                    <select
                      aria-label={`Rôle de ${u.name}`}
                      className="select"
                      value={u.role}
                      disabled={self || patch.isPending}
                      onChange={(e) => patch.mutate({ id: u.id, body: { role: e.target.value as Role } })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => setResetting(u)}>
                        Réinitialiser le mot de passe
                      </Button>
                      <Button
                        variant={u.active ? "danger" : "ghost"}
                        disabled={self || patch.isPending}
                        onClick={() => patch.mutate({ id: u.id, body: { active: !u.active } })}
                      >
                        {u.active ? "Désactiver" : "Réactiver"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Liste des comptes utilisateurs</caption>
                <thead>
                  <tr className="border-b border-ds-line">
                    <th scope="col" className="py-2 pr-4">
                      Nom
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      E-mail
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Rôle
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Dernière connexion
                    </th>
                    <th scope="col" className="py-2">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((u) => {
                    const self = u.id === me?.id;
                    return (
                      <tr key={u.id} className="border-b border-ds-line align-middle">
                        <th scope="row" className="py-2 pr-4 font-semibold">
                          {u.name}{" "}
                          <span className={`pill ml-1 ${u.active ? "pill--good" : "pill--neutral"}`}>
                            {u.active ? "Actif" : "Désactivé"}
                          </span>
                        </th>
                        <td className="py-2 pr-4">{u.email}</td>
                        <td className="py-2 pr-4">
                          <select
                            aria-label={`Rôle de ${u.name}`}
                            className="rounded border border-ds-line bg-ds-surface px-2 py-1"
                            value={u.role}
                            disabled={self || patch.isPending}
                            onChange={(e) =>
                              patch.mutate({ id: u.id, body: { role: e.target.value as Role } })
                            }
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-4">
                          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("fr-FR") : "Jamais"}
                        </td>
                        <td className="space-x-2 py-2 whitespace-nowrap">
                          <Button variant="ghost" onClick={() => setResetting(u)}>
                            Réinitialiser le mot de passe
                          </Button>
                          <Button
                            variant={u.active ? "danger" : "ghost"}
                            disabled={self || patch.isPending}
                            onClick={() => patch.mutate({ id: u.id, body: { active: !u.active } })}
                          >
                            {u.active ? "Désactiver" : "Réactiver"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager total={total} offset={offset} pageSize={PAGE_SIZE} onChange={setOffset} />
          </>
        )}
      </Card>
      {resetting && <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />}
    </>
  );
}

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("AGENT");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => api<User>("/users", { method: "POST", body: { email, name, role, password } }),
    onSuccess: () => {
      setEmail("");
      setName("");
      setPassword("");
      setError(null);
      onCreated();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }
  return (
    <Card title="Créer un compte">
      <form onSubmit={onSubmit} className="grid max-w-3xl gap-x-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <ErrorAlert message={error} />
        </div>
        <Field label="Nom" required value={name} onChange={(e) => setName(e.target.value)} />
        <Field
          label="Adresse e-mail"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <SelectField label="Rôle" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </SelectField>
        <Field
          label="Mot de passe initial"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          hint={`Au moins ${PASSWORD_MIN_LENGTH} caractères. À communiquer par un canal sûr.`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="md:col-span-2">
          <Button type="submit" disabled={create.isPending}>
            Créer le compte
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reset = useMutation({
    mutationFn: () => api(`/users/${user.id}/reset-password`, { method: "POST", body: { password } }),
    onSuccess: onClose,
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ds-overlay p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-title"
        onSubmit={(e) => {
          e.preventDefault();
          reset.mutate();
        }}
        className="w-full max-w-md rounded-2xl bg-ds-surface p-6 shadow-xl"
      >
        <h2 id="reset-title" className="mb-1 text-lg font-bold">
          Réinitialiser le mot de passe
        </h2>
        <p className="mb-4 text-sm text-ds-muted">{user.name} sera déconnecté(e) de tous ses appareils.</p>
        <ErrorAlert message={error} />
        <Field
          label="Nouveau mot de passe"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          minLength={PASSWORD_MIN_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={reset.isPending}>
            Réinitialiser
          </Button>
        </div>
      </form>
    </div>
  );
}
