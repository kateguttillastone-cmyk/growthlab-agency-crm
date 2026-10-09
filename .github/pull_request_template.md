## Quoi et pourquoi

<!-- Le problème résolu, pas la liste des fichiers modifiés. Référence : exigence (EXG-…), phase de la feuille de route. -->

## Vérifications

- [ ] `pnpm lint && pnpm typecheck && pnpm test` passent en local
- [ ] Nouvelle logique métier = nouveau test (de préférence sur une vraie base)
- [ ] Changement de schéma : migration générée (`pnpm db:generate`), compatible avec la version précédente (expand / contract)
- [ ] Aucun secret, aucune donnée réelle de prospect
- [ ] Documentation mise à jour si le comportement change (`docs/`)

## Déploiement / retour arrière

<!-- Variables d'environnement à ajouter ? Migration irréversible ? Étape manuelle ? -->
