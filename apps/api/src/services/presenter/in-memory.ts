import type { AuthenticatedActor } from "../../auth/index.js";
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
  type PresenterCommandService,
  type PresenterQueryService
} from "./contracts.js";

const presenterQueryRoles = [
  "super_admin",
  "church_admin",
  "worship_leader",
  "planner",
  "musician",
  "volunteer",
  "viewer"
] as const;

const presenterCommandRoles = [
  "super_admin",
  "church_admin",
  "worship_leader",
  "planner"
] as const;

export interface InMemoryPresenterServiceSeed {
  readonly outputTargets?: readonly OutputTarget[];
  readonly presentations?: readonly Presentation[];
  readonly themes?: readonly PresenterTheme[];
}

export interface InMemoryPresenterServiceIds {
  readonly presentationId: () => string;
  readonly slideBlockId: () => string;
  readonly slideId: () => string;
}

export interface InMemoryPresenterServiceDependencies {
  readonly clock?: () => string;
  readonly ids?: Partial<InMemoryPresenterServiceIds>;
  readonly seed?: InMemoryPresenterServiceSeed;
}

export interface InMemoryPresenterServicesAdapter {
  readonly commandService: PresenterCommandService;
  readonly queryService: PresenterQueryService;
  readonly readOutputTargets: () => readonly OutputTarget[];
  readonly readPresentations: () => readonly Presentation[];
  readonly readThemes: () => readonly PresenterTheme[];
}

