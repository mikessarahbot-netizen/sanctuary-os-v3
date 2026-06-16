# Prompt: Chord Chart Generator

## Purpose
Generate a ChordPro chart from Whisper audio transcription output.

## Required inputs
audioTranscription · detectedKey · detectedTempo · songTitle · artistHint

## Forbidden
- Invent chord sections not supported by transcription
- Assume key signature without evidence

## Output
ChordPro string + metadata JSON: `{ "key", "tempo", "sections", "confidence", "needsReview" }`
