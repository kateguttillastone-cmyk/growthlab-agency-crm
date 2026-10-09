# 03 — Cahier des charges : GAC Pilot

| | |
|---|---|
| **Version** | 1.0 — cahier des charges rétro-documenté (état du commit `7817213`) |
| **Documents liés** | [Conception produit](01_conception_produit.md) · [PRD](02_product_requirements_document.md) · [Architecture](04_architecture_technique_et_systeme.md) |
| **Légende** | ✅ implémenté · 🟡 partiel · 📄 documenté sans code · 💡 recommandation · ❓ à confirmer |

> Ce cahier des charges couvre (a) la **maintenance et la consolidation** du produit existant et (b) les **évolutions** listées dans le PRD. **Aucun budget, aucun calendrier ni aucun effort chiffré n'est inventé** : ils sont à fournir par le commanditaire (voir §11).

---

## 1. Contexte

GrowthLab Agency exploite une automatisation de prospection (« Lead Pilot », n8n) qui alimente une base Airtable. GAC Pilot est l'interface web de pilotage commercial de cette base : tri et validation des emails, suivi d'appels, pipeline, indicateurs (voir [01 §2](01_conception_produit.md)).

Historique constaté dans le dépôt : l'application a d'abord été écrite comme **artifact Claude** (`source-artifact.html`, base de données fournie par la plateforme), puis **hébergée** sur Netlify avec un pont serveur vers n8n/Airtable (`build_site.py` ajoute la connexion et remplace la couche de données). Production : `https://crm.growthlab-agencycom.com` (README).

## 2. Objectifs

| ID | Objectif | Indicateur de validation | Lien |
|---|---|---|---|
| OBJ-1 | Maintenir en production un CRM fiable, accessible uniquement aux personnes autorisées | Aucun accès sans mot de passe ; 0 secret dans le dépôt | EXG-F-001..005 |
| OBJ-2 | Garantir qu'aucun email non relu n'est envoyé | Seuls les leads « Validé » atteignent la liste Brevo | EXG-F-042..047 |
| OBJ-3 | Éviter les pertes de saisies (colonnes absentes, erreurs réseau) | CA-07, CA-11 passés | EXG-F-052, 071..073 |
| OBJ-4 | Réduire la dette de maintenance (source unique, tests, CI) | Build reproductible + tests minimaux en CI | EXG-NF-011, 012 |
| OBJ-5 | Préparer l'extension (utilisateurs, contacts entrants, suivi de sourcing) | Décisions D1–D4 de [01 §10](01_conception_produit.md) prises | EXG-F-060, 081, 082, 091 |

## 3. Périmètre

### 3.1 Inclus
1. **Socle existant** (voir [02 §2](02_product_requirements_document.md)) : accès, dashboard, leads, sourcing & validation, pipeline, fiche d'évaluation, paramètres.
2. **Correctifs de cohérence** recensés en §9 (colonnes attendues, échappement, textes obsolètes).
3. **Documentation et exploitation** : procédures de build/déploiement, variables d'environnement, tests.
4. **Évolutions priorisées** par le commanditaire parmi EXG-F-060, 081, 082, 090..093 (à arbitrer, §11).

### 3.2 Exclu
- Les workflows n8n, le schéma Airtable, la configuration Brevo et les outils de sourcing/scoring (hors dépôt) — sauf **documentation de leur contrat** avec l'application (§5.2).
- La création/refonte de sites ou toute prestation commerciale de l'agence.
- Une application mobile native, une refonte graphique complète, un changement de fournisseur de base de données (sauf décision D1).

## 4. Description de l'existant (résumé)

| Élément | État |
|---|---|
| Application | Page unique HTML/CSS/JS sans framework ni dépendance npm, ≈ 2 200 lignes (`source-artifact.html`) |
| Build | Script Python à substitutions textuelles sur la source (`build_site.py`), échoue si une ancre n'est pas trouvée exactement une fois |
| Backend | Une fonction Netlify (`bridge.js`, Node, bundler esbuild) : contrôle du mot de passe + relais vers 5 webhooks n8n |
| Données | Airtable « Lead Pilot » via n8n ; aucune base propre |
| Tests / CI / observabilité | Aucun / aucune / aucune |
| Détail | [04 §2–§8](04_architecture_technique_et_systeme.md) |

## 5. Prestations attendues

