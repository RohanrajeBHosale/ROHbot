# ROHbot — Production-Grade Portfolio RAG Assistant (LLMs + RAG + Agents)

ROHbot is an LLM-powered assistant that answers questions about my work using **retrieval-augmented generation (RAG)** and a production-style API layer (grounding, citations, eval hooks). This repo is structured to reflect **real system design**, not a demo notebook.

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
# Fill required keys in .env
