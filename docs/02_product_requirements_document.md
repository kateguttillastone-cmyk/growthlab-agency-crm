# 02 — Product Requirements Document (PRD) : GAC Pilot

| | |
|---|---|
| **Version** | 1.0 — PRD rétro-documenté (état du commit `7817213`) |
| **Documents liés** | [Conception produit](01_conception_produit.md) · [Cahier des charges](03_cahier_des_charges.md) · [Architecture](04_architecture_technique_et_systeme.md) |
| **Légende de statut** | ✅ implémenté · 🟡 partiel/fragile · 📄 documenté sans code · 💡 recommandation · ❓ à confirmer (voir [01 §1](01_conception_produit.md)) |
| **Priorités** | **P0** indispensable / **P1** important / **P2** souhaitable (MoSCoW simplifié). Les priorités des exigences existantes sont celles que je propose ; elles sont à valider. |

Les références de code sans préfixe désignent `source-artifact.html` (« SA »), `site/netlify/functions/bridge.js` (« BR ») ou `build_site.py` (« BS »).

---

## 1. Rôles et permissions

| Rôle | Existence réelle | Droits constatés |
|---|---|---|
| **Utilisateur authentifié** | ✅ (mot de passe unique `APP_PASSWORD`, BR) | **Tous les droits** : lecture, édition de tout champ non « readonly », actions groupées, lancement de sourcing, consultation Brevo |
| Admin (« Kate Guttilla-Stone ») | 🟡 libellé statique (SA:415, SA:559) | Aucune différence de droits avec les autres |
| Commercial (« cold call/closing ») | 🟡 libellé statique (SA:560) | Aucune différence de droits |
| Visiteur non authentifié | ✅ | Voit uniquement l'écran de connexion ; toute requête `/api/*` sans mot de passe correct reçoit 401 |

**Règle constatée** : il n'y a pas de matrice de permissions ; la distinction Admin/Commercial n'est pas appliquée. Voir EXG-F-081 et EXG-F-082.

---

## 2. Exigences fonctionnelles par module

Format : **ID** · énoncé · priorité · statut · preuve. Les critères d'acceptation détaillés sont en §5 (liés par ID).

### 2.1 Module Accès & sécurité applicative (ACC)

