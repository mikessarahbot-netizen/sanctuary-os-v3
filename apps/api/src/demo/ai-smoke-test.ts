import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { config } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import {
  COMMUNITY_AI_DRAFT_PROMPT_VERSION,
  CommunityAiDraftPromptSchema,
  CommunityAiDraftSuggestionSchema
} from "../services/community/ai-draft.js";
import { createAnthropicCommunityAiDraftPort } from "../services/community/anthropic-ai-draft-port.js";
import {
  OBS_AI_ACTION_SUGGESTION_PROMPT_VERSION,
  ObsAiActionSuggestionPromptSchema,
  ObsAiActionSuggestionSchema
} from "../services/obs/ai-suggest.js";
import { createAnthropicObsAiSuggestionPort } from "../services/obs/anthropic-ai-suggest-port.js";

/**
 * Runnable LIVE smoke test for the real Anthropic AI port adapters.
 *
 * This is a plain ESM script (NOT a vitest spec) that proves the production
 * Anthropic-backed adapters work end-to-end against the live model:
 *
 *   - It builds a valid, PII-free `CommunityAiDraftPrompt` and a valid,
 *     secret-free `ObsAiActionSuggestionPrompt` (each through its own
 *     `*.parse(...)`, so the inputs are schema-valid before any call), drives them
 *     through the REAL `createAnthropicCommunityAiDraftPort` /
 *     `createAnthropicObsAiSuggestionPort` against a live `new Anthropic()` client,
 *     and re-validates each returned `unknown` through the suggestion schema — the
 *     same gate the services use. A green run means: the SDK request shape compiles
 *     AND is accepted, the model replies, and the reply is schema-valid.
 *
 *   - The sample fields are deliberately PII-free / secret-free (no member name,
 *     contact value, OBS host/port/password, or vault handle), so this script
 *     honors the same privacy posture the adapters enforce — it only ever sends the
 *     AI-safe projection.
 *
 * Key handling: the key is read from `apps/api/.env` (gitignored) via dotenv,
 * resolved from this file's own location so it loads regardless of cwd, and the SDK
 * reads `ANTHROPIC_API_KEY` from the environment. The key value is NEVER printed —
 * at most a "key detected (length N)" line.
 *
 * Run with: `pnpm --filter @sanctuary-os/api ai:smoke`
 * (Requires `ANTHROPIC_API_KEY=...` in `apps/api/.env`.)
 */

// Load apps/api/.env relative to THIS file (src/demo/ai-smoke-test.ts -> apps/api/.env),
// so the key loads no matter which directory the script is launched from.
const currentDir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(currentDir, "../../.env");
config({ path: envPath });

const apiKey = process.env["ANTHROPIC_API_KEY"];
if (apiKey === undefined || apiKey.length === 0) {
  console.error(
    "ANTHROPIC_API_KEY not set in apps/api/.env — paste your key and re-run"
  );
  process.exit(1);
}

// Never print the key itself; a length-only acknowledgement is enough to confirm
// it was loaded.
console.log(`key detected (length ${String(apiKey.length)})`);

const client = new Anthropic();

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

let communityOk = false;
let obsOk = false;

// COMMUNITY check: live comms-draft against the real model, then re-validate.
try {
  const communityPrompt = CommunityAiDraftPromptSchema.parse({
    aiPolicyProfile: { humanReviewRequiredFor: [], piiSharingAllowed: false },
    audienceKind: "segment",
    audienceLabel: "hospitality-team",
    campaignIntent:
      "Invite the hospitality team to Sunday's 8am volunteer huddle",
    channel: "sms",
    churchToneSummary:
      "Warm, brief, hopeful — like a friendly text from a ministry leader",
    engagementSignals: [
      {
        attendanceStreak: 4,
        commsResponseCount: 2,
        scopeKind: "segment",
        scopeRef: "hospitality-team",
        servingCount: 3
      }
    ],
    forbiddenTopics: ["giving", "fundraising"],
    promptVersion: COMMUNITY_AI_DRAFT_PROMPT_VERSION,
    requiredPlaceholders: ["firstName"],
    requestId: "smoke-community-1",
    tenantId: "tenant-demo"
  });

  const communityPort = createAnthropicCommunityAiDraftPort({ client });
  const communityRaw = await communityPort.draftCommunication(communityPrompt);
  const communitySuggestion = CommunityAiDraftSuggestionSchema.parse(communityRaw);

  communityOk = true;
  console.log("--- COMMUNITY: PASS ---");
  console.log(`status: ${communitySuggestion.status}`);
  console.log(`bodyTemplate: ${communitySuggestion.bodyTemplate}`);
  console.log(`rationale: ${communitySuggestion.rationale}`);
  console.log(
    `usedPlaceholders: ${JSON.stringify(communitySuggestion.usedPlaceholders)}`
  );
} catch (error: unknown) {
  console.error(`--- COMMUNITY: FAIL --- ${errorMessage(error)}`);
}

// OBS check: live action-suggestion against the real model, then re-validate.
try {
  const obsPrompt = ObsAiActionSuggestionPromptSchema.parse({
    aiPolicyProfile: { humanReviewRequiredFor: [], piiSharingAllowed: false },
    connectionProfileRef: "obs-connection-sanctuary",
    connectionStatus: "connected",
    operatorIntent:
      "The sermon is about to start; we're currently on the Worship scene",
    promptVersion: OBS_AI_ACTION_SUGGESTION_PROMPT_VERSION,
    recordingStatus: "inactive",
    scenes: [
      {
        displayName: "Worship",
        isCurrentProgramScene: true,
        obsSceneRef: "scene-worship"
      },
      {
        displayName: "Sermon",
        isCurrentProgramScene: false,
        obsSceneRef: "scene-sermon"
      },
      {
        displayName: "Announcements",
        isCurrentProgramScene: false,
        obsSceneRef: "scene-announcements"
      }
    ],
    sceneItems: [],
    serviceSegmentLabels: ["Welcome", "Worship", "Sermon", "Announcements"],
    sources: [],
    streamStatus: "active",
    requestId: "smoke-obs-1",
    tenantId: "tenant-demo"
  });

  const obsPort = createAnthropicObsAiSuggestionPort({ client });
  const obsRaw = await obsPort.suggestObsAction(obsPrompt);
  const obsSuggestion = ObsAiActionSuggestionSchema.parse(obsRaw);

  obsOk = true;
  console.log("--- OBS: PASS ---");
  console.log(`status: ${obsSuggestion.status}`);
  console.log(`kind: ${obsSuggestion.kind}`);
  console.log(`targetSceneRef: ${obsSuggestion.targetSceneRef ?? "(none)"}`);
  console.log(`rationale: ${obsSuggestion.rationale}`);
} catch (error: unknown) {
  console.error(`--- OBS: FAIL --- ${errorMessage(error)}`);
}

if (!communityOk || !obsOk) {
  console.error(
    `Smoke test FAILED (community: ${communityOk ? "pass" : "fail"}, obs: ${obsOk ? "pass" : "fail"}).`
  );
  process.exit(1);
}

console.log("Smoke test PASSED (community + obs).");
