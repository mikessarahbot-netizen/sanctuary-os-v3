import { parse, validate } from "graphql";
import { describe, expect, it } from "vitest";
import {
  PLAY_REPLAY_MUTATION_DOCUMENTS,
  type PlayCommandService,
  type PlayQueryService
} from "../services/play/index.js";
import {
  PRESENTER_REPLAY_MUTATION_DOCUMENTS,
  type PresenterCommandService,
  type PresenterQueryService
} from "../services/presenter/index.js";
import { createPresenterGraphqlSchema } from "./presenter-schema.js";

/**
 * Proves the desktop offline-replay mutation documents validate against the
 * server's TYPED executable schema.
 *
 * The desktop presenter and play network command services send the exact strings
 * exported as `PRESENTER_REPLAY_MUTATION_DOCUMENTS` and
 * `PLAY_REPLAY_MUTATION_DOCUMENTS` from `@sanctuary-os/api`. Those same maps are
 * imported here, so this test validates the real shipped documents — not copies.
 * `apps/desktop` cannot be imported from `apps/api`, so the canonical documents
 * live in `@sanctuary-os/api` (which the desktop already depends on) and both
 * sides reference the one source of truth.
 *
 * Validation is purely static against the schema's type system, so the resolver
 * stubs below never execute; they exist only because the schema factory wires
 * resolvers when it builds the executable schema.
 */
const notUsed = (): Promise<never> => Promise.reject(new Error("not used"));

const presenterStub: {
  readonly presenterCommandService: PresenterCommandService;
  readonly presenterQueryService: PresenterQueryService;
} = {
  presenterCommandService: {
    addSlide: notUsed,
    applyPresenterTheme: notUsed,
    createPresentationFromService: notUsed,
    removeSlide: notUsed,
    reorderSlides: notUsed,
    setOutputTarget: notUsed,
    updatePresentation: notUsed,
    updateSlide: notUsed
  },
  presenterQueryService: {
    outputTargets: notUsed,
    presentation: notUsed,
    presentationForService: notUsed,
    presentations: notUsed,
    presenterThemes: notUsed
  }
};

const playStub: {
  readonly playCommandService: PlayCommandService;
  readonly playQueryService: PlayQueryService;
} = {
  playCommandService: {
    addPlayCue: notUsed,
    removePlayCue: notUsed,
    reorderPlaySections: notUsed,
    savePadLayer: notUsed,
    savePlayArrangement: notUsed,
    savePlaySection: notUsed,
    saveTrackSet: notUsed,
    setPlaybackState: notUsed,
    updatePlayCue: notUsed,
    updateTrackSetMembers: notUsed
  },
  playQueryService: {
    getPlaybackState: notUsed,
    getTrackSet: notUsed,
    listPadLayers: notUsed,
    listPlayArrangements: notUsed,
    listPlayCues: notUsed,
    listPlaySections: notUsed,
    listTrackSets: notUsed,
    listTrackSetsForSong: notUsed,
    resolvePlaySequence: notUsed
  }
};

const schema = createPresenterGraphqlSchema({
  ...presenterStub,
  play: playStub
});

const presenterReplayDocuments = Object.entries(PRESENTER_REPLAY_MUTATION_DOCUMENTS);
const playReplayDocuments = Object.entries(PLAY_REPLAY_MUTATION_DOCUMENTS);

describe("replay mutation documents validate against the typed schema", () => {
  it.each(presenterReplayDocuments)(
    "validates the Presenter replay document for %s",
    (_operationName, document) => {
      const errors = validate(schema, parse(document));

      expect(errors).toEqual([]);
    }
  );

  it.each(playReplayDocuments)(
    "validates the Play replay document for %s",
    (_operationName, document) => {
      const errors = validate(schema, parse(document));

      expect(errors).toEqual([]);
    }
  );

  it("rejects the legacy untyped JSON! variable form (negative control)", () => {
    // The old desktop executors declared every replay variable as `$input: JSON!`.
    // Passing a `JSON` variable where the mutation argument is a typed input
    // (`UpdatePresentationInput!`) is a variable-position type mismatch, so the
    // typed schema must reject it. This guards against the fix silently regressing
    // back to the permissive form.
    const legacyDocument =
      "mutation updatePresentation($input: JSON!) {\n" +
      "  updatePresentation(input: $input) {\n" +
      "    presentationId\n" +
      "  }\n" +
      "}";

    const errors = validate(schema, parse(legacyDocument));

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((error) => error.message).join("\n")).toContain("$input");
  });
});