| ID | Exigence | Prio | Statut | Preuve |
|---|---|---|---|---|
| EXG-F-001 | L'application affiche un écran de connexion plein écran tant que le mot de passe n'est pas validé | P0 | ✅ | BS (bloc `LOGIN`) |
| EXG-F-002 | Le mot de passe saisi est vérifié par un appel `ping` ; en cas de succès, il est mémorisé dans le navigateur pour les visites suivantes | P0 | ✅ | BS `tryPassword` |
| EXG-F-003 | Toute réponse 401 réaffiche l'écran de connexion avec le message « Session expirée » et efface le mot de passe mémorisé | P0 | ✅ (lecture) 🟡 (pas géré lors d'une écriture) | BS `start`, `openGate` |
| EXG-F-004 | Le secret du pont n8n ne doit jamais être exposé au navigateur | P0 | ✅ | BR (variables d'environnement) |
| EXG-F-005 | Le service refuse de fonctionner (HTTP 500 `config_manquante`) si `BRIDGE_SECRET` ou `APP_PASSWORD` est absent | P0 | ✅ | BR |

### 2.2 Module Dashboard (DSH)

| ID | Exigence | Prio | Statut | Preuve |
|---|---|---|---|---|
| EXG-F-010 | Afficher 6 KPI : leads sourcés, qualifiés (Chaud+Tiède, % du total), emails validés, deals gagnés (+ valeur €), en pipeline actif (% des leads), valeur pipeline (+ nombre de deals ouverts) | P0 | ✅ | SA:1172 |
| EXG-F-011 | Filtrer le dashboard par période : toute la période, 7/30/90 jours, ou plage personnalisée, selon `Date détection` ; les leads sans date valide sont exclus d'une période bornée | P1 | ✅ | SA:1075-1105 |
| EXG-F-012 | Afficher trois entonnoirs : qualification (Chaud/Tiède/Froid), secteur (6 premiers + « Non renseigné »), pipeline (étapes non vides, avec montant) | P1 | ✅ | SA:1206-1234 |
| EXG-F-013 | Lister jusqu'à 6 leads « à traiter en priorité » : qualification Chaud et validation vide ou « Pas Validé » | P1 | ✅ | SA:1236 |
| EXG-F-014 | Lister les 8 leads les plus récents (Date détection décroissante) | P2 | ✅ | SA:1248 |
| EXG-F-015 | Afficher les statistiques Brevo sur 30 jours (envois, délivrabilité, ouverture, bounces, spam, désabonnements), actualisables manuellement et automatiquement toutes les 60 s | P1 | ✅ | SA:1902-1950, BS `start` |
| EXG-F-016 | Avertir lorsque les chiffres Brevo ne sont pas filtrés par campagne (`approximatif`) | P2 | ✅ | SA:1915 |
| EXG-F-017 | Le filtre de période ne s'applique pas aux statistiques Brevo (toujours 30 jours) | — | 🟡 constat de comportement | SA:1935 |

### 2.3 Module Leads (LEA)

| ID | Exigence | Prio | Statut | Preuve |
|---|---|---|---|---|
| EXG-F-020 | Présenter les leads dans un tableau à colonne « Prospect » épinglée, avec 55 colonnes (identité, qualification, appel, enrichissement SEO/tracking/avis, email, pipeline) | P0 | ✅ | SA:581-637 |
| EXG-F-021 | Recherche plein texte sur toutes les colonnes ; filtres par qualification et secteur | P0 | ✅ | SA:1443 |
| EXG-F-022 | Tri par clic sur l'en-tête ; filtre par colonne façon Google Sheets (liste de valeurs à décocher) | P1 | ✅ | SA:823-1010 |
| EXG-F-023 | Pagination (10/20/50/100 par page), mémorisée localement | P1 | ✅ | SA:720-765 |
| EXG-F-024 | Édition en place des champs texte, nombre, liste, téléphone, URL ; enregistrement à la perte de focus ou au changement | P0 | ✅ | SA:1572-1640 |
| EXG-F-025 | Poignée de recopie : étendre la valeur d'une cellule aux cellules voisines | P2 | ✅ | SA:1774-1880 |
| EXG-F-026 | Action groupée : appliquer une valeur à une colonne éditable sur **toutes** les lignes du filtre courant (toutes pages), avec confirmation, par lots de 4 et rapport de réussite/échecs | P1 | ✅ | SA:1667-1750 |
| EXG-F-027 | « Copier pour Sheets » du tableau filtré | P2 | ✅ | SA:876 |
| EXG-F-028 | Redimensionnement des colonnes, retour à la ligne, réinitialisation des colonnes/filtres/pagination ; réglages mémorisés localement | P2 | ✅ | SA:639-672, 1881 |
| EXG-F-029 | Segmenter par service via le sous-menu : **Google Ads** (service recommandé « Google Ads » **et** taille < 50), **Création de site** (service création/refonte **et** sans site web), **Autres** (reste) | P0 | ✅ | SA:675-698 |
| EXG-F-030 | Sur le segment « Création de site », masquer les colonnes SEO/Ads/email et mettre en avant téléphone, catégorie et avis Google | P2 | ✅ | SA:700-710 |
| EXG-F-031 | Afficher la colonne « Action » (édition de mail) uniquement sur le segment Google Ads | P2 | ✅ | SA:1445 |
| EXG-F-032 | Fiche d'aperçu (👁) : indicateurs d'évaluation du prospect + liens Google Ads Transparency et Meta Ads Library calculés depuis le domaine/nom | P1 | ✅ | SA:2082-2123, 792-801 |
| EXG-F-033 | Notifier (toast) l'arrivée de nouveaux leads par rapport à la dernière visite du navigateur | P2 | ✅ | SA:1108-1128 |
| EXG-F-034 | Les champs « readonly » (enrichissement, source, persona, dates d'envoi) ne sont pas éditables | P1 | ✅ | SA:`type:'readonly'` |
| EXG-F-035 | Segmentation « Sourcing » en 4 buckets (Google Ads, SEO, Création de site, Refonte) distincts de la segmentation « Leads » en 3 buckets | P1 | ✅ | SA:675, 688 |

### 2.4 Module Sourcing & validation (SRC)

| ID | Exigence | Prio | Statut | Preuve |
|---|---|---|---|---|
| EXG-F-040 | Formulaire ICP : secteur (5 valeurs), poste (texte, défaut « CEO, Founder »), localisation (france/paris/ile-de-france), statut email (validated/all), nom de fichier (défaut `sourcing-<horodatage>`) | P1 | ✅ | SA:478-487, 2066 |
| EXG-F-041 | Le lancement transmet l'ICP au webhook n8n `search-leads` et affiche une confirmation | P1 | 🟡 : confirmation = requête acceptée, pas fin du sourcing | BR `sourcing` |
| EXG-F-042 | Liste « Résultats & validation » : par défaut leads « Pas Validé » ou vides, triés Chaud > Tiède > Froid > autres ; filtre de statut (À traiter / Tous / Pas Validé / Validé / Rejeté) | P0 | ✅ | SA:1499-1545 |
| EXG-F-043 | Quand la colonne « Validation mail » est filtrée explicitement, ce filtre prévaut sur « À traiter » | P2 | ✅ | SA:1503-1510 |
| EXG-F-044 | Modale d'édition d'email : objet, corps, validation ; onglet Aperçu « tel que le prospect le recevra » (paragraphes, agenda inséré avant la formule de politesse, signature) | P0 | ✅ | SA:1953-2080 |
| EXG-F-045 | Enregistrer l'email envoie `Email objet`, `Email corps` et `Validation mail` (liste à un élément) dans une même mise à jour | P0 | ✅ | SA:2056 |
| EXG-F-046 | Réécriture de l'email par IA à partir d'une consigne libre | P2 | 📄 disponible uniquement dans la version Claude ; **désactivée** en hébergé | BS, SA:2025 |
| EXG-F-047 | Un lead passé à « Validé » rejoint la liste Brevo « Leads validés - GAC Pilot » dans les ~10 minutes | P0 | 📄 traitement côté n8n/Brevo, non vérifiable dans le dépôt | BS (texte Paramètres) |

### 2.5 Module Pipeline (PIP)

| ID | Exigence | Prio | Statut | Preuve |
|---|---|---|---|---|
| EXG-F-050 | Kanban à 9 colonnes : Nouveau, Contacté, Répondu, RDV programmé, RDV effectué, Proposition envoyée, Négociation, Gagné, Perdu | P0 | ✅ | SA:571 |
| EXG-F-051 | N'afficher que les leads ayant une `Étape pipeline` ; chaque carte montre entreprise, contact, secteur, statut email, valeur du deal, pack | P0 | ✅ | SA:1261 |
| EXG-F-052 | Glisser-déposer une carte met à jour `Étape pipeline` ; en cas d'échec, l'écran est re-rendu à son état réel | P0 | ✅ | SA:1280, BS |
| EXG-F-053 | Correspondance automatique `STATUT` → `Étape pipeline` : NRP, REPONDEUR, A RAP, BARRAGE SECRETAIRE → Contacté ; PI → Perdu ; RDV fixé → RDV programmé ; PB NUMERO → aucune | P0 | ✅ | SA:1619 |
| EXG-F-054 | La correspondance peut **écraser** une étape plus avancée (ex. lead en « Négociation » repassant à « Contacté » si un STATUT est réédité) — comportement actuel, non gardé | — | 🟡 constat | SA:1619-1626 |
| EXG-F-055 | Édition de `Valeur deal` (numérique), `Pack` (Starter/Growth/Scale/E-commerce), `Prochaine action Kate`, `Responsable` depuis la grille | P1 | ✅ | SA:581-637 |
| EXG-F-056 | Un lead entre dans le Kanban dès qu'une étape lui est attribuée (via la grille ou STATUT) ; il n'existe pas d'action « ajouter au pipeline » dédiée | P2 | 🟡 | SA:1262 |

### 2.6 Module Demandes de contact (CTC)

| ID | Exigence | Prio | Statut |
|---|---|---|---|
| EXG-F-060 | Afficher les demandes issues du formulaire du site | P2 | 📄 écran vide : « ce flux n'est pas encore branché à un workflow n8n » (SA:547) |

### 2.7 Module Paramètres & utilisateurs (PAR)

| ID | Exigence | Prio | Statut | Preuve |
|---|---|---|---|---|
| EXG-F-070 | Afficher l'état de connexion Airtable (nombre de leads, dernière lecture, fréquence d'actualisation) | P2 | ✅ | BS (remplacement du texte) |
| EXG-F-071 | Signaler les colonnes Airtable attendues mais absentes (`Étape pipeline`, `Valeur deal`, `Pack`, `Statut appel`, `Prochaine action`, `Responsable`) | P1 | 🟡 la liste ne correspond pas aux colonnes réellement éditées (`Prochaine action Kate`, `STATUT`) | BS |
| EXG-F-072 | Refuser côté interface toute écriture vers une colonne absente d'Airtable, avec message explicite | P1 | ✅ | BS `saveLeadFields` |
| EXG-F-073 | Traduire une colonne inconnue d'Airtable (erreur `UNKNOWN_FIELD_NAME`) en erreur 422 `colonne_absente` | P1 | ✅ | BR |
| EXG-F-081 | Gérer des utilisateurs nominatifs (création, rôle, désactivation) | P1 | 💡 (liste actuelle statique, non fonctionnelle) | SA:555-562 |
| EXG-F-082 | Appliquer des permissions par rôle (ex. validation d'email réservée à l'Admin) | P1 | 💡 ❓ à arbitrer | — |

### 2.8 Exigences transverses recommandées

| ID | Exigence | Prio | Statut |
|---|---|---|---|
| EXG-F-090 | Historiser qui a modifié quoi et quand (étape, validation, valeur) | P1 | 💡 |
| EXG-F-091 | Suivre l'état d'un sourcing lancé (en attente / terminé / en erreur) et le nombre de leads produits | P1 | 💡 |
| EXG-F-092 | Création manuelle d'un lead depuis l'interface | P2 | 💡 ❓ |
| EXG-F-093 | Export CSV natif des leads filtrés (en complément de « Copier pour Sheets ») | P2 | 💡 |

---

## 3. Règles métier

| ID | Règle | Statut | Preuve |
|---|---|---|---|
| RG-01 | Étapes de pipeline autorisées : les 9 listées en EXG-F-050 (valeur vide = hors pipeline) | ✅ | SA:571 |
| RG-02 | Pipeline « actif » = toute étape renseignée hors *Gagné* et *Perdu* | ✅ | SA:1181 |
| RG-03 | « Qualifié » = Qualification *Chaud* ou *Tiède* | ✅ | SA:1177 |
| RG-04 | Un email n'est « à traiter » que si `Validation mail` est vide ou *Pas Validé* | ✅ | SA:1146, 1502 |
| RG-05 | `Validation mail` et `Statut email` sont des champs à sélection multiple côté Airtable : l'application écrit une liste d'un seul élément (ou vide) | ✅ | SA:1560, 2056 |
| RG-06 | Segment « Google Ads » (Leads) : service recommandé contenant « google ads » **et** `Taille` numérique < 50 ; sinon le lead tombe dans « Autres » | ✅ | SA:688-693 |
| RG-07 | Segment « Création de site » : service contenant « création/creation/…fonte » **et** `Site web` vide ; avec site web → bucket « Refonte » (visible seulement dans Sourcing) | ✅ | SA:675-686 |
| RG-08 | Le mot « SEO »/« référencement » dans le service recommandé classe le lead en bucket SEO (Sourcing uniquement) ; dans l'onglet Leads, SEO tombe dans « Autres » | ✅ | SA:679, 695 |
| RG-09 | La classification dépend d'une recherche textuelle libre dans `Service recommandé` (fragile : tout libellé hors mots-clés → « Autres ») | 🟡 | SA:675 |
| RG-10 | Le lien « Google Ads Transparency » est construit sur le domaine du site (sans protocole ni `www.`) ; le lien Meta utilise le nom d'entreprise ou à défaut le domaine | ✅ | SA:787-801 |
| RG-11 | Le sourcing exige uniquement les 5 champs ICP ; aucune validation de format (le champ « poste » est libre) | 🟡 | SA:2066 |
| RG-12 | L'email affiché en aperçu reproduit le gabarit n8n : l'agenda (Calendly) est inséré avant la formule de clôture (cordialement, bien à vous, à bientôt, à très vite) ou, à défaut, à la fin ; signature « Kate Guttilla STONE — Traffic Manager » | ✅ (copie à maintenir synchronisée avec n8n) | SA:1953-1977 |
| RG-13 | Un lead validé est envoyé à Brevo par l'automatisation, pas par l'application | 📄 | BS |

---

## 4. User stories

Chaque story renvoie à ses exigences et à ses critères d'acceptation (CA, §5).

| ID | En tant que… | Je veux… | Afin de… | Exigences | CA |
|---|---|---|---|---|---|
| US-01 | utilisateur | me connecter avec un mot de passe | protéger les données prospects | EXG-F-001..005 | CA-01 |
| US-02 | responsable | voir les KPI sur une période choisie | piloter l'activité | EXG-F-010..014 | CA-02 |
| US-03 | responsable | lancer un sourcing paramétré | alimenter la base | EXG-F-040, 041 | CA-03 |
| US-04 | responsable | relire et valider les emails, un par un ou en masse | éviter des envois mauvais | EXG-F-042..045 | CA-04, CA-05 |
| US-05 | commercial | appeler depuis le tableau et consigner l'issue | ne pas ressaisir dans le pipeline | EXG-F-024, 053 | CA-06 |
| US-06 | commercial | déplacer un deal dans le Kanban | refléter l'avancement | EXG-F-050..052 | CA-07 |
| US-07 | responsable | cibler par service (Google Ads, création de site…) | adapter l'argumentaire | EXG-F-029..031, 035 | CA-08 |
| US-08 | commercial | ouvrir une fiche d'évaluation et vérifier les pubs concurrentes | préparer l'appel | EXG-F-032 | CA-09 |
| US-09 | responsable | suivre la performance des emails | ajuster les messages | EXG-F-015, 016 | CA-10 |
| US-10 | responsable | traiter des lots entiers (validation, qualification) | gagner du temps | EXG-F-026 | CA-05 |
| US-11 | administrateur | être alerté si une colonne Airtable manque | ne pas perdre de saisies | EXG-F-071..073 | CA-11 |
| US-12 | responsable | gérer les demandes de contact du site | ne pas perdre d'entrants | EXG-F-060 | 💡 CA à écrire quand le flux existera |
| US-13 | administrateur | créer des utilisateurs avec des rôles | tracer et limiter les droits | EXG-F-081, 082 | 💡 CA à écrire |

---

## 5. Critères d'acceptation vérifiables

| ID | Scénario (Given / When / Then) | Vérification |
|---|---|---|
| CA-01 | **Given** un visiteur sans mot de passe valide **When** il ouvre le site **Then** seul l'écran de connexion est visible ; **When** il saisit un mot de passe erroné **Then** « Mot de passe incorrect. » s'affiche et aucune donnée n'est chargée ; **When** il appelle `/api/leads` sans en-tête `x-app-password` **Then** HTTP 401 | Manuelle + `curl` |
| CA-02 | **Given** des leads avec `Date détection` variées **When** je choisis « 7 derniers jours » **Then** les 6 KPI, 3 entonnoirs, tâches et leads récents ne comptent que les leads dans la fenêtre ; un lead sans date en est exclu | Jeu de données de test |
| CA-03 | **Given** un ICP renseigné **When** je clique « Lancer le sourcing » **Then** `POST /api/sourcing` est émis avec les 5 champs et la modale « Sourcing envoyé » s'affiche ; si n8n répond ≠ 2xx, un toast d'échec s'affiche | Réseau + mock n8n |
| CA-04 | **Given** un lead « Pas Validé » **When** j'édite l'objet/corps puis choisis « Validé » et enregistre **Then** Airtable contient les nouveaux textes et `Validation mail=["Validé"]` ; le lead disparaît de la vue « À traiter » | Airtable |
| CA-05 | **Given** un filtre retournant 57 lignes sur 3 pages **When** j'applique « Validation mail = Validé » et confirme **Then** les 57 lignes sont mises à jour (pas seulement la page), le toast final indique le nombre de réussites et d'échecs | Jeu de données de test |
| CA-06 | **Given** un lead **When** je choisis STATUT « RDV fixé » **Then** `STATUT=RDV fixé` et `Étape pipeline=RDV programmé` sont enregistrés en une seule requête ; **When** je choisis « PB NUMERO » **Then** seule `STATUT` change | Airtable |
| CA-07 | **Given** une carte en « Contacté » **When** je la dépose en « Répondu » **Then** l'étape est enregistrée ; **si** l'enregistrement échoue **Then** la carte revient à sa colonne d'origine et un toast explique l'échec | Mock d'erreur |
| CA-08 | **Given** un lead à service « Google Ads » et Taille 80 **Then** il apparaît dans « Autres » (pas « Google Ads ») dans Leads ; à Taille 20 il apparaît dans « Google Ads » | Jeu de données de test |
| CA-09 | **Given** un lead avec site `https://www.exemple.fr/page` **When** j'ouvre la fiche **Then** le lien Google Ads Transparency contient `domain=exemple.fr` | Manuelle |
| CA-10 | **Given** que n8n/Brevo répond **Then** 6 tuiles s'affichent ; **sinon** « Statistiques Brevo injoignables. » sans bloquer le reste du dashboard | Mock |
| CA-11 | **Given** une colonne absente d'Airtable **When** je modifie ce champ **Then** aucune requête d'écriture n'est émise et le toast « Non enregistré : la colonne « X » n'existe pas encore dans Airtable. » s'affiche ; si la vérification de schéma est indisponible, l'écriture est tentée et la réponse 422 `colonne_absente` est affichée | Mock schéma |

---

## 6. Exigences non fonctionnelles

| ID | Catégorie | Exigence | Prio | Statut | Constat / preuve |
|---|---|---|---|---|---|
| EXG-NF-001 | Sécurité | Authentification obligatoire sur toutes les routes `/api/*` | P0 | ✅ | BR |
| EXG-NF-002 | Sécurité | Authentification nominative, expirable, avec limitation des tentatives | P1 | 💡 | Mot de passe unique, comparaison simple, pas de limitation de débit, mot de passe stocké en clair dans `localStorage` (clé `gac_pwd`) |
| EXG-NF-003 | Sécurité | En-têtes de sécurité HTTP | P1 | 🟡 | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` présents ; pas de `Content-Security-Policy` ni HSTS explicite (`netlify.toml`) |
| EXG-NF-004 | Sécurité | Échappement des données affichées (anti-XSS) | P0 | ✅ globalement | `esc()` systématique dans les tableaux, la fiche et le Kanban ; **trous constatés** (données Airtable insérées en `innerHTML` sans `esc()`) : `renderTasks` (nom, entreprise, service — SA:1244), libellés de secteur de `funnelBar` (SA:1199-1215) et pastilles Qualification/Validation de `renderRecentLeads` (SA:1255) |
| EXG-NF-005 | Sécurité | Aucun secret dans le dépôt | P0 | ✅ | README + revue : seules des URLs (`n8n.growthlab-agency.fr`) et l'identifiant de site Netlify |
| EXG-NF-006 | Performance | Chargement complet de la base à chaque rafraîchissement (toutes les 25 s) | P1 | 🟡 | `pull()` charge **tous** les leads ; pas de pagination serveur ; `limit(1000)` du code source est ignoré par le shim |
| EXG-NF-007 | Performance | Actions groupées par lots de 4 requêtes parallèles pour rester sous la limite Airtable | P1 | ✅ | SA:1667 |
| EXG-NF-008 | Disponibilité | Dégradation gracieuse si n8n/Brevo est indisponible | P1 | 🟡 | Brevo : message dédié ; leads : bandeau d'erreur ; pas de relance ni de cache |
| EXG-NF-009 | Accessibilité | Conformité WCAG 2.1 AA / RGAA | P1 | 💡 | Aucun attribut `aria-*`, pas d'attribut `lang` sur `<html>`, interactions clavier partielles (glisser-déposer sans alternative) |
| EXG-NF-010 | Compatibilité | Fonctionnement sur navigateurs modernes ; réduction responsive | P2 | 🟡 | Règles `@media` présentes (barre latérale masquée en petit écran) ; aucun test |
| EXG-NF-011 | Maintenabilité | Source unique + build reproductible | P1 | ✅ | Build vérifié identique ; mais `build_site.py` suppose le chemin `~/gac-pilot` |
| EXG-NF-012 | Maintenabilité | Tests automatisés | P1 | 💡 | Aucun test |
| EXG-NF-013 | Observabilité | Journalisation et alerte d'erreurs | P2 | 💡 | Aucune journalisation applicative ; seuls les journaux de fonction Netlify existent par défaut ❓ |
| EXG-NF-014 | Confidentialité | Conformité RGPD des données prospects (information, droit d'opposition, conservation) | P0 | ❓ | Non traité dans le dépôt ; désinscription gérée côté Brevo (statut `Désinscrit`) |
| EXG-NF-015 | Internationalisation | Interface en français (formats `fr-FR`, euro) | P2 | ✅ | `toLocaleString('fr-FR')` |
| EXG-NF-016 | Dépendances externes | Polices Google Fonts chargées à l'exécution | P2 | 🟡 | `@import` Google Fonts (SA:5) ; impact RGPD/performance ❓ |

---

## 7. Dépendances

| Dépendance | Type | Rôle | Dans le dépôt ? |
|---|---|---|---|
| Netlify (hébergement + Functions) | Plateforme | Sert l'app et le pont `/api/*` | Config seulement (`netlify.toml`) |
| n8n (`N8N_BASE`) — webhooks `crm-bridge-list`, `crm-bridge-schema`, `crm-bridge-update`, `crm-bridge-brevo`, `search-leads` | Service interne | Intermédiaire Airtable/Brevo, sourcing | ❌ workflows absents |
| Airtable — base « Lead Pilot » | Données | Source de vérité des leads | ❌ schéma absent |
| Brevo | Emailing | Envoi, statistiques, liste « Leads validés - GAC Pilot » | ❌ |
| Outils de sourcing/scoring IA | Amont | Alimentent les colonnes enrichies, `Raison (scoring IA)`, `Service recommandé`, `Persona` | ❌ ❓ non identifiés |
| Google Fonts, Google Ads Transparency, Meta Ads Library, Calendly | Externes | Polices, liens de vérification, agenda affiché dans l'aperçu | URL dans le code |
| Python 3, `npx netlify-cli` | Outillage | Build et déploiement manuels | README |

Dépendances entre exigences : EXG-F-052 ← EXG-F-072 (garde de colonne) ; EXG-F-045 ← EXG-F-047 (validation → Brevo) ; EXG-F-053 ← EXG-F-024 ; EXG-F-029 ← RG-06/07/09.

---

## 8. Matrice de traçabilité synthétique

| Parcours ([01 §5](01_conception_produit.md)) | Exigences | Documents de réalisation |
|---|---|---|
| UC-01 | EXG-F-001..005, EXG-NF-001..002 | [04 §6](04_architecture_technique_et_systeme.md) |
| UC-02, UC-10 | EXG-F-010..017 | [04 §4](04_architecture_technique_et_systeme.md) |
| UC-03 | EXG-F-040, 041, 091 | [03 §4](03_cahier_des_charges.md) |
| UC-04, UC-05 | EXG-F-042..047, 026 | |
| UC-06..UC-09 | EXG-F-020..035, 050..056 | |
| UC-11, UC-12 | EXG-F-060, 081, 082 | |

---

## 9. Hypothèses, questions ouvertes et décisions à valider

**Hypothèses**
- H1 : les priorités P0/P1/P2 sont proposées par l'auteur de ce document.
- H2 : les valeurs de listes (qualification, STATUT, packs, étapes) reflètent exactement les options d'Airtable (non vérifiable).
- H3 : les colonnes `Date détection`, `Service recommandé`, `Taille` sont alimentées par l'automatisation amont.

**Questions ouvertes**
- Q1 : faut-il empêcher un recul d'étape par `STATUT` (EXG-F-054) ?
- Q2 : la segmentation par mots-clés (RG-09) doit-elle devenir un champ explicite d'Airtable ?
- Q3 : la limite « Taille < 50 » pour Google Ads est-elle une règle commerciale permanente ?
- Q4 : le filtre de période du dashboard doit-il aussi s'appliquer à Brevo (EXG-F-017) ?
- Q5 : quelles colonnes Airtable existent réellement aujourd'hui (EXG-F-071) ?
- Q6 : les leads provenant de sources externes (scraping, enrichissement) peuvent contenir du HTML : faut-il corriger les trous d'échappement de EXG-NF-004 en priorité ?

**Décisions à valider**
- D1 : prioriser EXG-F-081/082 (utilisateurs, rôles) vs EXG-F-060 (contacts) vs EXG-F-091 (suivi sourcing).
- D2 : valider les niveaux de priorité de ce PRD.
- D3 : trancher RGPD (EXG-NF-014) avant toute extension du volume de prospection.