export const createInMemoryPresenterServicesAdapter = (
  dependencies: InMemoryPresenterServiceDependencies = {}
): InMemoryPresenterServicesAdapter => {
  const clock = dependencies.clock ?? (() => new Date().toISOString());
  const ids = createPresenterIds(dependencies.ids);
  const presentations = new Map<string, Presentation>();
  const themes = new Map<string, PresenterTheme>();
  const outputTargets = new Map<string, OutputTarget>();

  dependencies.seed?.themes?.forEach((theme) => {
    const parsedTheme = PresenterThemeSchema.parse(theme);
    themes.set(parsedTheme.themeId, parsedTheme);
  });

  dependencies.seed?.presentations?.forEach((presentation) => {
    const parsedPresentation = PresentationSchema.parse(presentation);
    presentations.set(parsedPresentation.presentationId, parsedPresentation);
    themes.set(parsedPresentation.theme.themeId, parsedPresentation.theme);
  });

  dependencies.seed?.outputTargets?.forEach((outputTarget) => {
    const parsedOutputTarget = OutputTargetSchema.parse(outputTarget);
    outputTargets.set(parsedOutputTarget.outputTargetId, parsedOutputTarget);
  });

  const findTenantPresentation = (
    presentationId: string,
    actor: AuthenticatedActor
  ): Presentation => {
    const presentation = presentations.get(presentationId);

    if (presentation === undefined || presentation.tenantId !== actor.tenantId) {
      throw new Error("Presenter presentation not found for tenant.");
    }

    return presentation;
  };

  const ensureTenantTheme = (themeId: string, actor: AuthenticatedActor): PresenterTheme => {
    const theme = themes.get(themeId);

    if (theme === undefined || theme.tenantId !== actor.tenantId) {
      throw new Error("Presenter theme not found for tenant.");
    }

    return theme;
  };

  const savePresentation = (presentation: Presentation): Presentation => {
    const parsedPresentation = PresentationSchema.parse(presentation);
    presentations.set(parsedPresentation.presentationId, parsedPresentation);

    return parsedPresentation;
  };

  const commandService: PresenterCommandService = {
    addSlide: (rawCommand): Promise<Slide> => runPresenterOperation((): Slide => {
      const command = AddPresenterSlideCommandSchema.parse(rawCommand);
      assertPresenterCommandRole(command.actor);
      const presentation = findTenantPresentation(
        command.input.presentationId,
        command.actor
      );
      const insertAfterIndex =
        command.input.afterSlideId === undefined
          ? presentation.slides.length - 1
          : presentation.slides.findIndex(
              (slide) => slide.slideId === command.input.afterSlideId
            );

      if (insertAfterIndex < 0) {
        throw new Error("Presenter slide insertion point not found for tenant.");
      }

      const slide = SlideSchema.parse({
        ...command.input.slide,
        order: insertAfterIndex + 1,
        presentationId: presentation.presentationId,
        slideId: ids.slideId(),
        tenantId: command.actor.tenantId
      });
      const slides = [
        ...presentation.slides.slice(0, insertAfterIndex + 1),
        slide,
        ...presentation.slides.slice(insertAfterIndex + 1)
      ].map((candidate, order): Slide => SlideSchema.parse({ ...candidate, order }));

      savePresentation({
        ...presentation,
        slides,
        updatedAt: clock()
      });

      return slide;
    }),

    applyPresenterTheme: (rawCommand): Promise<Presentation> =>
      runPresenterOperation((): Presentation => {
      const command = ApplyPresenterThemeCommandSchema.parse(rawCommand);
      assertPresenterCommandRole(command.actor);
      const presentation = findTenantPresentation(
        command.input.presentationId,
        command.actor
      );
      const theme = ensureTenantTheme(command.input.themeId, command.actor);

      return savePresentation({
        ...presentation,
        theme,
        updatedAt: clock()
      });
    }),

    createPresentationFromService: (rawCommand): Promise<Presentation> =>
      runPresenterOperation((): Presentation => {
      const command = CreatePresentationFromServiceCommandSchema.parse(rawCommand);
      assertPresenterCommandRole(command.actor);
      const now = clock();
      const theme = ensureDefaultTenantTheme(command.actor.tenantId, themes);
      const presentationId = ids.presentationId();
      const slide = SlideSchema.parse({
        blocks: [
          {
            alignment: "center",
            blockId: ids.slideBlockId(),
            kind: "text",
            text: command.input.title ?? "Service Presentation",
            textStyle: "heading"
          }
        ],
        layout: "title",
        order: 0,
        presentationId,
        slideId: ids.slideId(),
        tenantId: command.actor.tenantId,
        title: command.input.title ?? "Service Presentation"
      });
      const presentation = PresentationSchema.parse({
        createdAt: now,
        mediaCues: [],
        presentationId,
        serviceId: command.input.serviceId,
        slides: [slide],
        tenantId: command.actor.tenantId,
        theme,
        title: command.input.title ?? "Service Presentation",
        updatedAt: now
      });

      return savePresentation(presentation);
    }),

    removeSlide: (rawCommand): Promise<Presentation> =>
      runPresenterOperation((): Presentation => {
      const command = RemovePresenterSlideCommandSchema.parse(rawCommand);
      assertPresenterCommandRole(command.actor);
      const presentation = findTenantPresentation(
        command.input.presentationId,
        command.actor
      );

      if (presentation.slides.length === 1) {
        throw new Error("Presenter presentation must keep at least one slide.");
      }

      const remainingSlides = presentation.slides.filter(
        (slide) => slide.slideId !== command.input.slideId
      );

      if (remainingSlides.length === presentation.slides.length) {
        throw new Error("Presenter slide not found for tenant.");
      }

      return savePresentation({
        ...presentation,
        mediaCues: presentation.mediaCues.filter(
          (cue) => cue.slideId !== command.input.slideId
        ),
        slides: remainingSlides.map((slide, order): Slide =>
          SlideSchema.parse({ ...slide, order })
        ),
        updatedAt: clock()
      });
    }),

    reorderSlides: (rawCommand): Promise<readonly Slide[]> =>
      runPresenterOperation((): readonly Slide[] => {
      const command = ReorderPresenterSlidesCommandSchema.parse(rawCommand);
      assertPresenterCommandRole(command.actor);
      const presentation = findTenantPresentation(
        command.input.presentationId,
        command.actor
      );

      if (command.input.orderedSlideIds.length !== presentation.slides.length) {
        throw new Error("Presenter slide order must include every slide exactly once.");
      }

      const reorderedSlides = command.input.orderedSlideIds.map(
        (slideId, order): Slide => {
          const slide = presentation.slides.find(
            (candidate) => candidate.slideId === slideId
          );

          if (slide === undefined) {
            throw new Error("Presenter slide not found for tenant.");
          }

          return SlideSchema.parse({ ...slide, order });
        }
      );

      savePresentation({
        ...presentation,
        slides: reorderedSlides,
        updatedAt: clock()
      });

      return reorderedSlides;
    }),

    setOutputTarget: (rawCommand): Promise<OutputTarget> =>
      runPresenterOperation((): OutputTarget => {
      const command = SetPresenterOutputTargetCommandSchema.parse(rawCommand);
      assertPresenterCommandRole(command.actor);
      findTenantPresentation(command.input.presentationId, command.actor);

      if (command.input.outputTarget.tenantId !== command.actor.tenantId) {
        throw new Error("Presenter output target tenant must match actor tenant.");
      }

      const outputTarget = OutputTargetSchema.parse(command.input.outputTarget);
      outputTargets.set(outputTarget.outputTargetId, outputTarget);

      return outputTarget;
    }),

    updatePresentation: (rawCommand): Promise<Presentation> =>
      runPresenterOperation((): Presentation => {
      const command = UpdatePresentationCommandSchema.parse(rawCommand);
      assertPresenterCommandRole(command.actor);
      const presentation = findTenantPresentation(
        command.input.presentationId,
        command.actor
      );

      return savePresentation({
        ...presentation,
        ...(command.input.serviceId !== undefined
          ? { serviceId: command.input.serviceId }
          : {}),
        ...(command.input.title !== undefined ? { title: command.input.title } : {}),
        updatedAt: clock()
      });
    }),

    updateSlide: (rawCommand): Promise<Slide> => runPresenterOperation((): Slide => {
      const command = UpdatePresenterSlideCommandSchema.parse(rawCommand);
      assertPresenterCommandRole(command.actor);
      const presentation = findTenantPresentation(
        command.input.presentationId,
        command.actor
      );
      const existingSlide = presentation.slides.find(
        (slide) => slide.slideId === command.input.slide.slideId
      );

      if (
        existingSlide === undefined ||
        command.input.slide.presentationId !== presentation.presentationId ||
        command.input.slide.tenantId !== command.actor.tenantId
      ) {
        throw new Error("Presenter slide not found for tenant.");
      }

      const updatedSlide = SlideSchema.parse({
        ...command.input.slide,
        order: existingSlide.order
      });
      const slides = presentation.slides.map((slide) =>
        slide.slideId === updatedSlide.slideId ? updatedSlide : slide
      );

      savePresentation({
        ...presentation,
        slides,
        updatedAt: clock()
      });

      return updatedSlide;
    })
  };

  const queryService: PresenterQueryService = {
    outputTargets: (rawQuery): Promise<readonly OutputTarget[]> =>
      runPresenterOperation((): readonly OutputTarget[] => {
      const query = ListPresenterOutputTargetsQuerySchema.parse(rawQuery);
      assertPresenterQueryRole(query.actor);

      if (query.input.presentationId !== undefined) {
        findTenantPresentation(query.input.presentationId, query.actor);
      }

      return [...outputTargets.values()].filter(
        (outputTarget) => outputTarget.tenantId === query.actor.tenantId
      );
    }),

    presentation: (rawQuery): Promise<Presentation | null> =>
      runPresenterOperation((): Presentation | null => {
      const query = GetPresenterPresentationQuerySchema.parse(rawQuery);
      assertPresenterQueryRole(query.actor);
      const presentation = presentations.get(query.input.presentationId);

      return presentation?.tenantId === query.actor.tenantId ? presentation : null;
    }),

    presentationForService: (rawQuery): Promise<Presentation | null> =>
      runPresenterOperation((): Presentation | null => {
      const query = GetPresenterPresentationForServiceQuerySchema.parse(rawQuery);
      assertPresenterQueryRole(query.actor);

      return (
        [...presentations.values()].find(
          (presentation) =>
            presentation.tenantId === query.actor.tenantId &&
            presentation.serviceId === query.input.serviceId
        ) ?? null
      );
    }),

    presentations: (rawQuery): Promise<readonly Presentation[]> =>
      runPresenterOperation((): readonly Presentation[] => {
      const query = ListPresenterPresentationsQuerySchema.parse(rawQuery);
      assertPresenterQueryRole(query.actor);

      return [...presentations.values()].filter(
        (presentation) =>
          presentation.tenantId === query.actor.tenantId &&
          (query.input.filter?.serviceId === undefined ||
            presentation.serviceId === query.input.filter.serviceId)
      );
    }),

    presenterThemes: (rawQuery): Promise<readonly PresenterTheme[]> =>
      runPresenterOperation((): readonly PresenterTheme[] => {
      const query = ListPresenterThemesQuerySchema.parse(rawQuery);
      assertPresenterQueryRole(query.actor);
      const normalizedQuery = query.input.filter?.query?.toLowerCase();

      return [...themes.values()].filter(
        (theme) =>
          theme.tenantId === query.actor.tenantId &&
          (normalizedQuery === undefined ||
            theme.name.toLowerCase().includes(normalizedQuery))
      );
    })
  };

  return {
    commandService,
    queryService,
    readOutputTargets: (): readonly OutputTarget[] => [...outputTargets.values()],
    readPresentations: (): readonly Presentation[] => [...presentations.values()],
    readThemes: (): readonly PresenterTheme[] => [...themes.values()]
  };
};

