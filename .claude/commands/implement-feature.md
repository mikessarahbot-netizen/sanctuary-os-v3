# /implement-feature $FEATURE [$MODULE]

Implement one bounded feature. Stop when feature is complete.

Pre-flight (required before coding):
1. Restate exact scope
2. State what is out of scope
3. List files to read
4. List files to change
5. State validation approach

Rules:
- Smallest complete change
- Reuse existing patterns
- Add/update tests
- Run lint + typecheck + tests
- No silent refactors of unrelated code
- No PII to AI without policy check
