import type { RepositoryMutationIntent } from "./repository-contracts.js";
import type { TransactionHandle } from "./transactions.js";
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
  UpdatePresenterSlidePersistenceOperationSchema,
  type PresenterCommandPersistenceRepository,
  type PresenterOutputTargetPersistenceRecord,
  type PresenterPresentationPersistenceRecord,
  type PresenterQueryPersistenceRepository,
  type PresenterSlidePersistenceRecord,
  type PresenterThemePersistenceRecord
} from "./presenter-repository-contracts.js";

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
  readonly transactionId?: string | undefined;
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

interface PresenterPersistenceOperationOptions {
  readonly context: {
    readonly actorId?: string | undefined;
    readonly requestId: string;
    readonly tenantId: string;
  };
  readonly intent?: RepositoryMutationIntent | undefined;
  readonly transaction?: TransactionHandle | undefined;
}

export const createInMemoryPresenterPersistenceRepositoryAdapter = (
  seed: InMemoryPresenterPersistenceRepositorySeed = {}
): InMemoryPresenterPersistenceRepositoryAdapter => {
  const presentations = new Map(
    (seed.presentations ?? []).map((rawPresentation) => {
      const presentation = clonePresentation(rawPresentation);
      return [presentation.presentationId, presentation] as const;
    })
  );
  const themes = new Map(
    (seed.themes ?? []).map((rawTheme) => {
      const theme = cloneTheme(rawTheme);
      return [theme.themeId, theme] as const;
    })
  );
  const outputTargets = new Map(
    (seed.outputTargets ?? []).map((rawOutputTarget) => {
      const outputTarget = cloneOutputTarget(rawOutputTarget);
      return [outputTarget.outputTargetId, outputTarget] as const;
    })
  );
  const presentationOutputTargetIds = new Map<string, Set<string>>();
  const operations: RecordedInMemoryPresenterPersistenceOperation[] = [];

  for (const presentation of presentations.values()) {
    themes.set(presentation.theme.themeId, cloneTheme(presentation.theme));
  }

  Object.entries(seed.presentationOutputTargets ?? {}).forEach(
    ([presentationId, outputTargetIds]) => {
      presentationOutputTargetIds.set(presentationId, new Set(outputTargetIds));
    }
  );

  const recordOperation = (
    operationName: InMemoryPresenterPersistenceOperationName,
    options: PresenterPersistenceOperationOptions
  ): void => {
    if (options.context.actorId === undefined) {
      throw new Error("Presenter persistence operations require an actor ID.");
    }

    operations.push({
      actorId: options.context.actorId,
      ...(options.intent !== undefined ? { intent: options.intent } : {}),
      operationName,
      requestId: options.context.requestId,
      tenantId: options.context.tenantId,
      ...(options.transaction !== undefined
        ? { transactionId: options.transaction.transactionId }
        : {})
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

  const savePresentation = (
    presentation: PresenterPresentationPersistenceRecord
  ): PresenterPresentationPersistenceRecord => {
    const parsedPresentation = clonePresentation(presentation);
    presentations.set(parsedPresentation.presentationId, parsedPresentation);
    themes.set(parsedPresentation.theme.themeId, cloneTheme(parsedPresentation.theme));

    return clonePresentation(parsedPresentation);
  };

  const queryRepository: PresenterQueryPersistenceRepository = {
    getPresentation: (rawOperation): Promise<PresenterPresentationPersistenceRecord | null> =>
      Promise.resolve().then(() => {
        const operation = GetPresenterPresentationPersistenceOperationSchema.parse(rawOperation);
        recordOperation("getPresentation", operation.options);
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
          GetPresenterPresentationForServicePersistenceOperationSchema.parse(rawOperation);
        recordOperation("getPresentationForService", operation.options);
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
        const operation = ListPresenterOutputTargetsPersistenceOperationSchema.parse(rawOperation);
        recordOperation("listOutputTargets", operation.options);

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
          .filter((outputTarget) => outputTarget.tenantId === operation.options.context.tenantId)
          .filter(
            (outputTarget) =>
              allowedOutputTargetIds === undefined ||
              allowedOutputTargetIds.has(outputTarget.outputTargetId)
          )
          .map(cloneOutputTarget);
      }),

    listPresenterThemes: (
      rawOperation
    ): Promise<readonly PresenterThemePersistenceRecord[]> =>
      Promise.resolve().then(() => {
        const operation = ListPresenterThemesPersistenceOperationSchema.parse(rawOperation);
        recordOperation("listPresenterThemes", operation.options);
        const normalizedQuery = operation.input.filter?.query?.toLocaleLowerCase();

        return [...themes.values()]
          .filter(
            (theme) =>
              theme.tenantId === operation.options.context.tenantId &&
              (normalizedQuery === undefined ||
                theme.name.toLocaleLowerCase().includes(normalizedQuery))
          )
          .map(cloneTheme);
      }),

    listPresentations: (
      rawOperation
    ): Promise<readonly PresenterPresentationPersistenceRecord[]> =>
      Promise.resolve().then(() => {
        const operation = ListPresenterPresentationsPersistenceOperationSchema.parse(rawOperation);
        recordOperation("listPresentations", operation.options);

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
        recordOperation("addSlide", operation.options);
        const presentation = findTenantPresentation(
          operation.input.presentationId,
          operation.options.context.tenantId
        );
        const slide = cloneSlide(operation.input.slide);

        if (
          slide.presentationId !== presentation.presentationId ||
          slide.tenantId !== operation.options.context.tenantId
        ) {
          throw new Error("Presenter slide must belong to the target presentation tenant.");
        }

        if (presentation.slides.some((existingSlide) => existingSlide.slideId === slide.slideId)) {
          throw new Error("Presenter slide already exists for presentation.");
        }

        const nextSlides = [...presentation.slides.map(cloneSlide)];

        if (operation.input.afterSlideId === undefined) {
          nextSlides.push(slide);
        } else {
          const afterIndex = nextSlides.findIndex(
            (existingSlide) => existingSlide.slideId === operation.input.afterSlideId
          );

          if (afterIndex === -1) {
            throw new Error("Presenter slide insertion point not found for tenant.");
          }

          nextSlides.splice(afterIndex + 1, 0, slide);
        }

        const updatedPresentation = savePresentation({
          ...presentation,
          slides: normalizeSlideOrder(nextSlides)
        });
        const addedSlide = updatedPresentation.slides.find(
          (existingSlide) => existingSlide.slideId === slide.slideId
        );

        if (addedSlide === undefined) {
          throw new Error("Presenter slide add failed.");
        }

        return cloneSlide(addedSlide);
      }),

    removeSlide: (rawOperation): Promise<PresenterPresentationPersistenceRecord> =>
      Promise.resolve().then(() => {
        const operation = RemovePresenterSlidePersistenceOperationSchema.parse(rawOperation);
        recordOperation("removeSlide", operation.options);
        const presentation = findTenantPresentation(
          operation.input.presentationId,
          operation.options.context.tenantId
        );

        if (presentation.slides.length <= 1) {
          throw new Error("Presenter presentation must keep at least one slide.");
        }

        if (
          !presentation.slides.some((slide) => slide.slideId === operation.input.slideId)
        ) {
          throw new Error("Presenter slide not found for tenant.");
        }

        const nextSlides = presentation.slides.filter(
          (slide) => slide.slideId !== operation.input.slideId
        );
        const nextMediaCues = presentation.mediaCues.filter(
          (mediaCue) => mediaCue.slideId !== operation.input.slideId
        );

        return savePresentation({
          ...presentation,
          mediaCues: nextMediaCues,
          slides: normalizeSlideOrder(nextSlides)
        });
      }),

    reorderSlides: (
      rawOperation
    ): Promise<readonly PresenterSlidePersistenceRecord[]> =>
      Promise.resolve().then(() => {
        const operation = ReorderPresenterSlidesPersistenceOperationSchema.parse(rawOperation);
        recordOperation("reorderSlides", operation.options);
        const presentation = findTenantPresentation(
          operation.input.presentationId,
          operation.options.context.tenantId
        );
        const currentSlideIds = new Set(presentation.slides.map((slide) => slide.slideId));

        if (
          currentSlideIds.size !== operation.input.orderedSlideIds.length ||
          !operation.input.orderedSlideIds.every((slideId) => currentSlideIds.has(slideId))
        ) {
          throw new Error("Presenter slide order must include every slide exactly once.");
        }

        const slideById = new Map(
          presentation.slides.map((slide) => [slide.slideId, cloneSlide(slide)] as const)
        );
        const nextSlides = operation.input.orderedSlideIds.map((slideId) => {
          const slide = slideById.get(slideId);

          if (slide === undefined) {
            throw new Error("Presenter slide not found for tenant.");
          }

          return slide;
        });
        const updatedPresentation = savePresentation({
          ...presentation,
          slides: normalizeSlideOrder(nextSlides)
        });

        return updatedPresentation.slides.map(cloneSlide);
      }),

    savePresentation: (
      rawOperation
    ): Promise<PresenterPresentationPersistenceRecord> =>
      Promise.resolve().then(() => {
        const operation = SavePresenterPresentationPersistenceOperationSchema.parse(rawOperation);
        recordOperation("savePresentation", operation.options);

        if (operation.input.tenantId !== operation.options.context.tenantId) {
          throw new Error("Presenter presentation tenant must match operation tenant.");
        }

        return savePresentation(operation.input);
      }),

    savePresenterTheme: (
      rawOperation
    ): Promise<PresenterThemePersistenceRecord> =>
      Promise.resolve().then(() => {
        const operation = SavePresenterThemePersistenceOperationSchema.parse(rawOperation);
        recordOperation("savePresenterTheme", operation.options);
        const theme = cloneTheme(operation.input);

        if (theme.tenantId !== operation.options.context.tenantId) {
          throw new Error("Presenter theme tenant must match operation tenant.");
        }

        themes.set(theme.themeId, theme);

        return cloneTheme(theme);
      }),

    setOutputTarget: (
      rawOperation
    ): Promise<PresenterOutputTargetPersistenceRecord> =>
      Promise.resolve().then(() => {
        const operation = SetPresenterOutputTargetPersistenceOperationSchema.parse(rawOperation);
        recordOperation("setOutputTarget", operation.options);
        findTenantPresentation(
          operation.input.presentationId,
          operation.options.context.tenantId
        );
        const outputTarget = cloneOutputTarget(operation.input.outputTarget);

        if (outputTarget.tenantId !== operation.options.context.tenantId) {
          throw new Error("Presenter output target tenant must match operation tenant.");
        }

        outputTargets.set(outputTarget.outputTargetId, outputTarget);
        const targetIds =
          presentationOutputTargetIds.get(operation.input.presentationId) ?? new Set<string>();
        targetIds.add(outputTarget.outputTargetId);
        presentationOutputTargetIds.set(operation.input.presentationId, targetIds);

        return cloneOutputTarget(outputTarget);
      }),

    updateSlide: (rawOperation): Promise<PresenterSlidePersistenceRecord> =>
      Promise.resolve().then(() => {
        const operation = UpdatePresenterSlidePersistenceOperationSchema.parse(rawOperation);
        recordOperation("updateSlide", operation.options);
        const presentation = findTenantPresentation(
          operation.input.presentationId,
          operation.options.context.tenantId
        );
        const slide = cloneSlide(operation.input.slide);

        if (
          slide.presentationId !== presentation.presentationId ||
          slide.tenantId !== operation.options.context.tenantId
        ) {
          throw new Error("Presenter slide must belong to the target presentation tenant.");
        }

        const slideIndex = presentation.slides.findIndex(
          (existingSlide) => existingSlide.slideId === slide.slideId
        );

        if (slideIndex === -1) {
          throw new Error("Presenter slide not found for tenant.");
        }

        const nextSlides = presentation.slides.map((existingSlide, index) =>
          index === slideIndex ? slide : cloneSlide(existingSlide)
        );
        const updatedPresentation = savePresentation({
          ...presentation,
          slides: normalizeSlideOrder(nextSlides)
        });
        const updatedSlide = updatedPresentation.slides[slideIndex];

        if (updatedSlide === undefined) {
          throw new Error("Presenter slide update failed.");
        }

        return cloneSlide(updatedSlide);
      })
  };

  return {
    commandRepository,
    queryRepository,
    readOperations: (): readonly RecordedInMemoryPresenterPersistenceOperation[] =>
      operations.map((operation) => ({ ...operation })),
    readOutputTargets: (): readonly PresenterOutputTargetPersistenceRecord[] =>
      [...outputTargets.values()].map(cloneOutputTarget),
    readPresentationOutputTargetIds: (presentationId): readonly string[] => [
      ...(presentationOutputTargetIds.get(presentationId) ?? [])
    ],
    readPresentations: (): readonly PresenterPresentationPersistenceRecord[] =>
      [...presentations.values()].map(clonePresentation),
    readThemes: (): readonly PresenterThemePersistenceRecord[] =>
      [...themes.values()].map(cloneTheme)
  };
};

const normalizeSlideOrder = (
  slides: readonly PresenterSlidePersistenceRecord[]
): PresenterSlidePersistenceRecord[] =>
  slides.map((slide, order) =>
    cloneSlide({
      ...slide,
      order
    })
  );

const clonePresentation = (
  presentation: PresenterPresentationPersistenceRecord
): PresenterPresentationPersistenceRecord =>
  PresenterPresentationPersistenceRecordSchema.parse(structuredClone(presentation));

const cloneSlide = (
  slide: PresenterSlidePersistenceRecord
): PresenterSlidePersistenceRecord =>
  PresenterSlidePersistenceRecordSchema.parse(structuredClone(slide));

const cloneTheme = (
  theme: PresenterThemePersistenceRecord
): PresenterThemePersistenceRecord =>
  PresenterThemePersistenceRecordSchema.parse(structuredClone(theme));

const cloneOutputTarget = (
  outputTarget: PresenterOutputTargetPersistenceRecord
): PresenterOutputTargetPersistenceRecord =>
  PresenterOutputTargetPersistenceRecordSchema.parse(structuredClone(outputTarget));
