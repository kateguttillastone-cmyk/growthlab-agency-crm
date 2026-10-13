# Audit UX/UI de GAC Pilot : constats, écarts avec la maquette, priorités

*Audit réalisé le 13/10/2026 sur la version déployée sur `dev` (branche à jour), avec les données de démonstration (`docs/15-demo.md`). Aucun code n'a été modifié.*

## 1. Méthode et limites

- **Parcours réel** de toutes les pages dans Chromium : ordinateur 1440 × 900, mobile 390 × 844 (écran tactile), tablette 820 × 1180 pour les mesures ; thèmes clair (référence) et sombre (3 pages).
  36 captures dans [`captures/`](captures/) (préfixes `d-` ordinateur, `m-` mobile, `s-` sombre).
- **Mesures automatiques** sur les 13 pages et 3 largeurs : débordement horizontal de la page, zones tactiles < 40 px, textes < 12 px
  ([`metriques-brutes.txt`](metriques-brutes.txt)).
- **Comparaison avec la maquette** (canevas « GAC Pilot — Système de design », version `1791782504-a075`, 50 fichiers) : lecture du texte de
  chaque planche (description de l'écran, composants, états). Je n'ai pas pu afficher les planches elles-mêmes dans un navigateur
  (réseau fermé) : la comparaison porte sur **ce que la maquette décrit**, pas sur un côte-à-côte au pixel près.
- **Pas audité** : l'écran Import après simulation (rapport) et les états d'erreur de connexion, faute de fichier de test ; le contraste
  des couleurs (le canevas le documente déjà dans la planche « Contrastes vérifiés ») ; le lecteur d'écran.

### Légende
- **Type** : **ÉCART** = la maquette le prévoit, l'application ne le fait pas (oubli d'intégration) ·
  **CONCEPTION** = la maquette ne le prévoit pas ou le prévoit mal · **ANOMALIE** = défaut technique visible (pas un choix de design) ·
  **NOUVEAU** = fonction ajoutée depuis la maquette (IA, sourcing…), jamais dessinée.
- **Priorité** : **P1** empêche ou ralentit fortement un travail quotidien, ou risque d'erreur grave · **P2** gêne réelle, contournable ·
  **P3** confort / cohérence.

## 2. Synthèse

| Type | P1 | P2 | P3 | Total |
|---|---|---|---|---|
| ÉCART (oubli d'intégration) | 9 | 15 | 3 | 27 |
| CONCEPTION | 1 | 11 | 17 | 29 |
| ANOMALIE (défaut technique) | 2 | 0 | 0 | 2 |
| NOUVEAU (à dessiner) | 0 | 3 | 0 | 3 |
| **Total** | **12** | **29** | **20** | **61** |

*Deux constats cumulent un écart et une anomalie technique (L-3 sur mobile, A-2) : ils sont comptés une fois, comme écart. La liste des anomalies à corriger sans attendre
la maquette est au §7.*

**Les 8 points qui coûtent le plus à l'usage** (détail au §4) :

1. **Appels mobile : les issues d'appel sont sous le pli** (A-2) : la maquette promettait « tout tient dans un écran sans défiler ».
2. **Appels ordinateur : ni raccourcis clavier ni file à venir** (A-1) : la maquette prévoyait 1 à 7 et P pour enchaîner vingt appels sans souris.
3. **Pipeline : toute la page défile horizontalement** (PL-1) : la barre latérale disparaît et les dernières colonnes sont atteintes à tâtons.
4. **Leads : les 9 filtres sont toujours ouverts**, le tableau commence à 520 px (L-1), et **les actions groupées sont inutilisables sur mobile** (L-3).
5. **Leads : la fiche mélange sélecteurs à effet immédiat et boutons « Enregistrer » épars** (L-7) : on ne sait pas ce qui est enregistré.
6. **E-mails mobile : la page déborde et la liste précède l'éditeur** (E-1, E-2) : on choisit un e-mail et rien ne bouge à l'écran.
7. **Réglages : les créneaux d'envoi se saisissent en code** (`mon@14:00,tue@09:00`) (R-1) : une faute de frappe change l'envoi de milliers d'e-mails.
8. **Utilisateurs mobile : les actions (réinitialiser, désactiver) sont hors écran** (U-3).

## 3. Ce qui fonctionne bien (à conserver)

- **Identité** : violet et blanc, barre latérale sombre, typographie et pastilles de statut ; cohérents sur toutes les pages (`d-02`, `d-04`).
- **Appels** : un seul prospect, le numéro en grand bouton, une note facultative (`d-08`) : la logique est juste.
- **E-mails** : relecture avec **aperçu fidèle côte à côte** (`d-10`), avertissements en clair (objet trop long), adresse exclue ou jetable visible dès la liste.
- **Sourcing** : formulaire court, simulation lisible, tableau des exécutions avec état, coût et erreur (`d-12`).
- **Responsive de base** : liste de leads en cartes sur mobile, filtres repliables, barre de navigation basse (`m-04`, `m-12`).
- **Accessibilité de fond** : libellés, légendes de tableaux, annonces d'état (le travail n'est pas à refaire, seulement à compléter).

