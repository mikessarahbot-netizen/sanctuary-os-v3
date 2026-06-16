# Prompt: Readiness Score

## Purpose
Estimate service readiness from volunteer confirmations, rehearsal data, blockers, and time remaining.

## Required inputs
serviceDate · currentDate · volunteerAssignments · confirmationStatuses · rehearsalCompletion · knownBlockers · serviceComplexity · churchContextSummary

## Forbidden
- Assume volunteer is ready without supporting data
- Invent blockers or produce false precision

## Output (JSON only)
```json
{ "status", "readinessScore", "readinessBand", "summary", "strengths", "risks", "recommendedActions", "confidence", "needsReview" }
```
