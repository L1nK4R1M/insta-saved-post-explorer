# Places v5 validation strategy

1. Red tests for strict LLM output rejection and five international address
   fixtures.
2. Mocked OpenAI adapter tests for bounded request, timeout, refusal, invalid
   JSON, and no-caption leakage in logs.
3. Existing Geoapify/scoring tests prove no direct model pin and no false exact.
4. PostgreSQL tests prove post-isolated approximate places and confirmed-link
   preservation.
5. Run lint, typecheck, full tests, build, `git diff --check`, Develop dry-run,
   Preview smoke, and separate specification/engineering reviews.
