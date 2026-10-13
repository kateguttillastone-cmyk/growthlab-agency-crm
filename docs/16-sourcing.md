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

## À venir

Enrichissement du site (technologies, SEO) puis qualification et rédaction des e-mails par l'API Anthropic (lots 5c et 5d).
