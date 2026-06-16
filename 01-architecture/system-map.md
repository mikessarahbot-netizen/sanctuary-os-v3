# System Map

## Containers
| Container | Owns |
|---|---|
| Web app (Next.js) | Admin, planning, community workflows |
| Mobile app (Expo) | Volunteer confirmations, charts, rehearsal |
| Desktop app (Tauri) | Presenter, Play, local media |
| API backend | GraphQL, auth, domain logic, context assembly, events |
| packages/ | church-context · ai-engine · db · ui · obs-agent · midi-bridge |

## Module ownership
| Module | Owns |
|---|---|
| Planning | services, items, assignments, readiness, templates |
| Presenter | slides, scripture, outputs, style |
| Play | tracks, arrangements, cues, pads, playback state |
| Charts | rendering, ChordPro editor, annotations, per-musician prefs |
| Community+ | members, households, attendance, comms, engagement |
| AI engine | prompt execution, validation, usage logging |
| OBS agent | obs-websocket, scene automation, human-confirm gate, logs |

## Communication
- GraphQL/HTTP — all app reads/writes
- WebSockets — realtime state changes
- Local desktop event bus — high-frequency Play/Presenter sync
- HTTP APIs — Claude, Whisper, Auth0, Twilio, CCLI, SongSelect

## Failure strategy
| Failure | Behavior |
|---|---|
| Internet down | Play + Presenter continue locally; sync queues |
| AI unavailable | Core workflows continue manually; AI surfaces degrade gracefully |
| OBS disconnected | Planning + Presenter unaffected; automation disabled with visible status |
