# ROHbot — Production-Grade Portfolio RAG Assistant (LLMs + RAG + Agents)

ROHbot is an LLM-powered assistant that answers questions about my work using **retrieval-augmented generation (RAG)** and a production-style API layer (grounding, citations, eval hooks). This repo is structured to reflect **real system design**, not a demo notebook.

Design goal: prioritize factual correctness and debuggability over creative generation.

**Live:** https://rohbot.vercel.app

---

## What it does
- Ingests portfolio content into a searchable knowledge base
- Builds embeddings + stores vectors (e.g., Supabase vector store)
- Retrieves relevant chunks (Top-K) and generates grounded answers
- Supports structured prompting and response handling (safety + fallbacks)
- Optional: voice input/output (if enabled)

---

## System architecture (high level)
**Query → Retriever → (Reranker) → Prompt Builder → LLM → Post-process → Response (+ sources)**

Docs:
- Architecture: `docs/architecture.md`
- Evaluation: `docs/evaluation.md`

---

## Quickstart (local)
### 1) Setup
```bash
git clone https://github.com/RohanrajeBHosale/ROHbot.git
cd ROHbot
cp .env.example .env
```
### 2) Install
```bash
# Fill required keys in .env
npm install
# or: pnpm install
```
### 3) Ingest / Index
```bash
npm run ingest
```

###npm run dev
```bash
npm run dev
```

## Environment variables

See .env.example. Typical required values:
	•	GEMINI_API_KEY (or LLM provider key)
	•	SUPABASE_URL
	•	SUPABASE_ANON_KEY
	•	(optional) voice keys
  

## Ingestion & indexing

Ingestion takes raw sources (documents / site content), cleans and chunks them, embeds the chunks, and upserts vectors into the store.

Key steps:
	1.	Extract → clean → chunk
	2.	Embed chunks
	3.	Upsert vectors + metadata (source, url, section)

Run:
```bash
npm run ingest
```

##Retrieval & generation
	•	Retriever: Top-K semantic search against vector store
	•	(Optional) Reranker: reorder candidates for higher precision
	•	Prompt builder: injects retrieved context with strict formatting rules
	•	Post-processing: citation mapping + refusal policy for low-confidence queries

⸻

## Evaluation

We track:
	•	Retrieval quality: Hit@K / Recall@K on a small eval set
	•	Faithfulness: citation coverage + manual spot checks
	•	Latency: p50/p95 response times

Run:
```bash
npm run eval
```
Details: docs/evaluation.md


Details: docs/evaluation.md

⸻

Failure modes & mitigations
	•	Hallucinations: enforce citation requirement + refusal if retrieval confidence is low
	•	Prompt injection: sanitize user input + strip untrusted instructions + tool allowlist (if agents are used)
	•	Stale index: periodic re-ingestion (CI job or scheduled run)
	•	Long context: chunking + top-k control + truncation strategy

⸻

Repo structure
	•	api/ or src/api/: API routes / handlers
	•	ingest.js: ingestion pipeline entrypoint (recommend moving to scripts/)
	•	knowledge_sample/: sanitized sample documents only
	•	docs/: architecture + evaluation docs
	•	.github/workflows/: CI automation

⸻

Tech stack
	•	Node/Next.js API layer
	•	LLM: Gemini (or configurable provider)
	•	Vector store: Supabase (or configurable)
	•	Deploy: Vercel

⸻

Roadmap (realistic)
	•	Add reranker (cross-encoder) for higher precision
	•	Add automated eval runs in CI
	•	Add caching (embeddings + responses) to reduce latency

⸻

License
---

# 2) docs/architecture.md (COPY–PASTE)

Create: `docs/architecture.md`

```md
# ROHbot — Architecture

## Goal
Answer questions about my portfolio using **grounded retrieval** (RAG) and a production-style API. Priorities:
- correctness > creativity
- citations > vibes
- reproducibility > magic

---

## Components
### 1) Data sources
- Portfolio site content (pages/sections)
- Project descriptions / docs
- (Optional) PDFs, resumes, writeups

### 2) Ingestion pipeline
**Extract → Clean → Chunk → Embed → Upsert**
- Cleaning: remove nav/boilerplate, normalize whitespace
- Chunking: size ~300–800 tokens, overlap ~10–20%
- Metadata stored with each chunk:
  - `source`, `url`, `section`, `timestamp`

### 3) Vector store
Stores embeddings + metadata.
- semantic search by cosine similarity / ANN index
- filters by source/type if needed

### 4) Retrieval
- Top-K semantic search (K configurable)
- optional rerank step (cross-encoder) for precision

### 5) Prompt builder
Builds a structured prompt:
- system rules (no hallucination, cite sources)
- retrieved context formatted consistently
- user query appended last

### 6) LLM generation
- provider: Gemini (configurable)
- temperature controlled (lower for factual answers)
- max tokens bounded

### 7) Post-processing
- Citation mapping: attach sources used
- Confidence gating:
  - if retrieval weak/empty → refuse or ask clarifying question
- Safety layer:
  - strip prompt-injection patterns
  - tool allowlist (if agents enabled)

---

## Data flow
1. **Ingest**: sources → chunks → embeddings → store
2. **Query**: user query → embed → retrieve top-k
3. **Generate**: prompt(context + rules) → LLM → answer
4. **Return**: answer + citations (+ debug fields optionally)

---

## Design decisions (add your values)
- Chunk size: [X] tokens (tradeoff between recall and relevance)
- Top-K: [K] (tradeoff between coverage and context bloat)
- Embeddings model: [model name]
- Vector store: Supabase (simple + deployable)
- Refusal policy: refuse when no strong retrieval matches exist

```