### 5.1 Lot A — Maintenance corrective et de conformité
| Réf. | Prestation | Réponse à | Prio |
|---|---|---|---|
| A1 | Aligner la liste des colonnes « attendues » (écran Paramètres) sur les colonnes réellement éditées (`Prochaine action Kate`, `STATUT`, `RELANCE 1/2`…) | EXG-F-071 | P1 |
| A2 | Corriger les insertions HTML non échappées (tâches prioritaires, libellés de secteur, pastilles) | EXG-NF-004 | P0 |
| A3 | Gérer l'expiration de session (401) lors des **écritures**, pas seulement à la lecture | EXG-F-003 | P1 |
| A4 | Rendre `build_site.py` indépendant du chemin `~/gac-pilot` (chemins relatifs au dépôt) | EXG-NF-011 | P1 |
| A5 | Supprimer ou mettre à jour les textes obsolètes de la source (« tâche planifiée… session Claude Code ») | Cohérence | P2 |
| A6 | Renseigner `lang="fr"` sur `<html>` et corriger les points bloquants d'accessibilité les plus visibles | EXG-NF-009 | P1 |
| A7 | Protéger le webhook `search-leads` : l'appel de sourcing n'envoie **pas** l'en-tête `x-bridge-secret` contrairement aux autres appels (`bridge.js`) → confirmer avec n8n l'authentification de ce webhook | EXG-NF-001 | P0 ❓ |

### 5.2 Lot B — Documentation du contrat avec les systèmes externes
| Réf. | Livrable |
|---|---|
| B1 | Schéma Airtable de référence : noms exacts, types (texte, liste, multi-sélection, nombre, date, booléen), valeurs de listes, colonnes obligatoires |
| B2 | Contrat des 5 webhooks n8n : entrée, sortie, codes d'erreur, authentification (`x-bridge-secret`) |
| B3 | Règle d'envoi Brevo (délai ~10 min, liste « Leads validés - GAC Pilot », conditions) |
| B4 | Export versionné des workflows n8n concernés (si l'agence l'accepte) |

### 5.3 Lot C — Qualité et exploitation
| Réf. | Prestation | Prio |
|---|---|---|
| C1 | Tests automatisés des fonctions pures (classification en segments, mapping STATUT → étape, aperçu d'email, agrégations KPI) et du pont (mock n8n) | P1 |
| C2 | Pipeline CI : build, tests, contrôle que `site/public/index.html` correspond au build | P1 |
| C3 | Déploiement automatisé, environnement de prévisualisation | P2 |
| C4 | Journalisation et alerte d'erreurs du pont | P2 |
| C5 | Procédure de rotation de `BRIDGE_SECRET` et `APP_PASSWORD` | P1 |

### 5.4 Lot D — Évolutions (sous réserve d'arbitrage, §11)
EXG-F-060 (demandes de contact), EXG-F-081/082 (utilisateurs/rôles), EXG-F-090 (historique), EXG-F-091 (suivi de sourcing), EXG-F-092/093 (création manuelle, export CSV).

## 6. Contraintes

| Type | Contrainte | Source |
|---|---|---|
| Technique | Pas de framework front : le HTML source doit rester utilisable comme artifact Claude *ou* être migré (arbitrage ARB-4) | README, `build_site.py` |
| Technique | Le build repose sur 8 ancres textuelles exactes dans la source ; toute modification de ces blocs peut casser le build (échec explicite par `sub_once`) | `build_site.py` |
| Données | Airtable : limites d'API (le code limite les écritures groupées à 4 en parallèle) ; noms de colonnes contractuels | `source-artifact.html:1667` |
| Hébergement | Netlify : fonctions serverless à durée limitée (limites exactes non vérifiées ❓) | `netlify.toml` |
| Réglementaire | Prospection B2B par email et traitement de données personnelles (nom, téléphone, email, LinkedIn) : RGPD / ePrivacy ❓ à qualifier | — |
| Organisationnel | Équipe réduite, un compte « Admin » identifié (H1 de [01 §10](01_conception_produit.md)) | UI |
| Langue | Interface et documentation en français | UI |

## 7. Exigences de qualité

### 7.1 Sécurité
| Réf. | Exigence | État actuel |
|---|---|---|
| SEC-1 | Authentification sur toutes les routes d'API | ✅ |
| SEC-2 | Secrets uniquement en variables d'environnement, jamais exposés au navigateur | ✅ |
| SEC-3 | Authentification nominative et mot de passe non stocké en clair côté navigateur | 💡 (mot de passe en `localStorage`, clé `gac_pwd`) |
| SEC-4 | Limitation des tentatives de connexion | 💡 absente |
| SEC-5 | Comparaison du mot de passe en temps constant | 💡 (comparaison `!==` simple) |
| SEC-6 | Politique CSP, HSTS, `Permissions-Policy` | 💡 (3 en-têtes seulement) |
| SEC-7 | Échappement systématique des données affichées | 🟡 (A2) |
| SEC-8 | Moindre privilège sur le jeton Airtable côté n8n | ❓ hors dépôt |
| SEC-9 | Journal d'audit des modifications | 💡 |

### 7.2 Performance
| Réf. | Exigence | État |
|---|---|---|
| PERF-1 | Chargement initial de la liste de leads acceptable pour le volume cible | ❓ volume cible non défini |
| PERF-2 | Rafraîchissement sans recharger toute la base inutilement | 🟡 (rechargement complet toutes les 25 s) |
| PERF-3 | Actions groupées sans dépassement de quota Airtable | ✅ (lots de 4) |
| PERF-4 | Aucune valeur chiffrée de temps de réponse n'est définie : **à fixer** (ex. P95 d'affichage du tableau) | ❓ |

