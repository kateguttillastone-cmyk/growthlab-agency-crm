import type { EmailPreview } from "@gac/shared";

export interface MailIdentity {
  fromName: string;
  fromAddress: string;
  agendaText: string;
  signature: string;
  /** Mention d'opposition, en pied (vide = aucun pied). */
  optOutText?: string;
}

const CLOSING = /^(cordialement|bien à vous|à bientôt|à très vite)/i;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Gabarit unique de l'e-mail de prospection (reprend « Format Email HTML » de l'ancienne chaîne n8n) : texte sobre,
 * sans lien cliquable ni image. L'aperçu de l'interface et l'envoi utilisent CETTE fonction : on voit ce qui partira.
 * Le corps est en texte brut ; les paragraphes sont séparés par une ligne vide ; l'agenda s'insère avant la
 * formule de politesse finale (ou à la fin), puis la signature.
 */
export function renderEmail(input: { subject: string; body: string }, id: MailIdentity): EmailPreview {
  const blocks = input.body
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => ({ type: "text" as const, lines: b.split("\n").map((l) => l.trimEnd()) }));

  const agenda = { type: "agenda" as const, lines: [`Pour échanger : ${id.agendaText}`] };
  const signature = {
    type: "signature" as const,
    lines: id.signature.split("\n").map((l) => l.trim()),
  };
  const footer = id.optOutText?.trim()
    ? [
        {
          type: "footer" as const,
          lines: id.optOutText
            .trim()
            .split("\n")
            .map((l) => l.trim()),
        },
      ]
    : [];
  const closing = blocks.findIndex((b) => CLOSING.test(b.lines[0] ?? ""));
  const paragraphs =
    closing === -1
      ? [...blocks, agenda, signature, ...footer]
      : [...blocks.slice(0, closing), agenda, ...blocks.slice(closing), signature, ...footer];

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${paragraphs
    .map((p) =>
      p.type === "footer"
        ? `<p style="color:#666;font-size:12px">${p.lines.map(escapeHtml).join("<br>")}</p>`
        : `<p>${p.lines.map(escapeHtml).join("<br>")}</p>`,
    )
    .join("")}</div>`;
  const text = paragraphs.map((p) => p.lines.join("\n")).join("\n\n");

  return {
    from: `${id.fromName} <${id.fromAddress}>`,
    subject: input.subject.trim(),
    paragraphs,
    html,
    text,
  };
}
