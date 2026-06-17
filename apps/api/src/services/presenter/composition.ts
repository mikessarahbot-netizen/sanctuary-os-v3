import type { AuthenticatedActor } from "../../auth/index.js";
import { ApiRoleSchema } from "../../auth/index.js";
import {
  OutputTargetSchema,
  PresentationSchema,
  PresenterThemeSchema,
  SlideSchema,
  type OutputTarget,
  type Presentation,
  type PresenterTheme,
  type Slide
} from "../../domain/presenter/index.js";
import {
  AddPresenterSlideCommandSchema,
  ApplyPresenterThemeCommandSchema,
  CreatePresentationFromServiceCommandSchema,
  GetPresenterPresentationForServiceQuerySchema,
  GetPresenterPresentationQuerySchema,
  ListPresenterOutputTargetsQuerySchema,
  ListPresenterPresentationsQuerySchema,
  ListPresenterThemesQuerySchema,
  RemovePresenterSlideCommandSchema,
  ReorderPresenterSlidesCommandSchema,
  SetPresenterOutputTargetCommandSchema,
  UpdatePresentationCommandSchema,
  UpdatePresenterSlideCommandSchema,
  type AddPresenterSlideCommand,
  type ApplyPresenterThemeCommand,
  type CreatePresentationFromServiceCommand,
  type GetPresenterPresentationForServiceQuery,
  type GetPresenterPresentationQuery,
  type ListPresenterOutputTargetsQuery,
  type ListPresenterPresentationsQuery,
  type ListPresenterThemesQuery,
  type PresenterCommandService,
  type PresenterQueryService,
  type RemovePresenterSlideCommand,
  type ReorderPresenterSlidesCommand,
  type SetPresenterOutputTargetCommand,
  type UpdatePresentationCommand,
  type UpdatePresenterSlideCommand
} from "./contracts.js";

const PresenterReadRoleSchema = ApiRoleSchema;
const PresenterWriteRoleSchema = ApiRoleSchema.extract([
  "church_admin",
  "worship_leader",
  "planner"
]);

export type InMemoryPresenterOperationName =
  | "addSlide"
  | "applyPresenterTheme"
  | "createPresentationFromService"
  | "listOutputTargets"
  | "listPresentations"
  | "listThemes"
  | "removeSlide"
  | "reorderSlides"
  | "setOutputTarget"
  | "updatePresentation"
  | "updateSlide";

export interface RecordedInMemoryPresenterOperation {
  readonly actorId: string;
  readonly operationName: InMemoryPresenterOperationName;
  readonly requestId: string;
  readonly tenantId: string;
}

export interface PresenterInMemorySeed {
  readonly outputTargets?: readonly OutputTarget[];
  readonly presentations?: readonly Presentation[];
  readonly themes?: readonly PresenterTheme[];
}

export interface PresenterInMemoryIds {
  readonly presentationId: () => string;
  readonly slideBlockId: () => string;
  readonly slideId: () => string;
  readonly themeId: () => string;
}

export interface PresenterInMemoryServicesDependencies {
  readonly clock?: () => string;
  readonly ids?: Partial<PresenterInMemoryIds>;
  readonly seed?: PresenterInMemorySeed;
}

export interface PresenterInMemoryServices {
  readonly presenterCommandService: PresenterCommandService;
  readonly presenterQueryService: PresenterQueryService;
  readonly readOperations: () => readonly RecordedInMemoryPresenterOperation[];
  readonly readOutputTargets: () => readonly OutputTarget[];
  readonly readPresentations: () => readonly Presentation[];
  readonly readThemes: () => readonly PresenterTheme[];
}

