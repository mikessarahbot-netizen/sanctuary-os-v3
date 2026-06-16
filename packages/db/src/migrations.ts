import { z } from "zod";

export const MigrationStateSchema = z.enum(["pending", "applied", "failed", "rolled-back"]);

export const MigrationRecordSchema = z.object({
  appliedAt: z.string().datetime().optional(),
  checksum: z.string().min(1),
  migrationId: z.string().min(1),
  state: MigrationStateSchema
});

export type MigrationState = z.infer<typeof MigrationStateSchema>;
export type MigrationRecord = z.infer<typeof MigrationRecordSchema>;

export interface MigrationRegistry {
  readonly list: () => Promise<readonly MigrationRecord[]>;
}
