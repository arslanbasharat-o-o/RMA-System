# Architecture

## Runtime components

- **Next.js App Router:** interface and route handlers for authentication, RMA workflows, catalogs, reports, and image delivery.
- **PostgreSQL:** users, sessions, customers, RMA records, catalog data, vendor rules, recognition results, audit records, settings, and the durable job queue.
- **pg-boss worker:** processes queued image recognition independently from HTTP requests.
- **Private image volume:** stores original uploads and derived previews outside the web root. Image reads go through authenticated handlers.
- **Reverse proxy:** terminates HTTPS and forwards requests to the app. Caddy is available as an optional Compose profile.
- **Recognition adapters:** The private Google Lens API and Scrapling Chrome worker provide visual search; OpenAI Vision extracts visible markings when configured. Local build and mock-backed tests do not call paid services.

## Recognition flow

```mermaid
sequenceDiagram
  participant Staff
  participant App
  participant DB as PostgreSQL / pg-boss
  participant Worker
  participant Providers as private Google Lens and OpenAI
  participant Review as Staff review queue
  Staff->>App: Create RMA and upload display images
  App->>DB: Store metadata and enqueue work
  Worker->>DB: Claim durable job
  Worker->>Providers: Request visual candidates and OCR when configured
  Providers-->>Worker: Candidate models and transcribed markings
  Worker->>DB: Store evidence and calculated match state
  Staff->>Review: Review uncertain result and record correction
  Review->>DB: Save decision and audit trail
```

## Data boundaries

- Upload bytes and catalog workbooks are operational data and stay outside the public source repository.
- Provider keys, session secrets, and database credentials are runtime secrets. Do not prefix them with `NEXT_PUBLIC_`.
- Mock adapters are restricted to development and test environments by runtime guards.
- Production and CI use separate databases, storage, credentials, and worker instances.
- A fresh installation has no customer or RMA fixtures. Import organization-specific catalog data privately after deployment.

## Persistence

Compose defines separate named volumes for PostgreSQL and uploaded images. Backups must include both. A copy on the same VPS is not off-site recovery. Encrypt off-server copies and test restores before deleting older recovery points.