## 4. Constats détaillés

### 4.0 Transversal

| ID | Constat | Impact concret | Prio | Type | Capture |
|---|---|---|---|---|---|
| T-1 | **Un bouton de thème isolé** occupe une ligne vide (≈ 60 px) en haut de **chaque** page, au-dessus du titre. | Chaque écran perd une ligne ; sur mobile, le titre démarre sous le pli d'un bandeau vide. | P3 | CONCEPTION (ajout hors maquette) | toutes, p. ex. `d-02`, `m-02` |
| T-2 | **Statuts affichés tantôt en pastille, tantôt en texte brut** : *Étape* et *Appel* en texte (`A RAP`, `BARRAGE SECRETAIRE`, `RDV fixé`), *E-mail* mélange pastilles (Envoyé, Bounce) et petit texte (Pas Validé, Validé, Rejeté). | On ne repère pas d'un coup d'œil l'état d'un lead ; les libellés techniques d'appel ne sont pas traduits. | P2 | ÉCART (planche « Étiquettes de statut ») | `d-04` |
| T-3 | **Téléphones à deux formats** : `06 12 34 56 78` mais `+261345125754` brut pour un numéro non français. | Numéro illisible, difficile à dicter ; aspect « cassé » alors que la donnée est valide. | P2 | CONCEPTION | `d-04`, `d-03` |
| T-4 | **Texte très petit** : 69 à 86 éléments de moins de 12 px sur Leads, 35 à 41 sur le journal d'audit. | Contact, dates et libellés secondaires difficiles à lire, surtout sur mobile. | P2 | CONCEPTION | `d-04`, `d-17` |
| T-5 | **Zones tactiles trop petites** : 62 éléments < 40 px sur Leads (liens téléphone, selects), 12 à 15 sur Tableau de bord/Pipeline mobile. | Erreurs de toucher sur téléphone, surtout pour appeler ou déplacer une carte. | P2 | CONCEPTION | `m-03`, `m-04` |
| T-6 | **Boutons principaux désactivés presque invisibles** (« Créer le lead », « Enregistrer », « Exclure cette adresse »), sans dire ce qui manque. | On croit la page cassée ; on ne sait pas quel champ remplir. | P2 | CONCEPTION | `d-07`, `d-13`, `d-14` |
| T-7 | **Éléments natifs non habillés** : sélecteur de fichier en anglais (« Choose File / No file chosen »), cases et boutons radio du navigateur, bloc « Options » natif. | Rupture visuelle ; texte anglais dans une application française. | P2 | CONCEPTION | `d-16`, `d-05` |
| T-8 | **Largeur de contenu incohérente** : certains écrans sont pleine largeur (tableaux), d'autres plafonnés à ≈ 770 px et alignés à gauche, laissant la moitié droite vide (Sourcing, Réglages, Nouveau lead, Adresses exclues). | Impression d'écrans de natures différentes ; zone morte sur grand écran. | P3 | CONCEPTION | `d-12`, `d-14`, `d-07`, `d-13` |
| T-9 | **Pagination minimale** (Précédent / Suivant) sans numéros ni choix de taille. | Aller à une page précise demande de cliquer à répétition. | P3 | CONCEPTION | `d-04`, `d-15`, `d-17` |
| T-10 | **Libellés de rôle différents de la documentation** (« Commercial » pour `AGENT`, « Lecture seule » pour `VIEWER`) sans glossaire. | Confusion à l'attribution des droits. | P3 | CONCEPTION | `d-15` |

### 4.1 Tableau de bord (`d-02`, `m-02`)

