# Demandes d'audit gratuit (formulaire du site)

Le site de GrowthLab propose un formulaire « Demander mon audit gratuit ». Chaque demande est enregistrée dans le CRM, **à part des leads de prospection**, et le visiteur reçoit un e-mail de confirmation.

## Pourquoi à part des leads

- Ce sont des personnes qui **ont demandé** à être contactées (consentement), pas des prospects démarchés à froid.
- Le délai de réponse compte : l'écran `Demandes d'audit` affiche un badge avec le nombre de demandes « Nouvelle ».
- Les règles d'envoi diffèrent : l'accusé part tout de suite, hors file de relecture, hors plafond et créneaux de la prospection.
- « **Convertir en lead** » crée le prospect (qualifié « Chaud », origine « Demande d'audit (site) », étape « Nouveau ») ou rattache la demande au prospect déjà connu (même adresse e-mail) : jamais de doublon.

## Parcours

1. Le visiteur remplit le formulaire (entreprise, site, e-mail, téléphone facultatif, objet, message, case de consentement).
2. Le site envoie les réponses en JSON à `POST <adresse du CRM>/api/public/audit-requests`. Réponse `201 {"ok":true}`.
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

- Origine contrôlée (CORS) : seuls les sites de `AUDIT_FORM_ORIGINS` peuvent envoyer depuis un navigateur.
- Limitation du débit par adresse IP, champ piège, validation stricte de chaque champ (le navigateur n'est jamais cru).
- Même demande (mêmes réponses) dans les 10 minutes : enregistrée une seule fois.
- Consentement obligatoire, conservé avec la demande (texte et date) ; l'adresse IP n'est pas stockée avec la demande.

## RGPD

Base : consentement du visiteur (case cochée). À prévoir côté entreprise : durée de conservation des demandes (par exemple suppression ou anonymisation après un délai fixé) et mention dans la politique de confidentialité du site. Une désinscription ultérieure passe par la liste « Adresses exclues ».
