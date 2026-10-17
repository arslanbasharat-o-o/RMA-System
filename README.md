# RMA System

[![CI](https://img.shields.io/github/actions/workflow/status/arslanbasharat-o-o/RMA-System/ci.yml?branch=main&label=CI)](https://github.com/arslanbasharat-o-o/RMA-System/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/arslanbasharat-o-o/RMA-System?label=release)](https://github.com/arslanbasharat-o-o/RMA-System/releases/latest)
[![License](https://img.shields.io/github/license/arslanbasharat-o-o/RMA-System)](LICENSE)
[![Container images](https://img.shields.io/badge/GHCR-public%20images-2496ED?logo=docker&logoColor=white)](https://github.com/orgs/arslanbasharat-o-o/packages?repo_name=RMA-System)

RMA System helps repair teams manage returned mobile displays from intake through review. Keep customer and shipment details with each return, capture inspection photos from a phone or computer, and review model and vendor suggestions in one place. Staff can check uncertain results before marking them as verified.

**Start here:** [Try the latest release](https://github.com/arslanbasharat-o-o/RMA-System/releases/latest) · [Get the Docker images](https://github.com/arslanbasharat-o-o/RMA-System/pkgs/container/rma-system) · [Set up a local copy](#quick-start) · [Deploy with Docker](DEPLOYMENT.md)

![Operations dashboard using synthetic example records](screenshots/dashboard.png)

*Dashboard preview with synthetic example records. The examples use placeholder customer, tracking, and vendor data; no customer display images are shown.*

## What it does

- Records customers, return reasons, RMA shipments, and individual display assemblies.
- Captures multiple views of a display with a mobile camera or file upload.
- Sends visual identification through SerpApi or the bundled self-hosted Google Lens API and Scrapling Chrome worker, and reads markings with OpenAI Vision OCR when configured.
- Runs recognition outside the web request in a durable `pg-boss` worker queue.
- Matches evidence against display and vendor catalogs, then routes uncertain results to a staff review queue.
- Supports administrator, operator, and viewer roles, with authenticated image delivery and reports.
- Keeps uploaded images in private persistent storage rather than in the public source tree.

Recognition providers are configurable. Local development and automated checks use mock providers and make no paid recognition requests.

## Intake flow

```mermaid
flowchart LR
  A[Create RMA with customer details] --> B[Capture display images]
  B --> C[Queue recognition]
  C --> D[Identify model and vendor]
  D --> E{Confident result?}
  E -->|Yes| F[Review and verify]
  E -->|No| G[Staff review queue]
  G --> F
```

## Application preview

The repository includes additional screenshots for the RMA list, intake form, mobile camera flow, recognition review, vendor catalog, display catalog, and review queue. They use synthetic example records.

<details>
<summary>View selected screens</summary>

### RMA intake

![RMA creation form with synthetic example data](screenshots/create-rma.png)

### Mobile display capture

![Mobile display capture interface with the browser camera unavailable fallback visible](screenshots/camera-scanner.png)

### Recognition review

![Recognition review screen with synthetic example data](screenshots/recognition-review.png)

### Vendor catalog

![Vendor catalog with a synthetic example vendor](screenshots/vendor-catalog.png)

### Review queue

![Review queue with synthetic example data](screenshots/review-queue.png)

</details>

## Architecture

The Next.js App Router serves the interface and API routes. PostgreSQL stores operational records, audit evidence, and the durable queue. A separate RMA worker processes recognition jobs. Visual searches can use the bundled self-hosted Lens API and Scrapling Chrome worker, which share a private image volume and an internal Redis queue. Uploaded RMA images stay in private Docker volumes and are delivered through authenticated routes.

```mermaid
flowchart LR
  Browser --> Web[Next.js App Router]
  Web --> DB[(PostgreSQL)]
  Web --> Queue[pg-boss queue]
  Queue --> Worker[Background worker]
  Worker --> Lens[SerpApi or private Lens API]
  Lens --> Scrapling[Scrapling and Google Chrome]
  Worker --> OCR[OpenAI Vision OCR]
  Worker --> DB
  Web --> Store[(Private image volume)]
  Worker --> Store
  Proxy[HTTPS reverse proxy] --> Web
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the data boundaries and processing flow.

## Quick start

You need Node.js 24 (the repository pins 24.21.0 in `.nvmrc`), npm, and a local PostgreSQL 16 database. Create a disposable development database before running migrations or tests.

```bash
git clone https://github.com/arslanbasharat-o-o/RMA-System.git
cd RMA-System
nvm install
nvm use
npm ci
cp .env.example .env.local
```

Edit `.env.local` with the local database URL and a unique administrator password of at least 16 characters. Keep `LENS_PROVIDER=mock` and leave provider keys empty for offline development. Then load those values into the current shell and initialize the database:

```bash
set -a
. ./.env.local
set +a
npm run db:migrate
npm run db:seed
npm run dev
```

Run the background worker in another terminal after loading the same `.env.local` values:

```bash
set -a
. ./.env.local
set +a
npm run worker
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for disposable test databases and browser checks. For Docker deployment, persistent storage, and backups, see [DEPLOYMENT.md](DEPLOYMENT.md).

For production visual recognition, keep `LENS_PROVIDER=serpapi_lens` with
`SERPAPI_API_KEY` to use the existing provider, or set `LENS_PROVIDER=self_hosted_lens`
with the private Lens service URL and key. See [the self-hosted Lens deployment guide](docs/self-hosted-lens.md).

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Database-backed tests require an isolated PostgreSQL database and synthetic fixtures. The CI workflow provisions its own PostgreSQL service and uses mock recognition. Pull requests run the camera-intake browser checks in desktop Chromium and mobile Chrome; release validation runs the full Playwright suite in both projects. Never point tests at production or use a paid recognition provider for tests.

## Configuration and deployment

`.env.example` documents local-only placeholders. Keep runtime credentials in an untracked environment file or secret manager. Do not place real customer data, uploaded images, private catalog workbooks, database dumps, or API keys in Git.

The application is self-hosted. This repository does not deploy to a production host automatically; deployment and database changes require a separately reviewed release process. Follow [DEPLOYMENT.md](DEPLOYMENT.md) and preserve the existing database and storage volumes when updating an installation.

## Project status

The application version is recorded in `release.json`. Version tags publish a GitHub Release and four versioned container images after the full release checks pass. Publishing these artifacts does not deploy or change a running installation; see [the release process](docs/release-process.md).

## Releases and container images

The current release is [RMA System v0.2.8](https://github.com/arslanbasharat-o-o/RMA-System/releases/tag/v0.2.8). GitHub Container Registry publishes separate packages for the web app, RMA worker, Lens API, and Scrapling worker:

| Image | Purpose | Versioned tag | Current tag |
| --- | --- | --- | --- |
| `ghcr.io/arslanbasharat-o-o/rma-system` | Web application | `0.2.8` | `latest` |
| `ghcr.io/arslanbasharat-o-o/rma-system` | RMA background worker | `worker-0.2.8` | `worker-latest` |
| `ghcr.io/arslanbasharat-o-o/rma-system-lens-api` | Authenticated image-search API | `0.2.8` | `latest` |
| `ghcr.io/arslanbasharat-o-o/rma-system-lens-worker` | Scrapling and Chrome worker | `0.2.8` | `latest` |

Pull both images with Docker:

```bash
docker pull ghcr.io/arslanbasharat-o-o/rma-system:0.2.8
docker pull ghcr.io/arslanbasharat-o-o/rma-system:worker-0.2.8
docker pull ghcr.io/arslanbasharat-o-o/rma-system-lens-api:0.2.8
docker pull ghcr.io/arslanbasharat-o-o/rma-system-lens-worker:0.2.8
```

The [container package page](https://github.com/arslanbasharat-o-o/RMA-System/pkgs/container/rma-system) lists available tags and image details. For an existing Compose installation, set `RMA_APP_IMAGE` and `RMA_WORKER_IMAGE` to the selected tags, then follow [the deployment guide](DEPLOYMENT.md). Releases do not roll out to a server automatically.

## Security, contributing, and license

Read [SECURITY.md](SECURITY.md) to report a vulnerability privately. Contributions should follow [CONTRIBUTING.md](CONTRIBUTING.md).

This project is licensed under the [MIT License](LICENSE). Third-party components remain under their respective licenses.