| ID | Constat | Impact | Prio | Type |
|---|---|---|---|---|
| D-1 | **Les six indicateurs ne sont pas cliquables.** La maquette : « chacun ouvre la liste filtrée ». | On lit « 16 à appeler » mais il faut retrouver soi-même la liste. | P2 | ÉCART |
| D-2 | Le bloc **Secteurs** est dominé par « Autres : 19 » sur 26. | Le graphique n'apprend rien ; pas de « voir tout ». | P3 | CONCEPTION |
| D-3 | Les trois cartes d'entonnoir ont la même hauteur : la carte Qualification est à moitié vide. | Grand vide, hiérarchie floue. | P3 | CONCEPTION |
| D-4 | Sous-textes coupés ou mal accordés (« 1 RDV programmés », « 88 % des leads · 7100 € (3 deals) » sur deux lignes). | Lecture hachée. | P3 | CONCEPTION |
| D-5 | Aucun raccourci d'action (Nouveau lead, Sourcing, E-mails à relire) ; seul le sélecteur de période. | Le tableau de bord informe mais n'oriente pas. | P3 | CONCEPTION |

### 4.2 Pipeline (`d-03`, `m-03`, `s-03`)

| ID | Constat | Impact | Prio | Type |
|---|---|---|---|---|
| PL-1 | **La page entière défile horizontalement** : mesure 1 261 px de trop sur ordinateur, 1 881 px sur tablette (le défilement devrait être limité à la zone des colonnes). | La barre latérale et l'en-tête partent avec le défilement ; on perd ses repères pour atteindre « Gagné » et « Perdu ». | **P1** | ANOMALIE |
| PL-2 | **Pas de glisser-déposer ni de déplacement au clavier** (poignée, Espace, flèches, Entrée) ; chaque carte porte un menu « Déplacer vers… ». La maquette décrit aussi une **rangée de raccourcis** menant à une étape. | Un menu déroulant par carte : 15 cartes = 15 menus identiques ; déplacer demande deux gestes. | **P1** | ÉCART |
| PL-3 | Une colonne très remplie s'allonge sans limite (« Nouveau » : 15 cartes ≈ 2 000 px) alors que les autres sont presque vides ; pas de défilement propre à la colonne. | On ne voit jamais le tableau d'ensemble sur un écran. | P2 | CONCEPTION |
| PL-4 | Le **responsable** (« Administrateur ») est répété sur chaque carte ; la qualification est une pastille en pointillé. | Du bruit sans information ; pastilles incohérentes avec la liste des leads (pleines). | P3 | CONCEPTION |
| PL-5 | Mobile : le sélecteur « Étape affichée » double le titre de colonne ; chaque carte garde son menu. | Répétition ; les cartes sont hautes. | P3 | CONCEPTION |

### 4.3 Leads (`d-04`, `d-05`, `d-06`, `m-04`, `m-05`, `m-06`)

