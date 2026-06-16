# Prompt: Band Cue Generator

## Purpose
Generate verbal band cues for a song arrangement to be spoken via TTS during rehearsal or live service.

## Required inputs
arrangement · tempo · instrumentation · sectionNames · churchContextSummary

## Output (JSON only)
```json
{ "status", "cues": [{ "sectionName", "cueText", "barCountIn" }], "needsReview" }
```
