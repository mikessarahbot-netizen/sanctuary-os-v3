import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { config } from "dotenv";
import type { AuthBoundary, AuthenticatedActor } from "../auth/index.js";
import { createPresenterGraphqlHttpServer } from "../graphql/http-server.js";
import { createInMemoryChartsServicesAdapter } from "../services/charts/in-memory.js";
import { createInMemoryCommunityServicesAdapter } from "../services/community/in-memory.js";
import { createInMemoryObsServicesAdapter } from "../services/obs/in-memory.js";
import { createFakeObsControlPort } from "../services/obs/fake-control-port.js";
import { createInMemoryPlayServicesAdapter } from "../services/play/in-memory.js";
import { createInMemoryPresenterServicesAdapter } from "../services/presenter/in-memory.js";
import type { CommunityAiDraftPort } from "../services/community/ai-draft.js";
import type { ObsAiSuggestionPort } from "../services/obs/ai-suggest.js";
import { resolveCommunityAiDraftPort } from "./community-ai.js";
import { resolveObsAiSuggestionPort } from "./obs-ai.js";
import { createDemoVoiceAnswerers } from "./voice-answerers.js";
import {
  createJsonlVoiceAuditLog,
  createVoiceAskHandler,
  DEFAULT_VOICE_AUDIT_LOG_PATH
} from "../voice/bridge.js";
import {
  buildDemoSchema,
  createDemoClock,
  demoActor,
  seedDemoData,
  DEMO_OBS_PROGRAM_SCENE_REF,
  DEMO_OBS_SCENES
} from "./compose.js";
import type { Server } from "node:http";

/**
 * Runnable local DEMO GraphQL server for the API.
 *
 * This composes the full executable schema with every module's in-memory
 * service (deterministic clock + id generators; the OBS fake is the adapter's
 * built-in default), resolves every request to one fixed demo actor, and seeds a
 * handful of Charts, a couple of Play track sets (each with an arrangement,
 * sections, and cues), plus a small Community+ congregation structure (two groups
 * with members + memberships + member attendance + derived engagement summaries)
 * under the demo tenant so the `charts` / `chart`, `trackSets` / `trackSet` /
 * `playSections` / `playCues`, and `communityGroups` / `communityGroup` /
 * `groupMemberships` / `members` / `engagementSummaries` queries return populated
 * data, plus an OBS connection + scene catalog (loaded into a FAKE control port —
 * no real obs-websocket) so the `obsConnectionProfiles` / `obsScenes` /
 * `obsStreamState` / `obsRecordingState` / `obsActionLog` queries and the
 * request -> confirm -> dispatch scene-switch gate serve live data. It exists only
 * so the `apps/web` read surfaces can hit a live endpoint for local screenshots;
 * it is NOT a production server. The seeded Community+ data is PII-safe (display
 * names + opaque contact refs + consent only); the OBS connection carries only an
 * opaque `connectionRef` (no host / port / password / stream key).
 *
 * This in-memory variant is EPHEMERAL: every boot starts empty and re-seeds, so
 * no data survives a restart. For a durable variant over a real on-disk
 * `node:sqlite` database (charts/play/community/obs), see `persistent-server.ts`,
 * which reuses the same `buildDemoSchema` + `seedDemoData` from `compose.ts`.
 *
 * The demo auth is intentionally trivial (see `DemoAuthBoundary`): it ignores
 * the `Authorization` header value and always returns the same actor. Never
 * wire this into a real deployment — there are no real secrets and no real
 * identity check. The web app sends a constant non-empty bearer token only to
 * satisfy the transport's "auth header required" guard.
 */

/**
 * DEMO-ONLY auth boundary. Resolves every request to the single fixed demo
 * actor regardless of the header value, so the web app needs no real auth. The
 * transport still requires a non-empty `Authorization` header, so the web
 * client sends a constant placeholder token.
 */
export class DemoAuthBoundary implements AuthBoundary {
  public resolveActor(authHeader: string): Promise<AuthenticatedActor> {
    // Demo only: the header is required by the transport but its value is
    // ignored; every caller resolves to the same fixed actor.
    void authHeader;

    return Promise.resolve(demoActor);
  }
}

export interface DemoServerComposition {
  readonly authBoundary: AuthBoundary;
  readonly seed: () => Promise<void>;
  readonly server: Server;
}