| ID | Constat | Impact | Prio | Type |
|---|---|---|---|---|
| L-1 | **Neuf filtres toujours ouverts** sur trois rangées (dont « Envoi e-mail » seul sur sa ligne). La maquette : quatre filtres visibles et « Plus de filtres N ». | Le tableau commence à 520 px de haut : sur un portable, on voit trois lignes de leads. | **P1** | ÉCART |
| L-2 | **Vues enregistrées : un formulaire permanent** (« Enregistrer ces critères sous le nom ») au-dessus des filtres. La maquette : un menu « Vues enregistrées… » et un bouton « Enregistrer cette vue ». | Une ligne et un champ à vide en permanence pour une action rare ; les vues existantes ne sont pas mises en avant. | P2 | ÉCART |
| L-3 | **Actions groupées** : un bouton ouvre un panneau séparé qui **repousse** le tableau ; la sélection se fait ensuite par cases ; la simulation ne liste pas les leads touchés. La maquette : une barre qui **apparaît à la sélection**, des actions par menu (Qualification…, Responsable…, Étape…), « Exporter la sélection », et une simulation qui nomme les leads (« Boulangerie Dupont (Tiède) »). **Sur mobile, les cartes n'ont pas de case** : sélection impossible. | Action risquée (modifier des dizaines de leads) peu lisible ; **inutilisable sur téléphone**. | **P1** | ÉCART + ANOMALIE |
| L-4 | **En-tête du tableau non collant** (maquette : collant), dix colonnes serrées. | À partir de la quinzième ligne, on ne sait plus quelle colonne est laquelle. | P2 | ÉCART |
| L-5 | **Seul le nom ouvre la fiche**, alors que le numéro de téléphone de la même ligne est un lien d'appel. | Cliquer « sur la ligne » ouvre rien ou, pire, lance un appel involontaire. | P2 | CONCEPTION |
| L-6 | La **colonne E-mail** mélange pastilles (envoi) et petit texte (validation) pour deux notions différentes. | On confond « validé » et « envoyé ». | P2 | CONCEPTION |
| L-7 | **Fiche latérale** : les champs à liste (qualification, service, étape, appels, relances) **s'enregistrent dès qu'on change la valeur, sans retour visible** (vérifié dans le code), mais « Commentaire » et « Prochaine action » ont chacun leur bouton « Enregistrer » ; aucune zone d'actions en tête (appeler, e-mail, qualifier par IA) ; l'e-mail et l'historique sont tout en bas. | On ne sait pas ce qui est déjà enregistré ; risque de perdre une note en fermant la fiche ; l'action principale n'est pas là où on la cherche. | **P1** | CONCEPTION |
| L-8 | **Mobile** : trois boutons d'en-tête sur deux lignes, puis le formulaire de vue enregistrée, avant la première carte (330 px). La maquette met les filtres dans une feuille. | Peu de leads visibles au premier écran. | P2 | ÉCART |
| L-9 | **Mobile, fiche** : libellés à gauche et sélecteurs étroits à droite, sur deux colonnes de 160 px. | Valeurs tronquées, appui difficile. | P3 | CONCEPTION |

### 4.4 Appels (`d-08`, `m-07`)

| ID | Constat | Impact | Prio | Type |
|---|---|---|---|---|
| A-1 | **Ordinateur** : la carte occupe toute la largeur (bouton du numéro de 1 090 px, note géante) ; **pas de raccourcis clavier** (la maquette : 1 à 7 et P ; le composant `.kbd` existe dans le système) ; **pas de file à venir** sous le prospect ; issues non fixées à droite. | Vingt appels à la suite exigent vingt déplacements de souris ; on ne voit pas qui suit. | **P1** | ÉCART |
| A-2 | **Mobile** : la zone de note (≈ 100 px) et les en-têtes poussent les issues sous le pli ; la barre de navigation fixe masque la première rangée de boutons. La maquette : « tout tient dans un écran sans défiler ». | Pour chaque appel il faut défiler, puis revenir en haut pour le suivant. | **P1** | ÉCART |
| A-3 | **Les huit issues ont le même poids**, sauf « RDV fixé ». « Pas intéressé » (le lead est perdu) ressemble à « Répondeur » ; **pas d'annulation** (la maquette : 5 secondes, avec barre de temps). | Un toucher involontaire classe définitivement un prospect. | **P1** | ÉCART (annulation aussi absente côté serveur) |
| A-4 | Les filtres Ville / Qualification sont deux champs pleins sur mobile (maquette : feuille de filtres) ; le compteur « 16 dans la file » ne montre pas les suivants. | Moins d'espace pour le prospect ; pas de visibilité sur la file. | P3 | ÉCART |

### 4.5 E-mails (`d-09`, `d-10`, `m-08`, `m-09`, `s-02`)

