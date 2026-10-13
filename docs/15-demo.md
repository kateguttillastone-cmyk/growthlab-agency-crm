# Données de démonstration et scénario de présentation

## 1. Charger les données (environnement de test uniquement)

Les entreprises, noms et textes sont **entièrement fictifs**. Seuls les e-mails et numéros viennent de la ligne de commande :
on met les siens, donc aucun message ni appel ne peut atteindre un tiers. **Les coordonnées ne sont jamais écrites dans le dépôt.**

Chaque adresse est déclinée en `nom+étiquette@domaine` (ex. `boite+lumiere@gmail.com`) : toutes arrivent dans la même boîte, et
les adresses restent distinctes (une adresse ne peut appartenir qu'à un contact). Les numéros sont convertis au format
international : `06…` → `+33…`, `03[2-4789]…` (Madagascar) → `+261…`.

Sur le serveur (après un déploiement de `dev`, pour que l'image contienne l'outil) :

```bash
cd ~/growthlab-dev
docker compose -p growthlab-dev -f docker-compose.prod.yml --env-file .env.dev run --rm \
  -e DEMO_ALLOW_RESET=1 api node dist/demo.js --reset --confirm-reset \
  --emails=adresse1@exemple.fr,adresse2@exemple.fr --phones=0600000000,0700000000
```

- `--reset --confirm-reset` **vide** leads, entreprises, contacts, e-mails, exclusions et vues enregistrées avant de charger
  (les comptes, les réglages et le journal d'audit sont conservés). Sans `--reset`, l'outil refuse de toucher une base non vide.
- `DEMO_ALLOW_RESET=1` est une seconde sécurité : **ne jamais l'utiliser en production**.
- Contenu : 26 leads, 20 e-mails, 3 adresses exclues, répartis sur 9 étapes, avec historique d'étapes sur 40 jours.

En local : `DATABASE_URL=… pnpm --filter @gac/api demo:seed --emails=… --phones=…`.

## 2. Scénario de démonstration (≈ 15 minutes)

Connexion en administrateur. L'envoi réel reste désactivé (`SEND_MODE=off`) : rien ne part pendant la démo.

1. **Thème et animations** *(1 min)* : l'icône en haut à droite bascule clair / sombre / système ; la fiche d'un lead arrive de la
   droite. Dans *Mon profil → Affichage*, « Réduire les animations » remplace les glissements par des fondus.
2. **Tableau de bord** *(2 min)* : 26 leads, 15 qualifiés, 11 e-mails validés, 16 à appeler, 1 deal gagné (1 800 €), pipeline actif.
   Les blocs « À traiter en priorité » et « Derniers leads » mènent aux fiches.
3. **Appels** *(2 min, idéalement sur téléphone)* : le numéro en grand lance l'appel ; choisir une issue (« Ne répond pas »,
   « À rappeler », « RDV fixé »…) affiche aussitôt le prospect suivant. Montrer l'onglet « À rappeler » et le filtre par ville.
4. **Pipeline** *(2 min)* : les 9 colonnes avec nombres et valeurs. « Déplacer vers… » sur une carte (clavier ou mobile) ; la carte se
   pose dans la nouvelle colonne. Filtrer par qualification ou responsable ; « Voir plus ».
5. **Leads** *(3 min)* : filtres et vues rapides ; **enregistrer une vue** ; cocher des lignes → **Actions groupées** (changer l'étape ou
   le responsable) : *Simuler* puis *Confirmer* ; **Exporter en CSV** ; **Nouveau lead** (création manuelle, anti-doublon : recréer
   « Atelier Lumière Électricité » renvoie vers la fiche existante).
6. **E-mails** *(3 min)* : file « À relire » (6 e-mails) ; ouvrir *Cabinet Dentaire Sourire* → aperçu fidèle, points d'attention, valider
   et passer au suivant. *Immobilier Horizon* : adresse jetable → validation bloquée. *Traiteur Saveurs* : adresse exclue → bloquée.
   **Validation groupée** : simuler, confirmer, puis **Annuler ce lot**. *Serrurerie Rapide* : envoi incertain → « Non parti : le remettre
   dans la file » / « Bien parti : le marquer comme envoyé ».
7. **Adresses exclues** *(1 min)* : 3 motifs (désinscription, rebond, manuelle) ; ajouter une exclusion ; aucune suppression possible.
8. **Réglages** *(1 min)* : texte des e-mails, plafond, créneaux ; les paramètres sensibles (clé Brevo, expéditeur, mode) restent sur
   le serveur.

Le scénario Brevo réel (envoi de test vers sa propre boîte) se fait ensuite avec `docs/12-envoi-brevo.md`, jamais pendant la démo.
