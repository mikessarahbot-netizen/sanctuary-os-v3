# Voice connect — pointing the xAI phone agent at Sanctuary OS

This connects Michael's existing xAI phone voice agent to the Sanctuary OS
demo API's `POST /voice/ask` endpoint, over the **tailnet only**.

What the bridge can and cannot do (enforced in code, covered by tests):

- **Answers** four read-only questions from live data: the setlist/charts,
  the stream + program-scene status, people counts, and a service-readiness
  summary. Responses are short plain text, ready for text-to-speech.
- **Never executes a mutation.** Anything that would change state (send or
  draft a message, start/stop the stream, switch a scene, edit records)
  gets `needs_confirmation` — the action must be confirmed by a human in the
  Sanctuary OS web console. Voice can request, never bypass.
- **Blocks** destructive operations, secrets/credential requests, PII dumps,
  and anything about tunnels or public exposure. Unrecognized requests are
  blocked, never guessed at.
- **Audits** every request to a JSONL log (default `./logs/voice-audit.jsonl`,
  gitignored; override with `SANCTUARY_OS_VOICE_AUDIT_LOG`): timestamp,
  category, truncated request summary, status, duration. Never keys, headers,
  or message bodies.

## 1. Set the voice key and run the API

Pick a long random key and put it in `apps/api/.env` (gitignored — never
commit it, never paste it into chat/docs):

```bash
# generate a key (example)
openssl rand -hex 32
```

```dotenv
# apps/api/.env
SANCTUARY_OS_VOICE_KEY=<paste the generated key>
```

Then run the demo API:

```bash
pnpm --filter @sanctuary-os/api dev
```

The boot log prints `Voice bridge (POST /voice/ask): enabled` when the key is
detected. Without the key the endpoint answers `503` (disabled) — it never
runs unauthenticated.

## 2. Smoke-test locally

```bash
curl -s http://127.0.0.1:4000/voice/ask \
  -H "Authorization: Bearer YOUR_VOICE_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{"request": "What songs are we singing on Sunday?"}'
```

Expected response:

```json
{
  "speech": "There are 3 charts ready: Amazing Grace in G, How Great Thou Art in D, and Cornerstone in C.",
  "status": "answered"
}
```

And a mutation attempt is refused:

```bash
curl -s http://127.0.0.1:4000/voice/ask \
  -H "Authorization: Bearer YOUR_VOICE_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{"request": "please just quickly stop the stream"}'
# → {"speech":"That would change something, so I can't do it by voice. Please
#    confirm it in the Sanctuary OS web console.","status":"needs_confirmation"}
```

A wrong key returns `401`; no key configured returns `503`.

## 3. Expose the port on the tailnet — LOCAL/TAILNET ONLY

> **WARNING — never expose this publicly.** Do **not** use `tailscale funnel`,
> ngrok, Cloudflare tunnels, or router port-forwarding. The demo server has
> demo auth on `/graphql`; only `/voice/ask` is keyed. Tailnet-only means only
> devices logged into your Tailscale account can reach it. Funnel/ngrok would
> put it on the public internet — that is off the table.

On the Mac running the API:

```bash
tailscale serve --bg --https=443 http://127.0.0.1:4000
tailscale serve status   # shows the https://<machine-name>.<tailnet>.ts.net URL
```

`tailscale serve` (unlike `funnel`) is tailnet-only by design and gives you a
valid HTTPS URL like `https://sanctuary-mac.tailnet-name.ts.net`. Stop it any
time with `tailscale serve --https=443 off`.

The device the xAI agent's tool calls originate from must be on the same
tailnet (e.g. the phone runs Tailscale, or the agent's backend relay is a
tailnet node). If the xAI agent's function calls come from xAI's cloud, they
CANNOT reach a tailnet URL — that is intentional; do not "fix" it with a
public tunnel. In that case run the voice agent's tool-executing component on
a tailnet machine.

## 4. Configure the xAI agent's tool/function calling

Add a tool definition to the phone agent along these lines:

```json
{
  "name": "ask_sanctuary",
  "description": "Ask Sanctuary OS (church service operations) a question: setlist and song keys, live-stream and scene status, people counts, service readiness. Read-only — it cannot change anything; anything that changes state must be confirmed by a human in the web console.",
  "parameters": {
    "type": "object",
    "properties": {
      "request": {
        "type": "string",
        "description": "The user's question, in natural language."
      }
    },
    "required": ["request"]
  }
}
```

HTTP wiring for the tool call:

- **URL:** `https://<machine-name>.<tailnet>.ts.net/voice/ask`
- **Method:** `POST`
- **Headers:** `Authorization: Bearer YOUR_VOICE_KEY_HERE`,
  `Content-Type: application/json`
- **Body:** `{"request": "<the user's question>"}`

Store the key in the agent platform's secret store, not in the prompt.

Response contract (always JSON):

| Field | Values | Speak it? |
|---|---|---|
| `status` | `answered` \| `needs_confirmation` \| `blocked` | — |
| `speech` | short plain text | yes — read `speech` aloud verbatim |
| `error` | only on 4xx/5xx (`401` bad key, `503` disabled, `400` bad body) | report a connection problem |

Example request/response pair:

```
POST /voice/ask
Authorization: Bearer YOUR_VOICE_KEY_HERE
Content-Type: application/json

{"request": "Is the stream live?"}
```

```json
{
  "speech": "The stream is active. The current program scene is Worship.",
  "status": "answered"
}
```

## Key rotation / revocation

Change `SANCTUARY_OS_VOICE_KEY` in `apps/api/.env` and restart the API; update
the agent's stored key. Removing the variable disables the endpoint entirely.
