import {
  type BulkLeadsResult,
  NONE,
  PIPELINE_STAGES,
  QUALIFICATIONS,
  type SavedView,
  SERVICES,
  type UserOption,
} from "@gac/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { filtersFromParams, type LeadFilters, toQueryString } from "../lib/leads";
import { Button, ErrorAlert } from "./ui";

/** Responsables possibles (comptes actifs) ; réservé aux responsables, les autres rôles n'y ont pas accès. */
export function useOwnerOptions() {
  const { can } = useAuth();
  return useQuery({
    queryKey: ["users", "options"],
    queryFn: () => api<UserOption[]>("/users/options"),
    enabled: can("MANAGER"),
    staleTime: 60_000,
  });
}

/** Vues enregistrées : les critères de la liste, gardés par personne. */
export function SavedViews({
  filters,
  onApply,
}: {
  filters: LeadFilters;
  onApply: (f: LeadFilters) => void;
}) {
  const qc = useQueryClient();
  const nameId = useId();
  const selectId = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const views = useQuery({
    queryKey: ["views", "leads"],
    queryFn: () => api<SavedView[]>("/views?page=leads"),
  });
  const current = Object.fromEntries(new URLSearchParams(toQueryString(filters)).entries());
  const save = useMutation({
    mutationFn: () =>
      api<SavedView>("/views", { method: "POST", body: { page: "leads", name, filters: current } }),
    onSuccess: async () => {
      setName("");
      setError(null);
      await qc.invalidateQueries({ queryKey: ["views", "leads"] });
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/views/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["views", "leads"] }),
    onError: (e) => setError(errorMessage(e)),
  });
  const [chosen, setChosen] = useState("");
  const list = views.data ?? [];
  return (
    <section aria-label="Vues enregistrées" className="mb-4 flex flex-wrap items-end gap-3">
      {list.length > 0 && (
        <div className="field">
          <label htmlFor={selectId} className="label">
            Mes vues
          </label>
          <select
            id={selectId}
            className="select"
            value={chosen}
            onChange={(e) => {
              setChosen(e.target.value);
              const v = list.find((x) => x.id === e.target.value);
              if (v) onApply(filtersFromParams(new URLSearchParams(v.filters)));
            }}
          >
            <option value="">Choisir…</option>
            {list.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {chosen && (
        <Button
          variant="ghost"
          disabled={remove.isPending}
          onClick={() => {
            remove.mutate(chosen);
            setChosen("");
          }}
        >
          Supprimer cette vue
        </Button>
      )}
      <div className="field">
        <label htmlFor={nameId} className="label">
          Enregistrer ces critères sous le nom
        </label>
        <input
          id={nameId}
          className="input"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <Button variant="secondary" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
        Enregistrer la vue
      </Button>
      <ErrorAlert message={error} />
    </section>
  );
}

type SetField = "qualification" | "service" | "stage" | "ownerId";
const FIELD_LABEL: Record<SetField, string> = {
  qualification: "Qualification",
  service: "Service",
  stage: "Étape",
  ownerId: "Responsable",
};

/** Actions groupées sur les lignes cochées ou sur tout ce que sélectionne le filtre : simuler, puis confirmer. */
export function BulkBar({
  names = [],
  ids,
  filters,
  total,
  onDone,
  onClear,
}: {
  /** Entreprises cochées visibles sur la page (pour nommer les leads concernés). */
  names?: string[];
  ids: string[];
  filters: LeadFilters;
  total: number;
  onDone: () => Promise<void>;
  onClear: () => void;
}) {
  const { can } = useAuth();
  const owners = useOwnerOptions();
  const fieldId = useId();
  const valueId = useId();
  const [scope, setScope] = useState<"ids" | "filter">("ids");
  const [field, setField] = useState<SetField>("stage");
  const [value, setValue] = useState("");
  const [sim, setSim] = useState<BulkLeadsResult | null>(null);
  const [done, setDone] = useState<BulkLeadsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fields = (["stage", "qualification", "service", "ownerId"] as SetField[]).filter(
    (f) => !(f !== "stage" && !can("MANAGER")),
  );
  const options: Array<[string, string]> =
    field === "stage"
      ? PIPELINE_STAGES.map((v) => [v, v])
      : field === "qualification"
        ? QUALIFICATIONS.map((v) => [v, v])
        : field === "service"
          ? SERVICES.map((v) => [v, v])
          : [[NONE, "Sans responsable"], ...(owners.data ?? []).map((o): [string, string] => [o.id, o.name])];

  const filterBody = Object.fromEntries(
    new URLSearchParams(toQueryString({ ...filters, sort: undefined, order: undefined })),
  );
  const target = scope === "ids" ? { ids } : { filter: filterBody };

  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const set = { [field]: value === NONE ? null : value };
      const res = await api<BulkLeadsResult>("/leads/bulk", {
        method: "POST",
        body: { ...target, set, dryRun, ...(dryRun ? {} : { expectedCount: sim?.matched }) },
      });
      if (dryRun) {
        setSim(res);
        setDone(null);
      } else {
        setSim(null);
        setDone(res);
        await onDone();
      }
    } catch (e) {
      setError(errorMessage(e));
      setSim(null);
    } finally {
      setBusy(false);
    }
  }
  const reset = () => {
    setSim(null);
    setDone(null);
  };

  return (
    <section aria-label="Actions groupées" className="card sticky bottom-20 z-20 mb-4 shadow-lg lg:bottom-4">
      <h2 className="t-card mb-2">Actions groupées</h2>
      <fieldset className="mb-3 flex flex-wrap gap-4 border-0 p-0">
        <legend className="label mb-1">Appliquer à</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="bulk-scope"
            checked={scope === "ids"}
            disabled={ids.length === 0}
            onChange={() => {
              setScope("ids");
              reset();
            }}
          />
          Les {ids.length} ligne(s) cochée(s)
          {names.length > 0 && (
            <span className="t-small text-ds-muted">
              {" "}
              ({names.slice(0, 3).join(", ")}
              {ids.length > 3 ? "…" : ""})
            </span>
          )}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="bulk-scope"
            checked={scope === "filter"}
            onChange={() => {
              setScope("filter");
              reset();
            }}
          />
          Tous les {total.toLocaleString("fr-FR")} leads correspondant aux filtres
        </label>
      </fieldset>
      <div className="flex flex-wrap items-end gap-3">
        <div className="field">
          <label htmlFor={fieldId} className="label">
            Champ à modifier
          </label>
          <select
            id={fieldId}
            className="select"
            value={field}
            onChange={(e) => {
              setField(e.target.value as SetField);
              setValue("");
              reset();
            }}
          >
            {fields.map((f) => (
              <option key={f} value={f}>
                {FIELD_LABEL[f]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={valueId} className="label">
            Nouvelle valeur
          </label>
          <select
            id={valueId}
            className="select"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              reset();
            }}
          >
            <option value="">Choisir…</option>
            {options.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <Button
          variant="secondary"
          disabled={busy || !value || (scope === "ids" && ids.length === 0)}
          onClick={() => run(true)}
        >
          Simuler
        </Button>
        <Button variant="ghost" onClick={onClear}>
          Décocher
        </Button>
      </div>
      <ErrorAlert message={error} />
      {sim && (
        <div role="status" className="alert alert--info mt-3 flex-col">
          <p className="font-semibold">
            {sim.changed} lead(s) seraient modifiés, {sim.unchanged} déjà dans cet état (sur {sim.matched}).
          </p>
          {scope === "ids" && names.length > 0 && (
            <p className="t-small">
              Concerne : {names.slice(0, 5).join(", ")}
              {ids.length > 5 ? ` et ${ids.length - 5} autre(s)` : ""}.
            </p>
          )}
          {sim.changed > 0 && (
            <div>
              <Button disabled={busy} onClick={() => run(false)}>
                Confirmer : modifier {sim.changed} lead(s)
              </Button>
            </div>
          )}
        </div>
      )}
      {done && (
        <p role="status" className="mt-3 text-sm font-semibold">
          {done.changed} lead(s) modifié(s).
        </p>
      )}
    </section>
  );
}