const createPresenterIds = (
  overrides: Partial<InMemoryPresenterServiceIds> | undefined
): InMemoryPresenterServiceIds => {
  let nextPresentationNumber = 1;
  let nextSlideNumber = 1;
  let nextSlideBlockNumber = 1;

  return {
    presentationId:
      overrides?.presentationId ??
      ((): string => {
        const value = `presentation_${String(nextPresentationNumber)}`;
        nextPresentationNumber += 1;
        return value;
      }),
    slideBlockId:
      overrides?.slideBlockId ??
      ((): string => {
        const value = `block_${String(nextSlideBlockNumber)}`;
        nextSlideBlockNumber += 1;
        return value;
      }),
    slideId:
      overrides?.slideId ??
      ((): string => {
        const value = `slide_${String(nextSlideNumber)}`;
        nextSlideNumber += 1;
        return value;
      })
  };
};

const ensureDefaultTenantTheme = (
  tenantId: string,
  themes: Map<string, PresenterTheme>
): PresenterTheme => {
  const existingTheme = [...themes.values()].find((theme) => theme.tenantId === tenantId);

  if (existingTheme !== undefined) {
    return existingTheme;
  }

  const theme = PresenterThemeSchema.parse({
    colors: {
      background: "#101820",
      lowerThirdBackground: "#000000",
      lowerThirdText: "#ffffff",
      text: "#f7f7f2"
    },
    lowerThird: {
      maxLines: 2,
      placement: "bottom-center"
    },
    name: "Default Presenter Theme",
    spacing: {
      blockGap: 24,
      slidePadding: 72
    },
    tenantId,
    themeId: `theme_default_${tenantId}`,
    typography: {
      baseFontSize: 48,
      bodyFontFamily: "Inter",
      headingFontFamily: "Inter Display",
      lineHeight: 1.2
    }
  });
  themes.set(theme.themeId, theme);

  return theme;
};

const assertPresenterQueryRole = (actor: AuthenticatedActor): void => {
  if (!hasAllowedRole(actor, presenterQueryRoles)) {
    throw new Error("Actor is not allowed to read Presenter resources.");
  }
};

const assertPresenterCommandRole = (actor: AuthenticatedActor): void => {
  if (!hasAllowedRole(actor, presenterCommandRoles)) {
    throw new Error("Actor is not allowed to change Presenter resources.");
  }
};

const hasAllowedRole = (
  actor: AuthenticatedActor,
  allowedRoles: readonly string[]
): boolean => actor.roles.some((role) => allowedRoles.includes(role));

const runPresenterOperation = <TResult>(
  operation: () => TResult
): Promise<TResult> => {
  try {
    return Promise.resolve(operation());
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error("Presenter operation failed.")
    );
  }
};
