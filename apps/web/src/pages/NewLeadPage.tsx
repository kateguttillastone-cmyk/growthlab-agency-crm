import { type CreateLeadInput, type LeadDetail, QUALIFICATIONS, SERVICES } from "@gac/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, ErrorAlert, Field, SelectField } from "../components/ui";
import { ApiError, api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";

/** Création d'un prospect trouvé hors import. Un prospect déjà connu (même site ou même nom) n'est pas dupliqué. */
export function NewLeadPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [v, setV] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<string | null>(null);
  const set = (k: string) => (e: { target: { value: string } }) =>
    setV((cur) => ({ ...cur, [k]: e.target.value }));

  const create = useMutation({
    mutationFn: () => {
      const body: Record<string, string> = {};
      for (const [k, val] of Object.entries(v)) if (val.trim()) body[k] = val.trim();
      return api<LeadDetail>("/leads", { method: "POST", body: body as unknown as CreateLeadInput });
    },
    onSuccess: async (lead) => {
      await qc.invalidateQueries({ queryKey: ["leads"] });
      navigate(`/leads?lead=${lead.id}`);
    },
    onError: (e) => {
      const details = e instanceof ApiError ? (e.details as { leadId?: string } | undefined) : undefined;
      setExisting(e instanceof ApiError && e.status === 409 ? (details?.leadId ?? null) : null);
      setError(errorMessage(e));
    },
  });

  return (
    <>
      <header className="pagebar pagebar--compact mb-4">
        <div className="pagebar-title">
          <h1 className="t-page">Nouveau lead</h1>
        </div>
      </header>
      <p className="mb-4 max-w-3xl text-sm text-ds-muted">
        Pour un prospect trouvé en dehors de l'import. Le prospect arrive à l'étape « Nouveau » ; s'il existe
        déjà, il n'est pas dupliqué.
      </p>
      <form
        className="card max-w-3xl"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setExisting(null);
          create.mutate();
        }}
      >
        <ErrorAlert message={error} />
        {existing && (
          <p className="mb-4 text-sm">
            <Link className="link" to={`/leads?lead=${existing}`}>
              Ouvrir la fiche existante
            </Link>
          </p>
        )}
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Entreprise" required value={v.companyName ?? ""} onChange={set("companyName")} />
          <Field label="Site web" value={v.website ?? ""} onChange={set("website")} />
          <Field label="Téléphone" type="tel" value={v.phone ?? ""} onChange={set("phone")} />
          <Field label="Ville" value={v.city ?? ""} onChange={set("city")} />
          <Field label="Métier ou secteur" value={v.sector ?? ""} onChange={set("sector")} />
          <Field label="E-mail du contact" type="email" value={v.email ?? ""} onChange={set("email")} />
          <Field label="Prénom du contact" value={v.firstName ?? ""} onChange={set("firstName")} />
          <Field label="Nom du contact" value={v.lastName ?? ""} onChange={set("lastName")} />
          <Field label="Fonction" value={v.jobTitle ?? ""} onChange={set("jobTitle")} />
          {can("MANAGER") && (
            <>
              <SelectField
                label="Qualification"
                value={v.qualification ?? ""}
                onChange={set("qualification")}
              >
                <option value="">Non qualifié</option>
                {QUALIFICATIONS.map((q) => (
                  <option key={q}>{q}</option>
                ))}
              </SelectField>
              <SelectField label="Service" value={v.service ?? ""} onChange={set("service")}>
                <option value="">Aucun</option>
                {SERVICES.map((q) => (
                  <option key={q}>{q}</option>
                ))}
              </SelectField>
            </>
          )}
        </div>
        <div className="field mb-4">
          <label htmlFor="new-lead-comment" className="label">
            Commentaire
          </label>
          <textarea
            id="new-lead-comment"
            className="textarea"
            maxLength={2000}
            value={v.comment ?? ""}
            onChange={set("comment")}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={create.isPending || !(v.companyName ?? "").trim()}>
            Créer le lead
          </Button>
          <Link to="/leads" className="btn btn--secondary">
            Annuler
          </Link>
        </div>
      </form>
    </>
  );
}
