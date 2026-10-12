import { SUPPRESSION_REASONS, type SuppressionPage } from "@gac/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { Pager } from "../components/Pager";
import { Button, ErrorAlert, Field, Spinner } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { BLOCKED_LABELS } from "../lib/emails";

const PAGE_SIZE = 50;

/** Adresses exclues de toute prospection. Aucune suppression depuis l'interface : l'opposition d'une personne doit être respectée. */
export function SuppressionsPage() {
  const qc = useQueryClient();
  const searchId = useId();
  const reasonId = useId();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [reason, setReason] = useState("");
  const [offset, setOffset] = useState(0);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDq(q.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  if (dq) p.set("q", dq);
  if (reason) p.set("reason", reason);
  const list = useQuery({
    queryKey: ["suppressions", p.toString()],
    queryFn: () => api<SuppressionPage>(`/suppressions?${p}`),
    placeholderData: keepPreviousData,
  });

  const add = useMutation({
    mutationFn: () =>
      api<{ email: string; created: boolean }>("/suppressions", {
        method: "POST",
        body: { email, ...(note.trim() ? { note } : {}) },
      }),
    onSuccess: async (r) => {
      setError(null);
      setInfo(r.created ? `${r.email} est exclue.` : `${r.email} était déjà exclue.`);
      setEmail("");
      setNote("");
      await qc.invalidateQueries({ queryKey: ["suppressions"] });
      await qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e) => {
      setInfo(null);
      setError(errorMessage(e));
    },
  });

  const d = list.data;
  return (
    <>
      <h1 className="mb-1 text-2xl font-extrabold">Adresses exclues</h1>
      <p className="mb-4 max-w-3xl text-sm text-ds-muted">
        Ces adresses ne reçoivent plus aucun e-mail : désinscriptions, rebonds, plaintes et exclusions
        manuelles. Une adresse exclue ne peut pas être retirée depuis l'application.
      </p>

      {d && (
        <ul className="mb-4 flex flex-wrap gap-2" aria-label="Répartition par motif">
          {SUPPRESSION_REASONS.map((r) => (
            <li key={r} className="pill pill--neutral">
              {BLOCKED_LABELS[r]} : {(d.byReason[r] ?? 0).toLocaleString("fr-FR")}
            </li>
          ))}
        </ul>
      )}

      <form
        className="card mb-4 max-w-3xl"
        onSubmit={(e) => {
          e.preventDefault();
          setInfo(null);
          add.mutate();
        }}
      >
        <h2 className="t-card mb-3">Exclure une adresse</h2>
        <ErrorAlert message={error} />
        {info && (
          <p role="status" className="alert alert--good mb-4">
            {info}
          </p>
        )}
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field
            label="Adresse e-mail"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Note (facultatif)"
            hint="Ex. « a répondu stop par e-mail »"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          disabled={add.isPending || !email.trim()}
          onClick={(e) => {
            if (!window.confirm(`Exclure définitivement ${email.trim()} de toute prospection ?`))
              e.preventDefault();
          }}
        >
          Exclure cette adresse
        </Button>
      </form>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="field">
          <label htmlFor={searchId} className="label">
            Rechercher
          </label>
          <input
            id={searchId}
            type="search"
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={reasonId} className="label">
            Motif
          </label>
          <select
            id={reasonId}
            className="select"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Tous</option>
            {SUPPRESSION_REASONS.map((r) => (
              <option key={r} value={r}>
                {BLOCKED_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="card">
        {list.isPending && <Spinner />}
        <ErrorAlert message={list.error ? errorMessage(list.error) : null} />
        {d && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Adresses exclues, {d.total.toLocaleString("fr-FR")} au total
                </caption>
                <thead>
                  <tr className="border-b border-ds-line">
                    <th scope="col" className="py-2 pr-4">
                      Adresse
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Motif
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Note
                    </th>
                    <th scope="col" className="py-2">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((s) => (
                    <tr key={s.email} className="border-b border-ds-line">
                      <th scope="row" className="py-2 pr-4 font-normal">
                        {s.email}
                      </th>
                      <td className="py-2 pr-4">{BLOCKED_LABELS[s.reason]}</td>
                      <td className="py-2 pr-4">{s.note ?? "—"}</td>
                      <td className="whitespace-nowrap py-2">{new Date(s.at).toLocaleDateString("fr-FR")}</td>
                    </tr>
                  ))}
                  {d.items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-ds-muted">
                        Aucune adresse exclue ne correspond.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pager total={d.total} offset={offset} pageSize={PAGE_SIZE} onChange={setOffset} />
          </>
        )}
      </section>
    </>
  );
}
