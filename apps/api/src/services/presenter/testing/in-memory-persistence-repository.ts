import type {
  PresenterCommandPersistenceRepository,
  PresenterOutputTargetPersistenceRecord,
  PresenterPresentationPersistenceRecord,
  PresenterQueryPersistenceRepository,
  PresenterSlidePersistenceRecord,
  PresenterThemePersistenceRecord,
  RepositoryMutationIntent
} from "@sanctuary-os/db";
import {
  AddPresenterSlidePersistenceOperationSchema,
  GetPresenterPresentationForServicePersistenceOperationSchema,
  GetPresenterPresentationPersistenceOperationSchema,
  ListPresenterOutputTargetsPersistenceOperationSchema,
  ListPresenterPresentationsPersistenceOperationSchema,
  ListPresenterThemesPersistenceOperationSchema,
  PresenterOutputTargetPersistenceRecordSchema,
  PresenterPresentationPersistenceRecordSchema,
  PresenterSlidePersistenceRecordSchema,
  PresenterThemePersistenceRecordSchema,
  RemovePresenterSlidePersistenceOperationSchema,
  ReorderPresenterSlidesPersistenceOperationSchema,
  SavePresenterPresentationPersistenceOperationSchema,
  SavePresenterThemePersistenceOperationSchema,
  SetPresenterOutputTargetPersistenceOperationSchema,
  UpdatePresenterSlidePersistenceOperationSchema
} from "@sanctuary-os/db";

export type InMemoryPresenterPersistenceOperationName =
  | "addSlide"
  | "getPresentation"
  | "getPresentationForService"
  | "listOutputTargets"
  | "listPresenterThemes"
  | "listPresentations"
  | "removeSlide"
  | "reorderSlides"
  | "savePresentation"
  | "savePresenterTheme"
  | "setOutputTarget"
  | "updateSlide";

export interface RecordedInMemoryPresenterPersistenceOperation {
  readonly actorId: string;
  readonly intent?: RepositoryMutationIntent | undefined;
  readonly operationName: InMemoryPresenterPersistenceOperationName;
  readonly requestId: string;
  readonly tenantId: string;
}

export interface InMemoryPresenterPersistenceRepositorySeed {
  readonly outputTargets?: readonly PresenterOutputTargetPersistenceRecord[];
  readonly presentationOutputTargets?: Readonly<Record<string, readonly string[]>>;
  readonly presentations?: readonly PresenterPresentationPersistenceRecord[];
  readonly themes?: readonly PresenterThemePersistenceRecord[];
}

export interface InMemoryPresenterPersistenceRepositoryAdapter {
  readonly commandRepository: PresenterCommandPersistenceRepository;
  readonly queryRepository: PresenterQueryPersistenceRepository;
  readonly readOperations: () => readonly RecordedInMemoryPresenterPersistenceOperation[];
  readonly readOutputTargets: () => readonly PresenterOutputTargetPersistenceRecord[];
  readonly readPresentationOutputTargetIds: (
    presentationId: string
  ) => readonly string[];
  readonly readPresentations: () => readonly PresenterPresentationPersistenceRecord[];
  readonly readThemes: () => readonly PresenterThemePersistenceRecord[];
}

interface PresenterPersistenceContext {
  readonly actorId?: string | undefined;
  readonly requestId: string;
  readonly tenantId: string;
}

interface PresenterPersistenceWriteOptions {
  readonly context: PresenterPersistenceContext;
  readonly intent: RepositoryMutationIntent;
}

