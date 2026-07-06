# JARVIS PRIME — Enterprise Migration Priority Roadmap

This roadmap arranges the migration steps in order of **technical priority and dependency**. P0 (Critical Security & Isolation) must be implemented first, as all subsequent features (Temporal workflows, integrations, scaling) depend on a secure database and authentication structure.

---

```mermaid
graph TD
    subgraph P0: Critical Foundation (Security & Isolation)
        P0_1[1. Secrets Management & Vault] --> P0_2[2. Database Encryption pg_crypto]
        P0_2 --> P0_3[3. Identity & RLS Multi-Tenancy]
    end

    subgraph P1: Core Reliability & Capabilities
        P0_3 --> P1_1[4. Temporal Workflow Engine]
        P1_1 --> P1_2[5. OAuth2 Client Integrations]
        P1_2 --> P1_3[6. LangGraph AI Agents]
    end

    subgraph P2: Scale, Monitoring & Operations
        P1_3 --> P2_1[7. Redis Caching & Rate Limits]
        P2_1 --> P2_2[8. JSON Logging & Prometheus]
        P2_2 --> P2_3[9. Docker, K8s, & Terraform IaC]
    end
```

---

## 🔴 P0: Critical Foundation (Security & Tenant Isolation)

Implement these steps first. Without secure credential management and strict database level isolation, the system cannot safely support multiple customers.

### 1. Secrets Management (Vault / Infisical)
*   **Objective**: Remove all plain-text sensitive variables from `.env` files.
*   **Steps**:
    1. Spin up a HashiCorp Vault or Infisical cluster.
    2. Define secret scopes (Development, Staging, Production).
    3. Modify [config.js](file:///Users/anujsingh/Jarvis%20ai%20company/engine/src/config.js) to resolve variables dynamically from the vault transit manager at runtime.

### 2. Database Field-Level Encryption (pg_crypto)
*   **Objective**: Ensure that if the database is compromised, client access tokens and cookies remain unreadable.
*   **Steps**:
    1. Run `CREATE EXTENSION IF NOT EXISTS pgcrypto;` on your Supabase Postgres instance.
    2. Encrypt sensitive columns (e.g. `linkedin_cookie`, `resend_api_key`) using `pgp_sym_encrypt` on insertion.
    3. Update [db.js](file:///Users/anujsingh/Jarvis%20ai%20company/engine/src/lib/db.js) to decrypt columns using `pgp_sym_decrypt` on query read.

### 3. Identity and Row-Level Security (Keycloak/Auth0 + Postgres RLS)
*   **Objective**: Transition from single-secret header auth to dynamic multi-tenant JSON Web Token (JWT) verification.
*   **Steps**:
    1. Set up Auth0 or Keycloak and create user client profiles.
    2. Replace the auth token checker in [runner.js](file:///Users/anujsingh/Jarvis%20ai%20company/engine/src/runner.js) with token signature verification against the Identity Provider's JWKS endpoint.
    3. Apply Row Level Security (RLS) policies in [schema.sql](file:///Users/anujsingh/Jarvis%20ai%20company/engine/sql/schema.sql) so database queries default to the current caller's tenant context.

---

## 🟡 P1: Core Reliability & Capabilities (Workflow & AI Agents)

With tenant security resolved, replace the MVP scripting engine with resilient enterprise-grade workflow workers and AI agent graph layers.

### 4. Temporal Workflow Engine Migration
*   **Objective**: Replace the built-in scheduler (`scheduler.js`) with a fault-tolerant distributed workflow engine that handles state retention, automatic retries, and failures.
*   **Steps**:
    1. Set up a Temporal cluster.
    2. Convert outreach sequences into Temporal Workflows (`OutreachWorkflow`).
    3. Map email generation, sending, and LinkedIn DMs into decoupled Temporal Activities.
    4. Implement Temporal workflow timers to wait days/weeks securely without process-crash state loss.

### 5. Enterprise Integrations & OAuth2 Flow
*   **Objective**: Allow clients to safely authorize their own outreach accounts (Gmail, Google Calendar, HubSpot) via standardized consent pages.
*   **Steps**:
    1. Register OAuth2 applications on Google Cloud Platform, Microsoft Entra, and HubSpot developer portals.
    2. Create secure OAuth redirect callback routes in the Express API to receive auth codes.
    3. Securely store encrypted refresh tokens in the Postgres DB using pg_crypto.

### 6. AI Agent Platform Upgrade (LangGraph & Vector DB)
*   **Objective**: Introduce context-aware AI agents instead of simple template completions, complete with prompt injection safeguards.
*   **Steps**:
    1. Rebuild prospect qualification pipelines using LangGraph state machines.
    2. Set up pgvector inside the PostgreSQL database.
    3. Index company data, PDFs, and client scripts to perform Vector Semantic Searches, providing precise contextual parameters to the LLM during email writing.

---

## 🔵 P2: Scale, Monitoring & Operations (Production Hardening)

Hardening steps that can be run once the core features are validated.

### 7. Caching and Distributed Rate Limiting (Redis)
*   **Objective**: Scale backend APIs across multiple instances and cache frequent database queries.
*   **Steps**:
    1. Setup a Redis cluster.
    2. Replace Express in-memory rate limiting with Redis token bucket middleware.
    3. Cache database dashboard queries.

### 8. Structured Logging & Prometheus Metrics
*   **Objective**: Acquire full visibility over system performance, API latency, queue lag, and error rates.
*   **Steps**:
    1. Install `winston` / `pino` to write structured logs in JSON format.
    2. Stream JSON logs to Grafana Loki or ELK.
    3. Integrate `prom-client` in Express to expose metric endpoints.

### 9. Infrastructure as Code (Docker + Kubernetes + Terraform)
*   **Objective**: Automate the provisioning of databases, caches, K8s clusters, and deployment pipelines.
*   **Steps**:
    1. Standardize backend and frontend Dockerfiles.
    2. Write Terraform files (`main.tf`) to define AWS EKS, AWS RDS, and AWS ElastiCache resources.
    3. Write Helm charts to deploy the containers across Kubernetes, using Horizontal Pod Autoscaling (HPA).
