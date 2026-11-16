# Pakistan Business Compliance AI

> Your AI-powered guide to understanding business registration, tax compliance, and regulatory filings in Pakistan.

![React](https://img.shields.io/badge/Frontend-React_19_+_TypeScript-0f766e)
![Backend](https://img.shields.io/badge/Backend-Node.js_+_Express-1e293b)
![Database](https://img.shields.io/badge/Data-Cloud_Firestore_+_SQLite_FTS5-0369a1)
![AI](https://img.shields.io/badge/AI-Gemini_%2B_OpenRouter_Fallback-4338ca)

---

## 1. What Is This Project?

**Pakistan Business Compliance AI** is an official-source-grounded regulatory research assistant built for founders, freelancers, SMEs, and consultants across Pakistan.

Unlike generic chatbots, every compliance answer, checklist item, and structure comparison first retrieves passages from indexed **SECP**, **FBR**, and **SRB** regulatory documents and cites exact document titles, sections, and page numbers.

---

## 2. Who Can Use It?

- **New entrepreneurs & freelancers:** Check NTN registration steps on FBR IRIS and compare sole proprietorships against incorporated companies.
- **Startup founders:** Compare Sole Proprietorships, Partnerships (AOP), Single Member Companies (SMC), Private Limited Companies, and Public Limited Companies side by side.
- **SMEs & compliance managers:** Generate tailored compliance checklists from your Business Profile and track filing progress.
- **Accountants & corporate advisors:** Search statutory passages, inspect historical superseded notices (such as Form 29 vs. Form 9 under Companies Regulations 2024), and summarize regulatory PDFs/DOCX files.

---

## 3. Important Disclaimer

> **Informational Guidance Only — Not Legal or Tax Advice**
>
> Pakistan Business Compliance AI provides informational assistance grounded in indexed official documents. It is **not** a substitute for a qualified advocate, chartered accountant, company secretary, or tax practitioner. Tax rates, thresholds, statutory forms, and deadlines change frequently—always verify critical decisions directly with **SECP**, **FBR**, **SRB**, or a licensed professional before filing.

---

## 4. Key Features

- **Grounded RAG Compliance Assistant:** Retrieves matching official document passages via Hybrid Vector + FTS5 BM25 search before generating structured answers (Direct Answer, Detailed Explanation, Step-by-Step Guidance, Conditions & Exceptions, What You May Need, Important Considerations) in English or Urdu (`اردو`).
- **Dual AI Provider Resilience (`Gemini + OpenRouter`):** Uses **Google Gemini (`gemini-4-hydrogen`)** as primary chat/JSON synthesis engine with automatic failover to **OpenRouter** when Gemini hits quota/rate limits (`429`) or transient outages (`500–504` / timeouts)—without masking invalid credentials or misconfigurations.
- **Strict Citation Verification & Conflict Warnings:** Strips unverified chunk references, flags historical/superseded regulations (e.g., Form 29 replaced by Form 9), and highlights source conflicts.
- **Business Compliance Checklists:** Generates profile-tailored official checklists linked to source chunks, alongside custom personal tasks, status tracking (`not_started`, `in_progress`, `completed`, `needs_review`), and notes.
- **Entity Structure Comparison:** Compares 2–4 Pakistani business structures across statutory criteria with clickable source citations and 5-minute deterministic caching.
- **Official Document Library & Summarizer:** Searches indexed documents and exact passages, inspects full extracted text and version history, and summarizes official or uploaded documents (`PDF`, `DOCX`, `HTML`, `CSV`, `TXT`, `PNG/JPG` OCR).
- **Saved Research & Bilingual Support:** Saves answers and conversations into folders, exports clean PDFs (`jsPDF`) and personal JSON workspace backups (`Settings`), and switches seamlessly between English (LTR), Urdu (RTL), Light Mode, and Dark Mode.
- **Admin Governance Console:** Protected RBAC console allowing verified administrators to upload official files, fetch allowlisted `.gov.pk` / `.gos.pk` URLs (SSRF-protected), inspect ingestion jobs, flag superseded/conflict documents, and review audit logs and user feedback.

---

## 5. Screenshots

*Capture screenshots from your live deployment and place them in `docs/screenshots/` before linking publicly:*

| Screen | Preview |
| --- | --- |
| Overview & Onboarding | `<!-- Add docs/screenshots/overview.png -->` *(Pending capture)* |
| Grounded Compliance Assistant | `<!-- Add docs/screenshots/assistant.png -->` *(Pending capture)* |
| Compliance Checklist Tracker | `<!-- Add docs/screenshots/checklist.png -->` *(Pending capture)* |
| Entity Structure Comparison | `<!-- Add docs/screenshots/compare.png -->` *(Pending capture)* |
| Official Document Library | `<!-- Add docs/screenshots/library.png -->` *(Pending capture)* |

---

## 6. Technology Stack

| Layer | Technologies |
| --- | --- |
| **Frontend** | React 19, TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), Lucide Icons, Motion, `jsPDF` |
| **Backend** | Node.js 20+, Express 4, TypeScript (`tsx`), Helmet, `express-rate-limit`, Multer |
| **Authentication** | Firebase Authentication (Email/Password + Google Sign-In) + RS256 Firebase ID Token verification |
| **User Workspace Database** | Cloud Firestore (`users`, `business_profiles`, `conversations`, `checklists`, `saved_items`, `feedback`, `admins`) |
| **Regulatory RAG Index** | SQLite (`better-sqlite3`) with FTS5 BM25 lexical search + `Float32Array` vector embeddings + `embedding_model` tracking |
| **AI & Document Pipeline** | Primary `@google/genai` (`gemini-4-hydrogen`, `gemini-embedding-2`, Vision OCR) + fallback OpenRouter API + `pdf-parse`, `mammoth`, `cheerio` |

---

## 7. Dual AI Architecture (`Gemini + OpenRouter`)

All AI calls run strictly **on the Express backend** (`server/services/aiProvider.ts` and `server/services/gemini.ts`). API keys are **never** sent to browsers.

### Routing Modes (`AI_PROVIDER`)

1. **`auto` (Recommended Default):**
   - Tries **Gemini (`LLM_MODEL`, default `gemini-4-hydrogen`)** first.
   - Automatically falls back to **OpenRouter (`OPENROUTER_MODEL`)** ONLY for eligible runtime disruptions:
     - HTTP `429` / `RESOURCE_EXHAUSTED` / rate limits
     - HTTP `500`, `502`, `503`, `504` transient outages
     - Network failures or request timeouts (`AI_REQUEST_TIMEOUT_MS`)
   - **Never silently hides broken keys or invalid configs:** `401` / `403` invalid API keys, missing models (`404`), and schema/code bugs log sanitized diagnostics and return clear actionable errors.
2. **`gemini`:** Enforces Gemini exclusively (no fallback).
3. **`openrouter`:** Routes structured chat, summaries, checklists, and comparisons exclusively through OpenRouter.

### Embeddings & RAG Continuity

- **Separated by Design:** `gemini-embedding-2` (or configured `EMBEDDING_MODEL`) vector indexing and query embeddings stay isolated from chat generation so switching chat providers or falling back to OpenRouter **never corrupts the vector index**.
- **Model Compatibility Guard:** Every embedded chunk records its `embedding_model` in `document_chunks`. Similarity scoring strictly compares vectors generated by the active model and never mixes incompatible embeddings.
- **Query Embedding Cache & Graceful Fallback:** Repeated queries hit an in-memory TTL LRU cache (reduces embedding API calls). If Gemini embedding quota is exhausted or absent, `retriever.ts` automatically falls back to **SQLite FTS5 BM25 + keyword scoring** so retrieval continues uninterrupted.
- **Re-Embedding Policy:** If you intentionally change `EMBEDDING_MODEL` in production, invoke `reembedOutdatedChunks()` (exported from `server/ingestion/pipeline.ts`) before relying on vector similarity across historical documents.

### Free-Tier OpenRouter Model Caveats

- Free models on OpenRouter (such as `openrouter/free` or `:free` variants) are subject to upstream daily/minute rate limits, occasional cold-start latency, and model slug rotation.
- Before calling chat completions with a named OpenRouter slug, `validateOpenRouterModel()` inspects OpenRouter's live `/api/v1/models` catalog (cached 10 minutes) to confirm the model exists and supports text output.
- Cost & payload guards cap context size (`AI_MAX_CONTEXT_CHARS`), output tokens (`AI_MAX_OUTPUT_TOKENS`), request timeouts (`AI_REQUEST_TIMEOUT_MS`), and cache repeated `compare` & official document `summarize` responses for 5 minutes.

---

## 8. Local Setup Guide

### Prerequisites

- **Node.js v20+** (tested on Node v22)
- **npm** or **Bun**
- A **Firebase project** with **Firebase Authentication** and **Cloud Firestore**
- A **Google Gemini API key** and/or an **OpenRouter API key**

### Steps

```bash
# 1. Clone the repository
git clone <your-github-repository-url>
cd Pakistan-Business-Compliance-AI

# 2. Install dependencies
npm install

# 3. Create your local .env from template (never commit .env!)
cp .env.example .env
# Windows PowerShell: Copy-Item .env.example .env

# 4. Run development server (Express API + Vite SPA on port 3000)
npm run dev
```

Visit `http://localhost:3000` and verify backend health at `http://localhost:3000/api/health`.

---

## 9. Environment Variables (`.env.example`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | — | Server-side Google Gemini API key (primary LLM, embeddings, Vision OCR). |
| `OPENROUTER_API_KEY` | — | Server-side OpenRouter API key (automatic fallback or primary when `AI_PROVIDER=openrouter`). |
| `OPENROUTER_MODEL` | `openrouter/free` | OpenRouter model identifier or router slug. |
| `AI_PROVIDER` | `auto` | AI routing mode: `auto`, `gemini`, or `openrouter`. |
| `LLM_MODEL` | `gemini-4-hydrogen` | Primary Gemini text/vision model. |
| `EMBEDDING_MODEL` | `gemini-embedding-2` | Embedding model identifier stored per chunk in `document_chunks`. |
| `AI_REQUEST_TIMEOUT_MS` | `30000` | Upstream AI request timeout (5,000–120,000 ms). |
| `AI_MAX_CONTEXT_CHARS` | `16000` | Context truncation ceiling to control token cost. |
| `AI_MAX_OUTPUT_TOKENS` | `1800` | Maximum output token limit passed to OpenRouter. |
| `APP_URL` | `http://localhost:3000` | Public backend/app origin added to CORS allowlist and OpenRouter `HTTP-Referer`. |
| `CORS_ORIGINS` | `""` | Comma-separated additional allowed frontend origins (required if hosting frontend on Vercel). |
| `PORT` | `3000` | Server port (Cloud Run & Render inject this automatically). |
| `VITE_API_BASE_URL` | `""` | Leave blank for same-origin Cloud Run / AI Studio. Set to backend URL (e.g., `https://api.example.com`) when frontend is hosted separately on Vercel. |
| `DATABASE_PATH` | `./data/compliance.db` | Local SQLite RAG + FTS5 database path. |
| `STORAGE_PATH` | `./data/uploads` | Private local directory for uploaded document processing. |
| `DATABASE_URL` | `""` | Optional managed PostgreSQL connection string for future production database migration. |
| `ADMIN_EMAILS` | `""` | Comma-separated verified admin emails allowed on `/api/admin/*`. |

---

## 10. Firebase Setup Checklist

1. **Enable Authentication Providers:**
   - Open **Firebase Console -> Authentication -> Sign-in method**.
   - Enable **Email/Password** (required for registration & login forms) and optionally **Google Sign-In**.
   - Under **Authentication -> Settings -> Authorized domains**, add your deployed Cloud Run / Vercel / custom domain (and `localhost` for local testing).
2. **Deploy Security Rules:**
   - Rules live in `firestore.rules` and are validated with `npx eslint firestore.rules`.
   - Deploy updated rules with `firebase deploy --only firestore:rules`.
3. **Grant Admin Privileges (RBAC):**
   - Add an immutable document at `/admins/{uid}` in Cloud Firestore (cannot be self-created from browser SDKs).
   - Also set the verified admin email in the server `ADMIN_EMAILS` environment variable for `/api/admin/*` routes.

---

## 11. Production Persistence & Migration Architecture

### Current Hybrid Storage Model

- **User Workspaces (Persistent across deploys):** Stored in **Cloud Firestore** (`users`, `business_profiles`, `conversations`, `checklists`, `saved_items`, `feedback`). Safe on stateless containers like Cloud Run.
- **Regulatory RAG Index & Uploaded Documents:** Currently stored in local SQLite (`DATABASE_PATH`) and local disk (`STORAGE_PATH`). On stateless containers (Cloud Run without mounted volumes, or free Render web services without a persistent disk), local files reset to the 6 seeded baseline SECP/FBR/SRB documents on container rebuild.

### Recommended Production Upgrade Path (When Scaling Past Starter Tier)

To make admin-uploaded documents and custom vectors persist permanently across container restarts and horizontal scaling:

1. **Managed PostgreSQL + `pgvector` (via `DATABASE_URL`):**
   - Replace SQLite `document_chunks` with PostgreSQL `vector(N)` columns indexed with HNSW (`CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)`) plus native `tsvector` + GIN indexes for hybrid lexical + semantic search.
   - Keep `embedding_model` metadata on every chunk row and migrate baseline/admin documents using a one-time idempotent export/upsert script keyed by `documents.checksum` (SHA-256).
2. **Private Cloud Object Storage (GCS or S3/R2):**
   - Store admin-uploaded source PDFs/DOCX/images in a **private** bucket keyed by `${sha256}_${sanitizedFilename}` instead of `STORAGE_PATH` local disk.
   - Never expose raw bucket URLs publicly; serve authorized downloads via short-lived signed URLs or authenticated backend streams.
3. **Important Cost Note:** Provisioning Cloud SQL (PostgreSQL) or mounted persistent disks may incur cloud charges depending on your plan tier. Keep `DATABASE_URL` unset while operating zero-cost Starter/demo deployments.

---

## 12. Deployment Guides

### Option A: Google AI Studio Publish -> Google Cloud Run (Single Full-Stack Service)

This repository runs frontend + Express backend on a single server listening on `0.0.0.0:$PORT`, making it natively compatible with **Google Cloud Run**.

1. In Google AI Studio, open **Settings -> Secrets** and configure:
   - `GEMINI_API_KEY`
   - `OPENROUTER_API_KEY` *(optional fallback)*
   - `AI_PROVIDER=auto`
   - `OPENROUTER_MODEL=openrouter/free`
   - `ADMIN_EMAILS` *(verified admin email(s), if needed)*
2. Ensure `firebase-applet-config.json` and `firestore.rules` are synced with your Firebase project, and Email/Password + Authorized Domains are enabled in Firebase Console.
3. Click **Publish** in Google AI Studio to deploy to Cloud Run (`npm run build` followed by `npm start`).
4. Note the deployed Cloud Run `https://...run.app` URL:
   - Add that exact hostname to **Firebase Console -> Authentication -> Settings -> Authorized domains**.
   - Set `APP_URL` to that Cloud Run URL so CORS & OpenRouter headers match production.
   - Verify health at `https://<your-cloud-run-url>/api/health`.
5. **Cloud Run Notes:** Cloud Run's starter tier scales down when idle (cold starts take a few seconds). Because container filesystems on Cloud Run are ephemeral, admin-uploaded custom documents revert on container replacement unless migrated to PostgreSQL + GCS (see Section 11).

### Option B: Split Hosting (`Vercel` Frontend + `Render` Backend)

1. **Deploy Backend on Render:**
   - Create a Web Service connected to your GitHub repo.
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - Set environment variables: `NODE_ENV=production`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `AI_PROVIDER=auto`, `OPENROUTER_MODEL`, `CORS_ORIGINS=https://your-app.vercel.app`, `APP_URL=https://your-backend.onrender.com`, `ADMIN_EMAILS`.
   - *(Optional)* Attach a Render Persistent Disk mounted at `/var/data` and set `DATABASE_PATH=/var/data/compliance.db` and `STORAGE_PATH=/var/data/uploads`.
2. **Deploy Frontend on Vercel:**
   - Import the same GitHub repo as a Vite project (**Output Directory:** `dist`).
   - Add Vercel Environment Variable: `VITE_API_BASE_URL=https://your-backend.onrender.com`
   - Add your `https://your-app.vercel.app` domain to **Firebase Console -> Authentication -> Authorized domains** AND to Render's `CORS_ORIGINS`.

---

## 13. Security & Privacy Architecture

- **Firebase Auth & Server JWT Verification:** Protected `/api/*` endpoints verify RS256 Firebase ID Tokens against Google X.509 certificates (`aud`, `iss`, `sub`, `exp`, `iat`).
- **Firestore Zero-Trust Isolation:** `firestore.rules` defaults to `allow read, write: if false;`, checks `request.auth.uid == userId` on all workspace collections, validates fields/types/batch consistency, and checks `email_verified == true` + `/admins/{uid}` for admin actions.
- **Strict Secret Separation:** `GEMINI_API_KEY` and `OPENROUTER_API_KEY` never leave the backend. `.env` and local databases are excluded in `.gitignore`.
- **SSRF & Abuse Controls:** Remote document ingestion permits only verified Pakistani official domains (`secp.gov.pk`, `fbr.gov.pk`, `srb.gos.pk`, `pakistancode.gov.pk`, `eobi.gov.pk`) and blocks private/loopback/metadata IPs. Express enforces Helmet headers, explicit origin checks on `/api/*`, rate limiting (`120 req/min` API, `25 req/min` AI endpoints), extension whitelists, and 10 MB upload caps.

---

## 14. Verification & Testing

Run the full quality & security test suite before committing or deploying:

```bash
npm run lint                  # Strict TypeScript check (tsc --noEmit)
npx eslint firestore.rules    # Static security-rule audit
npm test                      # Backend unit + mocked dual-AI + Express HTTP integration tests
npm run build                 # Production Vite bundle check
```

> Note: Automated tests in `server/tests/api.test.ts` use deterministic mocks for Gemini & OpenRouter network calls alongside a real SQLite/FTS5 database and live Express HTTP server bound to localhost so CI verification runs reliably without consuming API quota.

---

## 15. Publishing to GitHub

Before pushing to a public repository, verify no `.env`, `*.db`, `data/`, or `*.zip` files are staged:

```bash
git status
git add .
git commit -m "Complete dual-AI resilience, portability, and production readiness updates"
git push origin main
```

---

## 16. Troubleshooting

- **`auth/operation-not-allowed` during signup:** Enable **Email/Password** in Firebase Console -> Authentication -> Sign-in method.
- **Google Sign-In fails on deployed URL:** Add your Cloud Run / Vercel / custom hostname under **Firebase Console -> Authentication -> Settings -> Authorized domains**.
- **`503 AI_PROVIDER_UNAVAILABLE`:** Neither `GEMINI_API_KEY` nor `OPENROUTER_API_KEY` is configured on the backend server. Set at least one valid key in environment variables/secrets and restart.
- **CORS 403 when calling backend from Vercel:** Add your exact `https://your-app.vercel.app` origin (no trailing slash) to backend `CORS_ORIGINS`.
- **`OPENROUTER_MODEL` rejected:** Verify the exact slug on `https://openrouter.ai/models` (or set `OPENROUTER_MODEL=openrouter/free`).
