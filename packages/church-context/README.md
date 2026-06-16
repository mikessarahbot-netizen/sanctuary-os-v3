# ChurchContext

Canonical Zod schemas and TypeScript types for Sanctuary OS context projections.

## Scaffold contract
- Defines the shared `ChurchContext` shape from `03-context/church-context-schema.md`.
- Exports projection names and privacy blocklists for AI callers.
- Does not assemble context from persistence.
- Does not call AI providers or vendor SDKs.
- Does not contain tenant-specific data.

The API package owns full-context assembly and projection building.
