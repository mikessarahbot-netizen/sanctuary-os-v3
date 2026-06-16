# Planning Module Plan

## Scope v1
Service CRUD · ordered items · song attachment · item notes · volunteer role assignment · confirm/decline · rehearsal asset visibility · CCLI usage log · readiness score · AI setlist generation · template-based service creation

## Out of scope v1
Full CRM · payroll · giving · sermon manuscript editing · generic livestream hosting · automatic destructive schedule changes

## Domain objects
Service · ServiceItem · Assignment · RehearsalTracking · CCLIUsageLog

## Domain boundaries
| Object | Owns | Does not own |
|---|---|---|
| Service | Date/time, service type, status, ordered items, publish state | Member records, media storage, livestream state |
| ServiceItem | Item type, title, duration, notes, attached song/asset refs | Song catalog source data |
| Assignment | Role, person ref, status, response history | Person contact data |
| RehearsalTracking | Asset visibility, acknowledgement, readiness signals | Chart rendering or playback engine |
| CCLIUsageLog | Song usage events, reporting status | Vendor credentials |

## GraphQL (queries)
`services(filter)` · `service(id)` · `serviceTemplates(serviceTypeId)` · `serviceAssignments(serviceId)` · `serviceReadiness(serviceId)` · `songLibrary(searchInput)`

## GraphQL (mutations)
`createService` · `updateService` · `duplicateServiceFromTemplate` · `addServiceItem` · `updateServiceItem` · `reorderServiceItems` · `assignVolunteer` · `updateAssignmentStatus` · `generateSetlist` · `refreshReadinessScore`

## WebSocket events emitted
`service.published` · `assignment.statusChanged` · `readiness.updated`

## Readiness score inputs
- Required roles assigned
- Assignment confirmations received
- Service items ordered and timed
- Songs have key/arrangement/charts available
- Rehearsal assets visible to assigned volunteers
- CCLI logging status is current where required

## AI setlist generation rules
- Use only songs present in `songLibraryProfile`
- Respect `bannedOrPausedSongIds`, licensing flags, service type, theme, keys, and team constraints
- Return rationale and alternatives, not an automatic write
- Validate output before showing it to users

## Acceptance for first implementation task
- Domain and API names match this plan
- Mutations are tenant-scoped and role-checked in services
- Publish and destructive changes require explicit user intent
- WebSocket events use validated payload schemas
