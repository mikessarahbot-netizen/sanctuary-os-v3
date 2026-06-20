# obs-agent

Scaffold — intentionally empty for now.

The real obs-websocket-v5 control adapter does **not** live here. It is co-located
with its port in the api workspace
(`apps/api/src/services/obs/obs-websocket-control-port.ts`, built on
`obs-websocket-js` v5), because that adapter depends on the api-owned `ObsControlPort`
contract. Normal dependency direction is app → package, never package → app, so
having this package import the api-owned port would invert it — the same rationale
the AI adapters use to live beside their ports rather than in `packages/ai-engine`.

This package is reserved for the genuinely runtime-specific OBS agent code: the
desktop/agent process that owns the obs-websocket socket lifecycle (connect/auth +
secret resolution from the vault) and injects a connected `OBSWebSocket` into
`createObsWebSocketControlPort(...)`. See `docs/running.md` → "Live OBS".
