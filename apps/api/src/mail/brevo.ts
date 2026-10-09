/** Message prêt à partir. */
export interface OutgoingMail {
  to: string;
  from: { name: string; email: string };
  replyTo?: { name: string; email: string };
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  tags: string[];
}

/**
 * Résultat d'un envoi :
 *  - `sent` : accepté par le fournisseur (identifiant de message) ;
 *  - `rejected` : rien n'est parti ; `permanent` si le fournisseur refuse ce message (adresse, paramètres), sinon limite ou panne à réessayer ;
 *  - `uncertain` : délai dépassé ou coupure réseau : l'e-mail est peut-être parti, on ne le renvoie JAMAIS automatiquement.
 */
export type SendResult =
  | { kind: "sent"; messageId: string }
  | { kind: "rejected"; reason: string; permanent: boolean }
  | { kind: "uncertain"; reason: string };

export interface MailSender {
  send(mail: OutgoingMail): Promise<SendResult>;
}

const ENDPOINT = "https://api.brevo.com/v3/smtp/email";

/** Envoi transactionnel par l'API Brevo. La clé n'apparaît dans aucun message d'erreur ni journal. */
export function brevoSender(apiKey: string, timeoutMs = 15_000, fetchImpl: typeof fetch = fetch): MailSender {
  return {
    async send(mail) {
      let res: Response;
      try {
        res = await fetchImpl(ENDPOINT, {
          method: "POST",
          headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            sender: mail.from,
            to: [{ email: mail.to }],
            ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
            subject: mail.subject,
            htmlContent: mail.html,
            textContent: mail.text,
            headers: mail.headers,
            tags: mail.tags,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        const name = (e as { name?: string }).name;
        return {
          kind: "uncertain",
          reason: name === "TimeoutError" || name === "AbortError" ? "délai dépassé" : "coupure réseau",
        };
      }
      const raw = await res.text().catch(() => "");
      if (res.ok) {
        try {
          const id = (JSON.parse(raw) as { messageId?: string }).messageId;
          if (id) return { kind: "sent", messageId: id };
        } catch {
          // réponse illisible : l'envoi a peut-être eu lieu
        }
        return { kind: "uncertain", reason: "réponse du fournisseur illisible" };
      }
      // 429 et 5xx : à réessayer ; 4xx : refus définitif. Le détail reste court et sans donnée personnelle.
      let detail = "";
      try {
        detail = String((JSON.parse(raw) as { message?: string }).message ?? "").slice(0, 200);
      } catch {
        // pas de détail exploitable
      }
      return {
        kind: "rejected",
        permanent: res.status >= 400 && res.status < 500 && res.status !== 429,
        reason: `Brevo ${res.status}${detail ? ` : ${detail}` : ""}`,
      };
    },
  };
}