export const createInMemoryPresenterPersistenceRepositoryAdapter = (
  seed: InMemoryPresenterPersistenceRepositorySeed = {}
): InMemoryPresenterPersistenceRepositoryAdapter => {
  const presentations = new Map<string, PresenterPresentationPersistenceRecord>();
  const themes = new Map<string, PresenterThemePersistenceRecord>();
  const outputTargets = new Map<string, PresenterOutputTargetPersistenceRecord>();
  const presentationOutputTargetIds = new Map<string, Set<string>>();
  const operations: RecordedInMemoryPresenterPersistenceOperation[] = [];

  (seed.presentations ?? []).forEach((rawPresentation) => {
    const presentation = clonePresentation(rawPresentation);
    presentations.set(presentation.presentationId, presentation);
    themes.set(presentation.theme.themeId, cloneTheme(presentation.theme));
  });

  (seed.themes ?? []).forEach((rawTheme) => {
    const theme = cloneTheme(rawTheme);
    themes.set(theme.themeId, theme);
  });

  (seed.outputTargets ?? []).forEach((rawOutputTarget) => {
    const outputTarget = cloneOutputTarget(rawOutputTarget);
    outputTargets.set(outputTarget.outputTargetId, outputTarget);
  });

  Object.entries(seed.presentationOutputTargets ?? {}).forEach(
    ([presentationId, outputTargetIds]) => {
      presentationOutputTargetIds.set(presentationId, new Set(outputTargetIds));
    }
  );

  const recordReadOperation = (
    operationName: InMemoryPresenterPersistenceOperationName,
    context: PresenterPersistenceContext
  ): void => {
    const actorId = requireActorId(context);
    operations.push({
      actorId,
      operationName,
      requestId: context.requestId,
      tenantId: context.tenantId
    });
  };

  const recordWriteOperation = (
    operationName: InMemoryPresenterPersistenceOperationName,
    options: PresenterPersistenceWriteOptions
  ): void => {
    const actorId = requireActorId(options.context);
    operations.push({
      actorId,
      intent: options.intent,
      operationName,
      requestId: options.context.requestId,
      tenantId: options.context.tenantId
    });
  };

  const findTenantPresentation = (
    presentationId: string,
    tenantId: string
  ): PresenterPresentationPersistenceRecord => {
    const presentation = presentations.get(presentationId);

    if (presentation === undefined || presentation.tenantId !== tenantId) {
      throw new Error("Presenter presentation not found for tenant.");
    }

    return presentation;
  };

  const saveTenantPresentation = (
    presentation: PresenterPresentationPersistenceRecord,
    tenantId: string
  ): PresenterPresentationPersistenceRecord => {
    if (presentation.tenantId !== tenantId) {
      throw new Error("Presenter presentation tenant must match operation tenant.");
    }

    const savedPresentation = clonePresentation(presentation);
    presentations.set(savedPresentation.presentationId, savedPresentation);
    themes.set(savedPresentation.theme.themeId, cloneTheme(savedPresentation.theme));

    return clonePresentation(savedPresentation);
  };

  const queryRepository: PresenterQueryPersistenceRepository = {
    getPresentation: (rawOperation): Promise<PresenterPresentationPersistenceRecord | null> =>
      Promise.resolve().then(() => {
        const operation =
          GetPresenterPresentationPersistenceOperationSchema.parse(rawOperation);
        recordReadOperation("getPresentation", operation.options.context);
        const presentation = presentations.get(operation.input.presentationId);

        return presentation !== undefined &&
          presentation.tenantId === operation.options.context.tenantId
          ? clonePresentation(presentation)
          : null;
      }),

    getPresentationForService: (
      rawOperation
    ): Promise<PresenterPresentationPersistenceRecord | null> =>
      Promise.resolve().then(() => {
        const operation =
          GetPresenterPresentationForServicePersistenceOperationSchema.parse(
            rawOperation
          );
        recordReadOperation("getPresentationForService", operation.options.context);

        const presentation =
          [...presentations.values()].find(
            (candidate) =>
              candidate.tenantId === operation.options.context.tenantId &&
              candidate.serviceId === operation.input.serviceId
          ) ?? null;

        return presentation === null ? null : clonePresentation(presentation);
      }),

    listOutputTargets: (
      rawOperation
    ): Promise<readonly PresenterOutputTargetPersistenceRecord[]> =>
      Promise.resolve().then(() => {
        const operation =
          ListPresenterOutputTargetsPersistenceOperationSchema.parse(rawOperation);
        recordReadOperation("listOutputTargets", operation.options.context);

        if (operation.input.presentationId !== undefined) {
          findTenantPresentation(
            operation.input.presentationId,
            operation.options.context.tenantId
          );
        }

        const allowedOutputTargetIds =
          operation.input.presentationId === undefined
            ? undefined
            : presentationOutputTargetIds.get(operation.input.presentationId) ?? new Set();

        return [...outputTargets.values()]
          .filter(
            (outputTarget) =>
              outputTarget.tenantId === operation.options.context.tenantId &&
              (allowedOutputTargetIds === undefined ||
                allowedOutputTargetIds.has(outputTarget.outputTargetId))
          )
          .map(cloneOutputTarget);
      }),

    listPresenterThemes: (
      rawOperation
    ): Promise<readonly PresenterThemePersistenceRecord[]> =>
      Promise.resolve().then(() => {
        const operation = ListPresenterThemesPersistenceOperationSchema.parse(rawOperation);
        recordReadOperation("listPresenterThemes", operation.options.context);
        const normalizedQuery = operation.input.filter?.query?.toLocaleLowerCase();

        return [...themes.values()]
          .filter((theme) => {
            if (theme.tenantId !== operation.options.context.tenantId) {
              return false;
            }

            return (
              normalizedQuery === undefined ||
              theme.name.toLocaleLowerCase().includes(normalizedQuery)
            );
          })
          .map(cloneTheme);
      }),

    listPresentations: (
      rawOperation
    ): Promise<readonly PresenterPresentationPersistenceRecord[]> =>
      Promise.resolve().then(() => {
        const operation =
          ListPresenterPresentationsPersistenceOperationSchema.parse(rawOperation);
        recordReadOperation("listPresentations", operation.options.context);

        return [...presentations.values()]
          .filter(
            (presentation) =>
              presentation.tenantId === operation.options.context.tenantId &&
              (operation.input.filter?.serviceId === undefined ||
                presentation.serviceId === operation.input.filter.serviceId)
          )
          .map(clonePresentation);
      })
  };

  const commandRepository: PresenterCommandPersistenceRepository = {
    addSlide: (rawOperation): Promise<PresenterSlidePersistenceRecord> =>
      Promise.resolve().then(() => {
        const operation = AddPresenterSlidePersistenceOperationSchema.parse(rawOperation);
        recordWriteOperation("addSlide", operation.options);
        const presentation = findTenantPresentation(
          operation.input.presentationId,
          operation.options.context.tenantId
        );

        if (
          operation.input.slide.tenantId !== operation.options.context.tenantId ||
          operation.input.slide.presentationId !== presentation.presentationId
        ) {
          throw new Error("Presenter slide tenant and presentation must match operation.");
        }

        if (
          presentation.slides.some(
            (candidate) => candidate.slideId === operation.input.slide.slideId
          )
        ) {
          throw new Error("Presenter slide already exists for presentation.");
        }

        const insertAfterIndex =
          operation.input.afterSlideId === undefined
            ? presentation.slides.length - 1
            : presentation.slides.findIndex(
                (slide) => slide.slideId === operation.input.afterSlideId
              );

        if (insertAfterIndex < 0) {
          throw new Error("Presenter slide insertion point not found for tenant.");
        }

        const slides = [
          ...presentation.slides.slice(0, insertAfterIndex + 1),
          operation.input.slide,
          ...presentation.slides.slice(insertAfterIndex + 1)
        ].map(reorderSlide);
        const updatedPresentation = clonePresentation({
          ...presentation,
          slides
        });
        presentations.set(updatedPresentation.presentationId, updatedPresentation);
        const insertedSlide = slides[insertAfterIndex + 1];

        if (insertedSlide === undefined) {
          throw new Error("Presenter slide insertion failed.");
        }

        return cloneSlide(insertedSlide);
      }),

    removeSlide: (
      rawOperation
    ): Promise<PresenterPresentationPersistenceRecord> =>
      Promise.resolve().then(() => {
        const operation = RemovePresenterSlidePersistenceOperationSchema.parse(rawOperation);
        recordWriteOperation("removeSlide", operation.options);
        const presentation = findTenantPresentation(
          operation.input.presentationId,
          operation.options.context.tenantId
        );

        if (presentation.slides.length === 1) {
          throw new Error("Presenter presentation must keep at least one slide.");
        }

        const remainingSlides = presentation.slides.filter(
          (slide) => slide.slideId !== operation.input.slideId
        );

        if (remainingSlides.length === presentation.slides.length) {
          throw new Error("Presenter slide not found for tenant.");
        }

        const updatedPresentation = clonePresentation({
          ...presentation,
          mediaCues: presentation.mediaCues.filter(
            (cue) => cue.slideId !== operation.input.slideId
          ),
          slides: remainingSlides.map(reorderSlide)
        });
        presentations.set(updatedPresentation.presentationId, updatedPresentation);

        return clonePresentation(updatedPresentation);
      }),

    reorderSlides: (
      rawOperation
    ): Promise<readonly PresenterSlidePersistenceRecord[]> =>
      Promise.resolve().then(() => {
        const operation =
          ReorderPresenterSlidesPersistenceOperationSchema.parse(rawOperation);
        recordWriteOperation("reorderSlides", operation.options);
        const presentation = findTenantPresentation(
          operation.input.presentationId,
          operation.options.context.tenantId
        );

        if (operation.input.orderedSlideIds.length !== presentation.slides.length) {
          throw new Error("Presenter slide order must include every slide exactly once.");
        }

        const reorderedSlides = operation.input.orderedSlideIds.map((slideId, order) => {
          const slide = presentation.slides.find(
            (candidate) => candidate.slideId === slideId
          );

          if (slide === undefined) {
            throw new Error("Presenter slide not found for tenant.");
          }

          return cloneSlide({ ...slide, order });
        });
        const updatedPresentation = clonePresentation({
          ...presentation,
          slides: reorderedSlides
        });
        presentations.set(updatedPresentation.presentationId, updatedPresentation);

        return reorderedSlides.map(cloneSlide);
      }),

    savePresentation: (
      rawOperation
    ): Promise<PresenterPresentationPersistenceRecord> =>
      Promise.resolve().then(() => {
        const operation =
          SavePresenterPresentationPersistenceOperationSchema.parse(rawOperation);
        recordWriteOperation("savePresentation", operation.options);

        return saveTenantPresentation(
          operation.input,
          operation.options.context.tenantId
        );
      }),

    savePresenterTheme: (
      rawOperation
    ): Promise<PresenterThemePersistenceRecord> =>
      Promise.resolve().then(() => {
        const operation = SavePresenterThemePersistenceOperationSchema.parse(rawOperation);
        recordWriteOperation("savePresenterTheme", operation.options);

        if (operation.input.tenantId !== operation.options.context.tenantId) {
          throw new Error("Presenter theme tenant must match operation tenant.");
        }

        const theme = cloneTheme(operation.input);
        themes.set(theme.themeId, theme);

        return cloneTheme(theme);
      }),

    setOutputTarget: (
      rawOperation
    ): Promise<PresenterOutputTargetPersistenceRecord> =>
      Promise.resolve().then(() => {
        const operation =
          SetPresenterOutputTargetPersistenceOperationSchema.parse(rawOperation);
        recordWriteOperation("setOutputTarget", operation.options);
        findTenantPresentation(
          operation.input.presentationId,
          operation.options.context.tenantId
        );

        if (operation.input.outputTarget.tenantId !== operation.options.context.tenantId) {
          throw new Error("Presenter output target tenant must match operation tenant.");
        }

        const outputTarget = cloneOutputTarget(operation.input.outputTarget);
        outputTargets.set(outputTarget.outputTargetId, outputTarget);
        const targetIds =
          presentationOutputTargetIds.get(operation.input.presentationId) ?? new Set();
        targetIds.add(outputTarget.outputTargetId);
        presentationOutputTargetIds.set(operation.input.presentationId, targetIds);

        return cloneOutputTarget(outputTarget);
      }),

    updateSlide: (rawOperation): Promise<PresenterSlidePersistenceRecord> =>
      Promise.resolve().then(() => {
        const operation = UpdatePresenterSlidePersistenceOperationSchema.parse(rawOperation);
        recordWriteOperation("updateSlide", operation.options);
        const presentation = findTenantPresentation(
          operation.input.presentationId,
          operation.options.context.tenantId
        );
        const existingSlide = presentation.slides.find(
          (slide) => slide.slideId === operation.input.slide.slideId
        );

        if (
          existingSlide === undefined ||
          operation.input.slide.presentationId !== presentation.presentationId ||
          operation.input.slide.tenantId !== operation.options.context.tenantId
        ) {
          throw new Error("Presenter slide not found for tenant.");
        }

        const updatedSlide = cloneSlide({
          ...operation.input.slide,
          order: existingSlide.order
        });
        const updatedPresentation = clonePresentation({
          ...presentation,
          slides: presentation.slides.map((slide) =>
            slide.slideId === updatedSlide.slideId ? updatedSlide : slide
          )
        });
        presentations.set(updatedPresentation.presentationId, updatedPresentation);

        return cloneSlide(updatedSlide);
      })
  };

  return {
    commandRepository,
    queryRepository,
    readOperations: () => [...operations],
    readOutputTargets: () => [...outputTargets.values()].map(cloneOutputTarget),
    readPresentationOutputTargetIds: (presentationId) => [
      ...(presentationOutputTargetIds.get(presentationId) ?? [])
    ],
    readPresentations: () => [...presentations.values()].map(clonePresentation),
    readThemes: () => [...themes.values()].map(cloneTheme)
  };
};

