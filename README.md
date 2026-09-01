# 🤖 Autonomous Social Media AI Pipeline

> **An autonomous, multi-tenant content generation, design & publishing platform for LinkedIn, Instagram, Threads, Telegram, VK and beyond — powered by microservice AI agents, RAG fact-grounding, Puppeteer carousel rendering, Telegram Human-in-the-Loop moderation, and Kubernetes (K3s + KEDA) cloud infrastructure.**

![Autonomous Social Media AI Pipeline Banner](docs/banner.jpg)

[![Node.js](https://img.shields.io/badge/Node.js-v20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Next.js 15](https://img.shields.io/badge/Next.js-15.0+-black.svg)](https://nextjs.org/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-K3s-326CE5.svg)](https://k3s.io/)
[![KEDA](https://img.shields.io/badge/Autoscaling-KEDA-orange.svg)](https://keda.sh/)
[![BullMQ](https://img.shields.io/badge/BullMQ-Redis-red.svg)](https://bullmq.io/)
[![Docker](https://img.shields.io/badge/Docker-GHCR-2496ED.svg)](https://github.com/features/packages)
[![Microsoft Azure](https://img.shields.io/badge/Cloud-Microsoft_Azure-0078D4.svg)](https://azure.microsoft.com/)
[![Telegram Bot](https://img.shields.io/badge/Telegram-Bot_API-2CA5E0.svg)](https://core.telegram.org/bots)

---

## 📋 Table of Contents

1. [🌟 Business Value & Core Capabilities](#-business-value--core-capabilities)
   - [The Problem We Solve](#the-problem-we-solve)
   - [Key Capabilities](#key-capabilities)
   - [Multi-Tenant Portals](#multi-tenant-portals)
2. [🏗 System Architecture & Tech Stack](#-system-architecture--tech-stack)
   - [Agent Interaction Flowchart](#agent-interaction-flowchart)
   - [Microservices Breakdown](#microservices-breakdown)
   - [Reliability & Brand Safety Mechanisms](#reliability--brand-safety-mechanisms)
3. [📱 Telegram Bot: Mobile Human-in-the-Loop](#-telegram-bot-mobile-human-in-the-loop)
4. [☸️ Production Deployment: Microsoft Azure + K3s + KEDA](#️-production-deployment-microsoft-azure--k3s--keda)
   - [Architecture & Scale-to-Zero](#architecture--scale-to-zero)
   - [Automated Setup on Azure VM](#automated-setup-on-azure-vm)
   - [GitHub Actions CI/CD Pipeline](#github-actions-cicd-pipeline)
   - [Kubernetes Database Seeding](#kubernetes-database-seeding)
5. [🐳 Local Quickstart: Docker Compose](#-local-quickstart-docker-compose)
   - [Prerequisites](#prerequisites)
   - [Environment Setup (.env)](#environment-setup-env)
   - [Docker Compose Run](#docker-compose-run)
   - [Local Database Seeding](#local-database-seeding)
6. [🧪 Testing & API Reference](#-testing--api-reference)
7. [📚 Documentation Index](#-documentation-index)

---

## 🌟 Business Value & Core Capabilities

### The Problem We Solve

Creating high-performing B2B and media content (**LinkedIn, Telegram, Threads, VK, Instagram**) traditionally requires a large agency: *a copywriter, a domain engineer (GxP / system architecture / cinema lore), a graphic designer, an editor, and an SMM manager*. Running such a team costs **$3,000 to $10,000+ per month**, and publishing a single verified post with custom graphics takes 2–3 days.

This platform automates the end-to-end content engineering pipeline:
- **Reduces content marketing costs by up to 90%**.
- **Generates publish-ready posts with styled carousels in 20 seconds**.
- **Strong Brand Safety & Regulatory Compliance** — near-zero numeric hallucinations on our internal eval set (RAG-grounded facts, validated against golden datasets), strict adherence to FDA/EMA standards (21 CFR Part 11, GxP), with automated checks blocking forbidden terms and cross-brand hashtag leakage.
- **Human-in-the-Loop (HITL) via Telegram:** Approve, edit copy, or trigger re-generation in 1 tap directly from your phone.
- **Cloud Scale-to-Zero:** Resource-heavy microservices (Puppeteer design renderer and AI writers) scale to 0 pods when idle using KEDA Redis triggers, running 24/7 on minimal cloud hardware.

---

### Key Capabilities

- 🏢 **Multi-Tenancy Architecture (`tenantId`):** Manage dozens of independent brands and media channels on a single infrastructure with isolated style guides, color palettes, and factual knowledge bases.
- 🎨 **Automated Puppeteer Carousel Engine:** Dynamically renders high-resolution (1080x1350 PNG) branded carousels tailored to post topics with SVG/PNG illustrations and dynamic article cover extraction.
- 📱 **Telegram Bot Workflow:** Full mobile moderation cockpit — album previews, inline editing, live container logs viewing, and interactive `/daily_cinema` RSS feed curator.
- 📚 **RAG Fact Grounding:** Automatic verification of technical specs and regulatory numbers against a database of verified facts (`fact_chunks`).
- 🤖 **Self-Correction & Quality Drift:** Evaluator agent audits alignment against Golden Datasets. If an alignment score is `< 85%`, the system automatically re-generates the post before human review.
- ⚡ **High-Speed LPU Inference:** Powered by Groq (`llama-3.3-70b-versatile` & `openai/gpt-oss-120b`) and Google Gemini (`gemini-2.0-flash`) for sub-3-second generation and literary-grade Russian/English copywriting.
- ☸️ **Kubernetes Event-Driven Autoscaling (KEDA):** Dynamic pod scaling based on BullMQ queue depths in Redis.

---

### Multi-Tenant Portals

| Portal | Target Audience | Platforms | Specialized Content Pillars |
| :--- | :--- | :--- | :--- |
| **💻 Tech Portal** (`software-development-default`) | Senior Developers, Architects, CTOs | LinkedIn, Telegram, Threads | - `github-trending-repos` (Curated Repo Roundups)<br/>- `architecture-deep-dive` (System Design & Tradeoffs)<br/>- `pet-projects-showcase` (Dev Showcase) |
| **🧪 Testo Pharma Portal** (`testo`) | QA Directors, Pharma Engineers, Warehouse Managers | Instagram, Telegram, Threads | - `pharma-compliance-explained` (GxP & 21 CFR Part 11)<br/>- `pharma-cold-chain-story` (Cold Chain & GDP Logistics)<br/>- `testo-device-breakdown` (Saveris Pharma, Testo 190) |
| **🏭 Testo Gas Industrial** (`testo`) | Chief Power Engineers, Boiler Operators, Ecologists | Telegram, LinkedIn, Threads | - `gas-boiler-efficiency` (Testo 300, Burner Tuning)<br/>- `gas-industrial-emissions` (Testo 350, Flue Gas & NOx)<br/>- `gas-safety-leak-detection` (Testo 316-EX) |
| **🎬 Cinema Media Hub** (`cinema-media`) | Pop-Culture, Movie & MCU Fans | Telegram, Threads, VK | - `cinema-marvel-mcu-lore` (MCU canon, Easter Eggs)<br/>- `cinema-history-curiosities` (Backstage, Rare facts)<br/>- `cinema-boxoffice-records` (Box office, Casting news) |

---

## 🏗 System Architecture & Tech Stack

### Agent Interaction Flowchart

The system is designed as an **asynchronous microservice graph** orchestrated by **OpenClaw** via **BullMQ / Redis** job queues:

```mermaid
flowchart TD
    Client([User / Telegram Bot / Cron]) -->|POST /runs| OC[OpenClaw Orchestrator :4000]
    
    subgraph Pipeline [AI Content Pipeline]
        OC -->|Job: Trend Search| AG_Trend[Agent Trend Intelligence]
        AG_Trend -->|Trend Data + RSS Poster| AG_Pos[Agent Positioning]
        AG_Pos -->|Filtered Topic| AG_Strat[Agent Strategy]
        AG_Strat -->|Content Plan & Format| AG_Write[Agent Writing + RAG]
        AG_Write -->|Draft Text| AG_Design[Agent Design + Puppeteer]
        AG_Design -->|Rendered PNG Carousel| AG_SEO[Agent SEO Audit]
        AG_SEO -->|Optimized Post| AG_Eval[Agent Evaluator]
    end

    AG_Eval -->|Alignment Score >= 85%| ReviewNode[Awaiting Approval State]
    AG_Eval -->|Alignment Score < 85%| AG_Write
    
    ReviewNode -->|Instant Preview| TG[Telegram Bot Mobile Cockpit]
    ReviewNode -->|Full Inspection| UI[Next.js 15 Web Dashboard :3005]
    
    TG -->|Human Approved| AG_Pub[Agent Publishing]
    UI -->|Human Approved| AG_Pub
    AG_Pub -->|Post Article & Carousel| Platforms[Telegram / LinkedIn / Threads / VK]
```

---

### Microservices Breakdown

| Microservice | Port | Tech Stack | Responsibility |
| :--- | :--- | :--- | :--- |
| **`openclaw`** | `:4000` | Node.js, Express, BullMQ | Orchestrator: manages state transitions, run lifecycle, and human approval APIs. |
| **`agent-trend-intelligence`**| `:4001` | Node.js, Jina API, Cheerio | Scrapes trends from GitHub, Hacker News, Dev.to, and cinema RSS feeds. Extracts article posters. |
| **`agent-positioning`** | `:4002` | Node.js, LLM | Filters news & trends against the author's positioning matrix and company profile. |
| **`agent-content-strategy`** | `:4003` | Node.js, LLM | Selects content pillar, carousel/text format, and post structure. |
| **`agent-writing`** | `:4004` | Node.js, RAG Engine, MongoDB | Drafts post copy with prompt isolation, RAG fact verification, and Cyrillic fallback guard. Scales with KEDA. |
| **`agent-design`** | `:4005` | Node.js, Puppeteer Pool | Generates HTML/CSS templates and renders high-resolution PNG slides (1080x1350). Scales with KEDA. |
| **`agent-seo`** | `:4006` | Node.js, LLM | Audits readability, character counts, and platform-specific limits. |
| **`agent-evaluator`** | `:4008` | Node.js, Zod Validator | Evaluates drift against Golden Datasets, verifies disclaimers & CTAs. |
| **`agent-publishing`** | `:4007` | Node.js, REST APIs | Auto-publishes approved materials to social media platforms via official APIs. |
| **`telegram-bot`** | — | Node.js, Grammy / Telegraf | Interactive mobile Human-in-the-Loop interface for approval, editing, and curation. |
| **`web-dashboard`** | `:3005` | Next.js 15, React, Vanilla CSS | Full-featured frontend web dashboard for pipeline management, review, and live editing. |

---

### Reliability & Brand Safety Mechanisms

1. **Strict Prompt Isolation:**
   When generating content for a specific pillar, the system prompt receives **only** the guidelines of that target pillar, preventing cross-rubric tone pollution.
2. **Deterministic RAG Grounding:**
   Numbers, instrument specifications, and compliance rules are verified against `fact_chunks` stored in MongoDB.
3. **Bidirectional Hashtag Protection:**
   A deterministic sanitizer physically prevents tag leakage: IT tags (`#github`, `#backend`) are stripped from Testo posts, and pharma tags (`#gxp`, `#pharma`) are stripped from Tech posts.
4. **Automated Cyrillic Guard:**
   If an LLM inadvertently returns Latin/English prose for Russian portals, the pipeline automatically triggers an enrichment adaptation pass into structured Russian before presenting to the user.
5. **Shared Puppeteer Browser Pool:**
   `getSharedBrowser()` reuses headless Chromium instances with sequential mutex locks, preventing memory leaks and CPU spikes.

---

## 📱 Telegram Bot: Mobile Human-in-the-Loop

The Telegram Bot allows content managers and business owners to manage the entire pipeline from their smartphone:

* 🖼 **Multi-Photo Albums:** Sends the rendered 5-slide carousel directly as a Telegram photo album.
* 📝 **Full Post Text Preview:** Displays formatted text with hooks, bullet points, quotes, and hashtags.
* ⚡ **Action Cockpit:**
  * `✅ Опубликовать` — Approves and publishes to targeted social networks.
  * `✏️ Редактировать текст` — Direct interactive in-chat text editing.
  * `🔄 Сгенерировать заново` — Sends the run back to `agent-writing` with optional feedback.
  * `📋 Логи прогона` — Instant view of container logs and LLM model stats.
* 🍿 **`/daily_cinema` Curator:** Interactive feed selector allowing the user to browse fresh/popular cinema articles with cover art and launch a tailored generation pipeline with 1 click.

---

## ☸️ Production Deployment: Microsoft Azure + K3s + KEDA

The entire microservice pipeline is designed for cloud-native deployment on **Microsoft Azure** (compatible with Azure Free Trial $200 and Azure for Students $100 tier).

### Architecture & Scale-to-Zero

```mermaid
flowchart LR
    Ingress["Traefik Ingress :80/:443"] --> Dashboard["web-dashboard Pod"]
    Ingress --> API["openclaw Orchestrator Pod"]

    Bot["telegram-bot Pod"] --> API
    API --> Redis[("Redis BullMQ")]
    API --> Mongo[("MongoDB PVC")]

    KEDA["KEDA ScaledObject"] -->|"Monitors BullMQ Queues"| Redis
    KEDA -->|"Queue > 0: Scale 1→2"| Writer["agent-writing Pods"]
    KEDA -->|"Queue > 0: Scale 1→2"| Designer["agent-design Puppeteer Pods"]
    KEDA -.->|"Queue == 0: Scale 0"| Writer
    KEDA -.->|"Queue == 0: Scale 0"| Designer
```

### Automated Setup on Azure VM

1. **Provision Virtual Machine** (`Ubuntu 24.04 LTS`, `Standard_B2s` or `Standard_B2ls_v2`):
   ```bash
   bash scripts/azure/provision-vm.sh
   ```

2. **Connect via SSH and Install K3s, Helm & KEDA**:
   ```bash
   ssh -i ~/.ssh/vm-key.pem azureuser@<YOUR_VM_IP>
   
   curl -sSL https://raw.githubusercontent.com/maoroch/Autonomous_social_intelligence_engine/main/scripts/azure/setup-k3s.sh | bash
   ```

3. **Configure Secrets & Deploy Cluster**:
   ```bash
   cd ~/linkedin_ai-agent_tool
   nano k8s/secret-template.yaml   # Fill GROQ_API_KEY, TELEGRAM_BOT_TOKEN, etc.
   bash scripts/azure/deploy-k8s.sh
   ```

4. **Detailed Guide**: See [docs/k8s-azure-deployment-guide.md](docs/k8s-azure-deployment-guide.md) for full step-by-step instructions with SSL and Ingress details.

### GitHub Actions CI/CD Pipeline

The repository includes complete GitHub Actions workflows:
- **`.github/workflows/ci.yml`**: Runs TypeScript typechecks and all unit tests on every pull request.
- **`.github/workflows/cd-deploy.yml`**: Builds and pushes Docker images to GitHub Container Registry (`ghcr.io`) and executes rolling deployment to the Azure K3s cluster.

### Kubernetes Database Seeding

Once deployed in Kubernetes, seed all portal data inside the cluster:

```bash
# Seed Organizations & Multi-Tenant Portals
kubectl exec -n linkedin-pipeline -it deploy/openclaw -- npx tsx src/scripts/seed-organizations.ts

# Seed RAG Fact Chunks (Testo Pharma & Gas Facts)
kubectl exec -n linkedin-pipeline -it deploy/openclaw -- npx tsx src/scripts/seed-fact-chunks.ts

# Seed Golden Datasets for Quality Evaluator
kubectl exec -n linkedin-pipeline -it deploy/openclaw -- npx tsx src/scripts/seed-golden.ts

# Seed Default Portal Users
kubectl exec -n linkedin-pipeline -it deploy/openclaw -- npx tsx src/scripts/seed-users.ts
```

> [!WARNING]
> **These are seed credentials for local development only. Change all passwords before any internet-facing deployment.**
> Never use these values in staging or production.

Default credentials (local/demo only):
- **Tech Portal**: `http://<IP>/software-development-default/login` — email: `admin@tech.local`, password: `changeme-tech-2026`
- **Testo Portal**: `http://<IP>/testo/login` — email: `admin@testo.local`, password: `changeme-testo-2026`
- **Cinema Hub**: `http://<IP>/cinema-media`

---

## 🐳 Local Quickstart: Docker Compose

### Prerequisites

- **Docker** & **Docker Compose** (v2.20+)
- **Node.js** v20+ (for local workspace development)

### Environment Setup (.env)

1. Clone the repository:
   ```bash
   git clone https://github.com/maoroch/Autonomous_social_intelligence_engine.git
   cd Autonomous_social_intelligence_engine
   ```

2. Copy the environment configuration template:
   ```bash
   cp .env.example .env
   ```

3. Configure your API keys in `.env`:
   ```env
   NODE_ENV=development
   PORT=4000
   MONGO_URI=mongodb://mongo:27017
   MONGO_DB_NAME=linkedin_pipeline
   REDIS_HOST=redis
   REDIS_PORT=6379
   
   # AI Provider Keys
   GROQ_API_KEY=your_groq_api_key_here
   GOOGLE_API_KEY=your_gemini_api_key_here
   
   # Telegram Bot Configuration
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   TELEGRAM_ADMIN_CHAT_ID=your_chat_id_here
   AUTH_SECRET=your_secret_string_here
   ```

### Docker Compose Run

Spin up all microservices, MongoDB, and Redis in containers:

```bash
docker compose up --build -d
```

Verify status:
```bash
docker compose ps
```

> [!TIP]
> - Web Dashboard: **[http://localhost:3000](http://localhost:3000)** (or `:3005`)
> - OpenClaw Orchestrator API: **[http://localhost:4000](http://localhost:4000)**

### Local Database Seeding

```bash
docker compose exec openclaw npx tsx services/openclaw/src/scripts/seed-organizations.ts
docker compose exec openclaw npx tsx services/openclaw/src/scripts/seed-fact-chunks.ts
docker compose exec openclaw npx tsx services/openclaw/src/scripts/seed-golden.ts
docker compose exec openclaw npx tsx services/openclaw/src/scripts/seed-users.ts
```

---

## 🧪 Testing & API Reference

Run automated test suites locally:
```bash
# Run unit tests across all microservices
npm run build -w shared-lib
npx tsx --test services/telegram-bot/src/__tests__/*.test.ts \
               services/agent-trend-intelligence/src/__tests__/*.test.ts \
               services/agent-design/src/__tests__/*.test.ts
```

Trigger pipeline runs programmatically via `curl` or REST API:

### 1. Cinema Media Hub (Telegram / Movie Curiosities):
```bash
curl -X POST http://localhost:4000/runs \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "cinema-media",
    "targetPillarId": "cinema-history-curiosities",
    "topic": {
      "title": "Звезды, которые были успешны до своей главной роли в кино",
      "summary": "Харрисон Форд работал плотником, а Кен Джонг был практикующим врачом."
    }
  }'
```

### 2. Testo Industrial Gas Analyzers:
```bash
curl -X POST http://localhost:4000/runs \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "testo",
    "targetPillarId": "gas-industrial-emissions",
    "topic": {
      "title": "Сферы применения газоанализатора Testo 350: от котельных до металлургии",
      "summary": "Обзор применения Testo 350 для РНИ котлов, эко-контроля выбросов ТЭЦ, ГПУ и печей."
    }
  }'
```

### 3. Tech Portal (LinkedIn / GitHub Trending):
```bash
curl -X POST http://localhost:4000/runs \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "software-development-default",
    "targetPillarId": "github-trending-repos",
    "topic": {
      "title": "Top 5 Developer Tools 2026",
      "summary": "Best open source tools for backend engineers"
    }
  }'
```

---

## 📚 Documentation Index

Detailed documentation and architectural blueprints are available in the [`docs/`](docs/README.md) directory:

* ☸️ [Azure K3s & KEDA Deployment Guide](docs/k8s-azure-deployment-guide.md) — Comprehensive guide for production Azure VM deployment, K3s, KEDA, and CI/CD.
* 🏛 [Architecture & System Design](docs/architecture.md) — Microservices, BullMQ queues, MongoDB/GridFS, LLM model policies.
* ⚙️ [OpenClaw Orchestrator](docs/openclaw-orchestrator.md) — State machine, lifecycle stages, Quality Loop, and HITL.
* 🤖 [Agents Specification](docs/agents-specification.md) — Full reference for all 7 AI agents: schemas, prompts, and isolation rules.
* 📱 [Telegram Bot Guide](docs/telegram-bot-guide.md) — Mobile moderation workflow, slide albums, and inline editors.
* 🎬 [Cinema Media Strategy](docs/cinema-media-strategy.md) — Pop-culture, Marvel/MCU lore, and entertainment pillars.
* 🧪 [Testo Pharma Strategy](docs/testo-pharma-strategy.md) — GxP, 21 CFR Part 11, cleanrooms, and RAG grounding.
* 🏭 [Testo Gas Analyzers Strategy](docs/testo-gas-strategy.md) — Industrial boilers, power plants, and emissions monitoring.
* 💻 [Tech Pillars Specification](docs/tech-pillars-spec.md) — Senior dev & software architecture content rubric.
* 💡 [Cloud Deployment & K8s Idea](docs/azure-k8s-deployment-idea.md) — Azure Student Tier ($100), K3s, Scale-to-Zero & KEDA.

---

## 📄 License & Authors

Designed & developed with modern microservice architecture, multi-tenant AI pipelines, and Kubernetes event-driven autoscaling. All rights reserved.