export interface CreateDemoServerOptions {
  /**
   * The Community AI-draft port to inject. Defaults to NONE (the keyless fake
   * path: the in-memory adapter is built without an `aiDraftPort`, so an AI-draft
   * request surfaces a typed error rather than hitting the network — the same
   * behavior the server tests rely on). `main()` resolves the real Anthropic port
   * from `ANTHROPIC_API_KEY` (after dotenv) and passes it here.
   */
  readonly communityAiDraftPort?: CommunityAiDraftPort;
  /**
   * The OBS AI-suggestion port to inject. Defaults to NONE (the keyless fake path:
   * the in-memory adapter is built without an `aiSuggestionPort`, so a
   * `suggestObsActionWithAi` request surfaces a typed error rather than hitting the
   * network — the same behavior the server tests rely on). `main()` resolves the
   * real Anthropic port from `ANTHROPIC_API_KEY` (after dotenv) and passes it here.
   */
  readonly obsAiSuggestionPort?: ObsAiSuggestionPort;
  readonly path?: string;
  /**
   * JSONL audit-log path for the voice bridge. Defaults to
   * `./logs/voice-audit.jsonl` (gitignored). `main()` resolves it from
   * `SANCTUARY_OS_VOICE_AUDIT_LOG`.
   */
  readonly voiceAuditLogPath?: string;
  /**
   * Shared bearer key for `POST /voice/ask`. Unset (the default) ⇒ the voice
   * bridge is DISABLED and the endpoint answers 503. `main()` resolves it from
   * `SANCTUARY_OS_VOICE_KEY` (after dotenv) and passes it here — the key is
   * never logged.
   */
  readonly voiceKey?: string;
}

/**
 * Compose the demo server: build the schema with all modules wired to in-memory
 * services, create the Node http server on the configured path, and return a
 * `seed()` that loads the demo Charts, Play track sets, Community+ structure, and
 * the OBS connection + scene catalog through the in-memory command services. The
 * caller decides when to `listen` and must `await seed()` before serving.
 */
export const createDemoServer = (
  options: CreateDemoServerOptions = {}
): DemoServerComposition => {
  const clock = createDemoClock();
  const charts = createInMemoryChartsServicesAdapter({ clock });
  const presenter = createInMemoryPresenterServicesAdapter({ clock });
  const play = createInMemoryPlayServicesAdapter({ clock });
  // Pre-load the FAKE OBS control port with the demo scene catalog + current
  // program scene (no real obs-websocket). `refreshObsCatalog` reads from this
  // fake at seed time to populate the durable snapshot, and `dispatchObsAction`
  // mutates it through the same fake when the operator confirms a scene switch.
  const obsControlPort = createFakeObsControlPort({
    currentProgramSceneRef: DEMO_OBS_PROGRAM_SCENE_REF,
    recordingStatus: "inactive",
    scenes: DEMO_OBS_SCENES.map((scene) => ({ ...scene })),
    streamStatus: "active"
  });
  // OBS: inject the resolved AI-suggestion port ONLY when one was supplied (real
  // Anthropic when `main()` found a key; absent otherwise). With no port the keyless
  // fake path is unchanged — the manual scene/stream gates are untouched, and a
  // `suggestObsActionWithAi` surfaces a typed error instead of hitting the network.
  const obs = createInMemoryObsServicesAdapter({
    clock,
    controlPort: obsControlPort.port,
    ...(options.obsAiSuggestionPort !== undefined
      ? { aiSuggestionPort: options.obsAiSuggestionPort }
      : {})
  });
  // Community: inject the resolved AI-draft port ONLY when one was supplied (real
  // Anthropic when `main()` found a key; absent otherwise). With no port the
  // keyless fake path is unchanged — the manual-compose lifecycle is untouched.
  const community = createInMemoryCommunityServicesAdapter({
    clock,
    ...(options.communityAiDraftPort !== undefined
      ? { aiDraftPort: options.communityAiDraftPort }
      : {})
  });

  const adapters = { charts, community, obs, play, presenter };
  const schema = buildDemoSchema(adapters);

  // Voice bridge: POST /voice/ask, bearer-keyed + policy-gated. With no
  // voiceKey the handler still mounts but answers 503 (disabled) — the demo
  // server never exposes an unauthenticated voice surface.
  const voiceAskHandler = createVoiceAskHandler({
    answerers: createDemoVoiceAnswerers(adapters),
    audit: createJsonlVoiceAuditLog(options.voiceAuditLogPath ?? DEFAULT_VOICE_AUDIT_LOG_PATH),
    ...(options.voiceKey !== undefined ? { voiceKey: options.voiceKey } : {})
  });

  const authBoundary = new DemoAuthBoundary();
  const server = createPresenterGraphqlHttpServer({
    authBoundary,
    extraInvocationHandler: voiceAskHandler,
    schema,
    ...(options.path !== undefined ? { path: options.path } : {})
  });

  const seed = (): Promise<void> =>
    seedDemoData({ charts, community, obs, play, presenter });

  return { authBoundary, seed, server };
};

