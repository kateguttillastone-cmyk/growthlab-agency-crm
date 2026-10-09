# 06 — Modèle de données PostgreSQL

| | |
|---|---|
| **Statut** | Socle (phase 1) **implémenté** : `users`, `sessions`, `audit_events` (`apps/api/src/db/schema.ts`). Le reste est la **cible** des phases 2 à 5, à affiner à chaque phase. |
| **Liens** | [Feuille de route](07-feuille-de-route.md) · [Sortie d'Airtable](10-sortie-airtable-n8n.md) · exigences : [02 — PRD](02_product_requirements_document.md) |

## 1. Principes

1. **PostgreSQL est la source de vérité.** Plus d'Airtable ; les services externes (Brevo, Apify) sont des sous-traitants.
2. **Entreprise ≠ contact ≠ lead.** L'ancienne table à 55 colonnes mélangeait tout. Une entreprise a plusieurs contacts ;
   un lead est le suivi commercial d'un contact.
3. **Tout changement important laisse une trace** (`lead_events`), ce qui permet les KPI de délais et de conversion.
4. **Les données enrichies gardent leur provenance** (`enrichments.source`, `fetched_at`) pour savoir quand les rafraîchir.
5. **L'anti-doublon d'envoi est une contrainte de base de données**, pas une convention de code.
6. **Les valeurs de listes sont des types** (énumérations PostgreSQL alimentées par `packages/shared/src/catalog.ts`).

## 2. Schéma cible

```mermaid
erDiagram
    users ||--o{ sessions : possede
    users ||--o{ audit_events : "est l'auteur de"
    users ||--o{ leads : "est responsable de"
    companies ||--o{ contacts : emploie
    companies ||--o{ enrichments : "est décrite par"
    contacts ||--o| leads : "fait l'objet de"
    leads ||--o{ lead_events : historise
    leads ||--o{ email_messages : recoit
    users ||--o{ sourcing_runs : lance
    sourcing_runs ||--o{ leads : produit
    packs ||--o{ leads : "est visé par"
    email_messages }o--|| suppressions : "est bloqué par"

    companies {
        uuid id PK
        text name
        text domain "normalisé, unique si non vide"
        text website
        text sector
        int employees_min
        int employees_max
        int founded_year
        text address
        text city
        text region
        text country
        text phone
        text linkedin_url
        text description
        text source
    }
    contacts {
        uuid id PK
        uuid company_id FK
        text first_name
        text last_name
        text job_title
        text email "unique sur lower(email)"
        text phone
        text linkedin_url
    }
    leads {
        uuid id PK
        uuid contact_id FK "unique"
        uuid company_id FK
        uuid owner_id FK
        uuid sourcing_run_id FK
        qualification qualification "Chaud/Tiède/Froid/À qualifier"
        text qualification_reason
        segment segment "PME/TPE ou E-commerçant"
        text recommended_service
        uuid pack_id FK
        pipeline_stage stage
        numeric deal_value
        call_status call_status
        call_status followup_1
        call_status followup_2
        text comment
        text next_action
        timestamptz detected_at
    }
    enrichments {
        uuid id PK
        uuid company_id FK
        text kind "web_tech, seo, maps"
        jsonb data
        text source
        timestamptz fetched_at
    }
    lead_events {
        bigint id PK
        uuid lead_id FK
        uuid actor_id FK
        text type "stage_changed, validated, call_logged…"
        text from_value
        text to_value
        jsonb data
        timestamptz at
    }
    email_messages {
        uuid id PK
        uuid lead_id FK
        int sequence_no "1 = premier email"
        text subject
        text body
        validation_status validation
        uuid validated_by FK
        timestamptz validated_at
        email_status status "draft, queued, sending, sent, delivered, opened, bounced, unsubscribed, failed"
        timestamptz scheduled_for
        timestamptz sent_at
        text provider_message_id
        text prompt_version
    }
    suppressions {
        text email PK "minuscules"
        text reason "unsubscribe, bounce, complaint, manual"
        timestamptz at
    }
    sourcing_runs {
        uuid id PK
        uuid requested_by FK
        jsonb icp
        text status "pending, running, done, failed"
        text apify_run_id
        int found
        int created
        numeric cost_estimate
        text error
        timestamptz started_at
        timestamptz finished_at
    }
    packs {
        uuid id PK
        text name
        text segment
        numeric monthly_price "null = sur devis"
        bool active
    }
    users {
        uuid id PK
        text email
        text name
        user_role role
        text password_hash
    }
    sessions {
        uuid id PK
        uuid user_id FK
        text token_hash
    }
    audit_events {
        bigint id PK
        uuid actor_id FK
        text action
        text entity_type
    }
```

## 3. Contraintes importantes

| Besoin | Mécanisme |
|---|---|
| Pas de doublon de contact | `UNIQUE (lower(email))` sur `contacts` ; `UNIQUE (domain)` partiel sur `companies` (domaine non vide) |
| **Jamais deux envois du même email** | `UNIQUE (lead_id, sequence_no)` sur `email_messages` ; l'envoi « réclame » le message par `UPDATE … SET status='sending' WHERE id=$1 AND status='queued' RETURNING …` (une seule ligne retournée = un seul worker envoie) |
| Pas d'envoi à une personne désinscrite | Contrôle dans la transaction d'envoi contre `suppressions` ; ajout automatique sur désinscription, plainte ou rebond définitif (webhooks Brevo) |
| Valeur du deal cohérente | `CHECK (deal_value IS NULL OR deal_value >= 0)` ; `numeric(12,2)` (jamais de flottant pour l'argent) |
| Étape du pipeline valide | Énumération PostgreSQL (`pipeline_stage`) alimentée par le catalogue partagé ; un test vérifie que les deux restent synchronisés |
| Historique fiable | Les `lead_events` sont insérés **dans la même transaction** que la modification du lead |
| Recherche rapide | Index sur `leads (stage)`, `(qualification)`, `(owner_id)`, `(detected_at DESC)` ; index trigramme (`pg_trgm`) sur les colonnes recherchées en texte libre |
| Conservation RGPD | Colonnes `created_at`; tâche planifiée de purge/anonymisation selon la durée de conservation à décider ([01 §10](01_conception_produit.md)) |

## 4. Règles de migration

- Une migration par changement, générée par `pnpm db:generate`, relue, commitée avec le code.
- **Expand / contract** : ajouter d'abord (colonne nullable, nouvelle table), faire basculer le code, supprimer dans un
  déploiement ultérieur. La version N-1 du code doit fonctionner avec le schéma N : c'est ce qui rend le retour arrière sûr.
- Jamais de modification d'une migration déjà fusionnée dans `dev` ou `main`.
- Les migrations tournent au démarrage de l'API, protégées par un verrou consultatif PostgreSQL.
