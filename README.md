# RMA System

[![CI](https://img.shields.io/github/actions/workflow/status/arslanbasharat-o-o/RMA-System/ci.yml?branch=main&label=CI)](https://github.com/arslanbasharat-o-o/RMA-System/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/arslanbasharat-o-o/RMA-System?label=Release&color=2ea44f)](https://github.com/arslanbasharat-o-o/RMA-System/releases/latest)
[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Queue](https://img.shields.io/badge/Queue-pg--boss-FF6B6B?logo=task&logoColor=white)](https://github.com/timgit/pg-boss)
[![Docker](https://img.shields.io/badge/Docker-GHCR_Verified-2496ED?logo=docker&logoColor=white)](https://github.com/arslanbasharat-o-o/RMA-System/pkgs/container/rma-system)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

An enterprise-grade reverse logistics and multi-modal display assembly recognition platform. Engineered for electronics refurbishment facilities, warranty repair centers, and mobile parts distributors to streamline return authorization, eliminate counterfeit and wrong-model intake, and automate physical inspection triage.

---

## At a Glance

- **Warehouse-Ready Mobile Scanner**: Optimized touch interface with live camera scanner and photo uploader designed for warehouse intake benches.
- **Dual-Stream Multi-Modal AI**: Synchronizes visual matching from a private [Google Lens Scrapling Service](https://github.com/arslanbasharat-o-o/Google-Lens-API) with OpenAI Vision OCR reading flex cable markings, part codes, and IC stamps.
- **Zero-SKU Hallucination Policy**: Replaces error-prone guessing with deterministic catalog matching. Ambiguous variants (e.g. iPhone 15 Pro vs 15 Pro Max) trigger structured candidate suggestions or route to technician review.
- **Durable Asynchronous Queue**: Backed by `pg-boss` and PostgreSQL to process high-resolution inspection photos in the background without blocking web transactions.
- **Live Intake Synchronization**: Reactive polling and SSE keep operator interfaces updated in real time as background jobs advance from queued to verified.
- **Comprehensive Vendor & Warranty Rules**: Enforces supplier-specific defect allowances, warranty credit formulas, and automated return paperwork generation.

---

## Live System Preview

![Operations Dashboard](screenshots/dashboard.png)
*Figure 1: RMA System Operations Dashboard with real-time intake metrics, return reason breakdown, and active shipment tracking.*

---

## Visual Showcase

<details open>
<summary><b>1. Intake & Warehouse Operations</b></summary>
<br/>

| Creation & Ingestion | Mobile Camera Scanner |
| :---: | :---: |
| ![Create RMA](screenshots/create-rma.png) | ![Camera Scanner](screenshots/camera-scanner.png) |
| *Step-by-step customer selection and tracking ingestion* | *High-contrast camera capture scanner with fallbacks* |

| Return Authorization Register |
| :---: |
| ![RMA Tracking Register](screenshots/rma-list.png) |
| *Filterable, searchable RMA tracking register with status pills and export options* |

</details>

<details open>
<summary><b>2. Multi-Modal Recognition & Quality Assurance</b></summary>
<br/>

| AI Recognition & Evidence Review | Technician Exception Triage Queue |
| :---: | :---: |
| ![Recognition Review](screenshots/recognition-review.png) | ![Review Queue](screenshots/review-queue.png) |
| *Multi-modal inspection showing visual matches, OCR flex cable readings, and candidate suggestions* | *Exception triage interface for operator sign-off and manual overrides* |

</details>

<details>
<summary><b>3. Catalogs & Governance</b></summary>
<br/>

| Display Assembly Catalog | Supplier Warranty Rules |
| :---: | :---: |
| ![Display Catalog](screenshots/display-catalog.png) | ![Vendor Catalog](screenshots/vendor-catalog.png) |
| *Master catalog of display specifications, generations, and compatibility* | *Configurable supplier warranty rules, defect thresholds, and credit terms* |

| Secure Role-Based Access |
| :---: |
| ![Secure Login](screenshots/login.png) |
| *Session-secured portal with brute-force rate limiting and RBAC controls* |

</details>

---

## System Architecture

```mermaid
flowchart TD
    Client[Operator Browser / Mobile Camera] -->|HTTPS| Proxy[Caddy / Reverse Proxy]
    Proxy -->|Port 23001| App[Next.js 15 App Router<br/>Web & API Gateway]

    subgraph Storage & Persistence
        App --> DB[(PostgreSQL 16<br/>Operational Data & Audit Trail)]
        App --> Store[(Private Image Storage<br/>Docker Named Volume)]
        App --> Queue[(pg-boss Job Queue<br/>Postgres-backed)]
    end

    subgraph Asynchronous Worker
        Queue --> Worker[RMA Background Worker<br/>Node.js 24]
        Worker --> Store
        Worker --> DB
    end

    subgraph Multi-Modal Vision Services
        Worker -->|Visual Search| Lens[Private Google Lens API<br/>Fastify Gateway]
        Lens --> Scrapling[Scrapling Python Worker<br/>Chrome Stealth Session]
        Scrapling --> ProxyPool[Residential Proxy Rotation<br/>AnyIP / BrightData Pool]
        ProxyPool --> Google[Google Lens Web]

        Worker -->|Flex Cable OCR| OpenAI[OpenAI Vision<br/>gpt-4o-mini]
    end

    subgraph Decision Engine
        Worker --> Engine[Recognition Synthesizer & Rule Engine]
        Engine -->|Confident Match| AutoVerify[Auto-Match Verified]
        Engine -->|Ambiguity / Dispute| Triage[Staff Review Queue]
    end
```

---

## Recognition Pipeline & Anti-Hallucination Policy

The recognition engine rejects arbitrary guessing. It enforces an evidence-based trust boundary:

```mermaid
sequenceDiagram
    autonumber
    actor Tech as Warehouse Operator
    participant UI as Intake Interface
    participant Queue as pg-boss Queue
    participant Worker as Recognition Worker
    participant Lens as Google Lens Service
    participant OCR as OpenAI Vision OCR
    participant DB as Postgres Database

    Tech->>UI: Uploads display inspection photos
    UI->>DB: Stores raw image bytes in private volume
    UI->>Queue: Enqueues recognition job
    UI-->>Tech: Immediate 202 Accepted (processing in background)

    Queue->>Worker: Claims job
    par Visual Search
        Worker->>Lens: POST image to private Lens service
        Lens-->>Worker: Candidate visual matches (titles + domains)
    and Optical Character Recognition
        Worker->>OCR: Sends cropped flex cable crop
        OCR-->>Worker: Transcribed markings & part codes
    end

    Worker->>Worker: Evaluates candidate models against catalog
    alt Confident Model Agreement
        Worker->>DB: Records verified model & evidence score
    else Ambiguous Variants (e.g. iPhone 15 Pro vs Pro Max)
        Worker->>DB: Saves candidate suggestions (Zero-SKU Guessing)
        Worker->>DB: Routes item to Staff Review Queue
    end
    Worker-->>UI: Real-time status update via polling
```

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | [Next.js 15](https://nextjs.org) (App Router), [React 19](https://react.dev), [Tailwind CSS](https://tailwindcss.com), [Lucide React](https://lucide.dev) |
| **Backend & APIs** | Node.js 24 LTS, TypeScript 5.7, Next.js Server Actions & Route Handlers |
| **Database & ORM** | [PostgreSQL 16](https://www.postgresql.org), [Drizzle ORM](https://orm.drizzle.team) |
| **Job Queue** | [pg-boss](https://github.com/timgit/pg-boss) (transactional, PostgreSQL-backed reliable job queue) |
| **Computer Vision** | Standalone [Google Lens API](https://github.com/arslanbasharat-o-o/Google-Lens-API) (Scrapling + Google Chrome) & OpenAI Vision OCR |
| **Containerization** | Docker, Docker Compose, Multi-stage alpine/debian runners |
| **Edge Proxy** | [Caddy 2](https://caddyserver.com) with automated Let's Encrypt TLS |

---

## Quickstart

### Prerequisites

- **Node.js**: `24.21.0` (pinned in `.nvmrc`)
- **npm**: 10+
- **PostgreSQL**: 16+ running locally or in Docker

### Local Setup

```bash
# 1. Clone repository
git clone https://github.com/arslanbasharat-o-o/RMA-System.git
cd RMA-System

# 2. Pin Node version & install dependencies
nvm use
npm ci

# 3. Configure local environment
cp .env.example .env.local
```

Edit `.env.local` to point to your local PostgreSQL instance:

```dotenv
DATABASE_URL=postgres://postgres:postgres@localhost:5432/rma_development
SESSION_SECRET=a_very_long_random_development_session_secret_at_least_32_chars
LENS_PROVIDER=mock
OPENAI_API_KEY=
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=AdminPassword123!
```

```bash
# 4. Run database migrations and synthetic seeds
npm run db:migrate
npm run db:seed

# 5. Start web application (Terminal 1)
npm run dev

# 6. Start queue worker (Terminal 2)
npm run worker
```

Open [http://localhost:3000](http://localhost:3000) and log in with `admin@example.com` / `AdminPassword123!`.

---

## Docker & Production Deployment

Production deployments run via `docker-compose.yml` with isolated networks and persistent volumes.

```bash
# 1. Setup production environment file
cp .env.example .env
chmod 600 .env

# 2. Deploy services
docker compose up -d postgres app worker

# 3. Apply migrations and seed initial administrator
docker compose exec app npm run db:migrate
docker compose exec app npm run db:seed
```

### Published Container Images

Every GitHub release publishes pre-built multi-platform container images to GitHub Container Registry:

| Image | Description | Version Tag | Latest Tag |
| :--- | :--- | :--- | :--- |
| `ghcr.io/arslanbasharat-o-o/rma-system` | Web Application (Next.js 15) | `0.3.18` | `latest` |
| `ghcr.io/arslanbasharat-o-o/rma-system` | Queue Worker (`pg-boss`) | `worker-0.3.18` | `worker-latest` |

Pull images directly:

```bash
docker pull ghcr.io/arslanbasharat-o-o/rma-system:0.3.18
docker pull ghcr.io/arslanbasharat-o-o/rma-system:worker-0.3.18
```

---

## Verification & Quality Assurance

```bash
# Static type checking
npm run typecheck

# Code quality and linting
npm run lint

# Offline unit and integration test suite
npm test

# Full production build verification
npm run build
```

---

## Documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — Comprehensive technical architecture, data boundaries, and component interaction.
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — Production setup, volume persistence, SSL certificates, and backup runbooks.
- [`SECURITY.md`](SECURITY.md) — Security boundaries, credential policies, and vulnerability disclosure.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — Guidelines for code style, PR reviews, and test requirements.
- [`docs/self-hosted-lens.md`](docs/self-hosted-lens.md) — Setup and deployment of the self-hosted Google Lens API service.
- [`docs/recognition-evaluation.md`](docs/recognition-evaluation.md) — Ground-truth evaluation methodology and manifest validation.
- [`docs/release-process.md`](docs/release-process.md) — Versioning standards, tagging workflow, and container publishing.

---

## License

This project is licensed under the [MIT License](LICENSE).
