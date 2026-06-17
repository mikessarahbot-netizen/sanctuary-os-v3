import { z } from "zod";
import { AuthenticatedActorSchema } from "../../auth/index.js";
import { ChordProDocumentSchema, type ChordProDocument } from "./chordpro.js";

const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();
const IsoDateTimeStringSchema = z.string().datetime({ offset: true });
const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const NonNegativeIntegerSchema = z.number().int().nonnegative();

export const ChartTenantIdSchema = NonEmptyStringSchema.brand<"ChartTenantId">();
export const ChartIdSchema = NonEmptyStringSchema.brand<"ChartId">();
export const ChartSongRefSchema = NonEmptyStringSchema.brand<"ChartSongRef">();
export const ChartArrangementRefSchema =
  NonEmptyStringSchema.brand<"ChartArrangementRef">();
export const ChartAnnotationIdSchema = NonEmptyStringSchema.brand<"ChartAnnotationId">();
export const ChartMusicianIdSchema = NonEmptyStringSchema.brand<"ChartMusicianId">();

export const ChartAnnotationKindSchema = z.enum([
  "highlight",
  "note",
  "repeat",
  "section-marker"
]);
export const ChartInstrumentSchema = z.enum(["guitar", "piano", "bass", "vocal", "other"]);

export const ChartSchema = z
  .object({
    arrangementRef: ChartArrangementRefSchema.optional(),
    chartId: ChartIdSchema,
    chordProSource: NonEmptyStringSchema,
    createdAt: IsoDateTimeStringSchema,
    defaultKey: NonEmptyStringSchema,
    songRef: ChartSongRefSchema,
    tenantId: ChartTenantIdSchema,
    title: OptionalNonEmptyStringSchema,
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();

export const ChartArrangementSchema = z
  .object({
    arrangementRef: ChartArrangementRefSchema,
    capo: NonNegativeIntegerSchema,
    defaultKey: NonEmptyStringSchema,
    label: NonEmptyStringSchema,
    sectionOrder: z.array(NonEmptyStringSchema),
    songRef: ChartSongRefSchema,
    tenantId: ChartTenantIdSchema
  })
  .strict();

export const ChartAnnotationSchema = z
  .object({
    annotationId: ChartAnnotationIdSchema,
    chartId: ChartIdSchema,
    color: HexColorSchema.optional(),
    createdAt: IsoDateTimeStringSchema,
    kind: ChartAnnotationKindSchema,
    lineIndex: NonNegativeIntegerSchema,
    musicianId: ChartMusicianIdSchema,
    note: OptionalNonEmptyStringSchema,
    sectionIndex: NonNegativeIntegerSchema,
    tenantId: ChartTenantIdSchema,
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

export const MusicianChartPreferenceSchema = z
  .object({
    capo: NonNegativeIntegerSchema,
    chartId: ChartIdSchema,
    chordsVisible: z.boolean(),
    fontScale: z.number().positive(),
    instrument: ChartInstrumentSchema,
    musicianId: ChartMusicianIdSchema,
    tenantId: ChartTenantIdSchema,
    transposeSemitones: z.number().int(),
    updatedAt: IsoDateTimeStringSchema
  })
  .strict();

export const ChartRenderProjectionSchema = z
  .object({
    document: ChordProDocumentSchema,
    transposeSemitones: z.number().int()
  })
  .strict();

export type ChartTenantId = z.infer<typeof ChartTenantIdSchema>;
export type ChartId = z.infer<typeof ChartIdSchema>;
export type ChartSongRef = z.infer<typeof ChartSongRefSchema>;
export type ChartArrangementRef = z.infer<typeof ChartArrangementRefSchema>;
export type ChartAnnotationId = z.infer<typeof ChartAnnotationIdSchema>;
export type ChartMusicianId = z.infer<typeof ChartMusicianIdSchema>;
export type ChartAnnotationKind = z.infer<typeof ChartAnnotationKindSchema>;
export type ChartInstrument = z.infer<typeof ChartInstrumentSchema>;
export type Chart = z.infer<typeof ChartSchema>;
export type ChartArrangement = z.infer<typeof ChartArrangementSchema>;
export type ChartAnnotation = z.infer<typeof ChartAnnotationSchema>;
export type MusicianChartPreference = z.infer<typeof MusicianChartPreferenceSchema>;
export type ChartRenderProjection = z.infer<typeof ChartRenderProjectionSchema>;

const ChartsServiceRequestSchema = z
  .object({
    actor: AuthenticatedActorSchema,
    requestId: NonEmptyStringSchema
  })
  .strict();

export const ChartsFilterSchema = z
  .object({
    songRef: ChartSongRefSchema.optional()
  })
  .strict();

export const ListChartsQuerySchema = ChartsServiceRequestSchema.extend({
  input: z
    .object({
      filter: ChartsFilterSchema.optional()
    })
    .strict()
}).strict();

export const GetChartQuerySchema = ChartsServiceRequestSchema.extend({
  input: z
    .object({
      chartId: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const ListChartsForSongQuerySchema = ChartsServiceRequestSchema.extend({
  input: z
    .object({
      songRef: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const ListChartArrangementsQuerySchema = ChartsServiceRequestSchema.extend({
  input: z
    .object({
      songRef: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const GetMusicianChartPreferenceQuerySchema = ChartsServiceRequestSchema.extend({
  input: z
    .object({
      chartId: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const ListChartAnnotationsQuerySchema = ChartsServiceRequestSchema.extend({
  input: z
    .object({
      chartId: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const SaveChartCommandSchema = ChartsServiceRequestSchema.extend({
  input: z
    .object({
      arrangementRef: OptionalNonEmptyStringSchema,
      chartId: OptionalNonEmptyStringSchema,
      chordProSource: NonEmptyStringSchema,
      defaultKey: NonEmptyStringSchema,
      songRef: NonEmptyStringSchema,
      title: OptionalNonEmptyStringSchema
    })
    .strict()
}).strict();

export const UpdateChartSourceCommandSchema = ChartsServiceRequestSchema.extend({
  input: z
    .object({
      chartId: NonEmptyStringSchema,
      chordProSource: NonEmptyStringSchema,
      defaultKey: OptionalNonEmptyStringSchema
    })
    .strict()
}).strict();

export const SaveChartArrangementCommandSchema = ChartsServiceRequestSchema.extend({
  input: z
    .object({
      arrangementRef: NonEmptyStringSchema,
      capo: NonNegativeIntegerSchema,
      defaultKey: NonEmptyStringSchema,
      label: NonEmptyStringSchema,
      sectionOrder: z.array(NonEmptyStringSchema),
      songRef: NonEmptyStringSchema
    })
    .strict()
}).strict();

export const SetMusicianChartPreferenceCommandSchema = ChartsServiceRequestSchema.extend({
  input: z
    .object({
      capo: NonNegativeIntegerSchema,
      chartId: NonEmptyStringSchema,
      chordsVisible: z.boolean(),
      fontScale: z.number().positive(),
      instrument: ChartInstrumentSchema,
      musicianId: NonEmptyStringSchema,
      transposeSemitones: z.number().int()
    })
    .strict()
}).strict();

export const AddChartAnnotationCommandSchema = ChartsServiceRequestSchema.extend({
  input: z
    .object({
      chartId: NonEmptyStringSchema,
      color: HexColorSchema.optional(),
      kind: ChartAnnotationKindSchema,
      lineIndex: NonNegativeIntegerSchema,
      musicianId: NonEmptyStringSchema,
      note: OptionalNonEmptyStringSchema,
      sectionIndex: NonNegativeIntegerSchema
    })
    .strict()
    .superRefine((input, context) => {
      if (input.kind === "note" && input.note === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Chart note annotations require note text.",
          path: ["note"]
        });
      }
    })
}).strict();

export const UpdateChartAnnotationCommandSchema = ChartsServiceRequestSchema.extend({
  input: z
    .object({
      annotationId: NonEmptyStringSchema,
      chartId: NonEmptyStringSchema,
      color: HexColorSchema.optional(),
      kind: ChartAnnotationKindSchema,
      lineIndex: NonNegativeIntegerSchema,
      musicianId: NonEmptyStringSchema,
      note: OptionalNonEmptyStringSchema,
      sectionIndex: NonNegativeIntegerSchema
    })
    .strict()
    .superRefine((input, context) => {
      if (input.kind === "note" && input.note === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Chart note annotations require note text.",
          path: ["note"]
        });
      }
    })
}).strict();

export const RemoveChartAnnotationCommandSchema = ChartsServiceRequestSchema.extend({
  input: z
    .object({
      annotationId: NonEmptyStringSchema,
      chartId: NonEmptyStringSchema,
      confirmationIntent: z
        .object({
          confirmed: z.literal(true),
          reason: NonEmptyStringSchema
        })
        .strict(),
      musicianId: NonEmptyStringSchema
    })
    .strict()
}).strict();

export type ListChartsQuery = z.infer<typeof ListChartsQuerySchema>;
export type GetChartQuery = z.infer<typeof GetChartQuerySchema>;
export type ListChartsForSongQuery = z.infer<typeof ListChartsForSongQuerySchema>;
export type ListChartArrangementsQuery = z.infer<typeof ListChartArrangementsQuerySchema>;
export type GetMusicianChartPreferenceQuery = z.infer<
  typeof GetMusicianChartPreferenceQuerySchema
>;
export type ListChartAnnotationsQuery = z.infer<typeof ListChartAnnotationsQuerySchema>;
export type SaveChartCommand = z.infer<typeof SaveChartCommandSchema>;
export type UpdateChartSourceCommand = z.infer<typeof UpdateChartSourceCommandSchema>;
export type SaveChartArrangementCommand = z.infer<typeof SaveChartArrangementCommandSchema>;
export type SetMusicianChartPreferenceCommand = z.infer<
  typeof SetMusicianChartPreferenceCommandSchema
>;
export type AddChartAnnotationCommand = z.infer<typeof AddChartAnnotationCommandSchema>;
export type UpdateChartAnnotationCommand = z.infer<
  typeof UpdateChartAnnotationCommandSchema
>;
export type RemoveChartAnnotationCommand = z.infer<
  typeof RemoveChartAnnotationCommandSchema
>;

export interface ChartsQueryService {
  readonly listCharts: (query: ListChartsQuery) => Promise<readonly Chart[]>;
  readonly getChart: (query: GetChartQuery) => Promise<Chart | null>;
  readonly listChartsForSong: (
    query: ListChartsForSongQuery
  ) => Promise<readonly Chart[]>;
  readonly listChartArrangements: (
    query: ListChartArrangementsQuery
  ) => Promise<readonly ChartArrangement[]>;
  readonly getMusicianChartPreference: (
    query: GetMusicianChartPreferenceQuery
  ) => Promise<MusicianChartPreference | null>;
  readonly listChartAnnotations: (
    query: ListChartAnnotationsQuery
  ) => Promise<readonly ChartAnnotation[]>;
}

export interface ChartsCommandService {
  readonly saveChart: (command: SaveChartCommand) => Promise<Chart>;
  readonly updateChartSource: (command: UpdateChartSourceCommand) => Promise<Chart>;
  readonly saveChartArrangement: (
    command: SaveChartArrangementCommand
  ) => Promise<ChartArrangement>;
  readonly setMusicianChartPreference: (
    command: SetMusicianChartPreferenceCommand
  ) => Promise<MusicianChartPreference>;
  readonly addChartAnnotation: (
    command: AddChartAnnotationCommand
  ) => Promise<ChartAnnotation>;
  readonly updateChartAnnotation: (
    command: UpdateChartAnnotationCommand
  ) => Promise<ChartAnnotation>;
  readonly removeChartAnnotation: (
    command: RemoveChartAnnotationCommand
  ) => Promise<void>;
}

export const parseChart = (rawInput: unknown): Chart => ChartSchema.parse(rawInput);

export const parseChartArrangement = (rawInput: unknown): ChartArrangement =>
  ChartArrangementSchema.parse(rawInput);

export const parseChartAnnotation = (rawInput: unknown): ChartAnnotation =>
  ChartAnnotationSchema.parse(rawInput);

export const parseMusicianChartPreference = (
  rawInput: unknown
): MusicianChartPreference => MusicianChartPreferenceSchema.parse(rawInput);

export const parseChartRenderProjection = (rawInput: unknown): ChartRenderProjection =>
  ChartRenderProjectionSchema.parse(rawInput);

export type { ChordProDocument };
