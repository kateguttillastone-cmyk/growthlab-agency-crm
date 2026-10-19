# Demandes d'audit gratuit (formulaire du site)

Le site de GrowthLab propose un formulaire « Demander mon audit gratuit ». Chaque demande est enregistrée dans le CRM, **à part des leads de prospection**, et le visiteur reçoit un e-mail de confirmation.

## Pourquoi à part des leads

- Ce sont des personnes qui **ont demandé** à être contactées (consentement), pas des prospects démarchés à froid.
- Le délai de réponse compte : l'écran `Demandes d'audit` affiche un badge avec le nombre de demandes « Nouvelle ».
- Les règles d'envoi diffèrent : l'accusé part tout de suite, hors file de relecture, hors plafond et créneaux de la prospection.
- « **Convertir en lead** » crée le prospect (qualifié « Chaud », origine « Demande d'audit (site) », étape « Nouveau ») ou rattache la demande au prospect déjà connu (même adresse e-mail) : jamais de doublon.

## Parcours

1. Le visiteur remplit le formulaire (entreprise, site, e-mail, téléphone facultatif, objet, message, case de consentement).
2. Le site envoie les réponses à `POST <adresse du CRM>/api/public/audit-requests`, en **JSON** ou en **formulaire HTML classique** (`application/x-www-form-urlencoded`, case cochée = `consent=on`). Réponse `201 {"ok":true}`. Les noms de champs sont ceux du tableau ci-dessous : si l'outil du site impose d'autres noms, il faut une petite correspondance côté site.
3. Le CRM enregistre la demande avec la preuve du consentement (texte et date), puis, **après avoir répondu au visiteur** :
   - envoie l'**accusé de réception** au visiteur ;
   - envoie une **alerte** à l'équipe (`AUDIT_NOTIFY_EMAIL`).
4. L'équipe traite la demande : statut (`Nouvelle` → `Contactée` → `Audit livré` → `Convertie`, ou `Rejetée`), note interne, « Me l'attribuer », « Convertir en lead ».

## Brancher le formulaire du site

Dans l'appel du bouton « Envoyer ma demande » :

```js
const res = await fetch("https://<adresse-du-crm>/api/public/audit-requests", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    companyName, // Nom de l'entreprise
    website,     // Site web
    email,       // E-mail
    phone,       // Téléphone (facultatif)
    subject,     // Objet (facultatif)
    message,     // Message (facultatif)
    consent: true, // case « J'accepte d'être contacté·e… » cochée (obligatoire)
    hp: "",      // champ piège : un champ de formulaire invisible, qui doit rester VIDE
  }),
});
// 201 : demande enregistrée ; 400 : réponse invalide (message en français dans error.message) ; 429 : trop d'envois
```

Il faut aussi : un champ `hp` invisible (`display:none`, `tabindex=-1`, `autocomplete=off`) pour piéger les robots, et d'autoriser l'origine du site côté CRM (ci-dessous).

## Réglage du serveur

| Variable | Rôle |
|---|---|
| `AUDIT_FORM_ORIGINS` | Origine complète du site (ex. `https://www.growthlab-agencycom.com`), plusieurs séparées par des virgules. **Vide = formulaire fermé** : toute demande d'un navigateur est refusée. |
| `AUDIT_NOTIFY_EMAIL` | Adresse de l'équipe prévenue à chaque demande (vide = pas d'alerte). |
| `AUDIT_FORM_RATE_LIMIT_PER_MINUTE` | Demandes acceptées par minute et par adresse IP (5 par défaut). |

L'objet et le texte de l'accusé se modifient dans **Réglages** (`{entreprise}` et `{site}` sont remplacés). Le lien de rendez-vous et la signature viennent des mêmes réglages que la prospection.

## Envoi des e-mails selon le mode du serveur

| Serveur | Accusé au visiteur | Alerte à l'équipe |
|---|---|---|
| `SEND_MODE=prod` | envoyé à la vraie adresse | envoyée à `AUDIT_NOTIFY_EMAIL` |
| `SEND_MODE=off` avec Brevo et `SEND_TEST_RECIPIENT` | envoyé **à l'adresse de test** (préfixe `[TEST]`), jamais au visiteur ; la demande indique « Mode test » | idem, à l'adresse de test |
| `SEND_MODE=off` sans Brevo | non envoyé ; la demande indique « Envoi désactivé » | non envoyée |

Dans tous les cas la **demande est conservée**. Un accusé non parti se renvoie depuis la fiche (« Renvoyer l'accusé »). Une adresse en rebond, plainte ou exclusion manuelle ne reçoit rien. Un résultat incertain du fournisseur n'est jamais rejoué automatiquement.

## Protections

- Origine contrôlée (CORS) : seuls les sites de `AUDIT_FORM_ORIGINS` peuvent envoyer depuis un navigateur. Une origine mal écrite empêche le serveur de démarrer, avec un message qui la nomme.
- Limitation du débit par adresse IP, champ piège, validation stricte de chaque champ (le navigateur n'est jamais cru), caractères de contrôle retirés.
- Garde-fou global : au-delà de 300 demandes par heure, toutes provenances confondues, les nouvelles sont refusées (429).
- Même demande (mêmes réponses) dans les 10 minutes : enregistrée une seule fois.
- **Pas d'e-mail en rafale à un tiers** : quelqu'un peut saisir l'adresse de quelqu'un d'autre. Au-delà de 3 demandes par jour avec la même adresse, la demande est gardée mais l'accusé n'est plus envoyé automatiquement (« Renvoyer l'accusé » reste possible).
- Consentement obligatoire, conservé avec la demande (texte exact et date). **Le texte conservé est celui de `AUDIT_CONSENT_TEXT` (`packages/shared/src/audit-requests.ts`) : à garder identique à la phrase affichée sur le site.**
- L'adresse IP n'est conservée ni avec la demande ni dans le journal d'audit.

## RGPD

Base : consentement du visiteur (case cochée). À prévoir côté entreprise : durée de conservation des demandes et mention dans la politique de confidentialité du site. **Le CRM ne supprime rien automatiquement** : une demande reste en base tant que personne ne la supprime. Une durée de conservation (par exemple 12 ou 24 mois) est à décider, puis à appliquer (outil de purge à prévoir). Une désinscription ultérieure passe par la liste « Adresses exclues ».
