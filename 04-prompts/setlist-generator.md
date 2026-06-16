# Prompt: Setlist Generator

## Purpose
Ranked worship setlist recommendation grounded in song library history and service context.

## Required inputs
sermonTheme · scriptureReference · serviceType · songLibrary · recentUsageHistory · churchPreferences · planningConstraints · targetSetLength · churchContextSummary

## Forbidden
- Recommend songs not in songLibrary
- Invent scripture beyond what is supplied
- Assume theological compatibility without supplied context

## Output (JSON only)
```json
{ "status", "recommendedSetlist", "flowAnalysis", "usageWarnings", "confidence", "needsReview", "reviewNotes" }
```
