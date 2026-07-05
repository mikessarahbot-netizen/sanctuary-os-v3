import { demoActor, type DemoAdapters } from "./compose.js";
import type { VoiceQueryAnswerers } from "../voice/bridge.js";

/**
 * The demo wiring of the voice bridge's four allowed read queries. Each
 * answerer routes through an EXISTING module query service (tenant-scoped to
 * the demo actor, Zod-validated inside the service) and phrases the result as
 * one short plain-text sentence suitable for text-to-speech. No new domain
 * logic lives here — only phrasing.
 */
const VOICE_REQUEST_ID = "voice-ask";

/** "A", "A and B", or "A, B, and C" — natural for TTS. */
const speakList = (items: readonly string[]): string => {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  if (items.length === 2) {
    return `${items[0] ?? ""} and ${items[1] ?? ""}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1] ?? ""}`;
};

export const createDemoVoiceAnswerers = (adapters: DemoAdapters): VoiceQueryAnswerers => {
  const base = { actor: demoActor, requestId: VOICE_REQUEST_ID };

  const setlist = async (): Promise<string> => {
    const charts = await adapters.charts.queryService.listCharts({ ...base, input: {} });

    if (charts.length === 0) {
      return "No charts are loaded yet.";
    }

    const titles = charts.map(
      (chart) => `${chart.title ?? "an untitled chart"} in ${chart.defaultKey}`
    );

    return `There are ${String(charts.length)} charts ready: ${speakList(titles)}.`;
  };

  const streamStatus = async (): Promise<string> => {
    const profiles = await adapters.obs.queryService.listObsConnectionProfiles({
      ...base,
      input: {}
    });
    const profile = profiles[0];

    if (profile === undefined) {
      return "No OBS connection is configured.";
    }

    const input = { connectionProfileId: profile.connectionProfileId };
    const [streamState, scenes] = await Promise.all([
      adapters.obs.queryService.getObsStreamState({ ...base, input }),
      adapters.obs.queryService.listObsScenes({ ...base, input })
    ]);
    const programScene = scenes.find((scene) => scene.isCurrentProgramScene);

    return (
      `The stream is ${streamState?.streamStatus ?? "in an unknown state"}. ` +
      `The current program scene is ${programScene?.displayName ?? "unknown"}.`
    );
  };

  const memberCount = async (): Promise<string> => {
    const members = await adapters.community.queryService.listMembers({
      ...base,
      input: {}
    });
    const active = members.filter((member) => member.status === "active").length;

    return `There are ${String(members.length)} people on file, ${String(active)} of them active.`;
  };

  const readiness = async (): Promise<string> => {
    const [charts, trackSets] = await Promise.all([
      adapters.charts.queryService.listCharts({ ...base, input: {} }),
      adapters.play.queryService.listTrackSets({ ...base, input: {} })
    ]);

    return (
      `${String(charts.length)} charts and ${String(trackSets.length)} track sets are loaded. ` +
      (await streamStatus())
    );
  };

  return {
    member_count: memberCount,
    readiness,
    setlist,
    stream_status: streamStatus
  };
};