| ID | Constat | Impact | Prio | Type |
|---|---|---|---|---|
| E-1 | **Mobile : la page est plus large que l'écran** (155 px de débordement ; 43 px sur tablette). | Balayage horizontal involontaire ; contenu coupé. | **P1** | ANOMALIE |
| E-2 | **Mobile : la liste complète précède l'éditeur.** Choisir un e-mail n'amène pas à l'éditeur, qui est sous la liste. La maquette : « relecture en deux temps » (liste, puis écran plein avec retour, Aperçu / Modifier, actions fixées en bas). | On touche un e-mail, l'écran ne change pas : l'utilisateur croit que rien ne s'est passé. | **P1** | ÉCART |
| E-3 | **Ordinateur** : au chargement, aucun e-mail n'est sélectionné et le panneau de droite n'est qu'une petite carte « Choisissez un e-mail » (`d-09`). | Une moitié d'écran vide au début de chaque session. | P2 | CONCEPTION |
| E-4 | L'éditeur et l'aperçu se partagent deux colonnes étroites : l'**objet est tronqué** (« … plus de demandes pa ») ; les trois actions (Valider, Enregistrer, Rejeter) **ne sont pas fixées en bas** du panneau (maquette : fixées). | On relit l'objet sans le voir en entier ; sur un long e-mail il faut défiler pour valider. | P2 | ÉCART |
| E-5 | **Quatre panneaux administratifs empilés sous la tâche** (Envoi planifié, Fiabilité des adresses, Validation groupée, Résultats par version). « Envoi planifié » écarte libellés et valeurs de 520 px. La maquette : l'état d'envoi tient en une ligne en haut ; le détail est en bas. | La page fait 2 100 px de haut ; l'état d'envoi, important, est enterré ; lecture difficile des couples libellé/valeur. | P2 | ÉCART (partiel) |
| E-6 | Sept cartes de chiffres sans action ; les onglets n'ont pas de libellé alors que les filtres voisins en ont, d'où un alignement irrégulier. | Les chiffres ne mènent nulle part ; barre d'outils confuse. | P3 | CONCEPTION |
| E-7 | **Chaque ligne de la file répète le nom de l'entreprise** (l'objet commence par le nom). | Une ligne d'information perdue par e-mail ; on ne voit pas l'état utile (qualité de l'adresse, version du prompt). | P3 | CONCEPTION |
| E-8 | Bandeau d'« envoi à vérifier » (envoi au résultat inconnu) : le texte est long, les deux boutons sont de même poids ; la conséquence de chaque choix n'est pas expliquée. | Choix délicat (renvoyer ou non un e-mail) pris sans repère. | P2 | CONCEPTION |
| E-9 | **Nouveau (IA)** : boutons « Qualifier et rédiger l'e-mail » et « Réécrire » sans état de chargement détaillé, sans message de quota atteint ni d'erreur dessinés. | À l'usage, on ne sait pas si l'IA travaille (≈ 10 s), a échoué ou a atteint son plafond. | P2 | NOUVEAU |

### 4.6 Sourcing (`d-12`, `m-10`)

| ID | Constat | Impact | Prio | Type |
|---|---|---|---|---|
| S-1 | Le **même bandeau turquoise** sert à l'avertissement (« sourcing désactivé ») et au résultat de la simulation. | Une alerte et une information qui se ressemblent. | P2 | CONCEPTION |
| S-2 | Le **titre « Nouvelle recherche » est collé aux libellés** ; la simulation est trois phrases sans hiérarchie ; « ≤ 0,20 € » se coupe sur deux lignes. | Lecture dense pour une décision qui engage un coût. | P3 | CONCEPTION |
| S-3 | **Progression** affichée en pastille « En cours · 62 % » sans barre ; erreur du fournisseur citée telle quelle (« Apify a répondu 402 »). | Message technique pour des utilisateurs métier ; progression peu visible. | P3 | CONCEPTION |
| S-4 | « Voir les leads » filtre par la **source** (texte), pas par la recherche. | Les leads de deux recherches successives se mélangent. | P3 | CONCEPTION (aussi côté données) |
| S-5 | Les **nouveautés du sourcing** (source LinkedIn, qualification automatique, signaux du site) n'ont **aucun état dessiné** : fin de recherche avec qualification en cours, annulation, plafond atteint. | À l'usage on ne sait pas si la qualification des leads trouvés est terminée. | P2 | NOUVEAU |

### 4.7 Réglages (`d-14`, `m-11`)

| ID | Constat | Impact | Prio | Type |
|---|---|---|---|---|
| R-1 | **Créneaux d'envoi saisis en code** : `mon@14:00,tue@09:00,wed@09:00,thu@09:00`. La maquette : tableau jour par jour (heure de début + durée). | Une faute de frappe décale ou bloque l'envoi de centaines d'e-mails ; incompréhensible pour un non-technicien. | **P1** | ÉCART |
| R-2 | **Un seul long formulaire** (1 250 px) au lieu de **trois onglets** (Contenu des e-mails, Envoi, Adresse de test) ; pas de « simuler puis confirmer » pour les changements d'envoi (maquette : 3 étapes Simuler, Relire, Enregistrer avec les effets chiffrés) ; pas de bandeau « modifications non enregistrées ». | Réglage à risque modifié sans voir ses conséquences ; le bouton Enregistrer est loin des champs. | P2 | ÉCART |
| R-3 | Le bloc « Gérés sur le serveur » est une liste clé/valeur sans explication (« Brevo : Non configurée »). La maquette : carte « Désactivé par le serveur » qui explique que c'est un garde-fou volontaire. | On ne comprend pas pourquoi on ne peut pas activer l'envoi. | P3 | ÉCART |
| R-4 | **Aucun réglage du sourcing ni de l'IA** (plafond du jour, modèle, activer la qualification automatique) : ils ne se règlent que dans un fichier serveur. | Dépendance à un technicien pour un réglage de coût. | P2 | NOUVEAU |

### 4.8 Utilisateurs (`d-15`, `m-13`)

| ID | Constat | Impact | Prio | Type |
|---|---|---|---|---|
| U-1 | Le formulaire **« Créer un compte » est toujours déployé** avant la liste ; **pas de pastille d'état** (Actif, Invité, Bloqué, Désactivé), pas de « Débloquer ». | La tâche fréquente (gérer les comptes) est sous la tâche rare (créer). | P2 | ÉCART |
| U-2 | **Chaque ligne** porte un bouton long « Réinitialiser le mot de passe » et un bouton rouge « Désactiver ». | Beaucoup de rouge ; **« Désactiver » s'exécute sans aucune confirmation** (vérifié dans le code) alors que la maquette demande une confirmation qui dit les conséquences. | P2 | ÉCART |
| U-3 | **Mobile** : le tableau déborde et les colonnes Rôle, Dernière connexion et **Actions sont hors écran**. | Impossible d'agir sur un compte sans découvrir un défilement latéral invisible. | **P1** | ÉCART (cartes prévues en mobile) |
| U-4 | Sélecteur de rôle natif de petite taille, différent des champs du système. | Rupture visuelle. | P3 | CONCEPTION |

### 4.9 Import, Journal d'audit, Adresses exclues, Nouveau lead, Connexion, Profil

| ID | Page | Constat | Impact | Prio | Type |
|---|---|---|---|---|---|
| I-1 | Import (`d-16`) | Page presque vide : sélecteur de fichier **natif en anglais**, « Options » natif ; ni zone de dépôt à bord pointillé, ni indicateur des **quatre étapes** (Choisir, Simuler, Relire, Confirmer). | Opération sensible présentée comme un formulaire banal ; on ne sait pas où l'on en est. | P2 | ÉCART |
| AU-1 | Journal (`d-17`) | Colonnes **techniques** (`auth.login`, `user · 1c75b264`), **pas de colonne Utilisateur**, 28 lignes sur 32 sont des connexions ; **ni filtres** (période, action, utilisateur, objet), **ni détail avant/après**, ni export CSV (tout cela dans la maquette : libellé français au-dessus du code, fiche de détail). | Impossible de répondre à « qui a changé ce réglage ? ». | P2 | ÉCART |
| X-1 | Adresses exclues (`d-13`) | Le formulaire d'ajout précède la liste ; le **motif** est du texte (maquette : pastille), le **lead lié** est absent, les pastilles de comptage du haut ne filtrent pas. **Divergence de fond :** la maquette permet de retirer une exclusion avec confirmation et raison ; l'application l'interdit volontairement (opposition d'une personne). | La liste ne mène pas au lead concerné ; règle métier à arbitrer. | P2 | ÉCART + décision |
| N-1 | Nouveau lead (`d-07`) | **Douze champs à plat**, sans groupes ; seul « Entreprise » est obligatoire mais rien n'est marqué ; le doublon n'est signalé **qu'après** l'envoi (maquette : doublon probable signalé avant, « Ouvrir la fiche » / « Créer quand même »). | Formulaire long et incertain ; création inutile tentée puis refusée. | P2 | ÉCART |
| C-1 | Connexion (`d-01`) | Carte sans pastille de marque ; **pas d'essais restants ni de compte à rebours de blocage**, pas de retour à la page d'origine après une session expirée (on revient toujours au tableau de bord). | Après blocage, l'utilisateur ne sait ni pourquoi ni combien de temps. | P2 | ÉCART |
| PR-1 | Profil (`d-18`) | Conforme à la maquette ; la promesse « mémorisés pour ce compte, sur tous vos appareils » n'est pas écrite à l'écran ; mot de passe sans bouton afficher/masquer. | Mineur. | P3 | ÉCART |

