import { beforeEach, describe, expect, it } from "vitest";
import type { AuthenticatedActor } from "../../auth/index.js";
import {
  isPresenterDomainError,
  type Presentation,
  type PresenterDomainErrorCode
} from "../../domain/presenter/index.js";
import {
  CreatePresentationFromServiceCommandSchema,
  SetPresenterOutputTargetCommandSchema,
  UpdatePresenterSlideCommandSchema
} from "./contracts.js";
import {
  createInMemoryPresenterServicesAdapter,
  type InMemoryPresenterServicesAdapter
} from "./in-memory.js";

const actor: AuthenticatedActor = {
  actorId: "actor_1",
  roles: ["worship_leader"],
  tenantId: "tenant_1"
};

const viewer: AuthenticatedActor = {
  actorId: "actor_viewer",
  roles: ["viewer"],
  tenantId: "tenant_1"
};

const expectDomainErrorCode = async (
  operation: Promise<unknown>,
  code: PresenterDomainErrorCode
): Promise<void> => {
  const error: unknown = await operation.then(
    () => undefined,
    (caught: unknown) => caught
  );

  expect(isPresenterDomainError(error)).toBe(true);
  if (isPresenterDomainError(error)) {
    expect(error.code).toBe(code);
  }
};

describe("Presenter in-memory service typed domain errors", () => {
  let adapter: InMemoryPresenterServicesAdapter;
  let presentation: Presentation;

  beforeEach(async () => {
    adapter = createInMemoryPresenterServicesAdapter({ clock: () => "2026-06-17T08:00:00.000Z" });
    presentation = await adapter.commandService.createPresentationFromService(
      CreatePresentationFromServiceCommandSchema.parse({
        actor,
        input: { serviceId: "service_1", title: "Sunday" },
        requestId: "request_create"
      })
    );
  });

  it("throws AUTHORIZATION_FAILED when the actor lacks the command role", async () => {
    await expectDomainErrorCode(
      adapter.commandService.updatePresentation({
        actor: viewer,
        input: { presentationId: presentation.presentationId, title: "Edit" },
        requestId: "request_viewer"
      }),
      "AUTHORIZATION_FAILED"
    );
  });

  it("throws STALE_PRESENTATION when the presentation no longer exists", async () => {
    await expectDomainErrorCode(
      adapter.commandService.updatePresentation({
        actor,
        input: { presentationId: "presentation_missing", title: "Edit" },
        requestId: "request_missing"
      }),
      "STALE_PRESENTATION"
    );
  });

  it("throws THEME_MISMATCH when the theme is unknown", async () => {
    await expectDomainErrorCode(
      adapter.commandService.applyPresenterTheme({
        actor,
        input: { presentationId: presentation.presentationId, themeId: "theme_missing" },
        requestId: "request_theme"
      }),
      "THEME_MISMATCH"
    );
  });

  it("throws MISSING_SLIDE when updating an unknown slide", async () => {
    const slide = presentation.slides[0];
    if (slide === undefined) {
      throw new Error("Seeded presentation should have a slide.");
    }

    await expectDomainErrorCode(
      adapter.commandService.updateSlide(
        UpdatePresenterSlideCommandSchema.parse({
          actor,
          input: {
            presentationId: presentation.presentationId,
            slide: { ...slide, slideId: "slide_missing" }
          },
          requestId: "request_slide"
        })
      ),
      "MISSING_SLIDE"
    );
  });

  it("throws OUTPUT_TARGET_MISMATCH when the output target tenant differs", async () => {
    await expectDomainErrorCode(
      adapter.commandService.setOutputTarget(
        SetPresenterOutputTargetCommandSchema.parse({
          actor,
          input: {
            outputTarget: {
              confidenceOutputEnabled: false,
              displayName: "Main",
              outputTargetId: "output_1",
              safeBlanked: true,
              targetKind: "main",
              tenantId: "tenant_other",
              windowRef: "display-main"
            },
            presentationId: presentation.presentationId
          },
          requestId: "request_output"
        })
      ),
      "OUTPUT_TARGET_MISMATCH"
    );
  });

  it("throws VALIDATION_FAILED when a reorder omits slides", async () => {
    await expectDomainErrorCode(
      adapter.commandService.reorderSlides({
        actor,
        input: {
          orderedSlideIds: ["slide_1", "slide_extra"],
          presentationId: presentation.presentationId
        },
        requestId: "request_reorder"
      }),
      "VALIDATION_FAILED"
    );
  });
});