export const createInMemoryPresenterServices = (
  dependencies: PresenterInMemoryServicesDependencies = {}
): PresenterInMemoryServices => {
  const clock = dependencies.clock ?? (() => new Date().toISOString());
  const ids = createPresenterIds(dependencies.ids);
  const operations: RecordedInMemoryPresenterOperation[] = [];
  const presentations = new Map<string, Presentation>(
    (dependencies.seed?.presentations ?? []).map((rawPresentation) => {
      const presentation = PresentationSchema.parse(rawPresentation);
      return [presentation.presentationId, presentation] as const;
    })
  );
  const themes = new Map<string, PresenterTheme>(
    (dependencies.seed?.themes ?? []).map((rawTheme) => {
      const theme = PresenterThemeSchema.parse(rawTheme);
      return [theme.themeId, theme] as const;
    })
  );
  const outputTargets = new Map<string, OutputTarget>(
    (dependencies.seed?.outputTargets ?? []).map((rawTarget) => {
      const target = OutputTargetSchema.parse(rawTarget);
      return [target.outputTargetId, target] as const;
    })
  );

  const recordOperation = (
    operationName: InMemoryPresenterOperationName,
    actor: AuthenticatedActor,
    requestId: string
  ): void => {
    operations.push({
      actorId: actor.actorId,
      operationName,
      requestId,
      tenantId: actor.tenantId
    });
  };

  const queryService: PresenterQueryService = {
    outputTargets: async (
      rawQuery: ListPresenterOutputTargetsQuery
    ): Promise<readonly OutputTarget[]> => {
      await Promise.resolve();
      const query = ListPresenterOutputTargetsQuerySchema.parse(rawQuery);
      assertPresenterReadRole(query.actor);
      recordOperation("listOutputTargets", query.actor, query.requestId);

      return [...outputTargets.values()]
        .filter((target) => target.tenantId === query.actor.tenantId)
        .map((target) => OutputTargetSchema.parse(target));
    },

    presentation: async (
      rawQuery: GetPresenterPresentationQuery
    ): Promise<Presentation | null> => {
      await Promise.resolve();
      const query = GetPresenterPresentationQuerySchema.parse(rawQuery);
      assertPresenterReadRole(query.actor);
      recordOperation("listPresentations", query.actor, query.requestId);

      return getTenantPresentation(query.input.presentationId, query.actor.tenantId);
    },

    presentationForService: async (
      rawQuery: GetPresenterPresentationForServiceQuery
    ): Promise<Presentation | null> => {
      await Promise.resolve();
      const query = GetPresenterPresentationForServiceQuerySchema.parse(rawQuery);
      assertPresenterReadRole(query.actor);
      recordOperation("listPresentations", query.actor, query.requestId);

      return (
        [...presentations.values()]
          .filter(
            (presentation) =>
              presentation.tenantId === query.actor.tenantId &&
              presentation.serviceId === query.input.serviceId
          )
          .map((presentation) => PresentationSchema.parse(presentation))[0] ?? null
      );
    },

    presentations: async (
      rawQuery: ListPresenterPresentationsQuery
    ): Promise<readonly Presentation[]> => {
      await Promise.resolve();
      const query = ListPresenterPresentationsQuerySchema.parse(rawQuery);
      assertPresenterReadRole(query.actor);
      recordOperation("listPresentations", query.actor, query.requestId);

      return [...presentations.values()]
        .filter((presentation) => {
          if (presentation.tenantId !== query.actor.tenantId) {
            return false;
          }

          return (
            query.input.filter?.serviceId === undefined ||
            presentation.serviceId === query.input.filter.serviceId
          );
        })
        .map((presentation) => PresentationSchema.parse(presentation));
    },

    presenterThemes: async (
      rawQuery: ListPresenterThemesQuery
    ): Promise<readonly PresenterTheme[]> => {
      await Promise.resolve();
      const query = ListPresenterThemesQuerySchema.parse(rawQuery);
      assertPresenterReadRole(query.actor);
      recordOperation("listThemes", query.actor, query.requestId);
      const normalizedQuery = query.input.filter?.query?.toLocaleLowerCase();

      return [...themes.values()]
        .filter((theme) => {
          if (theme.tenantId !== query.actor.tenantId) {
            return false;
          }

          return (
            normalizedQuery === undefined ||
            theme.name.toLocaleLowerCase().includes(normalizedQuery)
          );
        })
        .map((theme) => PresenterThemeSchema.parse(theme));
    }
  };

  const commandService: PresenterCommandService = {
    addSlide: async (rawCommand: AddPresenterSlideCommand): Promise<Slide> => {
      await Promise.resolve();
      const command = AddPresenterSlideCommandSchema.parse(rawCommand);
      assertPresenterWriteRole(command.actor);
      recordOperation("addSlide", command.actor, command.requestId);
      const presentation = requireTenantPresentation(
        command.input.presentationId,
        command.actor.tenantId
      );
      const slide = SlideSchema.parse({
        ...command.input.slide,
        order: resolveNewSlideOrder(presentation.slides, command.input.afterSlideId),
        presentationId: presentation.presentationId,
        slideId: ids.slideId(),
        tenantId: command.actor.tenantId
      });
      const updatedSlides = insertAndReindexSlides(
        presentation.slides,
        slide,
        command.input.afterSlideId
      );
      savePresentation({
        ...presentation,
        slides: updatedSlides,
        updatedAt: clock()
      });

      return slide;
    },

    applyPresenterTheme: async (
      rawCommand: ApplyPresenterThemeCommand
    ): Promise<Presentation> => {
      await Promise.resolve();
      const command = ApplyPresenterThemeCommandSchema.parse(rawCommand);
      assertPresenterWriteRole(command.actor);
      recordOperation("applyPresenterTheme", command.actor, command.requestId);
      const presentation = requireTenantPresentation(
        command.input.presentationId,
        command.actor.tenantId
      );
      const theme = themes.get(command.input.themeId);

      if (theme === undefined || theme.tenantId !== command.actor.tenantId) {
        throw new Error("Presenter theme not found for tenant.");
      }

      return savePresentation({
        ...presentation,
        theme,
        updatedAt: clock()
      });
    },

    createPresentationFromService: async (
      rawCommand: CreatePresentationFromServiceCommand
    ): Promise<Presentation> => {
      await Promise.resolve();
      const command = CreatePresentationFromServiceCommandSchema.parse(rawCommand);
      assertPresenterWriteRole(command.actor);
      recordOperation(
        "createPresentationFromService",
        command.actor,
        command.requestId
      );
      const theme = firstTenantTheme(command.actor.tenantId) ?? createDefaultTheme(command);
      themes.set(theme.themeId, theme);
      const createdAt = clock();
      const title = command.input.title ?? "Service Presentation";
      const presentationId = ids.presentationId();
      const slide = SlideSchema.parse({
        blocks: [
          {
            alignment: "center",
            blockId: ids.slideBlockId(),
            kind: "text",
            text: title,
            textStyle: "heading"
          }
        ],
        layout: "title",
        order: 0,
        presentationId,
        slideId: ids.slideId(),
        tenantId: command.actor.tenantId,
        title
      });

      return savePresentation({
        createdAt,
        mediaCues: [],
        presentationId,
        serviceId: command.input.serviceId,
        slides: [slide],
        tenantId: command.actor.tenantId,
        theme,
        title,
        updatedAt: createdAt
      });
    },

    removeSlide: async (
      rawCommand: RemovePresenterSlideCommand
    ): Promise<Presentation> => {
      await Promise.resolve();
      const command = RemovePresenterSlideCommandSchema.parse(rawCommand);
      assertPresenterWriteRole(command.actor);
      recordOperation("removeSlide", command.actor, command.requestId);
      const presentation = requireTenantPresentation(
        command.input.presentationId,
        command.actor.tenantId
      );

      if (presentation.slides.length === 1) {
        throw new Error("Presenter presentations must keep at least one slide.");
      }

      if (!presentation.slides.some((slide) => slide.slideId === command.input.slideId)) {
        throw new Error("Presenter slide not found for tenant.");
      }

      return savePresentation({
        ...presentation,
        slides: reindexSlides(
          presentation.slides.filter((slide) => slide.slideId !== command.input.slideId)
        ),
        updatedAt: clock()
      });
    },

    reorderSlides: async (
      rawCommand: ReorderPresenterSlidesCommand
    ): Promise<readonly Slide[]> => {
      await Promise.resolve();
      const command = ReorderPresenterSlidesCommandSchema.parse(rawCommand);
      assertPresenterWriteRole(command.actor);
      recordOperation("reorderSlides", command.actor, command.requestId);
      const presentation = requireTenantPresentation(
        command.input.presentationId,
        command.actor.tenantId
      );
      const reorderedSlides = command.input.orderedSlideIds.map((slideId) => {
        const slide = presentation.slides.find(
          (candidate) => candidate.slideId === slideId
        );

        if (slide === undefined) {
          throw new Error("Presenter slide not found for tenant.");
        }

        return slide;
      });

      if (reorderedSlides.length !== presentation.slides.length) {
        throw new Error("Presenter slide order must include every slide exactly once.");
      }

      const slides = reindexSlides(reorderedSlides);
      savePresentation({
        ...presentation,
        slides,
        updatedAt: clock()
      });

      return slides;
    },

    setOutputTarget: async (
      rawCommand: SetPresenterOutputTargetCommand
    ): Promise<OutputTarget> => {
      await Promise.resolve();
      const command = SetPresenterOutputTargetCommandSchema.parse(rawCommand);
      assertPresenterWriteRole(command.actor);
      recordOperation("setOutputTarget", command.actor, command.requestId);
      requireTenantPresentation(command.input.presentationId, command.actor.tenantId);

      if (command.input.outputTarget.tenantId !== command.actor.tenantId) {
        throw new Error("Presenter output target tenant mismatch.");
      }

      outputTargets.set(command.input.outputTarget.outputTargetId, command.input.outputTarget);

      return OutputTargetSchema.parse(command.input.outputTarget);
    },

    updatePresentation: async (
      rawCommand: UpdatePresentationCommand
    ): Promise<Presentation> => {
      await Promise.resolve();
      const command = UpdatePresentationCommandSchema.parse(rawCommand);
      assertPresenterWriteRole(command.actor);
      recordOperation("updatePresentation", command.actor, command.requestId);
      const presentation = requireTenantPresentation(
        command.input.presentationId,
        command.actor.tenantId
      );

      return savePresentation({
        ...presentation,
        ...(command.input.serviceId !== undefined
          ? { serviceId: command.input.serviceId }
          : {}),
        ...(command.input.title !== undefined ? { title: command.input.title } : {}),
        updatedAt: clock()
      });
    },

    updateSlide: async (rawCommand: UpdatePresenterSlideCommand): Promise<Slide> => {
      await Promise.resolve();
      const command = UpdatePresenterSlideCommandSchema.parse(rawCommand);
      assertPresenterWriteRole(command.actor);
      recordOperation("updateSlide", command.actor, command.requestId);
      const presentation = requireTenantPresentation(
        command.input.presentationId,
        command.actor.tenantId
      );
      const slide = SlideSchema.parse(command.input.slide);

      if (
        slide.tenantId !== command.actor.tenantId ||
        slide.presentationId !== presentation.presentationId
      ) {
        throw new Error("Presenter slide tenant or presentation mismatch.");
      }

      if (!presentation.slides.some((candidate) => candidate.slideId === slide.slideId)) {
        throw new Error("Presenter slide not found for tenant.");
      }

      savePresentation({
        ...presentation,
        slides: reindexSlides(
          presentation.slides.map((candidate) =>
            candidate.slideId === slide.slideId ? slide : candidate
          )
        ),
        updatedAt: clock()
      });

      return slide;
    }
  };

  const getTenantPresentation = (
    presentationId: string,
    tenantId: string
  ): Presentation | null => {
    const presentation = presentations.get(presentationId);

    return presentation !== undefined && presentation.tenantId === tenantId
      ? PresentationSchema.parse(presentation)
      : null;
  };

  const requireTenantPresentation = (
    presentationId: string,
    tenantId: string
  ): Presentation => {
    const presentation = getTenantPresentation(presentationId, tenantId);

    if (presentation === null) {
      throw new Error("Presenter presentation not found for tenant.");
    }

    return presentation;
  };

  const savePresentation = (rawPresentation: unknown): Presentation => {
    const presentation = PresentationSchema.parse(rawPresentation);
    presentations.set(presentation.presentationId, presentation);

    return presentation;
  };

  const firstTenantTheme = (tenantId: string): PresenterTheme | null =>
    [...themes.values()].find((theme) => theme.tenantId === tenantId) ?? null;

  const createDefaultTheme = (
    command: CreatePresentationFromServiceCommand
  ): PresenterTheme =>
    PresenterThemeSchema.parse({
      colors: {
        background: "#101820",
        lowerThirdBackground: "#101820",
        lowerThirdText: "#ffffff",
        text: "#ffffff"
      },
      lowerThird: {
        maxLines: 2,
        placement: "bottom-center"
      },
      name: "Default Presenter Theme",
      spacing: {
        blockGap: 24,
        slidePadding: 64
      },
      tenantId: command.actor.tenantId,
      themeId: ids.themeId(),
      typography: {
        baseFontSize: 48,
        bodyFontFamily: "Inter",
        headingFontFamily: "Inter",
        lineHeight: 1.2
      }
    });

  return {
    presenterCommandService: commandService,
    presenterQueryService: queryService,
    readOperations: () => [...operations],
    readOutputTargets: () =>
      [...outputTargets.values()].map((target) => OutputTargetSchema.parse(target)),
    readPresentations: () =>
      [...presentations.values()].map((presentation) =>
        PresentationSchema.parse(presentation)
      ),
    readThemes: () => [...themes.values()].map((theme) => PresenterThemeSchema.parse(theme))
  };
};

