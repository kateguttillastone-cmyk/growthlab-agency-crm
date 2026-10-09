import { createHash } from "node:crypto";
import { basename } from "node:path";
import multipart from "@fastify/multipart";
import { type ImportResult, importResultSchema, MAX_IMPORT_ROWS } from "@gac/shared";
import type { FastifyInstance } from "fastify";
import { ImportError, importAirtableCsv } from "../../import/airtable";
import { authOf } from "../../lib/assert";
import { audit } from "../../lib/audit";
import { AppError, conflict } from "../../lib/errors";

const MODES = ["preview", "apply"] as const;

/** Nom de fichier affichable : sans chemin, sans caractère de contrôle, borné. Jamais utilisé pour écrire sur le disque. */
function displayName(raw: string | undefined): string {
  const base = basename((raw ?? "").replace(/\\/g, "/"));
  const printable = [...base].filter((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127).join("");
  return (printable || "export.csv").slice(0, 100);
}

/**
 * Import de l'export CSV d'Airtable par l'interface (administrateurs).
 * Deux temps : « preview » (simulation, rien n'est écrit) puis « apply » avec l'empreinte du fichier simulé, ce qui
 * garantit que le fichier importé est bien celui qui a été relu. Le fichier n'est jamais conservé.
 */
export async function importsRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app;
  const maxBytes = Math.floor(config.IMPORT_MAX_MB * 1024 * 1024);
  await app.register(multipart, { limits: { fileSize: maxBytes, files: 1, fields: 5, parts: 8 } });

  app.post(
    "/imports/airtable",
    {
      preHandler: app.requireRole("ADMIN"),
      // un import réel dure quelques secondes à quelques dizaines de secondes : on borne la fréquence
      config: { rateLimit: { max: config.IMPORT_RATE_LIMIT_PER_MINUTE, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      let buffer: Buffer | undefined;
      let fileName = "export.csv";
      const fields: Record<string, string> = {};
      try {
        for await (const part of req.parts()) {
          if (part.type === "file") {
            if (part.fieldname === "file" && !buffer) {
              fileName = displayName(part.filename);
              buffer = await part.toBuffer();
            } else {
              await part.toBuffer(); // vidé et ignoré
            }
          } else {
            fields[part.fieldname] = String(part.value).slice(0, 200);
          }
        }
      } catch (err) {
        if ((err as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
          throw new AppError(
            413,
            "VALIDATION_ERROR",
            `Fichier trop volumineux (maximum ${config.IMPORT_MAX_MB} Mo).`,
          );
        }
        throw err;
      }

      const mode = MODES.find((m) => m === fields.mode);
      if (!mode)
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Le champ « mode » doit valoir « preview » ou « apply ».",
        );
      if (!buffer || buffer.length === 0)
        throw new AppError(400, "VALIDATION_ERROR", "Aucun fichier reçu (champ « file »).");
      const tz = fields.tz;
      if (tz && !/^[+-]\d{2}:\d{2}$/.test(tz)) {
        throw new AppError(400, "VALIDATION_ERROR", "Le fuseau doit avoir la forme -04:00.");
      }

      const sha256 = createHash("sha256").update(buffer).digest("hex");
      if (mode === "apply" && fields.confirmHash !== sha256) {
        throw conflict(
          "Le fichier envoyé n'est pas celui qui a été analysé : relancez l'analyse avant d'importer.",
        );
      }

      let csv: string;
      try {
        csv = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      } catch {
        throw new AppError(
          422,
          "VALIDATION_ERROR",
          "Le fichier n'est pas encodé en UTF-8. Réexportez-le depuis Airtable (CSV) sans l'ouvrir ni l'enregistrer dans un tableur.",
        );
      }

      let report: Awaited<ReturnType<typeof importAirtableCsv>>;
      try {
        report = await importAirtableCsv(db, csv, {
          dryRun: mode === "preview",
          maxRows: MAX_IMPORT_ROWS,
          ...(tz ? { timezoneOffset: tz } : {}),
        });
      } catch (err) {
        if (err instanceof ImportError) throw new AppError(422, "VALIDATION_ERROR", err.message);
        throw err;
      }

      const actor = authOf(req).user;
      await audit(db, {
        actorId: actor.id,
        action: mode === "apply" ? "import.applied" : "import.preview",
        entityType: "import",
        entityId: sha256.slice(0, 12),
        // effectifs seulement : jamais de contenu du fichier
        data: {
          rows: report.rows,
          skipped: report.skipped,
          companies: report.companies.created,
          contacts: report.contacts.created,
          leads: report.leads.created,
          suppressions: report.suppressions.created,
        },
        ip: req.ip,
      });

      const result: ImportResult = {
        report,
        applied: mode === "apply",
        file: { name: fileName, bytes: buffer.length, sha256 },
      };
      return reply.send(importResultSchema.parse(result));
    },
  );
}
