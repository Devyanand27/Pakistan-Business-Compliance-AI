# Pakistan Business Compliance AI

An official-source-grounded regulatory research, checklist, and guidance platform for Pakistani entrepreneurs, startups, freelancers, SMEs, and accountants covering **SECP**, **FBR**, and **SRB** compliance.

---

## Core Architecture

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Lucide Icons, bilingual English (LTR) & Urdu (RTL) layout, Light/Dark modes, and client-side PDF export (`jsPDF`).
- **Authentication & User Persistence (Firebase):**
  - **Firebase Authentication:** Email/Password registration, sign-in, password reset, and optional Google Sign-In (`signInWithPopup`).
  - **Cloud Firestore (`firestore.rules`):** Per-user isolated storage for user profiles (`users/{uid}`), business profiles (`business_profiles/{uid}`), research conversations & messages (`conversations/{id}/messages`), compliance checklists (`checklists/{id}/items`), saved research (`saved_items`), and feedback (`feedback`).
- **Backend (`server.ts` + `/server/*`):** Node.js, Express, TypeScript (`tsx`), RS256 Firebase ID Token verification (`Authorization: Bearer <token>`), Helmet security headers, SSRF URL allowlist validation, and rate limiting.
- **Official Document Library & Hybrid Vector Search (`/server/db/database.ts`):** Relational SQLite (`better-sqlite3`) storing official SECP, FBR, and SRB statutory documents, FTS5 full-text BM25 indexing, and binary `Float32Array` vector storage for semantic embeddings.
- **AI & RAG Pipeline (`/server/services/gemini.ts` & `/server/rag/retriever.ts`):**
  - Embeddings via `gemini-embedding-2` paired with FTS5 lexical BM25 scoring.
  - Grounded synthesis via `gemini-4-hydrogen` with strict JSON schema output, prompt-injection defense, and server-side citation validation against actual retrieved `chunk_id`s.

---

## Environment Configuration

Configure environment variables via AI Studio Secrets or local `.env` (see `.env.example`):

- `GEMINI_API_KEY`: Server-side Gemini API key (automatically injected by AI Studio; never exposed to browser code).
- `DATABASE_PATH`: Filesystem path for official regulatory index SQLite file (default `./data/compliance.db`).
- `STORAGE_PATH`: Private filesystem directory for admin document uploads (default `./data/uploads`).
- `LLM_MODEL`: Server-side Gemini synthesis model (default `gemini-4-hydrogen`).
- `EMBEDDING_MODEL`: Server-side Gemini embedding model (default `gemini-embedding-2`).
- `ADMIN_EMAILS`: Comma-separated list of verified admin email addresses (default `nanddevya27@gmail.com`).

---

## Official Seeded Sources

The official document index seeds verified baseline guidance from:
1. **SECP (`secp.gov.pk`)** — Company Registration & Single Member Company (SMC) eZfile Guide; Companies Regulations, 2024 (Form A, Form 24, Form 9); plus a clearly flagged historical Form 29 record marked `superseded`.
2. **FBR (`fbr.gov.pk`)** — Income Tax Registration (NTN) via IRIS (Form 181) and Federal Sales Tax Registration (STRN Form 14(1)).
3. **SRB (`srb.gos.pk`)** — Sindh Sales Tax on Services e-Registration (SNTN) and Monthly Form SST-03 filing guidance.

---

## Local Setup, Tests & Verification

```bash
npm run lint
npm test
npx eslint firestore.rules
npm run build
```

Start development server on port `3000`:

```bash
npm run dev
```

---

## Security & AI Limitations

- **Zero Hallucination Policy:** If indexed official documents do not verify an answer, the assistant marks `insufficient_evidence` and states what could not be verified.
- **SSRF & Domain Allowlist:** Remote URL ingestion blocks localhost/private IP ranges and permits only verified `.gov.pk` / `.gos.pk` regulatory domains.
- **No Legal Advice:** This platform provides informational assistance only and does not replace a qualified corporate lawyer, chartered accountant, or tax practitioner.