const createPresenterIds = (
  overrides: Partial<PresenterInMemoryIds> | undefined
): PresenterInMemoryIds => {
  let presentationNumber = 1;
  let slideNumber = 1;
  let blockNumber = 1;
  let themeNumber = 1;

  return {
    presentationId:
      overrides?.presentationId ??
      (() => {
        const id = `presentation_${String(presentationNumber)}`;
        presentationNumber += 1;
        return id;
      }),
    slideBlockId:
      overrides?.slideBlockId ??
      (() => {
        const id = `block_${String(blockNumber)}`;
        blockNumber += 1;
        return id;
      }),
    slideId:
      overrides?.slideId ??
      (() => {
        const id = `slide_${String(slideNumber)}`;
        slideNumber += 1;
        return id;
      }),
    themeId:
      overrides?.themeId ??
      (() => {
        const id = `theme_${String(themeNumber)}`;
        themeNumber += 1;
        return id;
      })
  };
};

const assertPresenterReadRole = (actor: AuthenticatedActor): void => {
  const hasPresenterRole = actor.roles.some((role) =>
    PresenterReadRoleSchema.safeParse(role).success
  );

  if (!hasPresenterRole) {
    throw new Error("Actor is not allowed to read Presenter presentations.");
  }
};

const assertPresenterWriteRole = (actor: AuthenticatedActor): void => {
  const hasPresenterRole = actor.roles.some((role) =>
    PresenterWriteRoleSchema.safeParse(role).success
  );

  if (!hasPresenterRole) {
    throw new Error("Actor is not allowed to change Presenter presentations.");
  }
};

const resolveNewSlideOrder = (
  slides: readonly Slide[],
  afterSlideId: string | undefined
): number => {
  if (afterSlideId === undefined) {
    return slides.length;
  }

  const index = slides.findIndex((slide) => slide.slideId === afterSlideId);

  if (index === -1) {
    throw new Error("Presenter after-slide reference was not found.");
  }

  return index + 1;
};

const insertAndReindexSlides = (
  slides: readonly Slide[],
  slide: Slide,
  afterSlideId: string | undefined
): readonly Slide[] => {
  if (afterSlideId === undefined) {
    return reindexSlides([...slides, slide]);
  }

  const index = slides.findIndex((candidate) => candidate.slideId === afterSlideId);

  if (index === -1) {
    throw new Error("Presenter after-slide reference was not found.");
  }

  return reindexSlides([
    ...slides.slice(0, index + 1),
    slide,
    ...slides.slice(index + 1)
  ]);
};

const reindexSlides = (slides: readonly Slide[]): readonly Slide[] =>
  slides.map((slide, order) =>
    SlideSchema.parse({
      ...slide,
      order
    })
  );
