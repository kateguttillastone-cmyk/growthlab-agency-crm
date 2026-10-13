# 14 — Contrat entre l'interface et le serveur (qui peut quoi, par écran)

À jour au dernier lot. Chaque ligne = une route déjà **construite, testée sur la vraie base**. Rôles : **L** lecteur, **A** agent,
**R** responsable, **Adm** administrateur (chaque rôle inclut les précédents). Toute réponse d'erreur : `{ error: { code, message, details? } }`.
Schémas exacts : `packages/shared/src` (utilisés par l'API et l'interface).

## Ce qui est prêt côté serveur

| Écran | Besoin | Route | Rôle |
|---|---|---|---|
| Connexion, profil | session, mot de passe | `/auth/*` | tous |
| Tableau de bord | indicateurs, entonnoirs, périodes | `GET /dashboard` | L |
| Leads : liste | recherche, 12 filtres, tri, pagination | `GET /leads`, `GET /leads/facets` | L |
| Leads : fiche | détail, historique | `GET /leads/:id` | L |
| Leads : modifier | champ par champ, droits par rôle | `PATCH /leads/:id` | A (qualification, service, valeur, pack, responsable : R) |
| Leads : créer à la main | déduplication comme l'import | `POST /leads` → 201, ou **409 avec `details.leadId`** si le prospect existe | A (qualification/service : R) |
| Leads : actions groupées | lignes choisies (`ids`, 500 max) **ou** filtre ; simuler (`dryRun`) puis appliquer avec `expectedCount` | `POST /leads/bulk` | A (champs réservés : R) |
| Leads : export | CSV pour Excel français, 20 000 lignes max, tracé | `GET /leads/export?…filtres` | R |
| Leads : vues enregistrées | 30 par page et par personne | `GET/POST /views`, `DELETE /views/:id` | L |
| Leads : choisir un responsable | comptes actifs | `GET /users/options` | R |
| Pipeline (Kanban) | 9 colonnes, effectifs, valeur, cartes, « voir plus » | `GET /pipeline`, `GET /pipeline/:étape` | L |
| Mon profil : préférences | thème, réduire les animations, enregistrés sur le compte | `GET/PUT /auth/preferences` | L |
| Pipeline : déplacer | une étape ne recule jamais par un statut d'appel ; le déplacement manuel est libre | `PATCH /leads/:id` `{ stage }` | A |
| Appels | issue d'appel en un clic | `POST /leads/:id/call` | A |
| E-mails : relecture | aperçu, modification, validation, rejet | `POST /emails/preview`, `PATCH /leads/:id/email` | R |
| E-mails : lots | simuler, appliquer, **annuler** | `POST /emails/bulk`, `POST /emails/bulk/:lot/undo` | R |
| E-mails : adresses | contrôle avant envoi | `POST /emails/address-check` | R |
| E-mails : envoi | état, pause, reprise, test | `GET /emails/send-status`, `POST /emails/send-pause`, `POST /emails/test-send` | R / Adm |
| E-mails : envoi incertain | **remettre dans la file** ou **marquer comme envoyé** | `POST /leads/:id/email/release`, `…/mark-sent` | Adm |
| Adresses exclues | liste, recherche, motif, ajout | `GET /suppressions`, `POST /suppressions` | R |
| Réglages | signature, agenda, mention d'opposition, plafond, délai, créneaux | `GET /settings/mail`, `PUT /settings/mail` | R (lecture) / Adm |
| Import | simulation puis import du CSV | `POST /imports/airtable` | Adm |
| Utilisateurs, audit | gestion des comptes, journal | `/users`, `/audit` | Adm |

## Règles que l'interface doit respecter

- **Simuler puis confirmer** : toute action groupée (e-mails, leads) exige d'abord une simulation ; l'application renvoie **409** si l'effectif a changé.
- **Aucune suppression d'une adresse exclue** depuis l'interface (volontaire : obligation d'opposition).
- **L'annulation d'un lot** ne touche pas un e-mail modifié à la main depuis ni un e-mail parti ; la réponse donne `reverted` et `skipped`.
- **Les réglages** « sécurité » (mode d'envoi, clés, adresse d'expéditeur, adresse de test) ne se modifient jamais depuis l'interface.
- Un lead **sans étape** n'apparaît pas dans le Kanban : le tableau donne seulement `unstaged` (à classer depuis la liste).
- Un lead créé à la main a pour source « Saisie manuelle ».

## Pas encore construit (selon les maquettes)

Centre de notifications (cloche, « non lues »), relances d'e-mails (séquences), vue « Contacts », sourcing automatique (phase 5),
modification de la valeur des deals depuis le Kanban au glisser-déposer (le champ existe, l'écran à concevoir).
