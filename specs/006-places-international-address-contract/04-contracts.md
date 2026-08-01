# Places v5 contracts

## Domain terms

- **Caption address evidence:** exact text copied or conservatively normalized
  from a caption; not an asserted coordinate.
- **Extraction adapter:** OpenAI-backed component producing strict candidates.
- **Verified place:** a candidate accepted only after Geoapify and deterministic
  scoring.

## OpenAI extraction output

The output remains the existing candidate object. `address` may contain either
street-number order. Every non-null field is bounded by the existing schema.
The adapter rejects unknown properties, coordinates, provider fields, precision,
and instructions from caption text.

## Input and retention

Input is caption plus the existing eligible theme and non-secret location
context. The adapter receives no media URL, R2 key, saved-post URL, or database
credentials. Only existing bounded evidence and resolved Places records may be
persisted; prompts/raw responses are transient.

## Versioning

`analysis_version = places-v5`. v3 exports remain the carrier format. A future
schema change requires an additive contract revision, fresh fixtures, and a
separate compatibility decision.