### 7.3 Accessibilité
Objectif recommandé : WCAG 2.1 AA / RGAA (💡, à valider). État : aucun `aria-*`, `lang` absent, glisser-déposer sans alternative clavier, contrastes non audités, cellules éditables en `contenteditable` sans rôle.

### 7.4 Maintenabilité
Code monolithique (un fichier de ≈ 2 200 lignes), fonctions nommées en français et anglais, nombreux commentaires de décision utiles. Pas de typage ni de linter. Recommandation : tests (C1), découpage en modules à moyen terme ([04 §11](04_architecture_technique_et_systeme.md)).

### 7.5 Exploitation
| Réf. | Exigence | État |
|---|---|---|
| EXP-1 | Procédure de déploiement documentée | ✅ README (manuelle, via `netlify-cli`) |
| EXP-2 | Sauvegarde des données | ❓ côté Airtable/n8n, non documentée |
| EXP-3 | Supervision et alertes | 💡 absentes |
| EXP-4 | Procédure de retour arrière | 💡 (rollback Netlify ❓ non documenté) |
| EXP-5 | Gestion des environnements (dev / prod) | 💡 un seul site de production identifié |

## 8. Livrables

| N° | Livrable | Lot | Format |
|---|---|---|---|
| L1 | Code corrigé (source + build régénéré + fonction) | A | Dépôt Git |
| L2 | Dossier de contrat d'intégration (B1–B3) | B | Markdown |
| L3 | Jeu de tests et rapport de couverture des règles métier (RG-01..RG-13) | C | Dépôt Git |
| L4 | Pipeline CI et procédure de déploiement | C | Config + doc |
| L5 | Guide d'exploitation (variables, rotation de secrets, retour arrière, incidents) | C | Markdown |
| L6 | Évolutions retenues avec critères d'acceptation (CA-xx) | D | Dépôt Git |
| L7 | Mise à jour des documents 01–04 | Tous | Markdown |

## 9. Écarts constatés à traiter (preuves)

| # | Écart | Preuve | Lot |
|---|---|---|---|
| E1 | Colonnes attendues ≠ colonnes éditées (`Prochaine action` vs `Prochaine action Kate` ; `Statut appel` inutilisée) | `build_site.py` (bloc 5) vs `source-artifact.html:634` | A1 |
| E2 | XSS potentiel sur trois rendus | `source-artifact.html:1199, 1244, 1255` | A2 |
| E3 | 401 non géré à l'écriture | `build_site.py` (`API.call`, `start`) | A3 |
| E4 | `search-leads` appelé sans secret de pont | `bridge.js` (action `sourcing`) | A7 |
| E5 | Chemin `~/gac-pilot` en dur | `build_site.py` | A4 |
| E6 | Textes de synchro obsolètes dans la source | `source-artifact.html:1294, 1898, 2061` (remplacés au build) | A5 |
| E7 | Mot de passe en clair en `localStorage` | `build_site.py` (`tryPassword`) | SEC-3 |
| E8 | `limit(1000)` sans effet côté pont | `build_site.py` (`limit: function(){return this}`) | PERF-2 |
| E9 | `N8N_BASE` par défaut sur `n8n.growthlab-agency.fr`, domaine différent du site (`growthlab-agencycom.com`) | `bridge.js` | ❓ à confirmer |

## 10. Conditions de validation (recette)

