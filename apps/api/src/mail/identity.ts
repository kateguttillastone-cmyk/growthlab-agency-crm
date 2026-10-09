import type { Config } from "../config";
import type { MailIdentity } from "./template";

export function mailIdentity(config: Config): MailIdentity {
  return {
    fromName: config.MAIL_FROM_NAME,
    fromAddress: config.MAIL_FROM_ADDRESS,
    agendaText: config.MAIL_AGENDA_TEXT,
    signature: config.MAIL_SIGNATURE,
    optOutText: config.MAIL_OPTOUT_TEXT,
  };
}
