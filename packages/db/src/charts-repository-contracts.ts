import { z } from "zod";
import {
  RepositoryReadOptionsSchema,
  RepositoryWriteOptionsSchema
} from "./repository-contracts.js";

const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();
const IsoDateTimeStringSchema = z.string().datetime();
const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const NonNegativeIntegerSchema = z.number().int().nonnegative();

export const ChartsPersistenceReadOptionsSchema = RepositoryReadOptionsSchema.superRefine(
  (options, context) => {
    if (options.context.actorId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Charts persistence read operations require an actor ID.",
        path: ["context", "actorId"]
      });
    }
  }
);

export const ChartsPersistenceWriteOptionsSchema = RepositoryWriteOptionsSchema.superRefine(
  (options, context) => {
    if (options.context.actorId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Charts persistence write operations require an actor ID.",
        path: ["context", "actorId"]
      });
    }
  }
);

export const ChartStorageSchemaVersionSchema = z.literal("charts.v1");
export const ChartAnnotationKindSchema = z.enum([
  "highlight",
  "note",
  "repeat",
  "section-marker"
]);
export const ChartInstrumentSchema = z.enum(["guitar", "piano", "bass", "vocal", "other"]);

export const ChartPersistenceRecordSchema = z
  .object({
    arrangementRef: OptionalNonEmptyStringSchema,
    chartId: NonEmptyStringSchema,
    chordProSource: NonEmptyStringSchema,
    createdAt: IsoDateTimeStringSchema,
    defaultKey: NonEmptyStringSchema,
    schemaVersion: ChartStorageSchemaVersionSchema,
    songRef: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema,
    title: OptionalNonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();

export const ChartArrangementPersistenceRecordSchema = z
  .object({
    arrangementRef: NonEmptyStringSchema,
    capo: NonNegativeIntegerSchema,
    defaultKey: NonEmptyStringSchema,
    label: NonEmptyStringSchema,
    sectionOrder: z.array(NonEmptyStringSchema),
    songRef: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema
  })
  .strict();

export const ChartAnnotationPersistenceRecordSchema = z
  .object({
    annotationId: NonEmptyStringSchema,
    chartId: NonEmptyStringSchema,
    color: HexColorSchema.optional(),
    createdAt: IsoDateTimeStringSchema,
    kind: ChartAnnotationKindSchema,
    lineIndex: NonNegativeIntegerSchema,
    musicianId: NonEmptyStringSchema,
    note: OptionalNonEmptyStringSchema,
    sectionIndex: NonNegativeIntegerSchema,
    tenantId: NonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict()
  .superRefine((annotation, context) => {
    if (annotation.kind === "note" && annotation.note === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Chart note annotations require note text.",
        path: ["note"]
      });
    }
  });

export const MusicianChartPreferencePersistenceRecordSchema = z
  .object({
    capo: NonNegativeIntegerSchema,
    chartId: NonEmptyStringSchema,
    chordsVisible: z.boolean(),
    fontScale: z.number().positive(),
    instrument: ChartInstrumentSchema,
    musicianId: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema,
    transposeSemitones: z.number().int(),
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();

export const ListChartsPersistenceInputSchema = z
  .object({ filter: z.object({ songRef: OptionalNonEmptyStringSchema }).strict().optional() })
  .strict();
export const GetChartPersistenceInputSchema = z
  .object({ chartId: NonEmptyStringSchema })
  .strict();
export const ListChartsForSongPersistenceInputSchema = z
  .object({ songRef: NonEmptyStringSchema })
  .strict();
export const ListChartArrangementsPersistenceInputSchema = z
  .object({ songRef: NonEmptyStringSchema })
  .strict();
export const GetMusicianChartPreferencePersistenceInputSchema = z
  .object({ chartId: NonEmptyStringSchema, musicianId: NonEmptyStringSchema })
  .strict();
export const ListChartAnnotationsPersistenceInputSchema = z
  .object({ chartId: NonEmptyStringSchema, musicianId: OptionalNonEmptyStringSchema })
  .strict();

export const SaveChartPersistenceInputSchema = ChartPersistenceRecordSchema;
export const UpdateChartSourcePersistenceInputSchema = z
  .object({
    chartId: NonEmptyStringSchema,
    chordProSource: NonEmptyStringSchema,
    defaultKey: OptionalNonEmptyStringSchema
  })
  .strict();
export const SaveChartArrangementPersistenceInputSchema = ChartArrangementPersistenceRecordSchema;
export const SetMusicianChartPreferencePersistenceInputSchema =
  MusicianChartPreferencePersistenceRecordSchema;
export const AddChartAnnotationPersistenceInputSchema = ChartAnnotationPersistenceRecordSchema;
export const UpdateChartAnnotationPersistenceInputSchema = ChartAnnotationPersistenceRecordSchema;
export const RemoveChartAnnotationPersistenceInputSchema = z
  .object({
    annotationId: NonEmptyStringSchema,
    chartId: NonEmptyStringSchema,
    musicianId: NonEmptyStringSchema
  })
  .strict();

const readOperation = <T extends z.ZodTypeAny>(input: T) =>
  z.object({ input, options: ChartsPersistenceReadOptionsSchema }).strict();
const writeOperation = <T extends z.ZodTypeAny>(input: T) =>
  z.object({ input, options: ChartsPersistenceWriteOptionsSchema }).strict();

export const ListChartsPersistenceOperationSchema = readOperation(ListChartsPersistenceInputSchema);
export const GetChartPersistenceOperationSchema = readOperation(GetChartPersistenceInputSchema);
export const ListChartsForSongPersistenceOperationSchema = readOperation(
  ListChartsForSongPersistenceInputSchema
);
export const ListChartArrangementsPersistenceOperationSchema = readOperation(
  ListChartArrangementsPersistenceInputSchema
);
export const GetMusicianChartPreferencePersistenceOperationSchema = readOperation(
  GetMusicianChartPreferencePersistenceInputSchema
);
export const ListChartAnnotationsPersistenceOperationSchema = readOperation(
  ListChartAnnotationsPersistenceInputSchema
);
export const SaveChartPersistenceOperationSchema = writeOperation(SaveChartPersistenceInputSchema);
export const UpdateChartSourcePersistenceOperationSchema = writeOperation(
  UpdateChartSourcePersistenceInputSchema
);
export const SaveChartArrangementPersistenceOperationSchema = writeOperation(
  SaveChartArrangementPersistenceInputSchema
);
export const SetMusicianChartPreferencePersistenceOperationSchema = writeOperation(
  SetMusicianChartPreferencePersistenceInputSchema
);
export const AddChartAnnotationPersistenceOperationSchema = writeOperation(
  AddChartAnnotationPersistenceInputSchema
);
export const UpdateChartAnnotationPersistenceOperationSchema = writeOperation(
  UpdateChartAnnotationPersistenceInputSchema
);
export const RemoveChartAnnotationPersistenceOperationSchema = writeOperation(
  RemoveChartAnnotationPersistenceInputSchema
);

export type ChartsPersistenceReadOptions = z.infer<typeof ChartsPersistenceReadOptionsSchema>;
export type ChartsPersistenceWriteOptions = z.infer<typeof ChartsPersistenceWriteOptionsSchema>;
export type ChartPersistenceRecord = z.infer<typeof ChartPersistenceRecordSchema>;
export type ChartArrangementPersistenceRecord = z.infer<
  typeof ChartArrangementPersistenceRecordSchema
>;
export type ChartAnnotationPersistenceRecord = z.infer<
  typeof ChartAnnotationPersistenceRecordSchema
>;
export type MusicianChartPreferencePersistenceRecord = z.infer<
  typeof MusicianChartPreferencePersistenceRecordSchema
>;
export type ListChartsPersistenceInput = z.infer<typeof ListChartsPersistenceInputSchema>;
export type GetChartPersistenceInput = z.infer<typeof GetChartPersistenceInputSchema>;
export type ListChartsForSongPersistenceInput = z.infer<
  typeof ListChartsForSongPersistenceInputSchema
>;
export type ListChartArrangementsPersistenceInput = z.infer<
  typeof ListChartArrangementsPersistenceInputSchema
>;
export type GetMusicianChartPreferencePersistenceInput = z.infer<
  typeof GetMusicianChartPreferencePersistenceInputSchema
>;
export type ListChartAnnotationsPersistenceInput = z.infer<
  typeof ListChartAnnotationsPersistenceInputSchema
>;
export type UpdateChartSourcePersistenceInput = z.infer<
  typeof UpdateChartSourcePersistenceInputSchema
>;
export type RemoveChartAnnotationPersistenceInput = z.infer<
  typeof RemoveChartAnnotationPersistenceInputSchema
>;

export interface ChartsReadPersistenceOperation<TInput> {
  readonly input: TInput;
  readonly options: ChartsPersistenceReadOptions;
}

export interface ChartsPersistenceOperation<TInput> {
  readonly input: TInput;
  readonly options: ChartsPersistenceWriteOptions;
}

export interface ChartsQueryPersistenceRepository {
  readonly listCharts: (
    operation: ChartsReadPersistenceOperation<ListChartsPersistenceInput>
  ) => Promise<readonly ChartPersistenceRecord[]>;
  readonly getChart: (
    operation: ChartsReadPersistenceOperation<GetChartPersistenceInput>
  ) => Promise<ChartPersistenceRecord | null>;
  readonly listChartsForSong: (
    operation: ChartsReadPersistenceOperation<ListChartsForSongPersistenceInput>
  ) => Promise<readonly ChartPersistenceRecord[]>;
  readonly listChartArrangements: (
    operation: ChartsReadPersistenceOperation<ListChartArrangementsPersistenceInput>
  ) => Promise<readonly ChartArrangementPersistenceRecord[]>;
  readonly getMusicianChartPreference: (
    operation: ChartsReadPersistenceOperation<GetMusicianChartPreferencePersistenceInput>
  ) => Promise<MusicianChartPreferencePersistenceRecord | null>;
  readonly listChartAnnotations: (
    operation: ChartsReadPersistenceOperation<ListChartAnnotationsPersistenceInput>
  ) => Promise<readonly ChartAnnotationPersistenceRecord[]>;
}

export interface ChartsCommandPersistenceRepository {
  readonly saveChart: (
    operation: ChartsPersistenceOperation<ChartPersistenceRecord>
  ) => Promise<ChartPersistenceRecord>;
  readonly updateChartSource: (
    operation: ChartsPersistenceOperation<UpdateChartSourcePersistenceInput>
  ) => Promise<ChartPersistenceRecord>;
  readonly saveChartArrangement: (
    operation: ChartsPersistenceOperation<ChartArrangementPersistenceRecord>
  ) => Promise<ChartArrangementPersistenceRecord>;
  readonly setMusicianChartPreference: (
    operation: ChartsPersistenceOperation<MusicianChartPreferencePersistenceRecord>
  ) => Promise<MusicianChartPreferencePersistenceRecord>;
  readonly addChartAnnotation: (
    operation: ChartsPersistenceOperation<ChartAnnotationPersistenceRecord>
  ) => Promise<ChartAnnotationPersistenceRecord>;
  readonly updateChartAnnotation: (
    operation: ChartsPersistenceOperation<ChartAnnotationPersistenceRecord>
  ) => Promise<ChartAnnotationPersistenceRecord>;
  readonly removeChartAnnotation: (
    operation: ChartsPersistenceOperation<RemoveChartAnnotationPersistenceInput>
  ) => Promise<void>;
}