## 5. Écarts avec la maquette, vue par écran

| Écran | Prévu par la maquette et absent | Présent mais différent |
|---|---|---|
| Tableau de bord | indicateurs cliquables | — |
| Pipeline | glisser-déposer, clavier, rangée de raccourcis, carte qui revient en cas d'échec | menu « Déplacer vers… » par carte |
| Leads | 4 filtres + « Plus de filtres », menu de vues, barre d'actions groupées apparaissant à la sélection, en-tête collant, sélection groupée mobile en barre d'actions, filtres mobile en feuille | filtres tous ouverts, formulaire de vue permanent, panneau d'actions séparé |
| Appels | raccourcis 1–7 / P, file à venir, issues fixées à droite, annulation 5 s, tout sur un écran mobile | carte pleine largeur, issues sous le pli |
| E-mails | actions fixées en bas, relecture en deux temps (mobile), état d'envoi en une ligne | panneaux empilés, éditeur étroit |
| Réglages | trois onglets, créneaux jour par jour, simulation en 3 étapes, barre « non enregistré » | formulaire unique, syntaxe technique |
| Utilisateurs | pastilles d'état, confirmation avec conséquences, cartes mobile | tableau avec boutons répétés |
| Import | zone de dépôt, 4 étapes | champ natif |
| Journal | filtres, libellés français, détail avant/après, export | liste de codes |
| Adresses exclues | pastille de motif, lead lié, retrait avec raison | liste simple |
| Nouveau lead | groupes, champs facultatifs marqués, doublon avant création | grille plate |
| Connexion | essais restants, compte à rebours, retour à la page d'origine, marque | carte simple |

