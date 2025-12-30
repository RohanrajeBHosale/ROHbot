# Evaluation

This project prioritizes **grounded correctness**. Evaluation is lightweight but real.

## 1) Retrieval metrics
Given an eval set of queries with expected source pages/sections:

- **Hit@K**: Does at least one of the top-K retrieved chunks come from the expected source?
- **Recall@K**: Fraction of expected sources retrieved within top-K (if multiple sources)

Recommended K values: 3, 5, 10.

## 2) Faithfulness checks
We verify answers are supported by retrieved context:

- **Citation coverage**: each major claim should map to a retrieved chunk
- **Manual spot checks**: review ~20 queries/week (quick human audit)

Failure categories:
- hallucinated claim
- missing citation
- wrong section/source
- overly generic response

## 3) Latency
Track:
- p50 and p95 response time for:
  - retrieval
  - generation
  - total

## 4) Minimal eval workflow

1. Maintain a small `eval_queries.json`:
```json
[
  {"q": "What is ROHbot built with?", "expected": ["portfolio/rag-assistant"]},
  {"q": "What projects involve RAG?", "expected": ["projects/rag"]}
]

2.	Run npm run eval to produce:
	•	retrieval hit rates
	•	latency summary
	•	a small report file (json/md)

## 5) Acceptance bar (be strict)
	•	Hit@5 ≥ 0.80 on the eval set
	•	No uncited hard claims in sampled outputs
	•	p95 latency within a reasonable bound for the chosen model