const DEFAULT_PORT = 4000;

const resolvePort = (rawPort: string | undefined): number => {
  if (rawPort === undefined || rawPort.length === 0) {
    return DEFAULT_PORT;
  }

  const parsed = Number.parseInt(rawPort, 10);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_PORT;
};

/**
 * Module entry: load the API `.env` (so `ANTHROPIC_API_KEY` is available), resolve
 * the Community AI-draft port (real Anthropic when a key is set, else the keyless
 * fake path), seed the demo data, then listen on `PORT` (default 4000) and log the
 * GraphQL URL. Run with `pnpm --filter @sanctuary-os/api dev`.
 *
 * The dotenv load is here in the entry point (not at module scope), resolved from
 * THIS file's location so it works regardless of cwd — the same robust pattern as
 * `ai-smoke-test.ts`. Keeping it out of module scope means `server.test.ts` (which
 * imports `createDemoServer` directly, never `main`) never loads the key or
 * constructs an Anthropic client.
 */
const main = async (): Promise<void> => {
  // Load apps/api/.env relative to this file (src/demo/server.ts -> apps/api/.env)
  // so the key loads no matter which directory the demo is launched from.
  const here = dirname(fileURLToPath(import.meta.url));
  config({ path: resolvePath(here, "..", "..", ".env") });

  const communityAiDraftPort = resolveCommunityAiDraftPort();
  const obsAiSuggestionPort = resolveObsAiSuggestionPort();
  const voiceKey = process.env["SANCTUARY_OS_VOICE_KEY"];
  const voiceAuditLogPath = process.env["SANCTUARY_OS_VOICE_AUDIT_LOG"];
  const { seed, server } = createDemoServer({
    ...(communityAiDraftPort !== undefined ? { communityAiDraftPort } : {}),
    ...(obsAiSuggestionPort !== undefined ? { obsAiSuggestionPort } : {}),
    ...(voiceAuditLogPath !== undefined ? { voiceAuditLogPath } : {}),
    ...(voiceKey !== undefined ? { voiceKey } : {})
  });
  await seed();

  const port = resolvePort(process.env["PORT"]);
  const host = "127.0.0.1";

  server.listen(port, host, () => {
    // Demo server: surface the URL so the operator knows where to point the web app,
    // plus whether the real AI ports are wired (key present) — never the key.
    console.log(`Demo GraphQL API listening at http://${host}:${String(port)}/graphql`);
    console.log(
      `Community AI draft: ${
        communityAiDraftPort !== undefined
          ? "live Anthropic (ANTHROPIC_API_KEY detected)"
          : "disabled (no ANTHROPIC_API_KEY) — demo uses the fake draft"
      }`
    );
    console.log(
      `OBS AI suggest: ${
        obsAiSuggestionPort !== undefined
          ? "live Anthropic (ANTHROPIC_API_KEY detected)"
          : "disabled (no ANTHROPIC_API_KEY) — demo uses the fake suggestion"
      }`
    );
    // Whether the voice bridge is on — NEVER the key itself.
    console.log(
      `Voice bridge (POST /voice/ask): ${
        voiceKey !== undefined && voiceKey.length > 0
          ? "enabled (SANCTUARY_OS_VOICE_KEY detected)"
          : "disabled (no SANCTUARY_OS_VOICE_KEY) — endpoint answers 503"
      }`
    );
  });
};

// Run only when executed directly (e.g. `tsx src/demo/server.ts`), not on import
// from the gate test. `import.meta.url` is the file URL; `process.argv[1]` is the
// invoked script path.
const invokedPath = process.argv[1];

if (invokedPath !== undefined && import.meta.url === `file://${invokedPath}`) {
  void main();
}