const requireActorId = (context: PresenterPersistenceContext): string => {
  if (context.actorId === undefined) {
    throw new Error("Presenter persistence context requires an actor ID.");
  }

  return context.actorId;
};

const reorderSlide = (
  slide: PresenterSlidePersistenceRecord,
  order: number
): PresenterSlidePersistenceRecord =>
  cloneSlide({
    ...slide,
    order
  });

const clonePresentation = (
  presentation: PresenterPresentationPersistenceRecord
): PresenterPresentationPersistenceRecord =>
  PresenterPresentationPersistenceRecordSchema.parse(
    globalThis.structuredClone(presentation)
  );

const cloneTheme = (
  theme: PresenterThemePersistenceRecord
): PresenterThemePersistenceRecord =>
  PresenterThemePersistenceRecordSchema.parse(globalThis.structuredClone(theme));

const cloneOutputTarget = (
  outputTarget: PresenterOutputTargetPersistenceRecord
): PresenterOutputTargetPersistenceRecord =>
  PresenterOutputTargetPersistenceRecordSchema.parse(
    globalThis.structuredClone(outputTarget)
  );

const cloneSlide = (
  slide: PresenterSlidePersistenceRecord
): PresenterSlidePersistenceRecord =>
  PresenterSlidePersistenceRecordSchema.parse(globalThis.structuredClone(slide));
