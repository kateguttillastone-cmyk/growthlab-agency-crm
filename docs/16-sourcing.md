# 16 — Sourcing (recherche de prospects)

Remplace la **chaîne A d'n8n** : trouver des prospects à partir de critères, sans quitter le CRM. Désactivé par défaut.

## Fonctionnement

1. **Simuler** (menu *Sourcing*, responsables et administrateurs) : coût maximal (`résultats × SOURCING_COST_PER_RESULT`),
   doublons probables (entreprises déjà connues dans ces villes et ce secteur), budget du jour restant. Rien n'est lancé.
2. **Lancer** : exige le coût vu en simulation (409 s'il a changé) et refuse au-delà du plafond du jour (`SOURCING_DAILY_BUDGET`,
   jour de Paris, recherches annulées exclues ; le coût réel remplace l'estimation une fois la recherche terminée).
3. **Suivi** : une boucle (toutes les 10 s) lit l'état chez le fournisseur ; l'écran se rafraîchit seul. Un redémarrage du serveur
   ne perd rien (l'état et l'identifiant fournisseur sont en base). Au-delà de 45 minutes, la recherche est arrêtée.
4. **Résultat** : seuls les numéros **français** (`+33`) sont gardés (règle de l'ancienne chaîne) ; chaque prospect passe par la même
   déduplication que l'import et la saisie manuelle (domaine, sinon nom + téléphone ; e-mail du contact). Les leads arrivent à
   l'étape « Nouveau », « À appeler » s'ils ont un numéro, avec la source « Sourcing · Google Maps » ou « Sourcing · LinkedIn » et
   l'identifiant de la recherche dans leur historique. Le décompte (nouveaux, doublons, écartés) est affiché.

## Mise en service

```bash
# .env.dev (puis .env.prod) : le jeton ne va JAMAIS dans le dépôt
SOURCING_MODE=apify
APIFY_TOKEN=…
```

Redémarrer l'API. Sans `APIFY_TOKEN`, `SOURCING_MODE=apify` est refusé au démarrage.

> **Première recherche réelle : 5 résultats, une seule ville, et vérifier le résultat.** Les formats d'entrée et de sortie des acteurs
> Apify ont été écrits d'après leur documentation connue mais **n'ont pas pu être exécutés** depuis l'environnement de développement
> (réseau fermé). Si le format a changé, la recherche passe en « Échec : Format de résultat inattendu (champs reçus : …) » avec les
> **noms** de champs (jamais de valeurs) : les correspondances sont dans `apps/api/src/sourcing/apify.ts` (`fromMaps`, `fromLeadsFinder`).

| Source | Acteur (modifiable : `APIFY_ACTOR_MAPS`, `APIFY_ACTOR_LEADS`) |
|---|---|
| Google Maps | `compass~crawler-google-places` (une requête « métier ville » par ville) |
| LinkedIn | `code_crafter~leads-finder` (ancien acteur d'n8n : poste, lieu, tailles 1-10 et 11-20, e-mails validés) |

Le coût réel remonte en dollars chez Apify ; il est converti avec `SOURCING_USD_TO_EUR` (0,92 par défaut).

## Sécurité

- Le jeton Apify ne voyage que dans l'en-tête `Authorization`, jamais dans une adresse, un journal ni un message d'erreur.
- Réservé aux responsables ; chaque lancement et chaque annulation sont dans le journal d'audit.
- Limite de débit sur le lancement ; plafond par recherche (`SOURCING_MAX_PER_RUN`) et par jour.
- Une recherche annulée prévient Apify (le coût déjà engagé reste dû).

## Qualification et rédaction par IA (lot 5d)

Remplace le nœud « Claude Scoring » d'n8n. API Anthropic, **sortie structurée** (outil forcé, schéma Zod unique : segment, qualification,
service, raison, objet, corps) : aucun texte libre à analyser, une réponse invalide n'écrit rien.

- **Règles** (reprises de l'ancien prompt, dans `apps/api/src/ai/prompts.ts`, version `PROMPT_VERSION` enregistrée avec chaque e-mail) :
  service d'entrée *Création/Refonte de site* ou *Google Ads* seulement ; Chaud (5 à 50 salariés et besoin clair), Tiède (1 à 5, ou 50 à
  200), Froid (≥ 200 ou site déjà optimisé) ; jamais de backlinks, mots-clés ni autorité de domaine dans l'e-mail ; trafic organique cité
  seulement s'il est non nul ; texte brut, sans lien ni signature (ajoutés par le gabarit d'envoi).
- **Sans site web** : service « Création de site », sans appel à l'IA (règle de l'ancienne chaîne).
- **Un humain relit toujours** : l'e-mail rédigé arrive « Pas Validé » ; un e-mail déjà validé, envoyé ou en cours d'envoi n'est jamais écrasé.
- **Minimisation** : seuls l'entreprise, le secteur, la ville, les signaux du site et le prénom/poste du contact sont transmis ; **jamais
  d'adresse e-mail ni de numéro de téléphone**.
- **Automatique** après une recherche de sourcing (`SCORING_AUTO=true`, trois prospects à la fois) ; **à la demande** : bouton « Qualifier et
  rédiger l'e-mail (IA) » dans la relecture des e-mails ; **« Réécrire »** avec une consigne libre : la proposition remplit les champs mais
  n'est enregistrée qu'après relecture.
- **Plafond** : `AI_DAILY_LIMIT` appels par jour (409 au-delà). Clé : `ANTHROPIC_API_KEY` (en-tête uniquement, jamais dans un journal ni un message).

> Comme pour Apify, le format de l'API a été écrit d'après la documentation et testé avec un faux serveur ; **faire un premier essai sur 1 lead**.

## À venir

Enrichissement du site (technologies, SEO : acteurs Apify BuiltWith et Semrush de l'ancienne chaîne) : les champs existent déjà en base, ils
sont aujourd'hui « non mesurés » pour les nouveaux prospects et l'IA en tient compte (en cas de doute : Google Ads).
