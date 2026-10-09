import type { ImportResult } from "@gac/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, ErrorAlert } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { formatBytes, nothingNew, reportRows, sortedWarnings } from "../lib/imports";

type Phase = "idle" | "analysing" | "previewed" | "confirming" | "importing" | "done";

/** Import de l'export CSV d'Airtable : choisir le fichier → relire le rapport de simulation → confirmer. */
export function ImportPage() {
  const qc = useQueryClient();
  const fileId = useId();
  const tzId = useId();
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [tz, setTz] = useState("-04:00");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = (mode: "preview" | "apply", f: File, zone: string, confirmHash?: string) => {
    const form = new FormData();
    form.set("mode", mode);
    form.set("tz", zone);
    if (confirmHash) form.set("confirmHash", confirmHash);
    form.set("file", f);
    return api<ImportResult>("/imports/airtable", { method: "POST", form });
  };

  async function analyse(f: File, zone = tz) {
    setError(null);
    setResult(null);
    setPhase("analysing");
    try {
      setResult(await send("preview", f, zone));
      setPhase("previewed");
    } catch (e) {
      setError(errorMessage(e));
      setPhase("idle");
    }
  }

  async function apply() {
    if (!file || !result) return;
    setError(null);
    setPhase("importing");
    try {
      setResult(await send("apply", file, tz, result.file.sha256));
      setPhase("done");
      // les listes et compteurs de l'écran Leads doivent se recharger
      await qc.invalidateQueries({ queryKey: ["leads"] });
    } catch (e) {
      setError(errorMessage(e));
      setPhase("previewed");
    }
  }

  function reset() {
    setFile(null);
    setResult(null);
    setError(null);
    setPhase("idle");
  }

  const busy = phase === "analysing" || phase === "importing";
  const report = result?.report;

  return (
    <>
      <h1 className="mb-1 text-2xl font-extrabold">Import de l'ancienne base</h1>
      <p className="mb-6 max-w-3xl text-sm text-ink/70">
        Envoyez l'export CSV de la table Airtable. Le fichier est d'abord <strong>simulé</strong> : vous
        relisez le rapport, puis vous confirmez. Rien n'est écrit avant votre confirmation, le fichier n'est
        pas conservé, et l'import peut être rejoué sans créer de doublon ni écraser vos modifications.
      </p>

      <p role="status" aria-live="polite" className="sr-only">
        {phase === "analysing" && "Analyse du fichier en cours"}
        {phase === "importing" && "Import en cours"}
        {phase === "previewed" && "Analyse terminée : relisez le rapport"}
        {phase === "done" && "Import terminé"}
      </p>
      <ErrorAlert message={error} />

      {phase !== "done" && (
        <Card title="1. Choisir le fichier">
          <div className="space-y-4">
            <div>
              <label htmlFor={fileId} className="mb-1 block text-sm font-medium">
                Export CSV (maximum 10 Mo, 20 000 lignes)
              </label>
              <input
                id={fileId}
                type="file"
                accept=".csv,text/csv"
                disabled={busy}
                className="block w-full max-w-xl rounded border border-brand-100 bg-white px-2 py-2 text-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f) void analyse(f);
                  else reset();
                }}
              />
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-medium">Options</summary>
              <div className="mt-3">
                <label htmlFor={tzId} className="mb-1 block text-sm font-medium">
                  Fuseau horaire des dates sans fuseau (dernière validation)
                </label>
                <input
                  id={tzId}
                  value={tz}
                  pattern="[+-][0-9]{2}:[0-9]{2}"
                  title="Forme attendue : -04:00"
                  disabled={busy}
                  onChange={(e) => setTz(e.target.value)}
                  onBlur={() => file && /^[+-]\d{2}:\d{2}$/.test(tz) && void analyse(file, tz)}
                  className="w-28 rounded border border-brand-100 bg-white px-2 py-1 text-sm"
                />
                <p className="mt-1 text-xs text-ink/70">
                  Les dates de l'export analysé portent le fuseau -04:00. Modifier cette valeur relance
                  l'analyse.
                </p>
              </div>
            </details>
            {phase === "analysing" && <p className="text-sm">Analyse de {file?.name}…</p>}
          </div>
        </Card>
      )}

      {report &&
        result &&
        (phase === "previewed" || phase === "confirming" || phase === "importing" || phase === "done") && (
          <Card title={phase === "done" ? "Import terminé" : "2. Relire le rapport de simulation"}>
            <p className="mb-4 text-sm">
              <strong>{result.file.name}</strong> — {formatBytes(result.file.bytes)} — empreinte{" "}
              <code>{result.file.sha256.slice(0, 12)}</code> — {report.rows.toLocaleString("fr-FR")} lignes
              lues, {report.skipped.toLocaleString("fr-FR")} ignorées
            </p>

            {phase !== "done" && nothingNew(report) && (
              <p className="mb-4 rounded bg-brand-50 p-3 text-sm">
                Ce fichier a déjà été importé : tout ce qu'il contient est déjà en base. Rien de nouveau ne
                serait créé.
              </p>
            )}

            <table className="mb-4 w-full max-w-2xl text-left text-sm">
              <caption className="sr-only">Effectifs créés et déjà présents, par type de donnée</caption>
              <thead>
                <tr className="border-b border-brand-100">
                  <th scope="col" className="py-2 pr-4">
                    Donnée
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right">
                    {phase === "done" ? "Créés" : "À créer"}
                  </th>
                  <th scope="col" className="py-2 text-right">
                    Déjà présents
                  </th>
                </tr>
              </thead>
              <tbody>
                {reportRows(report).map((r) => (
                  <tr key={r.label} className="border-b border-brand-50">
                    <th scope="row" className="py-2 pr-4 font-normal">
                      {r.label}
                    </th>
                    <td className="py-2 pr-4 text-right font-semibold">
                      {r.created?.toLocaleString("fr-FR")}
                    </td>
                    <td className="py-2 text-right">{r.existing?.toLocaleString("fr-FR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {sortedWarnings(report).length > 0 && (
              <div className="mb-4">
                <h3 className="mb-1 text-sm font-bold">Points d'attention (traités automatiquement)</h3>
                <ul className="list-disc pl-5 text-sm">
                  {sortedWarnings(report).map(([label, n]) => (
                    <li key={label}>
                      {label} : <strong>{n.toLocaleString("fr-FR")}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {phase === "previewed" && (
              <div className="flex flex-wrap gap-2">
                <Button disabled={nothingNew(report)} onClick={() => setPhase("confirming")}>
                  Importer
                </Button>
                <Button variant="ghost" onClick={reset}>
                  Choisir un autre fichier
                </Button>
              </div>
            )}

            {(phase === "confirming" || phase === "importing") && (
              <div
                role="alertdialog"
                aria-labelledby="confirm-title"
                aria-describedby="confirm-desc"
                className="rounded-lg border border-brand-600 bg-brand-50 p-4"
              >
                <h3 id="confirm-title" className="font-bold">
                  Confirmer l'import ?
                </h3>
                <p id="confirm-desc" className="mb-3 mt-1 text-sm">
                  {report.leads.created.toLocaleString("fr-FR")} leads,{" "}
                  {report.contacts.created.toLocaleString("fr-FR")} contacts et{" "}
                  {report.suppressions.created.toLocaleString("fr-FR")} adresses exclues vont être créés.
                  L'opération est tracée dans le journal d'audit. Elle ne se défait pas d'un clic ; le rejouer
                  ne crée jamais de doublon.
                </p>
                <div className="flex gap-2">
                  <Button disabled={busy} onClick={() => void apply()}>
                    {phase === "importing" ? "Import en cours…" : "Confirmer l'import"}
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setPhase("previewed")}>
                    Annuler
                  </Button>
                </div>
              </div>
            )}

            {phase === "done" && (
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to="/leads"
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Voir les leads
                </Link>
                <Button variant="ghost" onClick={reset}>
                  Importer un autre fichier
                </Button>
              </div>
            )}
          </Card>
        )}
    </>
  );
}
