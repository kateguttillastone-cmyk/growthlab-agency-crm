# 12 — Envoi planifié des e-mails par Brevo (lot 4c)

| | |
|---|---|
| **Statut** | Implémenté, **désactivé par défaut** (`SEND_MODE=off`). Testé avec un faux fournisseur : aucun test n'envoie de vrai e-mail. |
| **Pas encore vérifié** | L'appel réel à l'API Brevo et la réception réelle des webhooks n'ont pas pu être essayés ici (pas de clé ni d'accès). Procédure de première mise en service : §5. |

## 1. Principes de sécurité

1. **Rien ne part sans action explicite** : `SEND_MODE=off` par défaut ; le mode `prod` refuse de démarrer s'il manque la clé,
   les secrets, l'adresse de test ou l'expéditeur (jamais pris par défaut), ou si `APP_ORIGIN` n'est pas en https.
2. **La clé Brevo n'est jamais dans le dépôt ni dans une conversation** : variable d'environnement du serveur uniquement.
   Elle n'apparaît ni dans les journaux, ni dans les réponses de l'API, ni dans les erreurs.
3. **Un e-mail ne part jamais deux fois** : il est *réservé* en base (`sending_at`, atomique, `SKIP LOCKED`) avant tout appel
   à Brevo. En cas de résultat incertain (délai dépassé, coupure), la réservation reste : **aucun renvoi automatique**. Une
   personne vérifie dans Brevo, puis libère l'envoi si, et seulement si, il n'est pas parti.
4. **Ne part que ce qui a été relu** : validé par une personne, adresse contrôlée « valide » (lot 4b), adresse absente de
   `suppressions`, objet et corps non vides.
5. **Rythme maîtrisé** : créneaux (heure de Paris, été/hiver gérés), un envoi toutes les 45 s, plafond quotidien (50 au début).
6. **Désinscription** : mention d'opposition en pied de chaque e-mail, en-têtes `List-Unsubscribe` (mailto + lien signé, un clic),
   exclusion immédiate et définitive ; un simple affichage du lien n'exclut personne (les antivirus de messagerie suivent les liens).

## 2. Fonctionnement

- Une boucle interne (toutes les 15 s) appelle `sendTick` : mode `prod`, pas en pause, créneau ouvert, plafond du jour, délai
  depuis le dernier envoi, puis réservation et envoi d'**un seul** e-mail. Les garde-fous et la réservation sont dans une
  transaction sérialisée : plusieurs exécutions simultanées ne dépassent ni le délai ni le plafond.
- Ordre : prospects « Chaud » d'abord, puis par date de validation.
- Refus définitif de Brevo (4xx) : compté ; après 3 refus l'e-mail n'est plus tenté. Limite ou panne (429, 5xx) : non compté, réessayé.
- Retours Brevo (webhook `POST /webhooks/brevo/<jeton>`) : `delivered` → Délivré, `opened`/`click` → Ouvert, `hard_bounce`,
  `invalid_email`, `blocked` → Bounce + exclusion, `spam` → exclusion (plainte), `unsubscribed` → Désinscrit + exclusion. Un statut ne
  recule jamais ; un rebond temporaire est ignoré ; rejouer un évènement ne change rien.
- Exclusion manuelle (`POST /suppressions`, responsables) : réponse « stop » reçue, demande orale. Un e-mail validé non envoyé
  vers cette adresse repart en relecture.
- Le jeton du webhook et ceux de désinscription sont masqués dans les journaux.

## 3. Écrans

Page **E-mails** : carte « Envoi planifié » (état, expéditeur, envoyés aujourd'hui / plafond, prêts, bloqués, prochain créneau,
envois à vérifier), bouton **Pause / Reprendre** (administrateurs), **« M'envoyer un test »** sur un e-mail validé (envoyé à
`SEND_TEST_RECIPIENT`, jamais au prospect, objet préfixé `[TEST]`, rien n'est marqué envoyé), et sur la fiche un bandeau
« Envoi à vérifier » avec **« Non parti : le remettre dans la file »** (administrateurs).

## 4. Configuration (variables d'environnement du serveur)

| Variable | Rôle | Défaut |
|---|---|---|
| `SEND_MODE` | `off` ou `prod` | `off` |
| `BREVO_API_KEY` | clé API Brevo | — (obligatoire en `prod`) |
| `BREVO_WEBHOOK_SECRET` | jeton secret de l'adresse du webhook (≥ 24 car.) | — (obligatoire en `prod`) |
| `UNSUBSCRIBE_SECRET` | signature des liens de désinscription (≥ 32 car.) | — (obligatoire en `prod`) |
| `SEND_TEST_RECIPIENT` | adresse qui reçoit les tests | — (obligatoire en `prod`) |
| `MAIL_FROM_ADDRESS` / `MAIL_FROM_NAME` | expéditeur (adresse **vérifiée chez Brevo**) | adresse obligatoire en `prod` |
| `MAIL_OPTOUT_TEXT` | mention d'opposition | texte « répondez stop… » |
| `SEND_DAILY_CAP` | envois par jour (heure de Paris) | 50 |
| `SEND_INTERVAL_SECONDS` | délai minimal entre deux envois | 45 |
| `SEND_SLOTS` | `jour@HH:MM,…` (heure de Paris) | `mon@14:00,tue@09:00,wed@09:00,thu@09:00` |
| `SEND_WINDOW_MINUTES` | durée d'ouverture d'un créneau | 120 |

Générer les secrets : `openssl rand -hex 24` (webhook), `openssl rand -hex 32` (désinscription).

## 5. Première mise en service (à suivre dans l'ordre)

1. **Brevo** : vérifier l'expéditeur (adresse ou domaine, SPF/DKIM/DMARC du domaine) ; créer la clé API.
2. **Serveur** : renseigner les variables du §4 avec `SEND_MODE=off`, redéployer.
3. **Test réel** : valider un e-mail, cliquer **« M'envoyer un test »**, vérifier la réception, l'agenda, la signature, la mention
   d'opposition, le rendu mobile, et que le message n'arrive pas en courrier indésirable.
4. **Webhook** : dans Brevo (Transactionnel → Webhooks), URL `https://<domaine>/api/webhooks/brevo/<BREVO_WEBHOOK_SECRET>`, évènements
   `delivered`, `opened`, `click`, `hard_bounce`, `invalid_email`, `blocked`, `spam`, `unsubscribed`. Envoyer un évènement d'essai.
5. **Chaîne n8n** : **désactiver** l'envoi de l'ancienne chaîne avant de passer en `prod` (jamais les deux ensemble : doublons).
6. **Passage en production** : `SEND_MODE=prod`, plafond bas (20–50), surveiller 3 à 5 jours : rebonds < 2 %, plaintes ≈ 0, puis
   augmenter le plafond progressivement. En cas de doute : **Pause** dans l'interface (effet immédiat) ou `SEND_MODE=off`.

## 6. Limites assumées

- Une seule instance de l'API envoie ; plusieurs instances restent sûres (réservation atomique) mais n'ont jamais été essayées.
- Le contrôle d'adresse (lot 4b) écarte les cas certains ; les rebonds réels sont traités par les webhooks.
- Pas de relances automatiques (séquences) : `email_messages.sequence_no` les prépare.
- Les statistiques Brevo en direct (EXG-F-015) ne sont pas reprises : les compteurs viennent de la base (statuts reçus par webhook).
