# GAC Pilot — CRM GrowthLab Agency

CRM commercial branché en direct sur Airtable (via un pont n8n), hébergé sur Netlify.

**Production :** https://crm.growthlab-agencycom.com

## Structure

- `source-artifact.html` — source du CRM, écrit comme un artifact Claude (utilise la capability `db`).
- `build_site.py` — transforme `source-artifact.html` en version hébergée : ajoute l'écran de connexion et remplace la capability `db` par un pont vers une fonction Netlify (`site/netlify/functions/bridge.js`), qui relaie vers des webhooks n8n (liste/mise à jour Airtable, stats Brevo).
- `site/` — projet Netlify déployé :
  - `site/public/index.html` — build généré (ne pas éditer à la main, régénérer via `build_site.py`)
  - `site/netlify/functions/bridge.js` — fonction serveur, lit les secrets depuis les variables d'environnement Netlify (`BRIDGE_SECRET`, `APP_PASSWORD`, `N8N_BASE`)
  - `site/netlify.toml` — config de déploiement

## Déployer un changement

1. Éditer `source-artifact.html`
2. Reconstruire : `python3 build_site.py`
3. Déployer :
   ```
   cd site
   npx netlify-cli@latest deploy --prod --dir public --functions netlify/functions --site 2055bb1e-95a6-4439-a526-8966c205595e
   ```

## Variables d'environnement Netlify requises

- `BRIDGE_SECRET` — secret partagé avec les webhooks n8n (jamais exposé au navigateur)
- `APP_PASSWORD` — mot de passe de l'écran de connexion du CRM
- `N8N_BASE` — URL de l'instance n8n (optionnel, valeur par défaut déjà en place)

Aucun secret n'est présent dans ce dépôt — tout est lu depuis les variables d'environnement Netlify.
