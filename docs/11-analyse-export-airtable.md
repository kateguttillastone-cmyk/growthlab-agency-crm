# 11 — Analyse de l'export Airtable (octobre 2026)

Export CSV de la table `BDD` : **1 976 lignes, 57 colonnes**, données du 14 août au 4 octobre 2026.
Ce document ne contient **que des chiffres agrégés** : aucune donnée de prospect, aucune adresse, aucun nom. Le fichier
d'origine reste hors du dépôt (`.gitignore` : `data/`, `*.csv`).

Il sert à trois choses : décider du modèle de données ([06](06-modele-donnees.md)), régler l'import
([10](10-sortie-airtable-n8n.md)) et **orienter les priorités du produit** avec ce que l'équipe a réellement fait.

## 1. Ce que contient la base

| Population | Lignes | Particularités |
|---|---|---|
| Prospects **LinkedIn Lead Finder** | 1 171 | Contact nominatif, site web, e-mail rédigé par l'IA, enrichissement SEO/technique |
| Prospects **Google Maps sans site** | 783 (+ 6 « Google Maps » avec site) | Aucune personne, seulement le standard ; tous détectés le 4 octobre ; qualification « À qualifier - Sans site web » ; file d'appel « À appeler » |
| **Pipeline Labs** | 15 | Source **absente du workflow n8n analysé** (import manuel ?) ; tous ont une adresse, 11 ont reçu un e-mail |
| Ligne vide | 1 | Ignorée |

Qualification : **Chaud 582**, Tiède 552, Froid 57, non qualifiés 784 (783 sans site + 1 « manuellement »). Effectif (champ `Taille`) : médiane **6**,
**1 057 sur 1 186** renseignés ont moins de 50 salariés ; médiane Chaud = 11, Tiède = 2, Froid = 1 500.

## 2. Ce que les données disent de l'usage réel

### 2.1 Les e-mails sont réellement partis

**665 e-mails ont été envoyés à de vrais prospects**, en 5 jours : 14/09 (19), 15/09 (162), 17/09 (72), 21/09 (288),
23/09 (124) — exactement les créneaux du workflow (lundi, mardi, jeudi, mercredi). Le nœud « TEST MODE » de n8n n'en
était donc pas un : l'ambiguïté signalée dans [03 E11](03_cahier_des_charges.md) est **tranchée par les données**.

| Résultat | Nombre | Part des envoyés |
|---|---|---|
| Délivré (sans ouverture) | 468 | 70,4 % |
| Ouvert | 139 | 20,9 % |
| **Rebond (adresse en échec)** | **47** | **7,1 %** |
| **Désinscrit** | **10** | **1,5 %** |
| Envoyé (statut non mis à jour) | 1 | 0,2 % |