## 6. Problèmes déjà présents dans la maquette (CONCEPTION)

À soumettre à Claude Design comme **questions** plutôt que comme corrections :

1. **Un seul niveau de densité** : la maquette ne distingue pas écrans de travail quotidien (Appels, E-mails, Leads) et écrans d'administration (Réglages, Utilisateurs, Journal).
   Les premiers demandent de la densité et du clavier, les seconds de la clarté et des garde-fous.
2. **Aucun état « mise à jour en cours »** pour les actions qui prennent du temps (IA, sourcing) : tous les états dessinés sont instantanés.
3. **Statut d'un lead dispersé** : qualification, étape, état d'appel et état d'e-mail sont quatre notions affichées avec quatre styles ; la maquette définit les pastilles mais pas **laquelle montrer où**.
4. **Pas de « barre d'outils de page »** : chaque écran place ses actions différemment (en-tête de page, sous les filtres, dans la carte).
5. **Mobile : la barre basse ne contient que cinq destinations** ; Pipeline, Sourcing et toute l'administration sont derrière « Plus ».
   Aucun critère ne dit quelles destinations méritent la barre selon le rôle.
6. **Retrait d'une adresse exclue** prévu par la maquette, contraire à la règle d'opposition retenue : arbitrage à faire.

## 7. Anomalies techniques à corriger côté code (indépendantes de la nouvelle maquette)

À traiter par l'équipe de développement **sans attendre** la nouvelle maquette :

| # | Anomalie | Mesure |
|---|---|---|
| 1 | Pipeline : défilement horizontal de **toute la page** (PL-1) | 1 261 px (1440), 1 881 px (820) |
| 2 | E-mails mobile : débordement horizontal de la page (E-1) | 155 px (390), 43 px (820) |
| 3 | Leads mobile : cases à cocher absentes en liste de cartes, actions groupées inutilisables (L-3) | — |
| 4 | Utilisateurs mobile : actions hors écran (U-3) | — |
| 5 | Appels mobile : issues masquées par la barre de navigation fixe (A-2) | — |
| 6 | Sélecteur de fichier non traduit (T-7) | — |

## 8. Ce qu'il faut décider avant la nouvelle maquette

1. **Retrait d'une adresse exclue** : le permettre (avec confirmation, raison et journal) ou garder l'interdit ?
2. **Qualification « Chaud »** pour les prospects Google Maps (effectif inconnu) : utiliser le nombre d'avis comme indice ?
3. **Annulation d'un appel (5 s)** : à construire côté serveur ; fait partie du chantier « appels » reporté.
4. **Priorité des écrans** : l'usage quotidien se concentre sur **E-mails, Leads, Sourcing** (équipe sans commerciaux pour l'instant ; Appels repoussé).
   Faut-il traiter ces trois en premier dans la nouvelle maquette ?
