# ROHbot — Production-Style RAG Portfolio Assistant

ROHbot is an LLM-powered assistant that answers questions about my work using **RAG** (retrieval + grounding) and an API layer deployable to Vercel.

Live: https://rohbot.vercel.app

## What it does
- Ingests portfolio content into a knowledge base
- Builds embeddings + stores vectors (Supabase)
- Retrieves relevant chunks and generates answers with grounded context
- Supports voice in/out (if enabled)

## Architecture
Query → Retriever (Top-K) → Prompt Builder → LLM → Response (+ sources)

See `docs/architecture.md` (add this file)

## Quickstart (local)
```bash
git clone https://github.com/RohanrajeBHosale/ROHbot.git
cd ROHbot
cp .env.example .env
npm install
npm run dev