- **Un taux de rebond de 7,1 % est élevé** : les fournisseurs d'envoi recommandent en général de rester nettement en
  dessous (de l'ordre de 2 %) sous peine de dégrader la réputation de l'expéditeur — seuils exacts à vérifier auprès de
  Brevo. Il est stable d'un jour à l'autre (6 à 10 % les jours de plus de 70 envois) et les 47 adresses sont toutes professionnelles : le problème est la
  **qualité des adresses** fournies par l'outil de sourcing, pas un envoi ponctuel défectueux.
- **10 personnes se sont désinscrites** : elles ne doivent plus jamais être contactées. Les 57 adresses (47 rebonds + 10
  désinscriptions) sont **importées dans la liste d'exclusion** (`suppressions`) et la phase 4 devra la respecter avant tout envoi.
- Prompts : 478 e-mails envoyés avec la version `v2-…` (ouverture 21,8 %, rebond 6,9 %), 187 sans version enregistrée (plus
  anciens), **520 rédigés avec `v4-…` mais pas encore envoyés** : c'est le stock à relire. La version du prompt est conservée
  pour comparer les résultats ; aucune conclusion sur v2 contre v4 n'est possible tant que v4 n'est pas parti.
- Sur les envoyés, « Chaud » s'ouvre à 22,1 % (rebond 8,3 %), « Tiède » à 18,8 % (5,4 %). Écart trop faible pour conclure.

### 2.2 À relire et à compléter

- **517 e-mails rédigés ne sont pas validés**, dont **363 ont une adresse destinataire** ; les ~150 autres appartiennent à des
  prospects LinkedIn **sans adresse e-mail** (151 au total) : ils sont injoignables par e-mail, mais ont un téléphone.
- 2 e-mails « Validé » n'ont pas d'adresse ; 2 « Validé » n'ont pas été envoyés.

### 2.3 Ce qui n'a jamais été utilisé

| Fonction | Lignes renseignées |
|---|---|
| Valeur du deal, Pack, Responsable, Prochaine action (Kate) | **0** |
| Étape du pipeline | 683 : **673 « Contacté »** (posé automatiquement à l'envoi) et 10 « Perdu ». Aucune autre étape |
| Suivi d'appel `STATUT` | 68 (NRP 18, PI 17, A RAP 11, REPONDEUR 10, PB NUMERO 9, BARRAGE SECRETAIRE 3) ; relances 1 et 2 : 28 |
| File d'appel « À appeler » | 783 prospects, **1** seul traité (« Pas intéressé ») |
| Coordonnées GPS | 6 |

**Conséquence pour la feuille de route** : le Kanban et la valeur des deals n'ont aucun usage réel à ce jour. Les besoins
vécus sont (1) **appeler la file de 783 prospects sans site**, (2) **relire et valider les e-mails**, (3) **fiabiliser les
adresses** et respecter les désinscriptions. [07](07-feuille-de-route.md) est réordonnée en conséquence.

## 3. Qualité des données et traitement à l'import

| Constat | Ampleur | Traitement |
|---|---|---|
| Ligne vide | 1 | Ignorée |
| Lignes en double (même contact et même entreprise) | 3 | Fusionnées |
| Même entreprise (même site), plusieurs contacts | 6 sites / 16 lignes | **Une entreprise, plusieurs contacts** (c'est la raison d'être de la séparation entreprises / contacts) |
| Même téléphone, entreprises **différentes** (standard, franchise) | 9 cas sur 17 | **Jamais fusionnées sur le seul téléphone** : clé = domaine, sinon nom + téléphone |
| `Taille` | 1 186 valeurs, toutes numériques de 1 à 355 000 | Effectif exact (entier). Le prompt et le workflow parlent de tranches (« 1-10 ») : **écart de vocabulaire** |
| `Service recommandé` | **25 formulations** de 3 services | Normalisé en `Google Ads` / `Création de site` / `Refonte de site` ; formulation d'origine conservée (type de campagne, suivi des conversions) |
| `Qualification` | 5 valeurs dont « À qualifier - Sans site web » (783) et « À qualifier manuellement » (1) | Ces deux dernières = **non qualifié** (valeur vide) |
| `Mots-clés organiques` | égal à `0` sur 767 lignes | **Ignoré** : source défaillante (mappage Semrush probable) |
| Cases à cocher (`E-commerce`, GTM, GA4, SSL…) | « checked » ou vide | Vide = « non » si le site a été mesuré, « inconnu » sinon (jamais « non » par défaut) |
| `Ville` vide alors que l'adresse existe | 652 (surtout Google Maps) | **Déduite de l'adresse** (629 villes + codes postaux) |
| `Persona` | texte JSON (`["CEO, Founder"]`) | Ignoré : c'est la requête de sourcing, pas une donnée du prospect |
| `Pays` | « Fra » / « France » | `FR` |
| Téléphones | tous au format national (`01 23 …`), 1 en `+33` | Format international `+33…` |
| Dates | `Date détection` ISO avec fuseau **-04:00** ; `Email envoyé le` jj/m/aaaa sans heure ; `Derniere validation` heure locale **sans fuseau** | Hypothèse : même fuseau que la détection (-04:00), réglable (`--tz=`). Le jour d'envoi est conservé sans heure |
| Note « Email vide suite à une panne crédit Claude (24/09) » | 180 lignes, mais 2 seulement ont réellement un e-mail vide | **178 notes obsolètes ignorées** ; les 2 vraies sont conservées |
| Texte contenant des balises HTML | 1 | Stocké tel quel, jamais interprété par l'interface (échappement) |
| Colonnes jamais utilisées | valeur du deal, pack, responsable, prochaine action Kate | Importées si présentes, sinon vides |

Deux systèmes de statut d'appel coexistent : `STATUT` / `RELANCE 1` / `RELANCE 2` (codes NRP, PI, PB NUMERO…, 68 lignes) et
`Statut appel` (« À appeler », « Pas intéressé »…, 784 lignes, jamais affiché par l'ancienne interface). Le nouveau modèle les
garde séparés : `call_status` (résultat de l'appel) et `call_state` (file d'appel).

## 4. Résultat de l'import (simulation et import réel, base jetable)

| | |
|---|---|
| Lignes lues / ignorées | 1 976 / 4 (1 vide + 3 doublons) |
| Entreprises créées | 1 963 (12 lignes rattachées à une entreprise déjà vue) |
| Contacts créés | 1 187 (2 contacts en double rapprochés) |
| Leads créés | 1 971 |
| E-mails créés | 1 187 |
| Adresses exclues (rebonds + désinscriptions) | 57 |
| Durée | ≈ 5 secondes |
| Rejeu du même fichier | **0 création** : tout est reconnu |
| Totaux contrôlés | Chaud 582, Contacté 672 (673 − 1 doublon), Délivré 468, Bounce 47, Désinscrit 10 : conformes à l'export, aux 3 doublons fusionnés près |

Temps de réponse mesurés ensuite sur ces 1 971 leads (environnement de test, pas le VPS) : liste paginée de 50 en
**4 à 12 ms**, recherche texte ≈ 7 ms, filtres combinés ≈ 4 ms, compteurs ≈ 4 ms ; 100 recherches dont 20 simultanées en 330 ms au
total. À comparer à l'ancien fonctionnement (rechargement de toute la base toutes les 25 secondes via n8n et Airtable). Ces
mesures valident le volume actuel ; elles ne disent rien d'un volume 100 fois supérieur (voir [09 §4](09-exploitation.md)).

## 5. Reproduire l'import

Le fichier reste **sur votre machine**, hors du dépôt (dossier `data/`, ignoré par Git).

```bash
# Docker seul (recommandé) : monter le dossier en lecture seule dans le conteneur de l'API
docker compose up -d postgres
docker compose run --rm -v "${PWD}/data:/data:ro" api node dist/import.js /data/export.csv --dry-run   # simulation
docker compose run --rm -v "${PWD}/data:/data:ro" api node dist/import.js /data/export.csv             # import réel
```

Sous PowerShell, `${PWD}` fonctionne ; sous l'invite de commandes classique, utilisez `%cd%`.
Avec Node installé : `pnpm --filter @gac/api import:airtable /chemin/export.csv --dry-run`.
Options : `--dry-run` (rien n'est écrit, le rapport est calculé), `--tz=-04:00` (fuseau des dates sans fuseau).
Rejouable sans risque : les données déjà présentes ne sont **jamais écrasées** (l'application fait foi après l'import).

## 6. Hypothèses, questions ouvertes et décisions

**Hypothèses**
- H1 : l'export est complet (la vue « Grid view 2 » n'est pas filtrée). Le nombre de lignes (1 976) est à rapprocher de celui d'Airtable.
- H2 : les dates sans fuseau (`Derniere validation`) sont dans le fuseau de la base (-04:00).
- H3 : les 665 statuts d'envoi ont été écrits en retour par un autre workflow n8n (absent de ceux analysés) à partir de Brevo.

**Questions ouvertes**
- Q1 : qui est « Pipeline Labs », et d'où viennent ces 15 prospects ?
- Q2 : les 47 rebonds ont-ils été traités dans Brevo (liste noire) ? A-t-on observé un avertissement ou une limitation de Brevo ?
- Q3 : l'équipe d'appel travaille-t-elle ailleurs (tableur, téléphone) ? Seuls 68 appels sont consignés sur 783 prospects à appeler.
- Q4 : la vérification des adresses avant envoi doit-elle devenir une étape obligatoire (phase 4) ?
- Q5 : conserve-t-on la valeur du deal / le pack / le responsable (aucun usage à ce jour) ou les met-on en veille ?

**Décisions prises dans le code (modifiables)**
- D1 : un statut d'appel ne fait jamais reculer l'étape du pipeline (`nextStageForCallStatus`).
- D2 : tous les commerciaux voient tous les leads ; le serveur limite les champs modifiables par rôle (`LEAD_FIELD_MIN_ROLE`).
- D3 : les adresses rebond / désinscrites sont exclues dès l'import.