1. **Recette fonctionnelle** : exécution des critères CA-01 à CA-11 ([02 §5](02_product_requirements_document.md)) sur un jeu de données de test (au moins 60 leads pour couvrir la pagination, des cas limites : sans date, sans site, Taille non numérique, colonnes absentes).
2. **Recette de sécurité** : appels `/api/*` sans/avec mauvais mot de passe (401), absence de secret dans le dépôt et dans le bundle livré, vérification des en-têtes HTTP, test d'injection HTML dans les champs de lead.
3. **Recette d'intégration** : appels réels (en environnement de test) des 5 webhooks ; scénario complet sourcing → validation → présence dans Brevo.
4. **Recette d'exploitation** : déploiement et retour arrière réalisés par une personne autre que l'auteur à partir du guide L5.
5. **Critères de réception** : tous les CA « P0 » passés, aucune anomalie bloquante ouverte, documents 01–04 à jour. Le commanditaire prononce la réception ❓ (interlocuteur à nommer).

## 11. Risques et points à arbitrer

### 11.1 Risques
| ID | Risque | Impact | Probabilité | Atténuation |
|---|---|---|---|---|
| R1 | Dépendance critique à n8n/Airtable/Brevo non versionnés ni documentés | Élevé | Moyenne ❓ | Lot B |
| R2 | Mot de passe partagé unique fuité ou stocké en clair | Élevé | Moyenne | SEC-3/4, authentification nominative |
| R3 | Données prospects personnelles sans cadre RGPD formalisé | Élevé | ❓ | Cadrage juridique avant extension |
| R4 | Rupture du build par modification de la source (ancres textuelles) | Moyen | Moyenne | Tests de build (C2), refonte du mécanisme (AR-10 de [04](04_architecture_technique_et_systeme.md)) |
| R5 | Régression silencieuse faute de tests | Moyen | Élevée | C1, C2 |
| R6 | Perte de saisies si colonne Airtable absente / réseau indisponible | Moyen | Moyenne | Gardes existantes + A1 |
| R7 | Volume en croissance : rechargement complet toutes les 25 s | Moyen | Croissante | PERF-2, pagination côté serveur |
| R8 | Segmentation par mots-clés libres → leads mal classés | Moyen | Moyenne | Champ de segment explicite (Q2 du PRD) |
| R9 | Aperçu d'email dupliqué du gabarit n8n : dérive entre aperçu et email réellement envoyé | Moyen | Moyenne | Source unique du gabarit |
| R10 | Dépendance à une personne (« Kate », « Ifaliana ») | Moyen | ❓ | Gestion des utilisateurs, documentation |

### 11.2 Points à arbitrer
| ID | Sujet | Options | Arbitre |
|---|---|---|---|
| ARB-1 | Authentification | Mot de passe partagé / comptes nominatifs / SSO ❓ | Commanditaire |
| ARB-2 | Source de vérité | Airtable seul / base applicative en plus | Commanditaire + technique |
| ARB-3 | Évolutions du lot D | Ordre et périmètre | Commanditaire |
| ARB-4 | Maintien du format artifact Claude | Conserver la dualité artifact/hébergé / migrer en projet web classique | Technique |
| ARB-5 | Niveau d'accessibilité visé | WCAG AA / minimal | Commanditaire |
| ARB-6 | Budget, calendrier, ressources | **Non fournis — non estimés ici** | Commanditaire |

---

## 12. Hypothèses, questions ouvertes et décisions à valider

**Hypothèses**
- H1 : le commanditaire est GrowthLab Agency ; le titulaire de la décision n'est pas identifié.
- H2 : le périmètre d'intervention inclut le dépôt uniquement ; les systèmes externes sont accessibles en lecture pour documentation.
- H3 : aucune obligation sectorielle (hors RGPD) n'est connue.

**Questions ouvertes**
- Q1 : volume actuel et cible de leads ? nombre d'utilisateurs simultanés ?
- Q2 : qui administre Netlify, n8n, Airtable, Brevo ? Existe-t-il des sauvegardes ?
- Q3 : le webhook `search-leads` est-il protégé (E4) ?
- Q4 : la différence de domaine n8n/site (E9) est-elle voulue ?
- Q5 : disponibilités et limites réelles du plan Netlify utilisé ?
- Q6 : doit-on conserver la compatibilité artifact Claude (ARB-4) ?

**Décisions à valider** : ARB-1 à ARB-6, priorité des lots A–D, et acceptation des critères de recette du §10.
